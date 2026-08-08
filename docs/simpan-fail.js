/* Dynopro Auto Contact — penghantar fail vCard
   Satu tempat sahaja untuk menyerahkan fail .vcf kepada pengguna.

   Sebab fail ini wujud: pada iPhone dan iPad, Safari MENGABAIKAN atribut
   `download` bagi URL blob. Fail tidak pernah muncul dalam senarai Muat
   Turun, dan pengguna nampak seolah-olah butang itu tidak berfungsi
   langsung. Helaian Kongsi iOS pula berfungsi, dan terus menawarkan
   "Save to Files" serta app Contacts.                                   */
(function (root, d) {
  'use strict';

  function isIOS() {
    return (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
           !root.MSStream;
  }

  var lastUrl = null;
  function viaAnchor(name, blob) {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    var a = d.createElement('a');
    a.href = lastUrl;
    a.download = name;
    d.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Sandaran iOS bila helaian Kongsi tiada: buka blob dalam tab baharu.
  // Safari akan papar bar "Download" — itu satu-satunya cara fail benar-benar
  // sampai ke app Files pada iPhone. Muat turun melalui <a download> hanya
  // gagal senyap di sini, jadi ia BUKAN sandaran yang sah untuk iOS.
  function viaTab(blob) {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    var w = root.open(lastUrl, '_blank');
    if (!w) { root.location.href = lastUrl; }    // pop-up disekat
  }

  /* Pulangkan cara penghantaran yang digunakan:
       'kongsi' — helaian Kongsi iOS
       'tab'    — dibuka dalam tab (sandaran iOS)
       'muat'   — muat turun biasa (Android / desktop)
     Pemanggil guna nilai ini untuk memaparkan arahan yang betul. */
  function hantar(name, data) {
    var blob = new Blob([data], { type: 'text/vcard;charset=utf-8' });

    if (isIOS()) {
      if (navigator.canShare && navigator.share) {
        try {
          var file = new File([blob], name, { type: 'text/vcard' });
          if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: name })
              .catch(function (err) {
                // Pengguna batal = biarkan. Ralat sebenar = cuba tab.
                if (err && err.name === 'AbortError') return;
                viaTab(blob);
              });
            return 'kongsi';
          }
        } catch (e) { /* jatuh ke tab */ }
      }
      viaTab(blob);
      return 'tab';
    }

    viaAnchor(name, blob);
    return 'muat';
  }

  root.DynoFail = { hantar: hantar, isIOS: isIOS };
})(window, document);
