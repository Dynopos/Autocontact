# 📇 Dynopro Auto Contact

Alat web untuk penjual: **tukar fail eksport perbualan menjadi kontak telefon
secara pukal**, dan **kemaskan buku alamat** yang penuh pendua.

Berfungsi pada **Android dan iPhone**. Boleh dipasang ke skrin utama seperti app
sebenar, dan berfungsi tanpa internet.

> 🚀 **Mula di sini:** [`docs/README-WEB.md`](docs/README-WEB.md) — lancarkan
> secara percuma dalam 3 minit menggunakan GitHub Pages.

---

## ✨ Dua fungsi

**1. Simpan nombor baharu** — [`docs/index.html`](docs/index.html)

Eksport perbualan atau kumpulan sebagai `.txt`, muat naik, dan semua nombor
menjadi kontak berlabel `Customer 001, 002, …`. App ingat apa yang sudah
disimpan, jadi import berulang tidak menghasilkan kontak berganda.

**2. Kemas kontak sedia ada** — [`docs/kemas.html`](docs/kemas.html)

Muat naik eksport `.vcf` atau `.csv` dari Google Contacts untuk mencari:

- **Pendua sebenar** — nombor sama walaupun ditulis berbeza
  (`0123456789` = `+60 12-345 6789` = `60123456789`)
- **Kontak tanpa nama**, **tanpa nombor**, dan **kosong sepenuhnya**
- **Mungkin pendua** — nama hampir sama, dicadang untuk semakan, *tidak*
  digabung automatik

Hasilnya satu fail kontak bersih untuk diimport semula.

---

## 🔒 Privasi

Semua pemprosesan berlaku dalam browser pengguna. Tiada fail dimuat naik ke
mana-mana server — projek ini **tiada server langsung**. Rekod disimpan dalam
storan tempatan browser pengguna sendiri.

---

## 📱 Versi Android native — direhatkan buat sementara

Kod Flutter dalam [`lib/`](lib/) masih lengkap dan berfungsi, tetapi projek
sedang **fokus pada versi web** dahulu.

Workflow GitHub Actions telah ditukar kepada **manual sahaja** supaya tidak
membazir kuota. Bila tiba masanya untuk Google Play:

1. Repo → tab **Actions** → **Bina APK Android (manual)** → **Run workflow**
2. Ikut [`docs/PANDUAN-PLAY-STORE.md`](docs/PANDUAN-PLAY-STORE.md)

Kelebihan menunggu: tiada yuran $25, tiada D-U-N-S 30 hari, tiada risiko polisi
Contacts Google, dan versi web sudah menjangkau pengguna iPhone yang Play Store
tidak boleh capai.

---

## 🧪 Cara guna

### Simpan nombor baharu
1. Dalam app chat: buka perbualan / kumpulan → **⋮ → More → Export chat → Without media**
2. Buka app → **Pilih fail .txt**
3. Semak senarai → **Simpan** → import fail kontak yang dijana

### Kemas kontak sedia ada
1. Di **contacts.google.com** → **Export** → pilih **vCard** (simpan fail ini sebagai backup)
2. Buka **Kemas Kontak** → muat naik fail itu
3. Semak pendua yang dijumpai → pilih tetapan → **Muat turun fail bersih**
4. Di Google Contacts: padam semua → import fail bersih

> 🛟 Google menyimpan kontak yang dipadam dalam **Trash selama 30 hari**, dan
> **Settings → Undo changes** boleh memutar balik seluruh senarai kontak dalam
> tempoh yang sama.

---

## 📁 Struktur projek

```
dynopro-auto-contact/
├── docs/                          # ← Versi web (dihoskan oleh GitHub Pages)
│   ├── index.html                 # Simpan nombor baharu
│   ├── kemas.html                 # Kemas kontak sedia ada
│   ├── kemas-engine.js            # Enjin pendua & normalisasi nombor
│   ├── manifest.webmanifest       # Maklumat pemasangan PWA
│   ├── sw.js                      # Service worker (offline)
│   ├── icons/                     # Ikon Dynopro
│   ├── privacy-policy.html        # Privacy policy (patuh PDPA)
│   ├── README-WEB.md              # 🚀 Panduan lancar web
│   ├── PANDUAN-PLAY-STORE.md      # Untuk kemudian
│   └── JUSTIFIKASI-CONTACTS.md    # Untuk kemudian
├── lib/main.dart                  # Versi Android native (direhatkan)
├── pubspec.yaml
├── .github/workflows/build.yml    # Bina APK — manual sahaja
└── README.md
```

---

## 🛠️ Nota teknikal

Versi web tidak menggunakan sebarang framework, pembinaan (build step), atau
kebergantungan luar — HTML, CSS dan JavaScript biasa sahaja. Ini bermakna ia
boleh dihoskan di mana-mana, dimuatkan dengan pantas, dan tidak akan rosak
akibat kemas kini pakej.

**Enjin nombor** menormalkan format Malaysia (`0…`, `60…`, `+60…`) kepada satu
bentuk piawai sebelum membanding, dan mengendalikan ruang tak-putus yang
digunakan oleh eksport iPhone.

**Enjin pendua** menggabungkan hanya apabila nombor telefon benar-benar sama.
Nama yang serupa dicadangkan untuk semakan manusia, tidak pernah digabung
secara automatik — kerana gabungan yang salah tidak boleh dibatalkan.

**Penghurai** menyokong vCard 2.1/3.0/4.0 (termasuk *quoted-printable* dan
lipatan baris) serta CSV Google Contacts dengan petikan bersarang.

---

## 📱 Google Play — kemudian

Semua dokumen sudah siap bila tiba masanya:
[`docs/PANDUAN-PLAY-STORE.md`](docs/PANDUAN-PLAY-STORE.md) dan
[`docs/JUSTIFIKASI-CONTACTS.md`](docs/JUSTIFIKASI-CONTACTS.md).

Ingat: nombor **D-U-N-S** mengambil masa sehingga 30 hari, jadi mohon lebih awal
daripada tarikh yang dirancang.
