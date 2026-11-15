// Normalisasi & pengesahan nombor telefon kepada E.164 dengan libphonenumber-js
// (metadata "max" — pengesahan penuh mengikut negara dan jenis nombor).
//
//   "0123456789", "60123456789", "+60 12-345 6789", "6012 345 6789" -> "+60123456789"
//   "+65 8123 4567" -> "+6581234567"
//   "", "123", "abc" -> null

import { parsePhoneNumberFromString } from "npm:libphonenumber-js@1.13.15/max";

export function keE164(mentah: unknown, negaraLalai = "MY"): string | null {
  if (typeof mentah !== "string" && typeof mentah !== "number") return null;
  let s = String(mentah).trim();
  if (!s) return null;
  s = s.replace(/[^\d+]/g, "");                  // buang ruang, sengkang, kurungan, titik
  if (s.indexOf("+") > 0) s = s.replace(/\+/g, ""); // '+' di tengah = ralat taip
  if (s.startsWith("00")) s = "+" + s.slice(2);  // awalan antarabangsa 00
  if (!/\d{6,}/.test(s)) return null;

  // Tanpa '+': nombor bermula 0 ialah nombor tempatan; yang lain dicuba
  // dahulu sebagai antarabangsa (cth. wa_id WhatsApp "60123456789").
  const cubaan = s.startsWith("+") ? [s] : s.startsWith("0") ? [s] : ["+" + s, s];
  for (const c of cubaan) {
    // deno-lint-ignore no-explicit-any
    const p = parsePhoneNumberFromString(c, negaraLalai as any);
    if (p && p.isValid()) return p.number as string;
  }
  return null;
}
