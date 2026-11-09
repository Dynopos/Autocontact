-- Dyno Auto Contact + Dyno Mini CRM — Automatic Lead Capture
-- ------------------------------------------------------------------
-- Lead baharu dari WhatsApp Cloud API, Meta Lead Ads, alat Auto Contact
-- atau integrasi API masuk ke jadual contacts yang SAMA dengan Mini CRM.
-- Penyewa (tenant) = akaun pengguna (owner_id). Semua jadual baharu
-- dilindungi Row Level Security; webhook menulis melalui fungsi
-- SECURITY DEFINER yang hanya boleh dipanggil oleh service_role.

-- ========== 1. Kenalan: status baharu & medan lead ==========
-- Status (id kekal untuk keserasian; label dalam app):
--   lead=New Lead, dihubungi=Contacted, prospek=Interested,
--   followup=Follow-up, customer=Won, tidak=Lost
alter table public.contacts drop constraint if exists contacts_status_check;
alter table public.contacts add constraint contacts_status_check
  check (status in ('lead','dihubungi','prospek','followup','customer','tidak'));

alter table public.contacts
  add column if not exists sumber_lead text
    check (sumber_lead in ('whatsapp','meta_lead_ads','auto_contact','manual','import','api')),
  add column if not exists mesej_pertama text not null default '' check (char_length(mesej_pertama) <= 1000),
  add column if not exists last_contact_at timestamptz,
  add column if not exists asas_persetujuan text not null default '' check (char_length(asas_persetujuan) <= 60);

create index if not exists contacts_owner_sumber_idx on public.contacts (owner_id, sumber_lead, created_at desc);

-- ========== 2. Integrasi ==========
-- token_rahsia: token Page Meta yang DISULITKAN (AES-GCM) oleh Edge Function
-- dengan kunci dalam pembolehubah persekitaran. kunci_hash: SHA-256 kunci API.
-- Kedua-duanya tidak boleh dibaca oleh pengguna (lihat GRANT di bawah).
create table if not exists public.integrations (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  jenis            text not null check (jenis in ('whatsapp','meta_lead_ads','api')),
  nama             text not null default '' check (char_length(nama) <= 80),
  external_id      text check (external_id is null or external_id ~ '^[0-9]{5,30}$'),
  kunci_hash       text unique check (kunci_hash is null or kunci_hash ~ '^[0-9a-f]{64}$'),
  kunci_awalan     text,
  token_rahsia     text,
  aktif            boolean not null default true,
  retensi_hari     integer not null default 180 check (retensi_hari between 7 and 3650),
  jumlah_event     integer not null default 0,
  last_event_at    timestamptz,
  last_success_at  timestamptz,
  last_error_at    timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  unique (jenis, external_id)
);
create index if not exists integrations_owner_idx on public.integrations (owner_id);

-- ========== 3. Log lead (aktiviti + kunci idempotensi) ==========
create table if not exists public.lead_events (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users (id) on delete cascade,
  integration_id     uuid references public.integrations (id) on delete set null,
  sumber_lead        text not null check (sumber_lead in ('whatsapp','meta_lead_ads','auto_contact','manual','import','api')),
  kaedah             text not null default 'webhook' check (kaedah in ('webhook','api','manual')),
  external_event_id  text not null check (char_length(external_event_id) between 1 and 200),
  contact_id         uuid references public.contacts (id) on delete set null,
  telefon            text,
  nama               text not null default '',
  mesej              text not null default '',
  diterima_at        timestamptz not null default now(),
  keputusan          text check (keputusan in ('dicipta','dikemas_kini','ditolak')),
  sebab              text not null default '',
  created_at         timestamptz not null default now(),
  unique (owner_id, sumber_lead, external_event_id)          -- event sama diproses sekali sahaja
);
create index if not exists lead_events_owner_idx on public.lead_events (owner_id, created_at desc);
create index if not exists lead_events_contact_idx on public.lead_events (contact_id);

