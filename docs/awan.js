/* Dyno Mini CRM — sambungan awan (Supabase)
   Satu tempat untuk log masuk, kenalan, import chat, klasifikasi dan
   penggunaan AI. Setiap permintaan membawa token pengguna; pelayan
   (Row Level Security) memastikan pengguna hanya nampak data sendiri.

   Bergantung pada: config.js dan supabase-js (UMD, global `supabase`). */
(function (root) {
  'use strict';

  var cfg = root.DYNO_CONFIG || {};
  var sb = null, pengguna = null, pendengar = [];
  var CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';

  // Ciri awan wujud hanya bila config.js diisi.
  function siap() { return !!(cfg.supabaseUrl && cfg.supabaseAnonKey); }

  // Pustaka Supabase dimuat hanya bila diperlukan, supaya pengguna mod
  // telefon sahaja tidak memuat turun apa-apa yang tidak digunakan.
  var muatP = null;
  function muatPustaka() {
    if (root.supabase && root.supabase.createClient) return Promise.resolve();
    if (!muatP) {
      muatP = new Promise(function (ok, gagal) {
        var s = document.createElement('script');
        s.src = CDN; s.async = true;
        s.onload = function () { ok(); };
        s.onerror = function () { muatP = null; gagal(new Error('Tidak dapat menyambung ke awan. Semak internet anda.')); };
        document.head.appendChild(s);
      });
    }
    return muatP;
  }

  function klien() {
    if (!sb && siap() && root.supabase) {
      sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'dyno_sb_auth' }
      });
      sb.auth.onAuthStateChange(function (_e, sesi) {
        var baru = sesi ? sesi.user : null;
        var tukar = (baru && baru.id) !== (pengguna && pengguna.id);
        pengguna = baru;
        if (tukar) pendengar.forEach(function (f) { try { f(pengguna); } catch (e) {} });
      });
    }
    return sb;
  }

  function ralat(e, lalai) {
    var m = (e && (e.message || e.error_description)) || lalai || 'Ralat tidak diketahui';
    var x = new Error(m); x.asal = e; return x;
  }
  function semak(res, lalai) {
    if (res.error) throw ralat(res.error, lalai);
    return res.data;
  }

  // ---------- Log masuk (kod 6 digit melalui emel) ----------
  function mula() {
    if (!siap()) return Promise.resolve(null);
    return muatPustaka().then(function () { klien(); return sb.auth.getSession(); }).then(function (r) {
      pengguna = r.data && r.data.session ? r.data.session.user : null;
      return pengguna;
    });
  }
  function hantarKod(emel) {
    return klien().auth.signInWithOtp({ email: emel, options: { shouldCreateUser: true } })
      .then(function (r) { semak(r, 'Kod tidak dapat dihantar'); });
  }
  function sahkanKod(emel, kod) {
    return klien().auth.verifyOtp({ email: emel, token: kod, type: 'email' })
      .then(function (r) { semak(r, 'Kod tidak sah'); pengguna = r.data.user; return pengguna; });
  }
  function logKeluar() {
    return klien().auth.signOut().then(function () { pengguna = null; });
  }

  // ---------- Kenalan ----------
  var LAJUR = 'id,telefon,nama,emel,produk,status,sumber,kumpulan,susulan,nota,kategori,kategori_disahkan,kategori_disahkan_at,ringkasan,tindakan,keyakinan,created_at,updated_at';

  function senaraiKenalan() {
    var semua = [], saiz = 1000;
    function halaman(dari) {
      return sb.from('contacts').select(LAJUR).order('created_at', { ascending: true })
        .range(dari, dari + saiz - 1)
        .then(function (r) {
          var d = semak(r, 'Kenalan tidak dapat dimuatkan');
          semua = semua.concat(d);
          return d.length === saiz ? halaman(dari + saiz) : semua;
        });
    }
    return halaman(0);
  }

  /* rows: [{ id?, telefon, nama, ... }] — yang ada id dikemas kini; yang
     tiada id dicipta (atau digabung jika nombor sudah wujud). */
  function simpanKenalan(rows, abaikanPendua) {
    var lama = rows.filter(function (r) { return r.id; });
    var baru = rows.filter(function (r) { return !r.id; }).map(function (r) {
      var x = Object.assign({}, r); delete x.id; x.owner_id = pengguna.id; return x;
    });
    var kerja = [];
    if (lama.length) kerja.push(sb.from('contacts').upsert(lama, { onConflict: 'id' }).select(LAJUR));
    for (var i = 0; i < baru.length; i += 500) {
      kerja.push(sb.from('contacts')
        .upsert(baru.slice(i, i + 500), { onConflict: 'owner_id,telefon', ignoreDuplicates: !!abaikanPendua })
        .select(LAJUR));
    }
    return Promise.all(kerja).then(function (hasil) {
      return hasil.reduce(function (a, r) { return a.concat(semak(r, 'Kenalan tidak dapat disimpan') || []); }, []);
    });
  }
  function padamKenalan(ids) {
    return sb.from('contacts').delete().in('id', ids).then(function (r) { semak(r, 'Kenalan tidak dapat dipadam'); });
  }

  // ---------- Import chat ----------
  function cariImport(hash) {
    if (!hash.length) return Promise.resolve([]);
    return sb.from('chat_imports').select('id,file_hash,file_name,created_at').in('file_hash', hash)
      .then(function (r) { return semak(r, 'Sejarah import tidak dapat dibaca'); });
  }
  function daftarImport(rek) {
    return sb.from('chat_imports')
      .upsert(Object.assign({ owner_id: pengguna.id }, rek), { onConflict: 'owner_id,file_hash' })
      .select('id,file_hash').single()
      .then(function (r) { return semak(r, 'Import tidak dapat direkodkan'); });
  }
  function senaraiImport() {
    return sb.from('chat_imports').select('id,file_name,message_count,created_at')
      .order('created_at', { ascending: false }).limit(100)
      .then(function (r) { return semak(r, 'Sejarah import tidak dapat dibaca'); });
  }
  function padamImport(id) {
    return sb.from('chat_imports').delete().eq('id', id).then(function (r) { semak(r, 'Import tidak dapat dipadam'); });
  }

  // ---------- Klasifikasi ----------
  function guna(p) {
    return sb.rpc('apply_classification', p).then(function (r) { return semak(r, 'Keputusan tidak dapat disimpan'); });
  }
  function simpanTertunda(rek) {
    return sb.from('classifications').insert(Object.assign({ owner_id: pengguna.id, status: 'pending' }, rek))
      .then(function (r) { semak(r, 'Senarai semakan tidak dapat dikemas kini'); });
  }
  function senaraiTertunda() {
    return sb.from('classifications')
      .select('id,import_id,sender_label,sender_phone,calon,kategori,produk,ringkasan,tindakan,keyakinan,susulan_hari,created_at')
      .eq('status', 'pending').order('created_at', { ascending: false })
      .then(function (r) { return semak(r, 'Senarai semakan tidak dapat dibaca'); });
  }
  function padamKlasifikasi(id) {
    return sb.from('classifications').delete().eq('id', id).then(function (r) { semak(r, 'Tidak dapat dipadam'); });
  }

  var MESEJ_AI = {
    had_bulanan: 'Had analisis AI bulan ini sudah dicapai.',
    perlu_log_masuk: 'Sesi tamat. Sila log masuk semula.',
    ai_menolak: 'AI tidak dapat menganalisis chat ini.',
    ai_sibuk: 'AI sedang sibuk. Cuba lagi sebentar.',
    input_tidak_sah: 'Chat ini tidak dapat dihantar untuk analisis.'
  };
  /* Pulangkan { keputusan, penggunaan } atau buang Error dengan .kod */
  function klasifikasi(muatan) {
    return sb.functions.invoke('classify-chat', { body: muatan }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      var p = ctx && typeof ctx.json === 'function' ? ctx.json().catch(function () { return {}; }) : Promise.resolve({});
      return p.then(function (b) {
        var e = new Error((b && (b.mesej || MESEJ_AI[b.ralat])) || 'Analisis gagal. Cuba lagi.');
        e.kod = (b && b.ralat) || 'rangkaian'; e.had = b && b.had;
        throw e;
      });
    });
  }

  function penggunaan() {
    var bulan = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
    return Promise.all([
      sb.from('ai_usage').select('jumlah').eq('bulan', bulan).maybeSingle(),
      sb.from('user_plans').select('ai_monthly_limit').maybeSingle()
    ]).then(function (r) {
      return {
        jumlah: (r[0].data && r[0].data.jumlah) || 0,
        had: r[1].data ? r[1].data.ai_monthly_limit : 20
      };
    });
  }

  // ---------- Borang log masuk (dikongsi oleh semua halaman) ----------
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function paparLogin(el, selesai) {
    var emel = '';
    function langkah1(msg) {
      el.innerHTML =
        '<div class="card"><div class="f"><label for="awEmel">Emel</label>' +
        '<input id="awEmel" type="email" inputmode="email" autocomplete="email" placeholder="nama@contoh.com" value="' + esc(emel) + '">' +
        '<div class="hint">Kami hantar kod 6 digit ke emel ini. Tiada kata laluan.</div>' +
        (msg ? '<div class="err">' + esc(msg) + '</div>' : '') + '</div>' +
        '<button class="btn" type="button" id="awHantar">Hantar kod</button></div>';
      el.querySelector('#awHantar').addEventListener('click', function () {
        emel = el.querySelector('#awEmel').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emel)) { langkah1('Masukkan emel yang sah.'); return; }
        this.disabled = true; this.textContent = 'Menghantar…';
        hantarKod(emel).then(function () { langkah2(); }, function (e) { langkah1(e.message); });
      });
    }
    function langkah2(msg) {
      el.innerHTML =
        '<div class="card"><div class="f"><label for="awKod">Kod dari emel ' + esc(emel) + '</label>' +
        '<input id="awKod" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456">' +
        (msg ? '<div class="err">' + esc(msg) + '</div>' : '<div class="hint">Semak juga folder Spam.</div>') + '</div>' +
        '<button class="btn" type="button" id="awSah">Log masuk</button>' +
        '<button class="linkbtn" type="button" id="awUlang">← Tukar emel / hantar semula</button></div>';
      el.querySelector('#awKod').focus();
      el.querySelector('#awSah').addEventListener('click', function () {
        var kod = el.querySelector('#awKod').value.replace(/\D/g, '');
        if (kod.length < 6) { langkah2('Masukkan kod 6 digit.'); return; }
        this.disabled = true; this.textContent = 'Menyemak…';
        sahkanKod(emel, kod).then(function (u) { selesai && selesai(u); }, function (e) { langkah2(e.message); });
      });
      el.querySelector('#awUlang').addEventListener('click', function () { langkah1(); });
    }
    langkah1();
  }

  root.DynoAwan = {
    siap: siap, mula: mula, pengguna: function () { return pengguna; },
    onTukar: function (f) { pendengar.push(f); },
    hantarKod: hantarKod, sahkanKod: sahkanKod, logKeluar: logKeluar,
    senaraiKenalan: senaraiKenalan, simpanKenalan: simpanKenalan, padamKenalan: padamKenalan,
    cariImport: cariImport, daftarImport: daftarImport, senaraiImport: senaraiImport, padamImport: padamImport,
    guna: guna, simpanTertunda: simpanTertunda, senaraiTertunda: senaraiTertunda, padamKlasifikasi: padamKlasifikasi,
    klasifikasi: klasifikasi, penggunaan: penggunaan, paparLogin: paparLogin
  };
})(window);
