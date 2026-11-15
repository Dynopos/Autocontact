globalThis.KemasEngine = require(require('path').join(__dirname, '..', 'docs', 'kemas-engine.js'));
require(require('path').join(__dirname, '..', 'docs', 'wa-klasifikasi.js'));
const W = globalThis.DynoWA; let fail = 0;
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };
const android = `09/11/2026, 14:05 - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.
09/11/2026, 14:05 - Kak Nik: Salam, kek lapis 1kg berapa?
09/11/2026, 14:06 - Bob Dyno: RM45 kak
09/11/2026, 14:07 - Kak Nik: Ok nak 2. Akaun bank apa?
boleh hantar ke rumah
09/11/2026, 14:08 - Kak Nik: <Media omitted>
13/11/2026, 09:00 - Bob Dyno: Maybank 1234567890 ya`;
const ios = `‎[9/11/26, 2:05:33 PM] +60 12-345 6789: Hi nak tanya harga hamper
[9/11/26, 2:06:01 PM] Bob Dyno: Boleh, emel saya bob@dyno.my
[9/11/26, 2:07:00 PM] +60 12-345 6789: ‎image omitted`;
const us = `11/13/2026, 9:00 AM - Ali: hello\n11/13/2026, 9:01 AM - Bob Dyno: hi`;
const group = `01/11/2026, 10:00 - Bob Dyno: Promo!\n01/11/2026, 10:01 - Ali: Saya nak\n01/11/2026, 10:02 - Siti: Saya pun`;
const a = W.huraiChat(android, 'WhatsApp Chat with Kak Nik.txt');
ok('android: system line skipped, 5 msgs', a.mesej.length === 5);
ok('android: multiline joined', /boleh hantar ke rumah/.test(a.mesej[2].teks));
ok('android: media placeholder', a.mesej[3].teks === '[media]');
ok('android: dd/mm date', a.mesej[4].tarikh === '2026-11-13');
ok('android: participants', a.peserta.join('|') === 'Kak Nik|Bob Dyno');
ok('filename name', a.namaFail === 'Kak Nik');
const i = W.huraiChat(ios, 'WhatsApp Chat - +60 12-345 6789.txt');
ok('ios: 3 msgs, 2-digit year', i.mesej.length === 3 && i.mesej[0].tarikh === '2026-11-09');
ok('ios: phone sender', i.peserta[0] === '+60 12-345 6789');
ok('ios: image omitted', i.mesej[2].teks === '[media]');
const u = W.huraiChat(us, 'x.txt');
ok('us mm/dd detected', u.mesej[0].tarikh === '2026-11-13');
const g = W.huraiChat(group, 'WhatsApp Chat with Pelanggan Raya.txt');
// me detection: Bob Dyno appears in multiple files
const saya = W.kenalPastiSaya([a, i, g], '');
ok('me detected via repeat', saya.every(s => s === 'Bob Dyno'));
const saya2 = W.kenalPastiSaya([a], '');
ok('me detected via filename', saya2[0] === 'Bob Dyno');
const saya3 = W.kenalPastiSaya([W.huraiChat(us, 'x.txt')], '');
ok('unknown me -> perlu_nama', W.sediakan(u, saya3[0]).status === 'perlu_nama');
ok('explicit name', W.kenalPastiSaya([u], 'bob dyno')[0] === 'Bob Dyno');
ok('group skipped', W.sediakan(g, 'Bob Dyno').status === 'kumpulan');
const s = W.sediakan(i, 'Bob Dyno');
ok('ios ready with phone', s.status === 'sedia' && s.telefon === '+60123456789');
// payload
const m = W.binaMuatan(a, 'Bob Dyno', 'Kak Nik', 'Kak Nik Kuih');
const txt = JSON.stringify(m);
ok('payload roles only', m.mesej.every(x => x.dari === 'pelanggan' || x.dari === 'penjual') && !/Kak Nik|Bob Dyno/.test(txt));
ok('payload account no redacted', /\[NOMBOR\]/.test(txt) && !/1234567890/.test(txt));
const mi = W.binaMuatan(i, 'Bob Dyno', '+60 12-345 6789', '');
ok('payload email redacted', /\[EMEL\]/.test(JSON.stringify(mi)) && !/bob@dyno/.test(JSON.stringify(mi)));
ok('price kept', /RM45/.test(txt));
const long = Array.from({length: 90}, (_, k) => `01/11/2026, 10:${String(k%60).padStart(2,'0')} - ${k%2?'Bob':'Ali'}: mesej ${k}`).join('\n');
const L = W.binaMuatan(W.huraiChat(long,''), 'Bob', 'Ali', '');
ok('payload capped to 60 + flagged', L.mesej.length === 60 && L.dipotong && /mesej 89/.test(L.mesej[59].teks));
// matching
const kenalan = [{ id: '1', telefon: '+60123456789', nama: 'Customer 001' }, { id: '2', telefon: '+60175558899', nama: 'Kak Nik' }, { id: '3', telefon: '+60191112222', nama: 'Ali Trading' }, { id: '4', telefon: '+60191113333', nama: 'Ali Trading' }];
ok('match by phone', W.padankan('+60 12-345 6789', kenalan).kenalan.id === '1');
ok('new phone', W.padankan('+60 13-999 8888', kenalan).status === 'baharu');
ok('match unique name', W.padankan('kak nik', kenalan).kenalan.id === '2');
const dup = W.padankan('Ali Trading', kenalan);
ok('duplicate names -> review with 2 candidates', dup.status === 'semak' && dup.calon.length === 2);
const fz = W.padankan('Kak Nikk', kenalan);
ok('fuzzy -> review with candidate', fz.status === 'semak' && fz.calon[0] && fz.calon[0].id === '2');
ok('no match -> review', W.padankan('Zul', kenalan).status === 'semak');
W.cincang('abc').then(h => { ok('sha256', h === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); if (fail) process.exit(1); });
