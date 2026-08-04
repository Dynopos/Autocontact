# Justifikasi Kebenaran Contacts + Borang Data Safety

Dokumen ini mengandungi **teks sedia salin-tampal** untuk Google Play Console.
Google membaca dalam Bahasa Inggeris, jadi teks rasmi ditulis dalam Bahasa Inggeris.
Penjelasan untuk Bob ada dalam Bahasa Melayu di bawah setiap bahagian.

---

## ⚠️ Kenapa dokumen ini penting

Google memperkenalkan **Contacts Permissions policy** yang berkuat kuasa **28 Oktober 2026**.
Polisi ini menyekat app yang meminta akses luas kepada senarai kontak pengguna.

**Kedudukan Dynopro Auto Contact (kukuh):**

| Perkara | Status Dynopro Auto Contact |
|---|---|
| `READ_CONTACTS` (baca senarai kontak) | ❌ **TIDAK diminta** — dibuang dari manifest |
| `WRITE_CONTACTS` (tambah kontak baru) | ✅ Diminta — ini fungsi teras app |
| Contact Picker mencukupi? | ❌ Tidak — Picker hanya untuk *memilih* kontak sedia ada, bukan *mencipta* kontak baru |
| Data dihantar ke server? | ❌ Tidak — semua pemprosesan di dalam peranti |

Hujah utama kita: **Contact Picker tidak boleh menggantikan fungsi kami**, kerana Picker
direka untuk pengguna *memilih* kontak yang sudah wujud. App kami *mencipta* kontak baharu
yang belum wujud. Tiada API alternatif untuk kemasukan pukal.

---

## 1️⃣ Permission Declaration — salin ke Play Console

**Lokasi:** Play Console → App content → Sensitive app permissions → Contacts

> ### Declaration text (English — copy exactly)
>
> **Core functionality that requires the permission**
>
> Dynopro Auto Contact's sole and core purpose is to create new contact entries in the user's
> address book from a chat export file that the user personally supplies.
>
> The user exports a chat transcript from their own messaging app (a plain `.txt`
> file), selects that file inside Dynopro Auto Contact, and the app extracts the phone numbers
> contained in it. The user then taps a single button to add those numbers as new
> contacts. Without `WRITE_CONTACTS`, the app cannot perform its only function.
>
> **Why the Android Contact Picker is not sufficient**
>
> The Android Contact Picker is designed for the user to *select contacts that already
> exist* in their address book and share them with an app. Dynopro Auto Contact does the opposite:
> it *creates contacts that do not yet exist*. The Contact Picker provides no mechanism
> for inserting new contact records, and therefore cannot deliver our core functionality.
>
> **We do not request broad read access**
>
> Dynopro Auto Contact does **not** declare or request `READ_CONTACTS`. The app never reads,
> enumerates, uploads, or analyses the user's existing contact list. We have explicitly
> removed `READ_CONTACTS` from our merged manifest using `tools:node="remove"` to
> guarantee this, even though a third-party library declares it.
>
> **How we avoid re-reading the address book**
>
> To prevent creating duplicate entries on repeat imports, the app maintains its own
> private local record of the numbers it has previously added, stored in app-private
> storage. We deliberately chose this design over reading the user's address book, so
> that we never need `READ_CONTACTS` at any point in the product lifecycle.
>
> **Data handling**
>
> All processing happens entirely on the device. The chat export file is parsed locally
> in memory. No phone numbers, contact records, file contents, or personal data are
> transmitted to our servers or any third party. The app contains no analytics SDK, no
> advertising SDK, and makes no network requests whatsoever.
>
> **User control**
>
> The user chooses the source file, previews the complete list of numbers that will be
> added before any write occurs, and must explicitly tap "Save to Contacts" to proceed.
> The Android runtime permission prompt is shown at that moment, not at app launch.

**Penjelasan untuk Bob:** Ayat di atas menekankan tiga perkara yang Google mahu dengar —
(1) tanpa kebenaran ni app tak berfungsi langsung, (2) kita tak minta akses baca,
(3) tiada data keluar dari phone. Ini hujah paling kuat yang boleh kita berikan.

---

## 2️⃣ Video demonstrasi (Google selalu minta)

Google biasanya minta video pendek menunjukkan aliran kebenaran. Rakam skrin phone,
**tanpa suntingan**, 30–60 saat:

1. Buka app dari skrin utama
2. Tunjuk skrin penerangan (fail apa yang perlu dipilih)
3. Pilih fail `.txt`
4. Tunjuk senarai nombor yang dijumpai (skrin pratonton)
5. Tekan **"Simpan semua ke Contacts"**
6. **Tunjuk dengan jelas prompt kebenaran Android muncul** ← paling penting
7. Tekan Allow
8. Buka app Contacts phone, tunjuk kontak baharu sudah masuk

Muat naik ke YouTube sebagai **Unlisted**, tampal pautan dalam borang.

---

## 3️⃣ Borang Data Safety — jawapan tepat

**Lokasi:** Play Console → App content → Data safety

| Soalan | Jawapan |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | *(Tidak relevan — tiada data dihantar)* |
| Do you provide a way for users to request that their data be deleted? | **No** *(data tidak pernah dikumpul oleh kami)* |

> ⚠️ **PENTING:** Jangan sesekali isytihar "No" jika kemudian Bob tambah ciri backup awan,
> analytics, Firebase, atau iklan. Percanggahan antara borang ini dengan kelakuan sebenar
> app adalah **punca utama app dibuang** dari Play Store.

**Kenapa "No" itu betul:** App membaca fail dan menulis ke Contacts — kedua-duanya
kekal di dalam peranti pengguna. Kita (pemaju) tidak pernah menerima apa-apa data.
"Collect" dalam definisi Google bermaksud data dihantar keluar dari peranti.

---

## 4️⃣ Nama & penerangan app — elak masalah tanda dagangan

**JANGAN** guna "WhatsApp" dalam nama app, ikon, atau tajuk listing. WhatsApp ialah
tanda dagangan Meta. App yang nampak seperti meniru atau berkaitan rasmi dengan
WhatsApp berisiko ditolak atas dasar **impersonation**, dan akaun boleh ditamatkan.

| ❌ Jangan | ✅ Guna |
|---|---|
| WhatsApp Contact Saver | **Dynopro Auto Contact** |
| WA Number Extractor | Dynopro Auto Contact: Chat Export to Contacts |
| Ikon guna warna/bentuk logo WhatsApp | Ikon sendiri yang tersendiri |

Dalam **penerangan** listing, dibenarkan menyebut secara fakta bahawa app menyokong
fail eksport daripada aplikasi pemesejan — contoh ayat selamat:

> "Works with standard chat export files (.txt) from popular messaging apps."

Elakkan ayat yang membayangkan kerjasama rasmi seperti *"official WhatsApp tool"*
atau *"powered by WhatsApp"*.

---

## 5️⃣ Senarai semak sebelum hantar

- [ ] `READ_CONTACTS` tiada dalam manifest akhir (CI kita sudah sahkan automatik)
- [ ] Privacy policy sudah terbit di URL awam (lihat `privacy-policy.html`)
- [ ] Borang Data Safety diisi = **No collection**
- [ ] Video demo kebenaran dimuat naik (Unlisted)
- [ ] Nama app **tiada** perkataan "WhatsApp"
- [ ] Target API 36 (CI kita sudah tetapkan)
- [ ] Muat naik fail **`.aab`**, bukan `.apk`
