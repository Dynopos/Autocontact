/* Dynopro Auto Contact — Enjin Kemas Kontak
   Menghurai fail eksport kontak, menormalkan nombor Malaysia,
   mengesan pendua, dan menjana fail bersih.

   Semua pemprosesan berlaku dalam peranti pengguna.
   Tiada rangkaian, tiada kebergantungan luar.                        */
(function (root) {
  'use strict';

  // ================= Normalisasi nombor =================
  // Malaysia: 0123456789 = 60123456789 = +60 12-345 6789 = nombor yang SAMA.
  function normPhone(raw) {
    if (!raw) return '';
    var s = String(raw).replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.indexOf('+') > 0) s = s.replace(/\+/g, '');        // '+' di tengah = ralat taip
    if (s.charAt(0) === '+') {
      return s.replace(/^\+?0+(?=\d)/, '+');                  // buang sifar pendahulu selepas +
    }
    if (s.indexOf('60') === 0 && s.length >= 10) return '+' + s;
    if (s.charAt(0) === '0') return '+60' + s.slice(1);
    if (s.length >= 9 && s.length <= 11) return '+60' + s;    // andaian nombor tempatan tanpa 0
    return s;
  }

  // Nombor mudah dibaca
  function prettyPhone(n) {
    if (!n) return '';
    if (n.indexOf('+60') === 0) {
      var r = n.slice(3);
      if (r.length === 9) return '+60 ' + r.slice(0, 2) + '-' + r.slice(2, 5) + ' ' + r.slice(5);
      if (r.length === 10) return '+60 ' + r.slice(0, 2) + '-' + r.slice(2, 6) + ' ' + r.slice(6);
      if (r.length > 2) return '+60 ' + r.slice(0, 2) + '-' + r.slice(2);
    }
    return n;
  }

  // Nombor Malaysia yang munasabah?
  function looksValidMY(n) {
    if (n.indexOf('+60') !== 0) return true;                  // bukan MY — jangan hakim
    var r = n.slice(3);
    if (!/^\d+$/.test(r)) return false;
    if (r.charAt(0) === '1') return r.length === 9 || r.length === 10;  // mudah alih
    return r.length >= 8 && r.length <= 9;                    // talian tetap
  }

  // ================= Normalisasi nama =================
  function stripJunk(s) {
    return String(s || '')
      // buang emoji & simbol hiasan
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normName(s) {
    return stripJunk(s)
      .toLowerCase()
      .replace(/[._\-*#~"'`^|\\\/()\[\]{}<>:;,!?]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Nama yang sebenarnya bukan nama (hanya nombor / terlalu pendek)
  function isEmptyName(s) {
    var n = normName(s);
    if (!n) return true;
    if (/^[\d\s+]+$/.test(n)) return true;                    // nama = nombor telefon
    return false;
  }

  // ================= Persamaan nama =================
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }

  // 0..1 — 1 bermakna sama
  function nameSimilarity(a, b) {
    a = normName(a); b = normName(b);
    if (!a || !b) return 0;
    if (a === b) return 1;

    // Kandungan token: "ali kedai" di dalam "ali kedai runcit bangi"
    var ta = a.split(' ').filter(Boolean), tb = b.split(' ').filter(Boolean);
    var setB = Object.create(null); tb.forEach(function (t) { setB[t] = 1; });
    var shared = ta.filter(function (t) { return setB[t]; }).length;
    var small = Math.min(ta.length, tb.length);
    if (small >= 2 && shared === small) return 0.94;          // satu nama subset penuh yang lain
    if (small >= 2 && shared >= 2 && shared / small >= 0.8) return 0.9;

    var dist = levenshtein(a, b);
    var maxLen = Math.max(a.length, b.length);
    return maxLen ? 1 - dist / maxLen : 0;
  }

  // ================= Penghurai vCard =================
  function decodeQP(s) {
    return s.replace(/=(?:\r?\n)/g, '')
            .replace(/=([0-9A-Fa-f]{2})/g, function (_, h) {
              return String.fromCharCode(parseInt(h, 16));
            });
  }

  function unescapeVal(s) {
    return String(s).replace(/\\n/gi, '\n').replace(/\\,/g, ',')
                    .replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  function parseVCF(text) {
    // Buka lipatan baris (baris sambungan bermula dengan ruang/tab)
    var unfolded = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                       .replace(/\n[ \t]/g, '');
    var out = [];
    var blocks = unfolded.split(/BEGIN:VCARD/i).slice(1);

    blocks.forEach(function (blk) {
      var body = blk.split(/END:VCARD/i)[0];
      var c = { name: '', phones: [], emails: [], org: '', note: '' };

      body.split('\n').forEach(function (line) {
        if (!line.trim()) return;
        var idx = line.indexOf(':');
        if (idx < 0) return;
        var head = line.slice(0, idx);
        var val = line.slice(idx + 1);
        var parts = head.split(';');
        var prop = parts[0].toUpperCase();
        if (prop.indexOf('.') > -1) prop = prop.split('.').pop();   // buang kumpulan item1.
        var isQP = /QUOTED-PRINTABLE/i.test(head);
        if (isQP) val = decodeQP(val);
        val = unescapeVal(val).trim();
        if (!val) return;

        if (prop === 'FN') { if (!c.name) c.name = val; }
        else if (prop === 'N') {
          if (!c.name) {
            var seg = val.split(';');
            c.name = ((seg[1] || '') + ' ' + (seg[0] || '')).replace(/\s+/g, ' ').trim();
          }
        }
        else if (prop === 'TEL') c.phones.push(val);
        else if (prop === 'EMAIL') c.emails.push(val);
        else if (prop === 'ORG') { if (!c.org) c.org = val.replace(/;+$/, '').replace(/;/g, ' '); }
        else if (prop === 'NOTE') { if (!c.note) c.note = val; }
      });

      out.push(finalise(c));
    });
    return out;
  }

  // ================= Penghurai CSV (Google Contacts) =================
  function parseCSVRows(text) {
    var rows = [], row = [], cell = '', inQ = false, i;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; }
          else inQ = false;
        } else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }

  function parseCSV(text) {
    var rows = parseCSVRows(text);
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var idx = function (re) {
      for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i;
      return -1;
    };
    var iName = idx(/^name$/), iGiven = idx(/given name/), iFamily = idx(/family name/);
    var phoneCols = [], emailCols = [], orgCol = idx(/organization 1 - name|^organization$/);
    head.forEach(function (h, i) {
      if (/phone \d+ - value|^phone$/.test(h)) phoneCols.push(i);
      if (/e-?mail \d+ - value|^e-?mail$/.test(h)) emailCols.push(i);
    });

    var out = [];
    rows.slice(1).forEach(function (r) {
      var name = iName > -1 ? (r[iName] || '').trim() : '';
      if (!name) {
        name = [(iGiven > -1 ? r[iGiven] : ''), (iFamily > -1 ? r[iFamily] : '')]
               .join(' ').replace(/\s+/g, ' ').trim();
      }
      var phones = [], emails = [];
      // Google memisahkan berbilang nilai dengan ' ::: '
      phoneCols.forEach(function (i) {
        String(r[i] || '').split(':::').forEach(function (v) { if (v.trim()) phones.push(v.trim()); });
      });
      emailCols.forEach(function (i) {
        String(r[i] || '').split(':::').forEach(function (v) { if (v.trim()) emails.push(v.trim()); });
      });
      out.push(finalise({
        name: name, phones: phones, emails: emails,
        org: orgCol > -1 ? (r[orgCol] || '').trim() : '', note: ''
      }));
    });
    return out;
  }

  // ================= Kemaskan satu kontak =================
  function finalise(c) {
    var seen = Object.create(null), phones = [], invalid = [];
    c.phones.forEach(function (p) {
      var n = normPhone(p);
      if (!n) return;
      if (seen[n]) return;
      seen[n] = 1;
      phones.push(n);
      if (!looksValidMY(n)) invalid.push(n);
    });
    var eseen = Object.create(null), emails = [];
    (c.emails || []).forEach(function (e) {
      var k = String(e).toLowerCase().trim();
      if (k && !eseen[k]) { eseen[k] = 1; emails.push(k); }
    });
    var name = stripJunk(c.name);
    return {
      name: name, phones: phones, emails: emails,
      org: stripJunk(c.org), note: c.note || '',
      invalidPhones: invalid,
      noName: isEmptyName(name),
      noPhone: phones.length === 0,
      empty: isEmptyName(name) && phones.length === 0 && emails.length === 0
    };
  }

  function parseAny(text, filename) {
    if (/BEGIN:VCARD/i.test(text)) return parseVCF(text);
    if ((filename || '').toLowerCase().slice(-4) === '.csv' || text.indexOf(',') > -1) return parseCSV(text);
    return [];
  }

  // ================= Kesan pendua =================
  function analyse(contacts, opts) {
    opts = opts || {};
    var nameThreshold = opts.nameThreshold || 0.88;

    // --- Union-find ---
    var parent = contacts.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }

    // 1) Nombor sama = PASTI pendua
    var byPhone = Object.create(null);
    contacts.forEach(function (c, i) {
      c.phones.forEach(function (p) {
        if (byPhone[p] === undefined) byPhone[p] = i;
        else union(byPhone[p], i);
      });
    });

    var certainRoots = Object.create(null);
    contacts.forEach(function (_, i) { if (find(i) !== i) certainRoots[find(i)] = 1; });

    // 2) Nama sangat serupa = MUNGKIN pendua (tidak digabung automatik)
    // Blocking: hanya bandingkan nama dalam baldi yang sama supaya laju.
    var buckets = Object.create(null);
    contacts.forEach(function (c, i) {
      if (c.noName) return;
      var n = normName(c.name);
      var key = n.slice(0, 2);
      (buckets[key] = buckets[key] || []).push(i);
      var toks = n.split(' ').filter(Boolean);
      if (toks.length > 1) {          // juga baldi ikut token pertama
        var k2 = '~' + toks[0];
        (buckets[k2] = buckets[k2] || []).push(i);
      }
    });

    var probable = [], seenPair = Object.create(null);
    Object.keys(buckets).forEach(function (k) {
      var arr = buckets[k];
      if (arr.length < 2 || arr.length > 400) return;
      for (var a = 0; a < arr.length; a++) {
        for (var b = a + 1; b < arr.length; b++) {
          var i = arr[a], j = arr[b];
          if (find(i) === find(j)) continue;            // sudah pendua pasti
          var pk = i < j ? i + '-' + j : j + '-' + i;
          if (seenPair[pk]) continue;
          seenPair[pk] = 1;
          var sim = nameSimilarity(contacts[i].name, contacts[j].name);
          if (sim >= nameThreshold) {
            probable.push({ a: i, b: j, score: sim });
          }
        }
      }
    });
    probable.sort(function (x, y) { return y.score - x.score; });

    // --- Kumpulkan pendua pasti ---
    var groupsMap = Object.create(null);
    contacts.forEach(function (c, i) {
      var r = find(i);
      (groupsMap[r] = groupsMap[r] || []).push(i);
    });
    var duplicateGroups = [];
    Object.keys(groupsMap).forEach(function (r) {
      if (groupsMap[r].length > 1) duplicateGroups.push(groupsMap[r]);
    });
    duplicateGroups.sort(function (a, b) { return b.length - a.length; });

    // --- Kiraan masalah ---
    var stats = {
      total: contacts.length,
      duplicateGroups: duplicateGroups.length,
      duplicateExtra: duplicateGroups.reduce(function (s, g) { return s + g.length - 1; }, 0),
      probablePairs: probable.length,
      noName: 0, noPhone: 0, empty: 0, invalidPhone: 0
    };
    contacts.forEach(function (c) {
      if (c.empty) { stats.empty++; return; }
      if (c.noName) stats.noName++;
      if (c.noPhone) stats.noPhone++;
      if (c.invalidPhones.length) stats.invalidPhone++;
    });

    return { groups: duplicateGroups, probable: probable, stats: stats, find: find };
  }

  // ================= Gabung satu kumpulan =================
  function mergeGroup(contacts, idxs) {
    var best = null, bestScore = -1;
    idxs.forEach(function (i) {
      var c = contacts[i];
      var score = (c.noName ? 0 : 40) + Math.min(c.name.length, 30) +
                  c.emails.length * 5 + (c.org ? 5 : 0) + c.phones.length;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    var phones = [], ps = Object.create(null);
    var emails = [], es = Object.create(null);
    var org = '', note = '';
    idxs.forEach(function (i) {
      var c = contacts[i];
      c.phones.forEach(function (p) { if (!ps[p]) { ps[p] = 1; phones.push(p); } });
      c.emails.forEach(function (e) { if (!es[e]) { es[e] = 1; emails.push(e); } });
      if (!org && c.org) org = c.org;
      if (!note && c.note) note = c.note;
    });
    return {
      name: best.name, phones: phones, emails: emails, org: org, note: note,
      noName: isEmptyName(best.name), noPhone: phones.length === 0,
      invalidPhones: [], empty: false, mergedFrom: idxs.length
    };
  }

  // ================= Bina hasil bersih =================
  function build(contacts, result, options) {
    var o = options || {};
    var keep = [];
    var handled = Object.create(null);

    result.groups.forEach(function (g) {
      g.forEach(function (i) { handled[i] = 1; });
      if (o.mergeDuplicates !== false) {
        keep.push(mergeGroup(contacts, g));
      } else {
        g.forEach(function (i) { keep.push(contacts[i]); });
      }
    });

    contacts.forEach(function (c, i) {
      if (handled[i]) return;
      keep.push(c);
    });

    var removedEmpty = 0, renamed = 0, removedNoPhone = 0;
    var final = [];
    keep.forEach(function (c) {
      if (o.dropEmpty !== false && c.empty) { removedEmpty++; return; }
      if (o.dropNoPhone && c.noPhone && !c.emails.length) { removedNoPhone++; return; }
      final.push(c);
    });

    if (o.nameUnnamed !== false) {
      var n = 0;
      final.forEach(function (c) {
        if (c.noName) { n++; c.name = 'Tanpa Nama ' + String(n).padStart(3, '0'); renamed++; }
      });
    }

    return {
      contacts: final,
      summary: {
        before: contacts.length,
        after: final.length,
        merged: result.stats.duplicateExtra,
        removedEmpty: removedEmpty,
        removedNoPhone: removedNoPhone,
        renamed: renamed
      }
    };
  }

  // ================= Jana vCard =================
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function toVCF(contacts) {
    return contacts.map(function (c) {
      var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      var name = c.name || '';
      lines.push('N:;' + esc(name) + ';;;');
      lines.push('FN:' + esc(name));
      c.phones.forEach(function (p) { lines.push('TEL;TYPE=CELL:' + esc(p)); });
      c.emails.forEach(function (e) { lines.push('EMAIL;TYPE=INTERNET:' + esc(e)); });
      if (c.org) lines.push('ORG:' + esc(c.org));
      if (c.note) lines.push('NOTE:' + esc(c.note));
      lines.push('END:VCARD');
      return lines.join('\r\n');
    }).join('\r\n') + '\r\n';
  }

  root.KemasEngine = {
    normPhone: normPhone, prettyPhone: prettyPhone, looksValidMY: looksValidMY,
    normName: normName, nameSimilarity: nameSimilarity, isEmptyName: isEmptyName,
    parseVCF: parseVCF, parseCSV: parseCSV, parseAny: parseAny,
    analyse: analyse, mergeGroup: mergeGroup, build: build, toVCF: toVCF
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).KemasEngine;
}
