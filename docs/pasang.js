/* Dynopro Auto Contact — pemasangan PWA (dikongsi semua halaman)
   Satu fail sahaja: daftar service worker + papar butang "Pasang".

   Cara guna: <script src="pasang.js" defer></script>
   Jika halaman sudah ada butang sendiri (#install), kami guna butang itu.
   Jika tidak, kami cipta butang terapung di bawah skrin secara automatik. */
(function (w, d) {
  'use strict';

  var deferred = null;
  var btn = null;
  var made = false;

  function standalone() {
    return w.navigator.standalone === true ||
      (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches);
  }

  function styles() {
    if (d.getElementById('dynoPasangCss')) return;
    var s = d.createElement('style');
    s.id = 'dynoPasangCss';
    s.textContent =
      '#dynoPasang{position:fixed;left:14px;right:14px;bottom:14px;z-index:9999;' +
      'display:none;align-items:center;gap:10px;width:auto;max-width:520px;' +
      'margin:0 auto;background:#2A0550;color:#fff;border:1px solid rgba(255,255,255,.22);' +
      'border-radius:15px;padding:13px 15px;font:600 13.5px/1.35 system-ui,-apple-system,' +
      '"Segoe UI",Roboto,sans-serif;text-align:left;cursor:pointer;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.28)}' +
      '#dynoPasang.show{display:flex}' +
      '#dynoPasang svg{flex:none}' +
      '#dynoPasang .x{margin-left:auto;opacity:.65;padding:0 2px;font-size:17px;line-height:1}';
    d.head.appendChild(s);
  }

  function ensureBtn() {
    if (btn) return btn;
    btn = d.getElementById('install');
    if (btn) return btn;                 // halaman ada butang sendiri
    styles();
    btn = d.createElement('button');
    btn.id = 'dynoPasang';
    btn.type = 'button';
    btn.innerHTML =
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>' +
      '<span>Pasang ke skrin utama telefon</span>' +
      '<span class="x" aria-label="Tutup">&times;</span>';
    made = true;
    (d.body || d.documentElement).appendChild(btn);
    return btn;
  }

  // Butang terapung melekat di bawah skrin — beri ruang tambahan supaya ia
  // tidak menutup butang halaman di bahagian bawah.
  function ruang(on) {
    if (!made || !d.body) return;
    d.body.style.paddingBottom = on ? ((btn.offsetHeight || 48) + 26) + 'px' : '';
  }

  function show(text) {
    var b = ensureBtn();
    if (text) {
      var sp = b.querySelector('span');
      if (sp) sp.textContent = text;
    }
    b.classList.add('show');
    ruang(true);
  }

  function hide() {
    if (btn) btn.classList.remove('show');
    ruang(false);
  }

  function wire() {
    var b = ensureBtn();
    if (b.dataset.dynoWired) return;
    b.dataset.dynoWired = '1';
    b.addEventListener('click', function (e) {
      // Tanda silang (hanya pada butang terapung) = sorok sahaja
      if (made && e.target && e.target.className === 'x') {
        hide();
        try { localStorage.setItem('dyno_pasang_tutup', '1'); } catch (err) {}
        return;
      }
      if (deferred) {
        deferred.prompt();
        deferred = null;
        hide();
      }
    });
  }

  w.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    wire();
    show();
  });

  w.addEventListener('appinstalled', hide);

  function ditutup() {
    try { return localStorage.getItem('dyno_pasang_tutup') === '1'; }
    catch (e) { return false; }
  }

  function start() {
    if (standalone()) return;            // sudah dipasang — jangan ganggu
    wire();
    if (ditutup()) return;               // pengguna sudah tutup butang ini

    // iOS tiada beforeinstallprompt — beri arahan manual.
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !w.MSStream;
    if (isIOS) show('Pasang: tekan Kongsi ⬆ → "Add to Home Screen"');

    // Sesetengah pelayar telefon (Samsung Internet, Firefox, atau bila
    // beforeinstallprompt dilepaskan sebelum skrip ini berjalan) tidak
    // mencetuskan peristiwa itu langsung. Papar panduan manual supaya
    // pengguna tidak buntu.
    var mobile = /Android|Mobile|iPhone|iPad|iPod/.test(navigator.userAgent);
    setTimeout(function () {
      if (deferred || standalone() || isIOS || !mobile) return;
      if (btn && btn.classList.contains('show')) return;
      show('Pasang: menu ⋮ pelayar → "Add to Home screen"');
    }, 3500);
  }

  if ('serviceWorker' in navigator) {
    w.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})(window, document);
