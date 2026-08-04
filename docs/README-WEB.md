# 🌐 Dynopro Auto Contact Web (PWA) — Cara Lancarkan

Versi web ini boleh Bob lancarkan **hari ini juga** — tiada Play Store, tiada kelulusan,
tiada yuran. Berfungsi atas **Android dan iPhone**.

---

## 🚀 Sudah hidup

| | |
|---|---|
| Repo | `Dynopos/Autocontact` |
| Sumber Pages | branch `main`, folder `/docs` |
| Custom domain | `autocontact.dynopro.my` |

Alamat sebenar setiap halaman:

| Halaman | URL |
|---|---|
| Halaman jualan utama | <https://autocontact.dynopro.my/> |
| Halaman jualan kedua | <https://autocontact.dynopro.my/buang-kontak-pendua.html> |
| Alat simpan nombor | <https://autocontact.dynopro.my/simpan.html> |
| Alat kemas kontak | <https://autocontact.dynopro.my/kemas.html> |
| Privacy policy | <https://autocontact.dynopro.my/privacy-policy.html> |
| Sitemap | <https://autocontact.dynopro.my/sitemap.xml> |

### Cara ia disiapkan (rujukan jika perlu diulang)

1. Di repo → **Settings** → **Pages**
2. **Source:** Deploy from a branch → **Branch:** `main` → **Folder:** `/docs`
3. Tekan **Save**

Custom domain dikawal oleh fail **`docs/CNAME`** — bukan melalui borang di Settings.
GitHub Pages hanya membaca `CNAME` dari folder sumber penerbitan, jadi meletakkannya
di root repo tidak berfungsi. Di sebelah DNS, satu rekod `CNAME` diperlukan:
host `autocontact` → nilai `dynopos.github.io`.

---

## 📲 Cara pengguna "memasang" app

Ini yang menjadikannya terasa seperti app sebenar, bukan sekadar laman web.

**Android (Chrome)** — satu butang ungu *"Pasang ke skrin utama telefon"* akan muncul
sendiri di bahagian atas. Ketuk, sahkan, dan ikon Dynopro Auto Contact terus muncul di skrin utama.
Bila dibuka, ia penuh skrin tanpa bar browser.

**iPhone (Safari)** — Apple tidak membenarkan butang automatik, jadi app akan
memaparkan arahan: tekan butang **Kongsi ⬆** → **Add to Home Screen**.

Selepas dipasang, app **berfungsi tanpa internet** — Service Worker menyimpan
keseluruhan app dalam telefon pengguna.

---

## ✅ Apa yang sudah diuji

Kesemua semakan ini dijalankan secara automatik dalam browser sebenar:

- Tapisan nombor dari fail eksport chat, termasuk format iPhone (ruang tak-putus)
- Membuang nombor berulang dalam fail yang sama
- Rekod ingatan — import kedua kali fail sama menghasilkan **sifar** kontak berganda
- Penomboran bersambung: Customer 001 → 010, kemudian sambung 011, 012 …
- Penjanaan fail `.vcf` yang sah dengan bilangan kad yang betul
- Butang set semula rekod
- Boleh dipasang (manifest + service worker + ikon maskable)
- Berfungsi luar talian
- Tiada ralat JavaScript

---

## 🔒 Privasi

Semua pemprosesan berlaku di dalam browser pengguna. Fail tidak pernah dimuat naik ke
mana-mana server — sebenarnya app ini **tiada server langsung**. Rekod ingatan disimpan
dalam storan tempatan browser pengguna sendiri.

Ini bermakna Bob tidak memegang sebarang data peribadi pelanggan, yang memudahkan
pematuhan PDPA dengan banyak.

---

## 🆚 Web vs App Play Store

| | Web (PWA) | Play Store |
|---|---|---|
| Masa untuk lancar | **Hari ini** | 5–8 minggu |
| Kos permulaan | **RM 0** | $25 + D-U-N-S |
| iPhone | ✅ Ya | ❌ Perlu App Store berasingan |
| Simpan ke Contacts | Muat turun `.vcf` → ketuk import | Terus, tanpa import |
| Komisen jualan | **0%** (guna gateway Malaysia) | 15–30% |
| Kemas kini | Serta-merta | Perlu semakan |
| Risiko polisi Contacts | **Tiada** | Ada |

Strategi disyorkan: **lancar web dahulu** untuk mengesahkan pelanggan sanggup membayar,
kemudian bina versi Play Store sebagai naik taraf apabila sudah ada pendapatan.

---

## 📁 Fail dalam folder ini

```
docs/
├── index.html                 # Halaman jualan SEO — "simpan nombor WhatsApp"
├── buang-kontak-pendua.html   # Halaman jualan SEO — "buang kontak pendua"
├── simpan.html                # Alat: simpan nombor pukal  (start_url PWA)
├── kemas.html                 # Alat: kemas kontak / buang pendua
├── kemas-engine.js            # Enjin normalisasi nombor & pengesan pendua
├── seo.css                    # Gaya dikongsi kedua-dua halaman jualan
├── manifest.webmanifest       # Maklumat pemasangan PWA
├── sw.js                      # Service worker (offline + boleh pasang)
├── icons/                     # Ikon app pelbagai saiz (8 fail)
├── privacy-policy.html        # Privacy policy (wajib jika ke Play Store)
├── sitemap.xml                # Sitemap untuk enjin carian
├── robots.txt                 # Arahan crawler
├── CNAME                      # Custom domain: autocontact.dynopro.my
├── .nojekyll                  # Matikan pemprosesan Jekyll
├── PANDUAN-PLAY-STORE.md      # Panduan Play Store
├── JUSTIFIKASI-CONTACTS.md    # Justifikasi kebenaran
└── README-WEB.md              # Fail ini
```

**Dua halaman jualan, dua alat.** `index.html` dan `buang-kontak-pendua.html` ialah
halaman SEO yang menarik pengunjung dari Google; kedua-duanya menghantar pengguna ke
alat sebenar, iaitu `simpan.html` dan `kemas.html`. PWA dipasang dari `simpan.html`
kerana itulah `start_url` dalam `manifest.webmanifest`.
