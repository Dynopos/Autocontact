-- Dyno Mini CRM — storan berpusat + Smart WhatsApp Classification
-- ------------------------------------------------------------------
-- Setiap jadual ada owner_id dan Row Level Security: pengguna hanya
-- boleh membaca dan menulis rekod sendiri. Tiada jadual yang boleh
-- dibaca oleh pengguna lain atau oleh pelawat tanpa log masuk.
--
-- Teks chat WhatsApp TIDAK disimpan di sini. Hanya keputusan analisis
-- (kategori, produk, ringkasan, tindakan) yang disahkan pengguna.

-- ========== Kenalan pelanggan ==========
create table if not exists public.contacts (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  telefon               text not null check (telefon ~ '^\+[0-9]{8,15}$'),
  nama                  text not null default '' check (char_length(nama) <= 120),
  emel                  text not null default '' check (char_length(emel) <= 160),
  produk                text not null default '' check (char_length(produk) <= 120),
  status                text not null default 'lead'
                          check (status in ('lead','prospek','followup','customer','tidak')),
  sumber                text not null default '' check (char_length(sumber) <= 40),
  kumpulan              text not null default '' check (char_length(kumpulan) <= 60),
  susulan               date,
  nota                  text not null default '' check (char_length(nota) <= 4000),
  -- Smart WhatsApp Classification
  kategori              text check (kategori in (
                          'prospek_harga','prospek_berminat','prospek_hampir',
                          'support_pelanggan','customer_semak','tidak_diketahui')),
  kategori_disahkan     boolean not null default false,
  kategori_disahkan_at  timestamptz,
  ringkasan             text not null default '' check (char_length(ringkasan) <= 1000),
  tindakan              text not null default '' check (char_length(tindakan) <= 300),
  keyakinan             numeric(3,2) check (keyakinan between 0 and 1),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (owner_id, telefon)
);
create index if not exists contacts_owner_idx on public.contacts (owner_id, updated_at desc);

-- ========== Import chat (tanpa teks chat) ==========
-- file_hash = SHA-256 teks chat, dikira dalam telefon. Digunakan untuk
-- mengesan fail yang sama dimuat naik dua kali.
create table if not exists public.chat_imports (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_hash      text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  file_name      text not null default '' check (char_length(file_name) <= 200),
  message_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (owner_id, file_hash)
);

-- ========== Keputusan klasifikasi ==========
-- status: 'pending' = menunggu semakan manual (kenalan belum dipadankan)
--         'saved'   = disahkan dan disimpan ke kenalan
create table if not exists public.classifications (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_id     uuid references public.chat_imports (id) on delete cascade,
  contact_id    uuid references public.contacts (id) on delete set null,
  sender_label  text not null default '' check (char_length(sender_label) <= 120),
  sender_phone  text check (sender_phone is null or sender_phone ~ '^\+[0-9]{8,15}$'),
  calon         jsonb not null default '[]'::jsonb,          -- id kenalan yang mungkin sepadan
  kategori      text not null check (kategori in (
                  'prospek_harga','prospek_berminat','prospek_hampir',
                  'support_pelanggan','customer_semak','tidak_diketahui')),
  produk        text not null default '' check (char_length(produk) <= 120),
  ringkasan     text not null default '' check (char_length(ringkasan) <= 1000),
  tindakan      text not null default '' check (char_length(tindakan) <= 300),
  keyakinan     numeric(3,2) check (keyakinan between 0 and 1),
  susulan_hari  integer check (susulan_hari between 0 and 30),
  status        text not null default 'pending' check (status in ('pending','saved')),
  created_at    timestamptz not null default now()
);
create index if not exists classifications_owner_idx on public.classifications (owner_id, status, created_at desc);

-- ========== Pelan & penggunaan AI ==========
-- Pengguna boleh MEMBACA had sendiri tetapi tidak boleh mengubahnya.
-- Hanya pentadbir (dashboard Supabase / service role) menukar had.
create table if not exists public.user_plans (
  owner_id          uuid primary key references auth.users (id) on delete cascade,
  ai_monthly_limit  integer not null default 20 check (ai_monthly_limit >= 0),
  updated_at        timestamptz not null default now()
);

create table if not exists public.ai_usage (
  owner_id  uuid not null references auth.users (id) on delete cascade,
  bulan     text not null check (bulan ~ '^\d{4}-\d{2}$'),
  jumlah    integer not null default 0,
  primary key (owner_id, bulan)
);

