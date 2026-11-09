# Dyno Mini CRM — awan & Smart WhatsApp Classification

Folder ini mengandungi semua yang diperlukan di sebelah pelayan:

| Fail | Fungsi |
|---|---|
| `migrations/20261109000000_mini_crm_cloud.sql` | Jadual, Row Level Security, dan fungsi `apply_classification` |
| `functions/classify-chat/index.ts` | Edge Function yang memanggil Claude (API key kekal di pelayan) |
| `functions/_shared/klasifikasi.ts` | Prompt, skema jawapan, pembersihan data peribadi |
| `migrations/20261110000000_lead_capture.sql` | Lead automatik: integrasi, log lead (idempotensi), log ralat, `capture_lead`, retensi |
| `functions/lead-capture/` | `POST /api/leads/capture` — kunci API atau JWT app |
| `functions/whatsapp-webhook/` | Webhook rasmi WhatsApp Business Platform (Cloud API) |
| `functions/meta-leads-webhook/` | Webhook Page `leadgen` untuk Meta Lead Ads (Facebook/Instagram) |
| `functions/integrasi/` | Sambung WhatsApp / Page Meta (pemilikan disahkan) dan cipta kunci API |
| `functions/lead-retry/` | Cuba semula lead Meta yang gagal (berjadual atau butang dalam app) |
| `functions/_shared/telefon.ts` | Normalisasi E.164 dengan `libphonenumber-js` |
| `tests/` | Ujian RLS, ujian Edge Function (Deno) dan ujian hujung ke hujung lead capture |

Selagi `docs/config.js` kosong, app di minicrm.my berjalan seperti dahulu (mod telefon sahaja)
dan semua ciri awan disembunyikan. Jadi kod ini selamat di-merge sebelum Supabase siap.

## Cara ia melindungi data

- **Fail chat tidak dimuat naik.** Telefon membaca fail, membuang nama, nombor telefon, emel, IC dan
  pautan, dan hanya menghantar paling banyak 60 mesej terkini (≤ 8,000 aksara) untuk analisis.
  Edge Function membersihkan sekali lagi sebelum menghantar kepada Claude, dan tidak menyimpan atau
  melog teks chat.
- **Setiap pengguna hanya nampak data sendiri.** Semua jadual ada `owner_id` dan Row Level Security.
  Pelawat tanpa log masuk (`anon`) tiada akses langsung.
- **AI hanya mencadang.** Tiada apa disimpan tanpa pengesahan pengguna. `apply_classification`:
  - menandakan **Customer hanya jika `p_pembelian_disahkan = true`**;
  - **tidak menimpa kategori yang sudah disahkan** kecuali `p_ganti_kategori = true`;
  - tidak pernah menurunkan status Customer sedia ada;
  - satu nombor = satu kenalan (`unique (owner_id, telefon)`), dan fail chat yang sama dikesan melalui
    SHA-256 (`unique (owner_id, file_hash)`).
- **Had AI bulanan** dalam `user_plans` (lalai 20). Pengguna boleh membaca had sendiri tetapi tidak
  boleh mengubahnya; Edge Function menuntut kiraan secara atomik dan memulangkannya jika AI gagal.

## Pemasangan (sekali sahaja)

