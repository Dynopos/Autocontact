-- Dyno Auto Contact (Android) + Dyno Mini CRM — identiti WhatsApp
-- ------------------------------------------------------------------
-- Pelanggan WhatsApp boleh dikenali dengan nombor telefon, username
-- WhatsApp, atau ID pengguna berskop perniagaan (hanya dari API rasmi).
-- Kenalan mesti mempunyai sekurang-kurangnya SATU pengenal yang boleh
-- dipercayai. Notifikasi yang hanya ada nama paparan disimpan sebagai
-- event "belum disahkan", bukan kenalan.

-- ========== 1. Kenalan: pengenal tambahan ==========
alter table public.contacts alter column telefon drop not null;

alter table public.contacts
  add column if not exists whatsapp_username text
    check (whatsapp_username is null or whatsapp_username ~ '^[a-z0-9._]{3,35}$'),
  add column if not exists whatsapp_bsuid text
    check (whatsapp_bsuid is null or char_length(whatsapp_bsuid) between 3 and 128),
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz generated always as (last_contact_at) stored;

alter table public.contacts drop constraint if exists contacts_ada_pengenal;
alter table public.contacts add constraint contacts_ada_pengenal
  check (telefon is not null or whatsapp_username is not null or whatsapp_bsuid is not null);

-- Satu pengenal = satu kenalan dalam setiap akaun (nombor sudah unik)
create unique index if not exists contacts_owner_username_uidx on public.contacts (owner_id, whatsapp_username) where whatsapp_username is not null;
create unique index if not exists contacts_owner_bsuid_uidx    on public.contacts (owner_id, whatsapp_bsuid)    where whatsapp_bsuid is not null;

update public.contacts set first_seen_at = coalesce(first_seen_at, last_contact_at, created_at) where first_seen_at is null;

-- Sumber: 'facebook_ads' hanya bila metadata rujukan iklan yang boleh dipercayai wujud
alter table public.contacts drop constraint if exists contacts_sumber_lead_check;
alter table public.contacts add constraint contacts_sumber_lead_check
  check (sumber_lead in ('whatsapp','facebook_ads','meta_lead_ads','auto_contact','manual','import','api'));

-- ========== 2. Log lead: identiti, peranti, status belum disahkan ==========
alter table public.lead_events drop constraint if exists lead_events_sumber_lead_check;
alter table public.lead_events add constraint lead_events_sumber_lead_check
  check (sumber_lead in ('whatsapp','facebook_ads','meta_lead_ads','auto_contact','manual','import','api'));
alter table public.lead_events drop constraint if exists lead_events_kaedah_check;
alter table public.lead_events add constraint lead_events_kaedah_check
  check (kaedah in ('webhook','api','manual','android'));
alter table public.lead_events drop constraint if exists lead_events_keputusan_check;
alter table public.lead_events add constraint lead_events_keputusan_check
  check (keputusan in ('dicipta','dikemas_kini','ditolak','belum_disahkan','disahkan_manual','diabaikan'));

alter table public.lead_events
  add column if not exists whatsapp_username text,
  add column if not exists whatsapp_bsuid text,
  add column if not exists peranti text check (peranti is null or char_length(peranti) <= 80),
  add column if not exists pratonton_tersembunyi boolean not null default false;

create index if not exists lead_events_belum_idx on public.lead_events (owner_id, created_at desc) where keputusan = 'belum_disahkan';

-- Pengguna boleh menandakan event belum disahkan sebagai diabaikan
grant update (keputusan) on public.lead_events to authenticated;

-- ========== 3. Integrasi: peranti Android ==========
alter table public.integrations drop constraint if exists integrations_jenis_check;
alter table public.integrations add constraint integrations_jenis_check
  check (jenis in ('whatsapp','meta_lead_ads','api','android'));