-- ========== updated_at automatik ==========
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- owner_id tidak boleh ditukar selepas rekod dicipta
create or replace function public.lock_owner() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id tidak boleh diubah';
  end if;
  return new;
end $$;

drop trigger if exists contacts_lock_owner on public.contacts;
create trigger contacts_lock_owner before update on public.contacts
  for each row execute function public.lock_owner();
drop trigger if exists chat_imports_lock_owner on public.chat_imports;
create trigger chat_imports_lock_owner before update on public.chat_imports
  for each row execute function public.lock_owner();
drop trigger if exists classifications_lock_owner on public.classifications;
create trigger classifications_lock_owner before update on public.classifications
  for each row execute function public.lock_owner();

-- ========== Row Level Security ==========
alter table public.contacts        enable row level security;
alter table public.chat_imports    enable row level security;
alter table public.classifications enable row level security;
alter table public.user_plans      enable row level security;
alter table public.ai_usage        enable row level security;

-- Pelawat tanpa log masuk tidak mendapat apa-apa
revoke all on public.contacts, public.chat_imports, public.classifications,
              public.user_plans, public.ai_usage from anon;

drop policy if exists contacts_own on public.contacts;
create policy contacts_own on public.contacts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_imports_own on public.chat_imports;
create policy chat_imports_own on public.chat_imports for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists classifications_own on public.classifications;
create policy classifications_own on public.classifications for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid()))
    and (import_id is null or exists (
      select 1 from public.chat_imports i where i.id = import_id and i.owner_id = auth.uid()))
  );

drop policy if exists user_plans_read_own on public.user_plans;
create policy user_plans_read_own on public.user_plans for select to authenticated
  using (owner_id = auth.uid());
revoke insert, update, delete on public.user_plans from authenticated;

drop policy if exists ai_usage_read_own on public.ai_usage;
create policy ai_usage_read_own on public.ai_usage for select to authenticated
  using (owner_id = auth.uid());
revoke insert, update, delete on public.ai_usage from authenticated;