1. **Cipta projek** di [supabase.com](https://supabase.com). Pilih rantau **Southeast Asia (Singapore)**
   supaya dekat dengan pengguna Malaysia.
2. **Jalankan migrasi.** Supabase → SQL Editor → tampal isi
   `migrations/20261109000000_mini_crm_cloud.sql` → Run.
   (Atau dengan CLI: `supabase link --project-ref <ref>` kemudian `supabase db push`.)
3. **Log masuk dengan kod emel.** Authentication → Sign In / Providers → Email: hidupkan.
   Authentication → Emails → template **Magic Link**: pastikan ia mengandungi `{{ .Token }}`
   (kod 6 digit), contohnya:
   ```html
   <h2>Kod log masuk Dyno Mini CRM</h2>
   <p>Masukkan kod ini dalam app: <strong>{{ .Token }}</strong></p>
   <p>Kod tamat dalam 1 jam. Abaikan emel ini jika anda tidak cuba log masuk.</p>
   ```
   Authentication → URL Configuration → Site URL: `https://minicrm.my`.
   Untuk pengguna sebenar, sediakan SMTP sendiri (Authentication → Emails → SMTP) kerana pelayan emel
   lalai Supabase sangat terhad.
4. **Edge Function dan API key Claude:**
   ```bash
   supabase functions deploy classify-chat
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ALLOWED_ORIGINS=https://minicrm.my
   ```
   API key dari [platform.claude.com](https://platform.claude.com). Jangan sesekali letak key ini dalam `docs/`.
5. **Sambungkan app.** Supabase → Project Settings → API. Salin **Project URL** dan kunci **anon public**
   ke `docs/config.js`, commit, dan merge. (Kunci anon memang selamat di pelayar kerana RLS.
   **Jangan** guna kunci `service_role`.)

## Pelan & had AI

Setiap pengguna baharu mendapat 20 analisis sebulan. Untuk menukar had seorang pengguna
(cari `id` di Authentication → Users), jalankan dalam SQL Editor:

```sql
insert into public.user_plans (owner_id, ai_monthly_limit)
values ('<id pengguna>', 500)
on conflict (owner_id) do update set ai_monthly_limit = excluded.ai_monthly_limit, updated_at = now();
```

Untuk menukar had lalai semua pengguna, ubah `coalesce(v_had, 20)` dalam `ai_usage_claim`.

## Anggaran kos AI

Fungsi ini guna **Claude Opus 5.5** (`claude-opus-5-5`, US$4 / US$20 setiap juta token input / output)
pada `effort: "low"`, dengan jawapan JSON berstruktur. Satu chat biasa ≈ 1,500–4,000 token input dan
≈ 300–1,000 token output (termasuk pemikiran model), iaitu lebih kurang **US$0.01–0.04 (≈ RM0.05–0.20)
setiap chat**. Semak penggunaan sebenar di Claude Console selepas beberapa hari, dan tetapkan harga pelan
serta had bulanan berdasarkan angka itu.

Fungsi juga menghantar `fallbacks: "default"`: jika pengelas keselamatan model menolak permintaan,
Claude menjalankannya semula pada model sandaran yang disyorkan dalam panggilan yang sama.

## Ujian

```bash
# Pembaca chat, pembersihan data, pemadanan (Node 18+)
node tests/wa-klasifikasi.test.js

# Edge Function dengan Claude & Supabase palsu (Deno 2)
cd supabase/tests && deno run -A classify-chat.test.ts

# RLS & peraturan perniagaan (Postgres 15+ tempatan, BUKAN projek Supabase sebenar)
createdb mini_crm_test
psql -d mini_crm_test -f supabase/tests/stub-auth.sql \
     -f supabase/migrations/20261109000000_mini_crm_cloud.sql \
     -f supabase/tests/rls.test.sql
```

---

# Lead automatik (WhatsApp Business Platform + Meta Lead Ads)

Aliran: **lead masuk → webhook/integrasi rasmi → normalisasi E.164 → cari nombor → cipta kenalan baharu
(New Lead) atau kemas kini `last_contact_at` → dashboard Mini CRM**. Semua sumber menulis ke jadual
`contacts` yang sama; tiada aplikasi CRM berasingan.

## Peraturan

- **Satu nombor = satu kenalan** (`unique (owner_id, telefon)`). Nombor sedia ada hanya dikemas kini
  `last_contact_at`; status, nota dan maklumat lain **tidak diubah** (nama/mesej pertama hanya diisi jika kosong).
- **Idempoten:** setiap event direkodkan dalam `lead_events` dengan `unique (owner_id, sumber_lead, external_event_id)`
  — WhatsApp `message.id`, Meta `leadgen_id`, API `external_lead_id`. Event berganda → `duplikat_event`.
- **Nombor tidak sah ditolak** (tiada kenalan dicipta) dan penolakan direkodkan untuk audit.
- **Sumber tepat:** `sumber_lead` hanya `whatsapp` / `meta_lead_ads` bila datang dari integrasi yang disahkan
  (atau kunci API yang anda cipta). App tidak boleh melabel lead sebagai Meta Ads.
- **Ralat sementara** (pangkalan data, Graph API): 3 cubaan dalaman dengan jarak masa, kemudian balas 5xx supaya
  Meta/pemanggil menghantar semula. Lead Meta yang gagal juga direkod dalam `integration_errors` untuk `lead-retry`.
- **Penyewaan:** setiap akaun (syarikat) hanya nampak kenalan, integrasi, log dan ralat sendiri (RLS). Token Page
  Meta disulitkan AES-256-GCM dan lajur rahsia tidak boleh dibaca oleh pengguna (column grants).

## Pembolehubah persekitaran (Supabase → Edge Functions → Secrets)

| Nama | Untuk | Nilai |
|---|---|---|
| `META_APP_SECRET` | whatsapp-webhook, meta-leads-webhook | App Secret app Meta Dyno (pengesahan `X-Hub-Signature-256`) |
| `WHATSAPP_VERIFY_TOKEN` | whatsapp-webhook | Rentetan rawak anda; masukkan yang sama di Meta |
| `META_VERIFY_TOKEN` | meta-leads-webhook | Rentetan rawak anda; masukkan yang sama di Meta |
| `INTEGRATION_ENC_KEY` | integrasi, meta-leads-webhook, lead-retry | `openssl rand -base64 32` — **jangan ubah** selepas Page disambung |
| `META_GRAPH_VERSION` | semua fungsi Meta | Versi Graph API semasa, cth. `v24.0` (semak changelog Meta) |
| `CRON_SECRET` | lead-retry | Rentetan rawak untuk tugas berjadual |
| `ALLOWED_ORIGINS` | fungsi yang dipanggil app | `https://minicrm.my` |
| `ANTHROPIC_API_KEY` | classify-chat | (sedia ada) |

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` disediakan automatik. Tiada rahsia dalam `docs/`.

## Pemasangan

1. Jalankan migrasi `20261110000000_lead_capture.sql` (SQL Editor atau `supabase db push`).
2. Deploy fungsi (gerbang JWT dimatikan untuk webhook & kunci API — lihat `config.toml`):
   ```bash
   supabase functions deploy lead-capture whatsapp-webhook meta-leads-webhook integrasi lead-retry
   supabase secrets set META_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=... META_VERIFY_TOKEN=... \
     INTEGRATION_ENC_KEY=$(openssl rand -base64 32) META_GRAPH_VERSION=v24.0 CRON_SECRET=... ALLOWED_ORIGINS=https://minicrm.my
   ```
3. **App Meta Dyno** (developers.facebook.com, satu app untuk semua pelanggan):
   - Produk **WhatsApp** → Configuration → Webhook: URL `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`,
     verify token = `WHATSAPP_VERIFY_TOKEN`, langgan medan **messages**.
   - Produk **Webhooks** → objek **Page**: URL `https://<ref>.supabase.co/functions/v1/meta-leads-webhook`,
     verify token = `META_VERIFY_TOKEN`, langgan medan **leadgen**.
   - Kebenaran yang perlu melalui App Review untuk pelanggan luar: `leads_retrieval`, `pages_manage_metadata`,
     `pages_show_list`, `pages_read_engagement`, `whatsapp_business_messaging`, `whatsapp_business_management`.
4. **Setiap pelanggan** menyambung sumber sendiri di `minicrm.my/integrasi.html` (Page ID + Page token, atau
   Phone number ID + token). Pemilikan disahkan melalui Graph API sebelum disimpan, jadi akaun lain tidak boleh
   menuntut Page atau nombor yang sama.
5. **Tugas berjadual** (Supabase → Integrations → Cron, atau SQL dengan `pg_cron` + `pg_net`):
   ```sql
   -- Padam log lead melebihi tempoh retensi (setiap hari 3 pagi waktu Malaysia)
   select cron.schedule('purge-lead-data', '0 19 * * *', $$select public.purge_lead_data()$$);
   -- Cuba semula lead Meta yang gagal (setiap 15 minit)
   select cron.schedule('lead-retry', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/lead-retry',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb) $$);
   ```

## API: `POST /functions/v1/lead-capture`

```http
POST https://<ref>.supabase.co/functions/v1/lead-capture
Authorization: Bearer dyno_<kunci dari integrasi.html>
Content-Type: application/json

{ "phone_number": "+60123456789", "contact_name": "Ahmad", "lead_source": "api",
  "first_message": "Nak tanya harga POS", "external_lead_id": "example-event-123" }
```

Atau `{ "leads": [ ... ] }` (maksimum 200). `lead_source`: `whatsapp`, `meta_lead_ads`, `auto_contact`,
`manual`, `import`, `api` (lalai `api`). `external_lead_id` **wajib** untuk kunci API.

```json
{ "diproses": 1, "keputusan": [{ "external_lead_id": "example-event-123", "status": "dicipta", "contact_id": "..." }] }
```

`status`: `dicipta` · `dikemas_kini` · `duplikat_event` · `ditolak` (dengan `sebab`). HTTP 401 kunci salah,
400 input salah, 503 ralat sementara (hantar semula — selamat kerana idempoten).

## Ujian hujung ke hujung

```bash
createdb lead && psql -d lead -f supabase/tests/stub-auth.sql \
  -f supabase/migrations/20261109000000_mini_crm_cloud.sql -f supabase/migrations/20261110000000_lead_capture.sql
PGURL=postgres://postgres@localhost:5432/lead deno run -A supabase/tests/lead-capture.e2e.test.ts
```

Fungsi Edge sebenar + Postgres sebenar; gerbang Supabase dan Graph API Meta disimulasi secara tempatan.

## Had yang masih ada

- **Belum diuji dengan Meta sebenar.** Format webhook dan Graph API dibina mengikut format rasmi Meta yang diketahui,
  tetapi dokumentasi Meta tidak dapat dibuka semasa pembangunan. Sahkan dengan nombor ujian WhatsApp dan
  [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing) sebelum dilancarkan.
- **App WhatsApp Business biasa** (bukan Cloud API) tiada API rasmi untuk membaca mesej — gunakan
  `kongsi.html` (kongsi kenalan/mesej, atau Share Target di Android).
- **Penyambungan Meta** menggunakan token yang ditampal. Facebook Login / Embedded Signup (lebih mudah untuk
  pelanggan) belum dibina, dan app Meta perlu lulus App Review untuk pelanggan luar.
- **Satu akaun = satu syarikat.** Berbilang pengguna dalam satu syarikat (pasukan) belum disokong.
- Token Page boleh tamat; status integrasi menunjukkan ralat dan pelanggan perlu menyambung semula.
