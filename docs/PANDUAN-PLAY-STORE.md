# 📱 Panduan Terbit Dynopro Auto Contact ke Google Play Store
### Laluan Akaun Organisasi (Syarikat) — Malaysia

Dokumen ini adalah pelan langkah demi langkah dari sifar sehingga app hidup di Play Store.
Semua maklumat disemak pada **4 Ogos 2026**.

---

## 💰 Kos sebenar

| Perkara | Kos | Nota |
|---|---|---|
| Yuran pendaftaran Play Console | **USD $25** (± RM 118) | **Sekali seumur hidup**, bukan tahunan. Kad kredit/debit sahaja — kad prepaid **tidak** diterima |
| Nombor D-U-N-S | **Percuma** | Dari Dun & Bradstreet |
| Pendaftaran SSM | RM 60–RM 1,000+ | Jika Bob belum ada syarikat berdaftar |
| Website syarikat | RM 0–RM 300/tahun | **Wajib** untuk akaun organisasi |
| Hosting privacy policy | Percuma | Boleh guna GitHub Pages |
| **Jumlah minimum (jika SSM sudah ada)** | **± RM 120** | |

---

## ⏱️ Jangka masa realistik

```
Minggu 1        →  Mohon D-U-N-S (percuma)
Minggu 1–4      →  Tunggu D-U-N-S diluluskan  ⚠️ ini bahagian paling lama
Minggu 4        →  Daftar Play Console + bayar $25
Minggu 4–5      →  Verifikasi identiti & organisasi oleh Google
Minggu 5        →  Muat naik .aab + isi listing + Data Safety
Minggu 5–6      →  Semakan Google (biasanya 3–7 hari; app minta kebenaran
                    sensitif seperti Contacts selalunya lebih lama)
────────────────────────────────────────────────
Realistik: 5–8 minggu dari hari ini
```

> 💡 **Mula mohon D-U-N-S HARI INI.** Itu satu-satunya bahagian yang Bob tak boleh
> percepatkan, dan semua benda lain boleh disiapkan sambil menunggu.

---

## ✅ Kelebihan akaun Organisasi (pilihan Bob)

| | Organisasi | Peribadi |
|---|---|---|
| Perlu D-U-N-S | Ya (± 30 hari) | Tidak |
| **12 penguji × 14 hari sebelum terbit** | ❌ **Dikecualikan** | ✅ Wajib |
| Nama papar di Play Store | Nama syarikat | Nama individu |
| Sesuai untuk app berbayar | ✅ Ya | Kurang |

Pilihan Bob betul: dengan akaun organisasi, **Bob tak perlu cari 12 orang penguji
dan tunggu 14 hari** — boleh terus terbit ke public sebaik lulus semakan.

---

## 📋 FASA 1 — Sebelum daftar (buat sekarang)

### 1.1 Pastikan syarikat berdaftar SSM
Perlu nama sah syarikat, nombor pendaftaran, dan alamat yang sepadan dengan dokumen rasmi.
Nama yang Bob isi di Google **mesti sama tepat** dengan SSM.

### 1.2 Mohon nombor D-U-N-S (percuma) ⚠️ MULA HARI INI
1. Pergi ke halaman khas Google: <https://www.dnb.com/en-us/smb/duns/google-developers.html>
2. Semak dahulu sama ada syarikat Bob **sudah** ada D-U-N-S (banyak syarikat sudah ada tanpa sedar)
3. Jika tiada, mohon baharu — **percuma**
4. Guna maklumat yang **sama tepat** dengan SSM: nama, alamat, nombor telefon
5. Ambil masa **sehingga 30 hari**

> Jika D&B hubungi untuk pengesahan, jawab cepat — ini boleh memendekkan tempoh menunggu.

### 1.3 Sediakan website syarikat
Wajib untuk akaun organisasi. Tidak perlu mewah — satu halaman yang menyatakan nama
syarikat, apa yang dijual, dan cara hubungi sudah memadai. Boleh guna GitHub Pages percuma.

### 1.4 Terbitkan privacy policy
Fail `docs/privacy-policy.html` sudah disediakan. Ganti semua `[TANDA KURUNG]` dengan
maklumat sebenar, kemudian terbitkan.

