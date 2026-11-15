// POST /functions/v1/lead-retry — cuba semula lead Meta Lead Ads yang gagal
//
//   Authorization: Bearer <CRON_SECRET>   — tugas berjadual: semua penyewa
//   Authorization: Bearer <JWT pengguna>  — butang "Cuba semula" dalam app: ralat sendiri sahaja
//
// Pulangan: { dicuba, berjaya, gagal }

import { jawab, kepala, logRalat, penggunaJwt, RalatSementara, rpc, tokenBearer } from "../_shared/lead.ts";
import { RalatGraph } from "../_shared/meta.ts";
import { type IntegrasiMeta, prosesLeadMeta } from "../_shared/metaLead.ts";

type Tertunda = { id: string; integration_id: string; owner_id: string; external_event_id: string; percubaan: number };

function samaMasaTetap(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function handler(req: Request): Promise<Response> {
  const asal = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: kepala(asal, true) });
  const j = (s: number, b: unknown) => jawab(s, b, asal, true);
  if (req.method !== "POST") return j(405, { ralat: "kaedah_tidak_sah" });

  const token = tokenBearer(req);
  let owner: string | null = null;
  if (!samaMasaTetap(token, Deno.env.get("CRON_SECRET") ?? "")) {
    const u = await penggunaJwt(token);
    if (!u) return j(401, { ralat: "perlu_log_masuk" });
    owner = u.id;
  }

  let senarai: Tertunda[];
  try {
    senarai = await rpc<Tertunda[]>("ralat_untuk_dicuba", { p_owner: owner, p_had: 50 });
  } catch {
    return j(503, { ralat: "sementara" });
  }

  const integ = new Map<string, IntegrasiMeta | null>();
  let berjaya = 0, gagal = 0;
  for (const t of senarai) {
    try {
      if (!integ.has(t.integration_id)) {
        // cari_integrasi mengikut id: guna jadual melalui service role
        const r = await rpc<IntegrasiMeta[]>("integrasi_mengikut_id", { p_id: t.integration_id });
        integ.set(t.integration_id, r[0] ?? null);
      }
      const i = integ.get(t.integration_id);
      if (!i || !i.aktif) { gagal++; continue; }
      await prosesLeadMeta(i, t.external_event_id);
      await rpc("selesai_ralat", { p_integration: t.integration_id, p_event_id: t.external_event_id });
      berjaya++;
    } catch (e) {
      gagal++;
      const s = e instanceof RalatSementara || (e instanceof RalatGraph && e.sementara);
      await logRalat(t.integration_id, t.owner_id, "meta_lead_ads", t.external_event_id, String(e instanceof Error ? e.message : e), s);
    }
  }
  return j(200, { dicuba: senarai.length, berjaya, gagal });
}
