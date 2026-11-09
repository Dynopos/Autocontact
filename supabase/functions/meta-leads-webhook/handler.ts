// Meta Lead Ads (Facebook / Instagram Instant Forms) — webhook Page, medan "leadgen"
//
// GET  : pengesahan langganan (hub.verify_token = META_VERIFY_TOKEN)
// POST : { object: "page", entry: [{ id, changes: [{ field: "leadgen",
//          value: { leadgen_id, page_id, form_id, ad_id, created_time } }] }] }
//        Tandatangan X-Hub-Signature-256 disahkan dengan META_APP_SECRET.
//        Butiran lead (nama, telefon, jawapan) diambil dari Graph API GET /{leadgen_id}
//        dengan token Page penyewa yang disulitkan dalam pangkalan data.
//
// Ralat sementara (Graph 5xx/had kadar, pangkalan data) -> direkodkan untuk
// lead-retry DAN dibalas 500 supaya Meta menghantar semula. Ralat kekal
// (token tamat, tiada kebenaran) -> direkodkan, dibalas 200; pengguna
// membetulkan sambungan kemudian menekan "Cuba semula".

import { sahkanLanggan, sahkanTandatangan, RalatGraph } from "../_shared/meta.ts";
import { logRalat, RalatSementara, rpc } from "../_shared/lead.ts";
import { type IntegrasiMeta, prosesLeadMeta } from "../_shared/metaLead.ts";

export async function handler(req: Request): Promise<Response> {
  if (req.method === "GET") return sahkanLanggan(req, Deno.env.get("META_VERIFY_TOKEN"));
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const mentah = await req.text();
  if (!(await sahkanTandatangan(mentah, req.headers.get("x-hub-signature-256"), Deno.env.get("META_APP_SECRET")))) {
    return new Response("signature", { status: 401 });
  }
  let badan: { object?: string; entry?: { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  try { badan = JSON.parse(mentah); } catch { return new Response("json", { status: 400 }); }
  if (badan.object !== "page") return new Response("ok");

  const cache = new Map<string, IntegrasiMeta | null>();
  let gagalSementara = false;

  for (const entry of badan.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "leadgen" || !ch.value) continue;
      const v = ch.value as { leadgen_id?: string | number; page_id?: string | number; created_time?: number };
      const leadId = v.leadgen_id != null ? String(v.leadgen_id) : "";
      const pageId = String(v.page_id ?? entry.id ?? "");
      if (!leadId || !pageId) continue;

      if (!cache.has(pageId)) {
        try {
          const r = await rpc<IntegrasiMeta[]>("cari_integrasi", { p_jenis: "meta_lead_ads", p_external_id: pageId });
          cache.set(pageId, r[0] ?? null);
        } catch (e) {
          console.error("meta-leads-webhook: cari_integrasi", String(e));
          gagalSementara = true; continue;
        }
      }
      const integ = cache.get(pageId);
      if (!integ || !integ.aktif) { console.warn("meta-leads-webhook: Page tidak didaftarkan/aktif", pageId); continue; }

      try {
        await prosesLeadMeta(integ, leadId, v.created_time);
        await rpc("selesai_ralat", { p_integration: integ.id, p_event_id: leadId }).catch(() => {});
      } catch (e) {
        const s = e instanceof RalatSementara || (e instanceof RalatGraph && e.sementara);
        gagalSementara ||= s;
        await logRalat(integ.id, integ.owner_id, "meta_lead_ads", leadId, String(e instanceof Error ? e.message : e), s);
      }
    }
  }
  return new Response(gagalSementara ? "retry" : "ok", { status: gagalSementara ? 500 : 200 });
}
