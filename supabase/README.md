# Dyno Mini CRM — awan & Smart WhatsApp Classification

Folder ini mengandungi semua yang diperlukan di sebelah pelayan:

| Fail | Fungsi |
|---|---|
| `migrations/20261109000000_mini_crm_cloud.sql` | Jadual, Row Level Security, dan fungsi `apply_classification` |
| `functions/classify-chat/index.ts` | Edge Function yang memanggil Claude (API key kekal di pelayan) |
| `functions/_shared/klasifikasi.ts` | Prompt, skema jawapan, pembersihan data peribadi |
| `tests/` | Ujian RLS (Postgres tempatan) dan ujian Edge Function (Deno) |

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
