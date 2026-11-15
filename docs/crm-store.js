/* Dynopro Auto Contact — storan Mini CRM
   Satu tempat untuk membaca dan menulis rekod pelanggan Mini CRM.

   Rekod disimpan dalam localStorage pelayar pengguna sahaja (kunci
   'dyno_crm') — sama seperti rekod nombor app ini. Tiada server.

   Kunci setiap rekod ialah nombor dalam bentuk piawai '+60…' (sama
   dengan KemasEngine.normPhone dan rekod simpan.html), jadi satu nombor
   hanya boleh wujud sekali walau ditaip dalam format berbeza.

   Bentuk rekod:
     { nama, emel, produk, status, sumber, kumpulan, susulan (YYYY-MM-DD),
       nota, dibuat (ISO), dikemas (ISO) }                                 */
(function (root) {
  'use strict';

  var K = 'dyno_crm';
  var mem = null;          // sandaran bila localStorage disekat

  // id kekal (data lama & pangkalan data); label ikut aliran jualan
  var STATUS = [
    { id: 'lead',      label: 'New Lead' },
    { id: 'dihubungi', label: 'Contacted' },
    { id: 'prospek',   label: 'Interested' },
    { id: 'followup',  label: 'Follow-up' },
    { id: 'customer',  label: 'Won' },
    { id: 'tidak',     label: 'Lost' }
  ];

  function kunci(raw) {
    var E = root.KemasEngine;
    if (!E) return '';
    var n = E.normPhone(raw);
    if (!n || n.charAt(0) !== '+') return '';
    var d = n.slice(1);
    if (d.length < 8 || d.length > 15) return '';
    return E.looksValidMY(n) ? n : '';
  }

  function semua() {
    try {
      var v = JSON.parse(localStorage.getItem(K) || '{}');
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) {
      return mem || {};
    }
  }

  /* Pulangkan true jika berjaya disimpan secara kekal. false bermakna
     storan penuh atau disekat — pemanggil mesti memberitahu pengguna. */
  function tulis(db) {
    try {
      localStorage.setItem(K, JSON.stringify(db));
      mem = null;
      return true;
    } catch (e) {
      mem = db;
      return false;
    }
  }

  function kini() { return new Date().toISOString(); }

  /* Dipanggil oleh simpan.html selepas fail kontak dijana: setiap nombor
     baharu masuk CRM sebagai Lead, dengan nama yang sama seperti dalam
     telefon (cth. Customer 001). Rekod sedia ada TIDAK ditimpa — nama dan
     nota yang pengguna sudah kemas kini dalam CRM kekal.
     senarai: [{ telefon, nama }]                                         */
  function tambahDariSimpan(senarai, kumpulan) {
    var db = semua(), t = kini(), tambah = 0;
    (senarai || []).forEach(function (x) {
      var k = kunci(x.telefon);
      if (!k || db[k]) return;
      db[k] = {
        nama: x.nama || '', emel: '', produk: '', status: 'lead',
        sumber: 'Auto Contact', kumpulan: kumpulan || '', susulan: '',
        nota: '', dibuat: t, dikemas: t
      };
      tambah++;
    });
    if (tambah) tulis(db);
    return tambah;
  }

  root.DynoCRM = {
    STATUS: STATUS,
    kunci: kunci,
    semua: semua,
    tulis: tulis,
    tambahDariSimpan: tambahDariSimpan
  };
})(window);