drop function if exists public.cari_kunci_api(text);
create function public.cari_kunci_api(p_hash text)
returns table (id uuid, owner_id uuid, aktif boolean, jenis text)
language sql stable security definer set search_path = public as $$
  select id, owner_id, aktif, jenis from public.integrations
  where jenis in ('api','android') and kunci_hash = p_hash
$$;
revoke all on function public.cari_kunci_api(text) from public, anon, authenticated;
grant execute on function public.cari_kunci_api(text) to service_role;

-- ========== 4. Tangkap identiti ==========
-- Susunan semakan: ID berskop perniagaan -> nombor -> username.
-- Pengenal tambahan hanya dilampirkan pada kenalan bila ia datang dalam
-- event YANG SAMA (bukti ia orang yang sama) dan belum dimiliki kenalan lain.
-- Kenalan TIDAK digabungkan berdasarkan nama paparan.
-- Tiada pengenal langsung -> event 'belum_disahkan' (tiada kenalan).
-- Pulangan: {status: dicipta|dikemas_kini|belum_disahkan|ditolak|duplikat_event, contact_id, event_id, konflik?}
create or replace function public.capture_identity(
  p_owner        uuid,
  p_sumber       text,
  p_event_id     text,
  p_telefon      text        default null,
  p_username     text        default null,
  p_bsuid        text        default null,
  p_nama         text        default '',
  p_mesej        text        default '',
  p_diterima     timestamptz default now(),
  p_integration  uuid        default null,
  p_kaedah       text        default 'webhook',
  p_asas         text        default '',
  p_peranti      text        default null,
  p_tersembunyi  boolean     default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev      uuid;
  v_c       public.contacts%rowtype;
  v_c2      public.contacts%rowtype;
  v_status  text;
  v_konflik text := null;
  v_label   text;
  v_bila    timestamptz := coalesce(p_diterima, now());
  v_nama    text := left(btrim(coalesce(p_nama, '')), 120);
  v_mesej   text := left(btrim(coalesce(p_mesej, '')), 1000);
  v_tel     text := nullif(btrim(coalesce(p_telefon, '')), '');
  v_user    text := nullif(lower(regexp_replace(btrim(coalesce(p_username, '')), '^@', '')), '');
  v_bsuid   text := nullif(btrim(coalesce(p_bsuid, '')), '');
begin
  if p_owner is null then raise exception 'p_owner diperlukan'; end if;

  -- 1. Idempotensi
  insert into public.lead_events (owner_id, integration_id, sumber_lead, kaedah, external_event_id, telefon,
                                  whatsapp_username, whatsapp_bsuid, nama, mesej, diterima_at, peranti, pratonton_tersembunyi)
  values (p_owner, p_integration, p_sumber, coalesce(p_kaedah, 'webhook'), p_event_id, v_tel,
          v_user, v_bsuid, v_nama, v_mesej, v_bila, left(p_peranti, 80), coalesce(p_tersembunyi, false))
  on conflict (owner_id, sumber_lead, external_event_id) do nothing
  returning id into v_ev;
  if v_ev is null then return jsonb_build_object('status', 'duplikat_event'); end if;

  if p_integration is not null then
    update public.integrations set last_event_at = now(), jumlah_event = jumlah_event + 1 where id = p_integration;
  end if;

  -- 2. Sahkan format pengenal; yang tidak sah dibuang (tidak diteka)
  if v_tel is not null and v_tel !~ '^\+[1-9][0-9]{7,14}$' then v_tel := null; end if;
  if v_user is not null and (v_user !~ '^[a-z0-9._]{3,35}$' or v_user !~ '[a-z]') then v_user := null; end if;

  if v_tel is null and v_user is null and v_bsuid is null then
    if v_nama <> '' and p_kaedah = 'android' then
      -- Hanya nama paparan: simpan untuk pengesahan manual
      update public.lead_events set keputusan = 'belum_disahkan', sebab = 'tiada_pengenal' where id = v_ev;
      return jsonb_build_object('status', 'belum_disahkan', 'event_id', v_ev);
    end if;
    update public.lead_events set keputusan = 'ditolak', sebab = 'nombor_tidak_sah' where id = v_ev;
    return jsonb_build_object('status', 'ditolak', 'sebab', 'nombor_tidak_sah', 'event_id', v_ev);
  end if;

  v_label := case p_sumber
    when 'whatsapp' then 'WhatsApp' when 'facebook_ads' then 'Facebook Ads' when 'meta_lead_ads' then 'Meta Ads'
    when 'auto_contact' then 'Auto Contact' when 'manual' then 'Manual' when 'import' then 'Import' else 'API' end;

  -- 3. Cari kenalan dengan pengenal yang boleh dipercayai (keutamaan: BSUID, telefon, username)
  if v_bsuid is not null then
    select * into v_c from public.contacts where owner_id = p_owner and whatsapp_bsuid = v_bsuid for update;
  end if;
  if v_c.id is null and v_tel is not null then
    select * into v_c from public.contacts where owner_id = p_owner and telefon = v_tel for update;
  end if;
  if v_c.id is null and v_user is not null then
    select * into v_c from public.contacts where owner_id = p_owner and whatsapp_username = v_user for update;
  end if;

  if v_c.id is null then
    insert into public.contacts (owner_id, telefon, whatsapp_username, whatsapp_bsuid, nama, status, sumber, sumber_lead,
                                 mesej_pertama, first_seen_at, last_contact_at, susulan, asas_persetujuan)
    values (p_owner, v_tel, v_user, v_bsuid, v_nama, 'lead', v_label, p_sumber, v_mesej, v_bila, v_bila,
            (v_bila at time zone 'Asia/Kuala_Lumpur')::date, left(coalesce(p_asas, ''), 60))
    on conflict do nothing
    returning * into v_c;
    if v_c.id is not null then
      v_status := 'dicipta';
    else
      -- Lead serentak: cari semula
      select * into v_c from public.contacts where owner_id = p_owner
        and ((v_tel is not null and telefon = v_tel) or (v_user is not null and whatsapp_username = v_user)
             or (v_bsuid is not null and whatsapp_bsuid = v_bsuid))
        order by created_at limit 1 for update;
    end if;
  end if;

  if v_status is null then
    -- Lampirkan pengenal baharu dari event yang sama HANYA jika tiada kenalan lain memilikinya
    if v_tel is not null and v_c.telefon is null then
      select * into v_c2 from public.contacts where owner_id = p_owner and telefon = v_tel and id <> v_c.id;
      if v_c2.id is null then v_c.telefon := v_tel; else v_konflik := 'telefon'; end if;
    elsif v_tel is not null and v_c.telefon <> v_tel then
      v_konflik := 'telefon';
    end if;
    if v_user is not null and v_c.whatsapp_username is null then
      v_c2 := null;
      select * into v_c2 from public.contacts where owner_id = p_owner and whatsapp_username = v_user and id <> v_c.id;
      if v_c2.id is null then v_c.whatsapp_username := v_user; else v_konflik := coalesce(v_konflik, 'username'); end if;
    elsif v_user is not null and v_c.whatsapp_username <> v_user then
      v_konflik := coalesce(v_konflik, 'username');
    end if;
    if v_bsuid is not null and v_c.whatsapp_bsuid is null then
      v_c2 := null;
      select * into v_c2 from public.contacts where owner_id = p_owner and whatsapp_bsuid = v_bsuid and id <> v_c.id;
      if v_c2.id is null then v_c.whatsapp_bsuid := v_bsuid; else v_konflik := coalesce(v_konflik, 'bsuid'); end if;
    end if;

    -- Status, nota dan maklumat lain dikekalkan
    update public.contacts set
      telefon           = v_c.telefon,
      whatsapp_username = v_c.whatsapp_username,
      whatsapp_bsuid    = v_c.whatsapp_bsuid,
      last_contact_at   = greatest(coalesce(last_contact_at, v_bila), v_bila),
      first_seen_at     = least(coalesce(first_seen_at, v_bila), v_bila),
      nama              = case when nama = '' then v_nama else nama end,
      mesej_pertama     = case when mesej_pertama = '' then v_mesej else mesej_pertama end,
      sumber_lead       = coalesce(sumber_lead, p_sumber)
    where id = v_c.id;
    v_status := 'dikemas_kini';
  end if;

  update public.lead_events set contact_id = v_c.id, keputusan = v_status,
    sebab = coalesce('konflik_' || v_konflik, '') where id = v_ev;
  if p_integration is not null then
    update public.integrations set last_success_at = now() where id = p_integration;
  end if;
  return jsonb_build_object('status', v_status, 'contact_id', v_c.id, 'event_id', v_ev, 'konflik', v_konflik);
end $$;

-- capture_lead (nombor sahaja) kekal untuk webhook sedia ada
create or replace function public.capture_lead(
  p_owner uuid, p_sumber text, p_event_id text, p_telefon text, p_nama text default '', p_mesej text default '',
  p_diterima timestamptz default now(), p_integration uuid default null, p_kaedah text default 'webhook', p_asas text default ''
) returns jsonb
language sql security definer set search_path = public as $$
  select public.capture_identity(p_owner, p_sumber, p_event_id, p_telefon, null, null, p_nama, p_mesej,
                                 p_diterima, p_integration, p_kaedah, p_asas, null, false)
$$;

-- ========== 5. Pengesahan manual lead "nama sahaja" (pengguna sendiri) ==========
-- Pengguna memasukkan nombor ATAU username yang mereka sahkan sendiri.
create or replace function public.sahkan_lead(p_event uuid, p_telefon text default null, p_username text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.lead_events%rowtype;
  r jsonb;
  v_tel text := regexp_replace(coalesce(p_telefon, ''), '[^0-9+]', '', 'g');
begin
  -- Format tempatan Malaysia -> E.164 (0123456789 / 60123456789 -> +60123456789)
  if v_tel ~ '^0[0-9]{8,10}$' then v_tel := '+6' || v_tel;
  elsif v_tel ~ '^60[0-9]{8,10}$' then v_tel := '+' || v_tel;
  end if;
  select * into e from public.lead_events where id = p_event and owner_id = auth.uid() for update;
  if not found then raise exception 'Lead tidak dijumpai'; end if;
  if e.keputusan <> 'belum_disahkan' then raise exception 'Lead ini sudah diproses'; end if;
  if v_tel = '' and nullif(btrim(coalesce(p_username, '')), '') is null then
    raise exception 'Masukkan nombor telefon atau username';
  end if;
  r := public.capture_identity(e.owner_id, e.sumber_lead, e.external_event_id || ':sah', nullif(v_tel, ''), p_username, null,
                               e.nama, e.mesej, e.diterima_at, e.integration_id, 'manual', 'disahkan_manual', e.peranti, e.pratonton_tersembunyi);
  if r->>'status' not in ('dicipta', 'dikemas_kini') then
    raise exception 'Nombor atau username tidak sah';
  end if;
  update public.lead_events set keputusan = 'disahkan_manual', contact_id = (r->>'contact_id')::uuid where id = p_event;
  return r;
end $$;

revoke all on function public.capture_identity(uuid, text, text, text, text, text, text, text, timestamptz, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.capture_identity(uuid, text, text, text, text, text, text, text, timestamptz, uuid, text, text, text, boolean) to service_role;
revoke all on function public.capture_lead(uuid, text, text, text, text, text, timestamptz, uuid, text, text) from public, anon, authenticated;
grant execute on function public.capture_lead(uuid, text, text, text, text, text, timestamptz, uuid, text, text) to service_role;
revoke all on function public.sahkan_lead(uuid, text, text) from public, anon;
grant execute on function public.sahkan_lead(uuid, text, text) to authenticated;
