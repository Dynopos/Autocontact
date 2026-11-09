/* Dyno Mini CRM — pembaca fail "Export Chat" WhatsApp (.txt)
   Semua kerja di sini berlaku dalam telefon pengguna:
     * hurai mesej, pengirim, tarikh dan nombor telefon
     * kenal pasti siapa penjual (pengguna) dan siapa pelanggan
     * padankan pelanggan dengan kenalan CRM
     * buang data peribadi sebelum apa-apa dihantar untuk analisis AI

   Tiada rangkaian di fail ini. Fail chat asal tidak dimuat naik ke mana-mana. */
(function (root) {
  'use strict';

  // ---------- Normalisasi nombor (sama seperti KemasEngine) ----------
  function normPhone(raw) {
    if (root.KemasEngine) return root.KemasEngine.normPhone(raw);
    var s = String(raw || '').replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.charAt(0) === '+') return s.replace(/^\+?0+(?=\d)/, '+');
    if (s.indexOf('60') === 0 && s.length >= 10) return '+' + s;
    if (s.charAt(0) === '0') return '+60' + s.slice(1);
    return s;
  }
  function telefonSah(raw) {
    var n = normPhone(raw);
    return /^\+\d{8,15}$/.test(n) ? n : '';
  }

  // Aksara tersembunyi yang dimasukkan oleh eksport iPhone/Android
  var HALIMUNAN = /[‎‏‪-‮⁦-⁩﻿]/g;

  // ---------- Hurai satu baris kepala mesej ----------
  // Android: 09/11/2026, 14:05 - Kak Nik: Salam
  //          9/11/26, 2:05 pm - Kak Nik: Salam
  // iPhone:  [09/11/2026, 14:05:33] Kak Nik: Salam
  var RE_KEPALA = /^\[?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([apAP][.\s]?[mM]\.?)?\]?\s*(?:[-–]\s*)?(.*)$/;

  function huraiPengirim(baki) {
    // "Nama: mesej". Mesej sistem ("X created group") tiada titik bertindih.
    var i = baki.indexOf(': ');
    if (i < 1 || i > 80) return null;
    return { pengirim: baki.slice(0, i).trim(), teks: baki.slice(i + 2) };
  }

  var RE_MEDIA = /^(<media omitted>|<media tidak disertakan>|<attached: [^>]*>|(image|video|audio|sticker|gif|document) omitted|null)$/i;

  /* Pulangkan { mesej:[{tarikh, pengirim, teks}], peserta:[nama...], namaFail } */
  function huraiChat(teks, namaFail) {
    var baris = String(teks || '').replace(/\r\n?/g, '\n').split('\n');
    var mentah = [];
    var semasa = null;

    baris.forEach(function (l) {
      var bersih = l.replace(HALIMUNAN, '');
      var m = bersih.match(RE_KEPALA);
      if (m) {
        var p = huraiPengirim(m[8] || '');
        if (!p) { semasa = null; return; }               // mesej sistem
        semasa = { d1: +m[1], d2: +m[2], y: +m[3], pengirim: p.pengirim, teks: p.teks };
        mentah.push(semasa);
      } else if (semasa && bersih.trim()) {
        semasa.teks += '\n' + bersih;                     // sambungan mesej berbilang baris
      }
    });

    // dd/mm atau mm/dd? Malaysia guna dd/mm; tukar hanya jika bukti jelas.
    var mmdd = mentah.some(function (x) { return x.d2 > 12; }) &&
               !mentah.some(function (x) { return x.d1 > 12; });
    var mesej = mentah.map(function (x) {
      var hari = mmdd ? x.d2 : x.d1, bulan = mmdd ? x.d1 : x.d2;
      var tahun = x.y < 100 ? 2000 + x.y : x.y;
      var t = (bulan >= 1 && bulan <= 12 && hari >= 1 && hari <= 31)
        ? tahun + '-' + String(bulan).padStart(2, '0') + '-' + String(hari).padStart(2, '0') : '';
      var isi = x.teks.trim();
      if (RE_MEDIA.test(isi)) isi = '[media]';
      return { tarikh: t, pengirim: x.pengirim.replace(HALIMUNAN, '').trim(), teks: isi };
    }).filter(function (x) { return x.teks; });

    var peserta = [];
    mesej.forEach(function (x) { if (peserta.indexOf(x.pengirim) < 0) peserta.push(x.pengirim); });
    return { mesej: mesej, peserta: peserta, namaFail: namaDariFail(namaFail) };
  }

  // "WhatsApp Chat with Kak Nik.txt" / "WhatsApp Chat - Kak Nik.txt" / "Chat WhatsApp dengan Kak Nik.txt"
  function namaDariFail(n) {
    var s = String(n || '').replace(/\.(txt|zip)$/i, '').replace(/\s*\(\d+\)$/, '');
    var m = s.match(/(?:whatsapp\s+chat|chat\s+whatsapp)\s*(?:with|dengan|-|–)\s*(.+)$/i);
    return m ? m[1].trim() : '';
  }

  // ---------- Siapa penjual? ----------
  function samaNama(a, b) {
    var f = function (s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };
    return !!f(a) && f(a) === f(b);
  }

  /* chats: hasil huraiChat bagi semua fail; namaSaya: input pengguna (boleh kosong).
     Pulangkan nama penjual bagi setiap chat (atau '' jika tidak pasti). */
  function kenalPastiSaya(chats, namaSaya) {
    var kiraan = {};
    chats.forEach(function (c) { c.peserta.forEach(function (p) { kiraan[p] = (kiraan[p] || 0) + 1; }); });
    var berulang = Object.keys(kiraan).filter(function (p) { return kiraan[p] >= 2 && !telefonSah(p); });

    return chats.map(function (c) {
      if (namaSaya) {
        var j = c.peserta.filter(function (p) { return samaNama(p, namaSaya); })[0];
        if (j) return j;
        // Pengguna isi nombor sendiri?
        var n = telefonSah(namaSaya);
        if (n) { var k = c.peserta.filter(function (p) { return telefonSah(p) === n; })[0]; if (k) return k; }
      }
      if (berulang.length === 1 && c.peserta.indexOf(berulang[0]) > -1) return berulang[0];
      if (c.peserta.length === 2 && c.namaFail) {
        var lawan = c.peserta.filter(function (p) { return !samaNama(p, c.namaFail); });
        if (lawan.length === 1) return lawan[0];
      }
      return '';
    });
  }

  /* Pulangkan ringkasan sedia-analisis bagi satu chat.
     status: 'sedia' | 'kumpulan' | 'perlu_nama' | 'tiada_pelanggan' | 'kosong' */
  function sediakan(chat, saya) {
    if (!chat.mesej.length) return { status: 'kosong' };
    var pelanggan = chat.peserta.filter(function (p) { return p !== saya; });
    if (!saya && chat.peserta.length === 2) return { status: 'perlu_nama', peserta: chat.peserta };
    if (pelanggan.length === 0) return { status: 'tiada_pelanggan' };
    if (pelanggan.length > 1) return { status: 'kumpulan', bilangan: pelanggan.length };
    var label = pelanggan[0];
    return {
      status: 'sedia',
      label: label,
      telefon: telefonSah(label),
      bilMesej: chat.mesej.length,
      bilPelanggan: chat.mesej.filter(function (m) { return m.pengirim === label; }).length
    };
  }

  // ---------- Buang data peribadi ----------
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function bersihkanTeks(teks, nama) {
    var t = String(teks || '')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMEL]')
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[PAUTAN]')
      .replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, '[IC]')
      .replace(/\+?\d[\d   \-().]{6,}\d/g, function (m) {
        return m.replace(/\D/g, '').length >= 8 ? '[NOMBOR]' : m;
      });
    (nama || []).forEach(function (n) {
      String(n || '').split(/\s+/).filter(function (w) { return w.length >= 3 && !/^\d+$/.test(w); })
        .forEach(function (w) { t = t.replace(new RegExp('(^|[^\\p{L}])' + escRe(w) + '(?=$|[^\\p{L}])', 'giu'), '$1[NAMA]'); });
    });
    return t;
  }

  var HAD_MESEJ = 60, HAD_TEKS = 500, HAD_JUMLAH = 8000;

  /* Bina muatan minimum untuk AI: peranan sahaja (bukan nama), tarikh hari,
     teks yang sudah dibersihkan, dan hanya mesej terakhir. */
  function binaMuatan(chat, saya, labelPelanggan, namaKenalan) {
    var namaBuang = [labelPelanggan, saya, namaKenalan, chat.namaFail].filter(function (x) { return x && !telefonSah(x); });
    var mesej = chat.mesej
      .filter(function (m) { return m.pengirim === saya || m.pengirim === labelPelanggan; })
      .map(function (m) {
        return { dari: m.pengirim === labelPelanggan ? 'pelanggan' : 'penjual',
                 teks: bersihkanTeks(m.teks, namaBuang).slice(0, HAD_TEKS),
                 tarikh: m.tarikh || undefined };
      });
    var dipotong = mesej.length > HAD_MESEJ;
    mesej = mesej.slice(-HAD_MESEJ);
    var jumlah = mesej.reduce(function (a, m) { return a + m.teks.length; }, 0);
    while (jumlah > HAD_JUMLAH && mesej.length > 1) { jumlah -= mesej.shift().teks.length; dipotong = true; }
    if (!mesej.some(function (m) { return m.dari === 'pelanggan'; })) return null;
    return { mesej: mesej, dipotong: dipotong };
  }

  // ---------- Padankan dengan kenalan CRM ----------
  /* kenalan: [{ id, telefon, nama, ... }]
     Pulangkan { status:'dipadankan'|'semak'|'baharu', kenalan, calon:[...], telefon } */
  function padankan(label, kenalan, namaFail) {
    var tel = telefonSah(label) || telefonSah(namaFail);
    if (tel) {
      var k = kenalan.filter(function (c) { return c.telefon === tel; })[0];
      return k ? { status: 'dipadankan', kenalan: k, calon: [], telefon: tel }
               : { status: 'baharu', kenalan: null, calon: [], telefon: tel };
    }
    var tepat = kenalan.filter(function (c) { return samaNama(c.nama, label); });
    if (tepat.length === 1) return { status: 'dipadankan', kenalan: tepat[0], calon: [], telefon: '' };
    var sim = root.KemasEngine && root.KemasEngine.nameSimilarity;
    var calon = tepat.length > 1 ? tepat : kenalan
      .map(function (c) { return { c: c, s: sim && c.nama ? sim(c.nama, label) : 0 }; })
      .filter(function (x) { return x.s >= 0.75; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 5)
      .map(function (x) { return x.c; });
    return { status: 'semak', kenalan: null, calon: calon, telefon: '' };
  }

  // ---------- Cap jari fail (mengesan fail sama dimuat naik semula) ----------
  function cincang(teks) {
    var data = new TextEncoder().encode(String(teks || '').replace(/\r\n?/g, '\n').trim());
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  // ---------- Baca fail .zip (eksport iPhone: "WhatsApp Chat - Nama.zip" → _chat.txt) ----------
  // Pembaca minimum: cari fail .txt dalam direktori pusat zip dan nyahmampat
  // dengan DecompressionStream pelayar. Media dalam zip diabaikan.
  function bacaZip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('Fail zip tidak sah'));
    var bil = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), masuk = [];
    for (var n = 0; n < bil && dv.getUint32(p, true) === 0x02014b50; n++) {
      var kaedah = dv.getUint16(p + 10, true), saizM = dv.getUint32(p + 20, true);
      var pn = dv.getUint16(p + 28, true), pe = dv.getUint16(p + 30, true), pk = dv.getUint16(p + 32, true);
      var ofs = dv.getUint32(p + 42, true);
      var nama = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + pn));
      if (/\.txt$/i.test(nama) && !/(^|\/)__MACOSX\//.test(nama)) masuk.push({ nama: nama, kaedah: kaedah, saiz: saizM, ofs: ofs });
      p += 46 + pn + pe + pk;
    }
    return Promise.all(masuk.map(function (m) {
      var mula = m.ofs + 30 + dv.getUint16(m.ofs + 26, true) + dv.getUint16(m.ofs + 28, true);
      var data = u8.subarray(mula, mula + m.saiz);
      var teks;
      if (m.kaedah === 0) teks = Promise.resolve(new TextDecoder().decode(data));
      else if (m.kaedah === 8 && typeof DecompressionStream !== 'undefined') {
        teks = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      } else return Promise.resolve(null);
      return teks.then(function (t) { return { nama: m.nama, teks: t }; });
    })).then(function (r) { return r.filter(Boolean); });
  }

  var KATEGORI = [
    { id: 'prospek_harga',     label: 'Prospek – Tanya harga' },
    { id: 'prospek_berminat',  label: 'Prospek – Berminat' },
    { id: 'prospek_hampir',    label: 'Prospek – Hampir membeli' },
    { id: 'support_pelanggan', label: 'Support – Kemungkinan pelanggan' },
    { id: 'customer_semak',    label: 'Customer – Perlu semakan pembelian' },
    { id: 'tidak_diketahui',   label: 'Tidak diketahui' }
  ];

  root.DynoWA = {
    huraiChat: huraiChat, namaDariFail: namaDariFail, kenalPastiSaya: kenalPastiSaya,
    sediakan: sediakan, bersihkanTeks: bersihkanTeks, binaMuatan: binaMuatan,
    padankan: padankan, cincang: cincang, telefonSah: telefonSah, samaNama: samaNama, bacaZip: bacaZip,
    KATEGORI: KATEGORI
  };
})(typeof window !== 'undefined' ? window : globalThis);