**Cara percuma guna GitHub Pages:**
1. Dalam repo GitHub → **Settings** → **Pages**
2. Source: **Deploy from a branch** → Branch: `main` → Folder: `/docs`
3. Simpan. URL akan jadi:
   `https://[username].github.io/dynopro-auto-contact/privacy-policy.html`
4. Buka URL tu dan pastikan ia boleh dilihat tanpa log masuk

---

## 📋 FASA 2 — Daftar Play Console

### 2.1 Buat akaun
1. Pergi ke <https://play.google.com/console/signup>
2. Pilih **Organization / Business** (bukan Personal)
3. Bayar **USD $25** — kad kredit atau debit sahaja
4. Isi maklumat yang diperlukan:

| Medan | Isi dengan |
|---|---|
| Developer name | Nama yang pengguna nampak di Play Store |
| D-U-N-S number | Dari Fasa 1.2 |
| Organization name & address | **Sama tepat** dengan SSM |
| Organization phone | Nombor syarikat yang boleh dihubungi |
| Organization website | Dari Fasa 1.3 |
| Contact name, email, phone | Orang yang bertanggungjawab |

### 2.2 Verifikasi
Google akan sahkan identiti dan butiran organisasi. Biasanya beberapa hari hingga seminggu.
**Pastikan setiap butiran sepadan dengan SSM dan D-U-N-S** — ketidakpadanan adalah punca
utama kelewatan.

---

## 📋 FASA 3 — Sediakan app

### 3.1 Dapatkan fail .aab
Play Store **tidak menerima** `.apk` untuk app baharu. GitHub Actions kita sudah dikemas
kini untuk membina **kedua-dua**:

- `app-release.apk` → untuk Bob uji sendiri di phone
- `app-release.aab` → untuk muat naik ke Play Console ✅

Ambil dari tab **Releases** dalam repo GitHub selepas build selesai.

### 3.2 Penandatanganan (App Signing)
Semasa muat naik pertama, pilih **Play App Signing** (disyorkan) — Google akan uruskan
kunci penandatanganan untuk Bob, jadi tak perlu risau kehilangan keystore.

### 3.3 Target API 36
Google mewajibkan **API 36** untuk app baharu mulai **31 Ogos 2026**. Workflow CI kita
sudah menetapkannya secara automatik, jadi ini sudah selesai.

---

## 📋 FASA 4 — Isi listing Play Store

### 4.1 Nama & penerangan

⚠️ **JANGAN letak perkataan "WhatsApp" dalam nama app atau ikon.** Itu tanda dagangan Meta
dan boleh menyebabkan penolakan atas dasar *impersonation*. Butiran penuh dalam
`docs/JUSTIFIKASI-CONTACTS.md`.

**Nama dicadangkan:**
```
Dynopro Auto Contact
```

**Penerangan pendek (80 aksara):**
```
Tukar fail eksport chat jadi kontak telefon — beratus nombor dalam satu ketukan.
```

**Penerangan panjang (contoh selamat):**
```
Dynopro Auto Contact menukar fail eksport perbualan (.txt) menjadi kontak telefon secara pukal.

Daripada menaip nombor pelanggan satu demi satu, eksport perbualan atau kumpulan anda
sebagai fail teks, pilih fail itu dalam Dynopro Auto Contact, dan simpan kesemua nombor ke buku
alamat anda dengan satu ketukan.

CIRI UTAMA
• Membaca fail eksport chat standard (.txt) daripada aplikasi pemesejan popular
• Mengesan nombor antarabangsa secara automatik
• Membuang nombor berulang
• Melabel kontak secara berturutan (Customer 001, 002, ...)
• Pratonton penuh sebelum apa-apa disimpan

PRIVASI
Semua pemprosesan berlaku di dalam peranti anda. Tiada data dihantar ke pelayan kami.
Aplikasi ini tidak membaca senarai kontak sedia ada anda — ia hanya menambah yang baharu.
```

### 4.2 Grafik yang diperlukan

