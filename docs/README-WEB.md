# 🌐 Dynopro Auto Contact Web (PWA) — Cara Lancarkan

Versi web ini boleh Bob lancarkan **hari ini juga** — tiada Play Store, tiada kelulusan,
tiada yuran. Berfungsi atas **Android dan iPhone**.

---

## 🚀 Lancarkan dalam 3 minit (percuma)

1. Muat naik keseluruhan projek ke repository GitHub
2. Di repo → **Settings** → **Pages**
3. **Source:** Deploy from a branch → **Branch:** `main` → **Folder:** `/docs`
4. Tekan **Save**, tunggu ± 1 minit

App Bob kini hidup di:
```
https://[username-github-anda].github.io/dynopro-auto-contact/
```

Privacy policy pula automatik berada di:
```
https://[username-github-anda].github.io/dynopro-auto-contact/privacy-policy.html
```

> 💡 Nak nama sendiri seperti `dynopro.my`? Beli domain, kemudian di
> **Settings → Pages → Custom domain**, masukkan domain tersebut. HTTPS percuma disediakan.

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
├── index.html              # App web (PWA)
├── manifest.webmanifest    # Maklumat pemasangan
├── sw.js                   # Service worker (offline + boleh pasang)
├── icons/                  # Ikon app pelbagai saiz
├── privacy-policy.html     # Privacy policy (wajib jika ke Play Store)
├── PANDUAN-PLAY-STORE.md   # Panduan Play Store
├── JUSTIFIKASI-CONTACTS.md # Justifikasi kebenaran
└── README-WEB.md           # Fail ini
```
