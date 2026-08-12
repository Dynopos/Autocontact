/* Dynopro Auto Contact — percubaan & lesen premium
   ------------------------------------------------------------------
   Percuma : 100 kontak pertama (semua kaedah, termasuk tangkapan skrin)
   Premium : RM14.90 sekali seumur hidup — kontak tanpa had

   NOTA JUJUR untuk Bob:
   Ini app yang berjalan sepenuhnya dalam pelayar pengguna. Sesiapa yang
   tahu membaca kod boleh melepasi kunci ini. Ia menghalang perkongsian
   biasa, bukan orang yang berniat memecahkannya. Untuk kunci yang benar-
   benar ketat, lesen perlu disahkan oleh pelayan — itu kerja berasingan.
   Pada harga RM14.90, kunci ringan begini biasanya memadai.
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  // ====== TETAPAN — Bob ubah dua baris ini sahaja ======
  var BAYAR_URL = '';          // pautan Bayarcash, contoh: https://www.bayarcash.com/...
  var WA_NOMBOR = '60182889932';
  // =====================================================

  var HAD_PERCUMA = 100;
  var HARGA = 'RM14.90';
  var K_LESEN = 'dyno_lesen';
  var GARAM = 'dynopro-auto-contact-2026';   // penukar checksum kod

  // ---- Kod lesen ----
  // Bentuk: DYNO-XXXX-XXXX  (kumpulan kedua ialah checksum kumpulan pertama)
  function hash(t) {
    var h = 5381, i;
    for (i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
    return h;
  }
  function checksum(siri) {
    return hash(GARAM + '|' + siri).toString(36).toUpperCase().slice(-4).padStart(4, '0');
  }
  function bersih(k) {
    return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  /* Terima "DYNO-A1B2-C3D4" dalam apa jua bentuk taipan. */
  function sahKod(kod) {
    var c = bersih(kod);
    if (c.indexOf('DYNO') === 0) c = c.slice(4);
    if (c.length !== 8) return false;
    var siri = c.slice(0, 4), cs = c.slice(4, 8);
    return checksum(siri) === cs;
  }

  function simpan(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ambil(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function premium() {
    var k = ambil(K_LESEN);
    return !!(k && sahKod(k));
  }
  function pasangKod(kod) {
    if (!sahKod(kod)) return false;
    simpan(K_LESEN, bersih(kod));
    return true;
  }

  // ---- Baki percubaan ----
  function baki(digunakan) {
    if (premium()) return Infinity;
    return Math.max(0, HAD_PERCUMA - (digunakan || 0));
  }

  function waLink() {
    var teks = encodeURIComponent(
      'Salam, saya nak premium Dynopro Auto Contact (' + HARGA + ' sekali seumur hidup).');
    return 'https://wa.me/' + WA_NOMBOR + '?text=' + teks;
  }

  root.DynoLesen = {
    HAD: HAD_PERCUMA,
    HARGA: HARGA,
    premium: premium,
    baki: baki,
    sahKod: sahKod,
    pasangKod: pasangKod,
    checksum: checksum,          // dipakai oleh alat penjana kod Bob
    bayarUrl: function () { return BAYAR_URL; },
    waLink: waLink
  };
})(window);
