# Dyno Auto Contact — Android

**"Setiap Lead Berharga. Jangan Biar Ia Hilang."**

App Android yang menangkap lead dari **app WhatsApp Business biasa** (bukan Cloud API) dan menghantarnya
terus ke Dyno Mini CRM. Ia membaca **notifikasi** WhatsApp Business melalui `NotificationListenerService`,
dengan kebenaran pengguna.

```
Iklan Facebook → WhatsApp Business (Android) → notifikasi → Dyno Auto Contact → POST /lead-capture → Mini CRM
```

## Apa yang ditangkap (hanya jika benar-benar ada dalam notifikasi)

| Data | Bila ditangkap | Sumber dalam notifikasi |
|---|---|---|
| Nombor telefon | ID perbualan ialah `<nombor>@s.whatsapp.net`, URI `tel:` pada orang, atau tajuk yang **keseluruhannya** nombor antarabangsa (WhatsApp memaparkan nombor bila pengirim tiada dalam kenalan telefon) | `sbn.tag`, `notification.shortcutId`, `Person.uri`, `EXTRA_TITLE` |
| Username WhatsApp | Tajuk/pengirim **keseluruhannya** `@nama.pengguna` | `EXTRA_TITLE` |
| Nama paparan | Tajuk notifikasi (boleh jadi nama yang anda simpan dalam Kenalan) | `EXTRA_TITLE` |
| Pratonton mesej & masa | Mesej pelanggan dalam `MessagingStyle` | `EXTRA_MESSAGES` |
| ID berskop perniagaan (BSUID) | **Tidak pernah** — notifikasi tidak menyediakannya; hanya API rasmi | — |

- Nombor **tidak diteka** dari nama (cth. "Ali 0123456789" kekal nama), dan username tidak diteka dari nombor.
- ID `…@lid` (ID dalaman WhatsApp) **bukan nombor telefon** dan tidak dihantar.
- Notifikasi **nama sahaja** → dihantar sebagai *lead belum disahkan*; tiada kenalan dicipta. Pengguna mengesahkan
  nombor/username dalam Mini CRM (**Lead belum disahkan**).
- Sumber sentiasa **WhatsApp**. Notifikasi tidak mengandungi metadata iklan, jadi lead **tidak** dilabel Facebook Ads.
- Diabaikan: chat kumpulan, status, saluran, panggilan, notifikasi ringkasan, mesej anda sendiri, app selain
  WhatsApp Business (WhatsApp biasa hanya jika pengguna menghidupkannya).

## Seni bina

| Modul | Fail | Fungsi |
|---|---|---|
| `:core` (Kotlin tulen) | `Pengekstrak.kt` | Notifikasi → calon lead; peraturan pengenal; ID event stabil |
| | `Telefon.kt` | E.164 dengan libphonenumber (sama dengan pelayan) |
| | `Penghantar.kt` | Baris gilir kekal + penapis pendua + penghantaran dengan cuba semula |
| | `KodSambungan.kt` | Kod sambungan dari Mini CRM (HTTPS + kunci peranti sahaja) |
| `:app` | `PendengarNotis.kt` | `NotificationListenerService`; tangkap semula notifikasi aktif bila disambung semula |
| | `PekerjaHantar.kt` | WorkManager: hantar dengan jarak masa eksponen; jaring keselamatan setiap 15 minit |
| | `Tetapan.kt` | Kunci peranti disulitkan dengan **Android Keystore**; baris gilir & log dalam SharedPreferences |
| | `UtamaActivity.kt` | Persetujuan, status akses, bateri, sambungan, baris gilir, ralat, log |

Pelayan: `supabase/functions/lead-capture` dengan **kunci peranti** (integrasi jenis `android`, satu kunci setiap
telefon, boleh diputuskan) → `capture_identity` (nyahpendua mengikut akaun + nombor E.164 / username).

