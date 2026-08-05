/* Dynopro Auto Contact — pembaca tangkapan skrin
   Membaca nombor telefon daripada tangkapan skrin senarai chat.

   Semuanya berjalan DALAM pelayar pengguna:
   • Imej tidak pernah dimuat naik ke mana-mana pelayan
   • Enjin OCR dihos pada domain ini sendiri, bukan CDN pihak ketiga
   • Selepas dimuat turun sekali, ia berfungsi tanpa internet          */
(function (root) {
  'use strict';

  var LOADED = false;

  // Muat enjin secara malas — hanya bila pengguna benar-benar guna ciri ini,
  // supaya app utama kekal ringan bagi mereka yang tidak memerlukannya.
  function loadEngine(onProgress) {
    if (LOADED && root.Tesseract) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      if (root.Tesseract) { LOADED = true; return resolve(); }
      onProgress && onProgress('Memuat turun enjin pembaca…', 0);
      var sc = document.createElement('script');
      sc.src = 'ocr/tesseract.min.js';
      sc.onload = function () { LOADED = true; resolve(); };
      sc.onerror = function () {
        reject(new Error('Gagal memuatkan enjin pembaca. Semak sambungan internet anda.'));
      };
      document.head.appendChild(sc);
    });
  }

  // Tangkapan skrin bergolek boleh sangat tinggi. OCR lebih tepat pada
  // kepingan yang lebih kecil, jadi kita potong dengan TINDIHAN supaya
  // tiada baris chat terpotong separuh di sempadan.
  var TILE = 1600, STEP = 1200, MAXW = 1400;

  function sliceImage(img) {
    var scale = img.naturalWidth > MAXW ? MAXW / img.naturalWidth : 1;
    var w = Math.round(img.naturalWidth * scale);
    var h = Math.round(img.naturalHeight * scale);
    var tiles = [];

    if (h <= TILE) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return [c];
    }
    for (var y = 0; y < h; y += STEP) {
      var th = Math.min(TILE, h - y);
      if (th < 60) break;
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = th;
      cv.getContext('2d').drawImage(img, 0, y / scale, img.naturalWidth, th / scale,
                                         0, 0, w, th);
      tiles.push(cv);
    }
    return tiles;
  }

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Fail imej tidak dapat dibaca: ' + file.name));
      };
      img.src = url;
    });
  }

  /* Baca senarai fail imej, pulangkan teks tergabung.
     onProgress(mesej, pecahan 0..1) dipanggil sepanjang proses. */
  function readScreenshots(files, onProgress) {
    files = Array.prototype.slice.call(files);
    var worker = null;

    return loadEngine(onProgress)
      .then(function () {
        onProgress && onProgress('Menyediakan pembaca…', 0.05);
        return root.Tesseract.createWorker('eng', 1, {
          workerPath: 'ocr/worker.min.js',
          corePath:   'ocr/',
          langPath:   'ocr/',
          gzip: true,
          logger: function () {}
        });
      })
      .then(function (w) {
        worker = w;
        var texts = [];

        // Proses satu imej pada satu masa supaya penggunaan memori terkawal
        // pada telefon lama.
        return files.reduce(function (chain, file, idx) {
          return chain.then(function () {
            return readImage(file).then(function (img) {
              var tiles = sliceImage(img);
              return tiles.reduce(function (c2, tile, ti) {
                return c2.then(function () {
                  var frac = (idx + (ti + 1) / tiles.length) / files.length;
                  onProgress && onProgress(
                    'Membaca gambar ' + (idx + 1) + ' daripada ' + files.length +
                    (tiles.length > 1 ? '  (bahagian ' + (ti + 1) + '/' + tiles.length + ')' : ''),
                    0.1 + frac * 0.9);
                  return worker.recognize(tile).then(function (res) {
                    texts.push(res.data.text);
                    tile.width = tile.height = 0;   // lepaskan memori
                  });
                });
              }, Promise.resolve());
            });
          });
        }, Promise.resolve()).then(function () { return texts.join('\n'); });
      })
      .then(function (text) {
        if (worker) worker.terminate();
        return text;
      })
      .catch(function (err) {
        if (worker) { try { worker.terminate(); } catch (e) {} }
        throw err;
      });
  }

  // Adakah enjin sudah tersimpan dalam peranti? Digunakan untuk memutuskan
  // sama ada perlu memberi amaran saiz muat turun kepada pengguna.
  function isCached() {
    if (!root.caches) return Promise.resolve(false);
    return root.caches.match('ocr/eng.traineddata.gz')
      .then(function (r) { return !!r; })
      .catch(function () { return false; });
  }

  root.DynoOCR = { readScreenshots: readScreenshots, isCached: isCached };
})(window);
