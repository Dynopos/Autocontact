// POST /functions/v1/lead-capture  —  "POST /api/leads/capture"
//
// Pengesahan (salah satu):
//   Authorization: Bearer dyno_<kunci API>   — integrasi pelayan-ke-pelayan (Zapier, Make, sistem lain)
//   Authorization: Bearer <JWT pengguna>     — app Dyno (Auto Contact, kongsi manual)
//
// Badan: satu lead, atau { "leads": [ ... ] } (maksimum 200)
//   { "phone_number": "+60123456789", "contact_name": "Ahmad", "lead_source": "whatsapp",
//     "first_message": "Nak tanya harga POS", "external_lead_id": "event-123",
//     "received_at": "2026-11-10T09:00:00+08:00", "consent_basis": "whatsapp_inbound" }
//
// Pulangan 200: { "diproses": n, "keputusan": [{ external_lead_id, status, contact_id?, sebab? }] }
//   status: dicipta | dikemas_kini | duplikat_event | ditolak
// 503: ralat sementara — selamat untuk dihantar semula (idempoten melalui external_lead_id).

import { keE164 } from "../_shared/telefon.ts";
import {
  jawab, kepala, penggunaJwt, RalatSementara, rpc, sha256Hex, SUMBER, type Sumber, tangkap, tokenBearer,
} from "../_shared/lead.ts";

const HAD_LEAD = 200;
const SUMBER_APP: Sumber[] = ["whatsapp", "auto_contact", "manual", "import"];

type Masuk = Record<string, unknown>;
type Hasil = { external_lead_id: string | null; status: string; contact_id?: string; sebab?: string };

function teks(v: unknown, had: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, had) : "";
}
function masa(v: unknown): Date {
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(typeof v === "number" && v < 1e12 ? v * 1000 : v);
    if (!isNaN(d.getTime()) && d.getTime() < Date.now() + 86_400_000) return d;
  }
  return new Date();
}

export async function handler(req: Request): Promise<Response> {
  const asal = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: kepala(asal, true) });
  const j = (s: number, b: unknown) => jawab(s, b, asal, true);
  if (req.method !== "POST") return j(405, { ralat: "kaedah_tidak_sah" });

  // ---- Siapa? ----
  const token = tokenBearer(req);
  let owner: string, integrasi: string | null = null, kaedah: "api" | "manual";
  if (token.startsWith("dyno_")) {
    const baris = await rpc<{ id: string; owner_id: string; aktif: boolean }[]>("cari_kunci_api", { p_hash: await sha256Hex(token) })
      .catch(() => null);
    if (baris === null) return j(503, { ralat: "sementara" });
    const k = baris[0];
    if (!k || !k.aktif) return j(401, { ralat: "kunci_tidak_sah" });
    owner = k.owner_id; integrasi = k.id; kaedah = "api";
  } else {
    const u = await penggunaJwt(token);
    if (!u) return j(401, { ralat: "perlu_log_masuk" });
    owner = u.id; kaedah = "manual";
  }

  // ---- Input ----
  let badan: unknown;
  try {
    const mentah = await req.text();
    if (mentah.length > 512_000) return j(413, { ralat: "terlalu_besar" });
    badan = JSON.parse(mentah);
  } catch {
    return j(400, { ralat: "json_tidak_sah" });
  }
  const senarai: Masuk[] = Array.isArray((badan as Masuk)?.leads) ? (badan as { leads: Masuk[] }).leads : [badan as Masuk];
  if (!senarai.length || senarai.length > HAD_LEAD) return j(400, { ralat: "bilangan_lead", had: HAD_LEAD });

  const keputusan: Hasil[] = [];
  let sementara = false;
  for (const l of senarai) {
    if (!l || typeof l !== "object") { keputusan.push({ external_lead_id: null, status: "ditolak", sebab: "format_tidak_sah" }); continue; }
    const sumberMasuk = teks(l.lead_source, 20) || (kaedah === "api" ? "api" : "manual");
    const sumber = sumberMasuk as Sumber;
    if (!(SUMBER as readonly string[]).includes(sumber) || (kaedah === "manual" && !SUMBER_APP.includes(sumber))) {
      keputusan.push({ external_lead_id: teks(l.external_lead_id, 200) || null, status: "ditolak", sebab: "lead_source_tidak_sah" });
      continue;
    }
    const telefon = keE164(l.phone_number);
    // Integrasi API mesti memberi ID event untuk idempotensi. App boleh
    // meninggalkannya: satu nombor dari sumber yang sama dianggap satu event.
    let eventId = teks(l.external_lead_id, 200);
    if (!eventId) {
      if (kaedah === "api") { keputusan.push({ external_lead_id: null, status: "ditolak", sebab: "external_lead_id_diperlukan" }); continue; }
      if (!telefon) { keputusan.push({ external_lead_id: null, status: "ditolak", sebab: "nombor_tidak_sah" }); continue; }
      eventId = `${sumber}:${telefon}`;
    }
    if (sementara) { keputusan.push({ external_lead_id: eventId, status: "belum_diproses" }); continue; }
    try {
      const h = await tangkap({
        owner, sumber, eventId, telefon,
        nama: teks(l.contact_name, 120),
        mesej: teks(l.first_message, 1000),
        diterima: masa(l.received_at),
        integrasi, kaedah,
        asas: teks(l.consent_basis, 60) || (sumber === "whatsapp" ? "whatsapp_inbound" : sumber),
      });
      keputusan.push({ external_lead_id: eventId, ...h });
    } catch (e) {
      if (e instanceof RalatSementara) {
        console.error("lead-capture: ralat sementara", String(e));
        sementara = true;
        keputusan.push({ external_lead_id: eventId, status: "belum_diproses" });
      } else {
        console.error("lead-capture: ralat", String(e));
        keputusan.push({ external_lead_id: eventId, status: "ditolak", sebab: "ralat_data" });
      }
    }
  }
  if (sementara) return j(503, { ralat: "sementara", mesej: "Cuba semula; lead yang sudah diproses tidak akan berganda.", keputusan });
  return j(200, { diproses: keputusan.length, keputusan });
}