### Perlindungan pendua (3 lapisan)
1. **ID event stabil** = SHA-256(pengenal | masa mesej (saat) | teks). Notifikasi yang dipos semula, diproses
   semula selepas sambung semula, atau diterima pada telefon kedua menghasilkan ID yang sama.
2. **Penapis dalam telefon** (3,000 ID terakhir) sebelum masuk baris gilir.
3. **Pelayan**: `unique (owner_id, sumber_lead, external_event_id)` untuk event; `unique (owner_id, telefon)` dan
   `unique (owner_id, whatsapp_username)` untuk kenalan.

## Bina

```bash
cd android
gradle :core:test              # tanpa Android SDK
gradle :app:assembleDebug      # perlukan Android SDK (ANDROID_HOME)
```

GitHub Actions (`.github/workflows/android.yml`) menjalankan ujian `:core`, membina APK debug dan lint pada
setiap push ke `android/`. APK dimuat naik sebagai artifak **dyno-auto-contact-debug-apk**.

## Persediaan pada telefon

1. Mini CRM → **Lead Automatik** → **Telefon Android** → *Cipta kod sambungan*.
2. Pasang APK, buka app, baca & **setuju**.
3. *Buka tetapan akses notifikasi* → hidupkan **Dyno Auto Contact**.
   APK di luar Play Store pada Android 13+: Tetapan → Apps → Dyno Auto Contact → ⋮ → **Benarkan tetapan terhad** dahulu.
4. Tampal kod sambungan.
5. *Buka tetapan bateri* → kecualikan Dyno Auto Contact (penting pada Xiaomi, Oppo, Vivo, Huawei, Samsung).
6. Dalam WhatsApp Business: pastikan notifikasi **dihidupkan** dan chat tidak dibisukan.

## Had teknikal (baca sebelum bergantung pada app ini)

- **Belum diuji pada telefon sebenar.** Logik diuji dengan data notifikasi tiruan. Sama ada WhatsApp Business
  benar-benar memaparkan JID nombor dalam `tag`/`shortcutId`, atau `@username` dalam tajuk, **mesti disahkan pada
  telefon sebenar** — gunakan log dalam app (ia merekod *dari mana* pengenal datang tanpa isi mesej).
- **Tiada notifikasi = tiada lead.** Chat dibisukan, notifikasi dimatikan, mod Jangan Ganggu yang menyekat
  notifikasi, atau WhatsApp dibuka pada chat itu ketika mesej tiba (WhatsApp tidak memaparkan notifikasi) —
  lead itu tidak ditangkap. Gunakan *Tambah lead manual* dalam Mini CRM untuk kes ini.
- **Kenalan yang disimpan**: jika pelanggan sudah disimpan dalam Kenalan telefon, tajuk notifikasi ialah nama
  tersebut; nombor hanya ditangkap jika WhatsApp juga menyediakannya dalam ID perbualan.
- **Sekatan latar belakang**: sesetengah pengeluar membunuh perkhidmatan latar belakang. App meminta sambung
  semula (`requestRebind`) dan memproses notifikasi yang masih aktif bila disambung semula, tetapi notifikasi
  yang sudah dipadam semasa app tidak berjalan tidak boleh dipulihkan.
- **Berbilang telefon**: ID event bergantung pada masa mesej yang dipaparkan oleh WhatsApp. Jika dua telefon
  memaparkan masa berbeza untuk mesej yang sama, event mungkin direkod dua kali — tetapi **kenalan tidak berganda**
  (nyahpendua mengikut nombor/username).
- **Pratonton tersembunyi**: jika WhatsApp hanya memaparkan "2 new messages", mesej tidak dihantar (hanya
  ditanda *pratonton disembunyikan*); pengenal masih ditangkap jika ada.
- **Play Store**: app yang membaca notifikasi app lain perlu penjelasan yang jelas dalam penyenaraian dan dasar
  privasi; versi ini untuk pengedaran terus (APK) dan ujian dahulu.
- Username WhatsApp adalah ciri yang agak baharu; format paparannya dalam notifikasi belum disahkan.