-- ========== Simpan keputusan klasifikasi ==========
-- Semua peraturan perniagaan di satu tempat, dijalankan sebagai pengguna
-- (SECURITY INVOKER), jadi RLS tetap terpakai:
--   * Customer HANYA bila p_pembelian_disahkan = true
--   * Kategori yang sudah disahkan tidak ditimpa tanpa p_ganti_kategori
--   * Status 'customer' sedia ada tidak pernah diturunkan
--   * Satu nombor = satu kenalan (tiada pendua)
create or replace function public.apply_classification(
  p_kategori            text,
  p_contact_id          uuid    default null,
  p_telefon             text    default null,
  p_nama                text    default '',
  p_produk              text    default '',
  p_ringkasan           text    default '',
  p_tindakan            text    default '',
  p_keyakinan           numeric default null,
  p_susulan             date    default null,
  p_pembelian_disahkan  boolean default false,
  p_ganti_kategori      boolean default false,
  p_import_id           uuid    default null,
  p_classification_id   uuid    default null,
  p_sender_label        text    default ''
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  c            public.contacts%rowtype;
  v_baru       boolean := false;
  v_kekal      boolean := false;
  v_status     text;
begin
  if v_uid is null then
    raise exception 'Perlu log masuk';
  end if;
  if p_kategori not in ('prospek_harga','prospek_berminat','prospek_hampir',
                        'support_pelanggan','customer_semak','tidak_diketahui') then
    raise exception 'Kategori tidak sah: %', p_kategori;
  end if;

  -- Cari atau cipta kenalan
  if p_contact_id is not null then
    select * into c from public.contacts where id = p_contact_id for update;
    if not found then
      raise exception 'Kenalan tidak dijumpai';
    end if;
  else
    if p_telefon is null or p_telefon !~ '^\+[0-9]{8,15}$' then
      raise exception 'Nombor telefon diperlukan untuk kenalan baharu';
    end if;
    select * into c from public.contacts
      where owner_id = v_uid and telefon = p_telefon for update;
    if not found then
      insert into public.contacts (owner_id, telefon, nama, sumber, status)
        values (v_uid, p_telefon, coalesce(left(p_nama, 120), ''), 'WhatsApp', 'lead')
        returning * into c;
      v_baru := true;
    end if;
  end if;

  -- Kategori yang sudah disahkan dilindungi
  v_kekal := c.kategori_disahkan and c.kategori is distinct from p_kategori and not p_ganti_kategori;

  v_status := c.status;
  if not v_kekal and c.status <> 'customer' then
    if p_kategori = 'customer_semak' and p_pembelian_disahkan then
      v_status := 'customer';
    elsif p_kategori in ('prospek_harga','prospek_berminat','prospek_hampir') then
      v_status := 'prospek';
    elsif p_kategori in ('support_pelanggan','customer_semak') then
      v_status := 'followup';
    end if;
  end if;

  update public.contacts set
    kategori             = case when v_kekal then kategori else p_kategori end,
    kategori_disahkan    = case when v_kekal then kategori_disahkan else true end,
    kategori_disahkan_at = case when v_kekal then kategori_disahkan_at else now() end,
    status               = v_status,
    produk               = case when coalesce(p_produk, '') <> '' then left(p_produk, 120) else produk end,
    ringkasan            = left(coalesce(p_ringkasan, ''), 1000),
    tindakan             = left(coalesce(p_tindakan, ''), 300),
    keyakinan            = p_keyakinan,
    susulan              = coalesce(p_susulan, susulan),
    nama                 = case when nama = '' and coalesce(p_nama, '') <> '' then left(p_nama, 120) else nama end
  where id = c.id
  returning * into c;

  if p_classification_id is not null then
    update public.classifications set
      contact_id = c.id, status = 'saved', kategori = p_kategori,
      produk = left(coalesce(p_produk, ''), 120), ringkasan = left(coalesce(p_ringkasan, ''), 1000),
      tindakan = left(coalesce(p_tindakan, ''), 300), keyakinan = p_keyakinan
    where id = p_classification_id;
  else
    insert into public.classifications (owner_id, import_id, contact_id, sender_label, sender_phone,
                                        kategori, produk, ringkasan, tindakan, keyakinan, status)
    values (v_uid, p_import_id, c.id, left(coalesce(p_sender_label, ''), 120), c.telefon,
            p_kategori, left(coalesce(p_produk, ''), 120), left(coalesce(p_ringkasan, ''), 1000),
            left(coalesce(p_tindakan, ''), 300), p_keyakinan, 'saved');
  end if;

  return jsonb_build_object(
    'contact_id', c.id, 'status', c.status, 'kategori', c.kategori,
    'kenalan_baharu', v_baru, 'kategori_dikekalkan', v_kekal);
end $$;

revoke all on function public.apply_classification(text, uuid, text, text, text, text, text, numeric, date, boolean, boolean, uuid, uuid, text) from public, anon;
grant execute on function public.apply_classification(text, uuid, text, text, text, text, text, numeric, date, boolean, boolean, uuid, uuid, text) to authenticated;

-- ========== Kiraan penggunaan AI (Edge Function sahaja) ==========
-- Dipanggil dengan service role oleh fungsi classify-chat. Menambah
-- kiraan secara atomik dan menolak jika had bulanan sudah dicapai.
create or replace function public.ai_usage_claim(p_owner uuid, p_bulan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_had    integer;
  v_jumlah integer;
begin
  select ai_monthly_limit into v_had from public.user_plans where owner_id = p_owner;
  v_had := coalesce(v_had, 20);

  insert into public.ai_usage (owner_id, bulan, jumlah) values (p_owner, p_bulan, 0)
    on conflict (owner_id, bulan) do nothing;
  update public.ai_usage set jumlah = jumlah + 1
    where owner_id = p_owner and bulan = p_bulan and jumlah < v_had
    returning jumlah into v_jumlah;

  if v_jumlah is null then
    return jsonb_build_object('ok', false, 'had', v_had);
  end if;
  return jsonb_build_object('ok', true, 'had', v_had, 'jumlah', v_jumlah);
end $$;

-- Pulangkan satu kiraan bila panggilan AI gagal selepas dituntut
create or replace function public.ai_usage_refund(p_owner uuid, p_bulan text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set jumlah = greatest(jumlah - 1, 0)
  where owner_id = p_owner and bulan = p_bulan;
$$;

revoke all on function public.ai_usage_claim(uuid, text)  from public, anon, authenticated;
revoke all on function public.ai_usage_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_usage_claim(uuid, text)  to service_role;
grant execute on function public.ai_usage_refund(uuid, text) to service_role;