-- ========== 4. Log ralat integrasi (untuk pemantauan & cuba semula) ==========
create table if not exists public.integration_errors (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid references auth.users (id) on delete cascade,
  integration_id     uuid references public.integrations (id) on delete cascade,
  sumber_lead        text not null,
  external_event_id  text,
  ralat              text not null check (char_length(ralat) <= 500),
  sementara          boolean not null default true,      -- true = boleh dicuba semula
  percubaan          integer not null default 1,
  selesai            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists integration_errors_event_uidx
  on public.integration_errors (integration_id, external_event_id) where external_event_id is not null;
create index if not exists integration_errors_owner_idx on public.integration_errors (owner_id, selesai, created_at desc);

-- ========== 5. Akses ==========
alter table public.integrations       enable row level security;
alter table public.lead_events        enable row level security;
alter table public.integration_errors enable row level security;

revoke all on public.integrations, public.lead_events, public.integration_errors from anon;
revoke all on public.integrations, public.lead_events, public.integration_errors from authenticated;

-- Pengguna nampak integrasi sendiri, TETAPI bukan token_rahsia atau kunci_hash.
grant select (id, owner_id, jenis, nama, external_id, kunci_awalan, aktif, retensi_hari, jumlah_event,
              last_event_at, last_success_at, last_error_at, last_error, created_at)
  on public.integrations to authenticated;
grant update (nama, aktif, retensi_hari) on public.integrations to authenticated;
grant delete on public.integrations to authenticated;
-- Integrasi dicipta hanya melalui Edge Function `integrasi` (selepas pemilikan disahkan).

grant select, delete on public.lead_events to authenticated;
grant select, update (selesai) on public.integration_errors to authenticated;

drop policy if exists integrations_own on public.integrations;
create policy integrations_own on public.integrations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists lead_events_own on public.lead_events;
create policy lead_events_own on public.lead_events for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists integration_errors_own on public.integration_errors;
create policy integration_errors_own on public.integration_errors for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ========== 6. Tangkap lead (satu transaksi, idempoten) ==========
-- Dipanggil oleh Edge Function (service_role) selepas pengesahan & normalisasi.
-- Pulangan: {status: 'dicipta'|'dikemas_kini'|'ditolak'|'duplikat_event', contact_id, event_id}
create or replace function public.capture_lead(
  p_owner        uuid,
  p_sumber       text,
  p_event_id     text,
  p_telefon      text,
  p_nama         text        default '',
  p_mesej        text        default '',
  p_diterima     timestamptz default now(),
  p_integration  uuid        default null,
  p_kaedah       text        default 'webhook',
  p_asas         text        default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev     uuid;
  v_c      public.contacts%rowtype;
  v_status text;
  v_label  text;
  v_nama   text := left(btrim(coalesce(p_nama, '')), 120);
  v_mesej  text := left(btrim(coalesce(p_mesej, '')), 1000);
  v_tarikh date := (coalesce(p_diterima, now()) at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if p_owner is null then raise exception 'p_owner diperlukan'; end if;

  -- 1. Idempotensi: event yang sama hanya direkodkan sekali
  insert into public.lead_events (owner_id, integration_id, sumber_lead, kaedah, external_event_id,
                                  telefon, nama, mesej, diterima_at)
  values (p_owner, p_integration, p_sumber, coalesce(p_kaedah, 'webhook'), p_event_id,
          p_telefon, v_nama, v_mesej, coalesce(p_diterima, now()))
  on conflict (owner_id, sumber_lead, external_event_id) do nothing
  returning id into v_ev;

  if v_ev is null then
    return jsonb_build_object('status', 'duplikat_event');
  end if;

  if p_integration is not null then
    update public.integrations set last_event_at = now(), jumlah_event = jumlah_event + 1
      where id = p_integration;
  end if;

  -- 2. Nombor tidak sah: tiada kenalan dicipta
  if p_telefon is null or p_telefon !~ '^\+[1-9][0-9]{7,14}$' then
    update public.lead_events set keputusan = 'ditolak', sebab = 'nombor_tidak_sah' where id = v_ev;
    return jsonb_build_object('status', 'ditolak', 'sebab', 'nombor_tidak_sah', 'event_id', v_ev);
  end if;

  v_label := case p_sumber
    when 'whatsapp' then 'WhatsApp' when 'meta_lead_ads' then 'Meta Ads'
    when 'auto_contact' then 'Auto Contact' when 'manual' then 'Manual'
    when 'import' then 'Import' else 'API' end;

  -- 3. Cari atau cipta kenalan (satu nombor = satu kenalan)
  select * into v_c from public.contacts where owner_id = p_owner and telefon = p_telefon for update;
  if not found then
    insert into public.contacts (owner_id, telefon, nama, status, sumber, sumber_lead, mesej_pertama,
                                 last_contact_at, susulan, asas_persetujuan)
    values (p_owner, p_telefon, v_nama, 'lead', v_label, p_sumber, v_mesej,
            coalesce(p_diterima, now()), v_tarikh, left(coalesce(p_asas, ''), 60))
    on conflict (owner_id, telefon) do nothing
    returning * into v_c;
    if v_c.id is not null then
      v_status := 'dicipta';
    else
      -- Lead serentak untuk nombor yang sama: baris kini wujud
      select * into v_c from public.contacts where owner_id = p_owner and telefon = p_telefon for update;
    end if;
  end if;

  if v_status is null then
    -- Kenalan sedia ada: rekod hubungan terkini, JANGAN ubah status, nota atau maklumat lain.
    -- Nama/mesej pertama/sumber hanya diisi jika masih kosong.
    update public.contacts set
      last_contact_at = greatest(coalesce(last_contact_at, coalesce(p_diterima, now())), coalesce(p_diterima, now())),
      nama            = case when nama = '' then v_nama else nama end,
      mesej_pertama   = case when mesej_pertama = '' then v_mesej else mesej_pertama end,
      sumber_lead     = coalesce(sumber_lead, p_sumber)
    where id = v_c.id;
    v_status := 'dikemas_kini';
  end if;

  update public.lead_events set contact_id = v_c.id, keputusan = v_status where id = v_ev;
  if p_integration is not null then
    update public.integrations set last_success_at = now() where id = p_integration;
  end if;

  return jsonb_build_object('status', v_status, 'contact_id', v_c.id, 'event_id', v_ev);
end $$;

-- ========== 7. Fungsi bantuan untuk Edge Function (service_role sahaja) ==========
create or replace function public.cari_integrasi(p_jenis text, p_external_id text)
returns table (id uuid, owner_id uuid, aktif boolean, token_rahsia text)
language sql stable security definer set search_path = public as $$
  select id, owner_id, aktif, token_rahsia from public.integrations
  where jenis = p_jenis and external_id = p_external_id
$$;

create or replace function public.integrasi_mengikut_id(p_id uuid)
returns table (id uuid, owner_id uuid, aktif boolean, token_rahsia text)
language sql stable security definer set search_path = public as $$
  select id, owner_id, aktif, token_rahsia from public.integrations where id = p_id
$$;

create or replace function public.cari_kunci_api(p_hash text)
returns table (id uuid, owner_id uuid, aktif boolean)
language sql stable security definer set search_path = public as $$
  select id, owner_id, aktif from public.integrations where jenis = 'api' and kunci_hash = p_hash
$$;

-- Rekod ralat (atau tambah kiraan jika event yang sama gagal lagi)
create or replace function public.log_ralat_integrasi(
  p_integration uuid, p_owner uuid, p_sumber text, p_event_id text, p_ralat text, p_sementara boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event_id is not null and p_integration is not null then
    insert into public.integration_errors (owner_id, integration_id, sumber_lead, external_event_id, ralat, sementara)
    values (p_owner, p_integration, p_sumber, p_event_id, left(p_ralat, 500), p_sementara)
    on conflict (integration_id, external_event_id) where external_event_id is not null
    do update set ralat = excluded.ralat, sementara = excluded.sementara,
                  percubaan = public.integration_errors.percubaan + 1, selesai = false, updated_at = now();
  else
    insert into public.integration_errors (owner_id, integration_id, sumber_lead, external_event_id, ralat, sementara)
    values (p_owner, p_integration, p_sumber, p_event_id, left(p_ralat, 500), p_sementara);
  end if;
  if p_integration is not null then
    update public.integrations set last_error_at = now(), last_error = left(p_ralat, 300) where id = p_integration;
  end if;
end $$;

create or replace function public.selesai_ralat(p_integration uuid, p_event_id text)
returns void language sql security definer set search_path = public as $$
  update public.integration_errors set selesai = true, updated_at = now()
  where integration_id = p_integration and external_event_id = p_event_id;
$$;

-- Ralat Meta Lead Ads yang perlu dicuba semula (p_owner null = semua, untuk tugas berjadual)
create or replace function public.ralat_untuk_dicuba(p_owner uuid default null, p_had integer default 50)
returns table (id uuid, integration_id uuid, owner_id uuid, external_event_id text, percubaan integer)
language sql stable security definer set search_path = public as $$
  select e.id, e.integration_id, e.owner_id, e.external_event_id, e.percubaan
  from public.integration_errors e
  join public.integrations i on i.id = e.integration_id and i.aktif
  where not e.selesai and e.sumber_lead = 'meta_lead_ads' and e.external_event_id is not null
    and e.percubaan < 20 and (p_owner is null or e.owner_id = p_owner)
  order by e.created_at
  limit greatest(1, least(p_had, 200))
$$;

-- Cipta integrasi selepas Edge Function mengesahkan pemilikan
create or replace function public.daftar_integrasi(
  p_owner uuid, p_jenis text, p_nama text, p_external_id text, p_kunci_hash text, p_kunci_awalan text, p_token text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pemilik uuid;
begin
  if p_external_id is not null then
    select owner_id into v_pemilik from public.integrations where jenis = p_jenis and external_id = p_external_id;
    if v_pemilik is not null and v_pemilik <> p_owner then
      raise exception 'sudah_disambung_akaun_lain';
    end if;
  end if;
  insert into public.integrations (owner_id, jenis, nama, external_id, kunci_hash, kunci_awalan, token_rahsia)
  values (p_owner, p_jenis, left(coalesce(p_nama, ''), 80), p_external_id, p_kunci_hash, p_kunci_awalan, p_token)
  on conflict (jenis, external_id) do update
    set nama = excluded.nama, token_rahsia = coalesce(excluded.token_rahsia, public.integrations.token_rahsia),
        aktif = true, last_error = null
  returning id into v_id;
  return v_id;
end $$;

-- ========== 8. Retensi data (PDPA) ==========
-- Padam log lead lebih lama daripada tempoh retensi integrasi (lalai 180 hari)
-- dan ralat yang sudah selesai lebih lama daripada 30 hari. Kenalan TIDAK dipadam.
create or replace function public.purge_lead_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ev integer; v_err integer;
begin
  delete from public.lead_events e
  where e.created_at < now() - make_interval(days => coalesce(
          (select i.retensi_hari from public.integrations i where i.id = e.integration_id), 180));
  get diagnostics v_ev = row_count;
  delete from public.integration_errors where selesai and updated_at < now() - interval '30 days';
  get diagnostics v_err = row_count;
  return jsonb_build_object('lead_events_dipadam', v_ev, 'ralat_dipadam', v_err);
end $$;

revoke all on function public.capture_lead(uuid, text, text, text, text, text, timestamptz, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cari_integrasi(text, text)                                from public, anon, authenticated;
revoke all on function public.cari_kunci_api(text)                                      from public, anon, authenticated;
revoke all on function public.integrasi_mengikut_id(uuid)                               from public, anon, authenticated;
revoke all on function public.log_ralat_integrasi(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.selesai_ralat(uuid, text)                                 from public, anon, authenticated;
revoke all on function public.ralat_untuk_dicuba(uuid, integer)                         from public, anon, authenticated;
revoke all on function public.daftar_integrasi(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.purge_lead_data()                                         from public, anon, authenticated;
grant execute on function public.capture_lead(uuid, text, text, text, text, text, timestamptz, uuid, text, text) to service_role;
grant execute on function public.cari_integrasi(text, text)                                to service_role;
grant execute on function public.cari_kunci_api(text)                                      to service_role;
grant execute on function public.integrasi_mengikut_id(uuid)                               to service_role;
grant execute on function public.log_ralat_integrasi(uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function public.selesai_ralat(uuid, text)                                 to service_role;
grant execute on function public.ralat_untuk_dicuba(uuid, integer)                         to service_role;
grant execute on function public.daftar_integrasi(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.purge_lead_data()                                         to service_role;