| Aset | Saiz | Nota |
|---|---|---|
| Ikon app | 512 × 512 px | PNG, **jangan** tiru logo WhatsApp |
| Feature graphic | 1024 × 500 px | Banner di atas listing |
| Screenshot telefon | Minimum 2 keping | Guna skrin app sebenar |

### 4.3 Borang wajib
- **Privacy policy URL** → dari Fasa 1.4
- **Data safety** → jawapan tepat ada dalam `docs/JUSTIFIKASI-CONTACTS.md`
- **Sensitive app permissions → Contacts** → teks justifikasi ada dalam fail sama
- **Content rating** → jawab soal selidik (app ni akan dapat rating Everyone)
- **Target audience** → 18+ (alat perniagaan)

---

## 📋 FASA 5 — Hantar & tunggu

1. Cipta **Production release** → muat naik `.aab`
2. Isi release notes
3. Tekan **Send for review**
4. Semakan biasa 3–7 hari. App yang meminta kebenaran sensitif seperti Contacts
   selalunya mengambil masa lebih lama, dan Google mungkin minta video demo —
   sebab tu elok siapkan video awal (panduan dalam `JUSTIFIKASI-CONTACTS.md`)

---

## ⚠️ Risiko jujur yang Bob perlu tahu

**1. Polisi Contacts baharu (berkuat kuasa 28 Oktober 2026)**
Google sedang mengetatkan akses kontak. Kedudukan kita kukuh kerana app **tidak meminta
`READ_CONTACTS`** langsung dan Contact Picker tidak boleh menggantikan fungsi mencipta
kontak baharu. Tetapi Google belum menyenaraikan "kemasukan kontak pukal" sebagai kes
guna yang diluluskan secara eksplisit, jadi ada kemungkinan mereka minta penjelasan
tambahan.

**Pelan sandaran jika ditolak:** tukar kepada kaedah fail `.vcf` — app menjana fail
kontak dan sistem Android yang mengimport. Kaedah itu **langsung tidak perlu kebenaran
Contacts**, jadi ia kebal daripada polisi ini. Pengguna cuma perlu satu ketukan tambahan.
Beritahu saya dan saya boleh tukarkan kod dalam masa singkat.

**2. Jangan sesekali tambah analytics/iklan tanpa kemas kini Data Safety**
Percanggahan antara borang Data Safety dan kelakuan sebenar app adalah punca **nombor satu**
app dibuang dari Play Store.

**3. Simpan bukti**
Simpan salinan video demo, teks justifikasi, dan tarikh hantar. Jika ditolak, Bob boleh
rayu dengan bukti yang kemas.

---

## 🎯 Senarai tindakan Bob (ikut turutan)

- [ ] **HARI INI** — Mohon D-U-N-S di dnb.com (percuma, ambil ± 30 hari)
- [ ] Sahkan maklumat SSM: nama sah, no. pendaftaran, alamat
- [ ] Siapkan website syarikat satu halaman
- [ ] Isi `[TANDA KURUNG]` dalam `docs/privacy-policy.html`
- [ ] Muat naik projek ke GitHub → dapatkan `.aab` dari tab Releases
- [ ] Hidupkan GitHub Pages untuk privacy policy
- [ ] Rakam video demo 30–60 saat (tunjuk prompt kebenaran dengan jelas)
- [ ] Sediakan ikon 512×512 + feature graphic 1024×500 + 2 screenshot
- [ ] Setelah D-U-N-S sampai → daftar Play Console, bayar $25
- [ ] Muat naik `.aab`, isi semua borang, hantar untuk semakan

---

## 🔗 Pautan penting

| Untuk | URL |
|---|---|
| Mohon D-U-N-S (khas Google) | https://www.dnb.com/en-us/smb/duns/google-developers.html |
| Daftar Play Console | https://play.google.com/console/signup |
| Keperluan akaun organisasi | https://support.google.com/googleplay/android-developer/answer/13628312 |
| Polisi kebenaran sensitif | https://support.google.com/googleplay/android-developer/answer/16558241 |
| Pratonton polisi Contacts baharu | https://support.google.com/googleplay/android-developer/answer/16909972 |
| Pesuruhjaya PDPA Malaysia | https://www.pdp.gov.my |
