// WhatsApp Business Platform (Cloud API) — webhook rasmi
//
// GET  : pengesahan langganan Meta (hub.verify_token = WHATSAPP_VERIFY_TOKEN)
// POST : mesej masuk. Tandatangan X-Hub-Signature-256 disahkan dengan META_APP_SECRET.
//        Setiap mesej masuk = satu event lead; message.id = kunci idempotensi.
//        Nombor (wa_id) -> E.164; nombor sama -> kenalan sama dikemas kini.
//
// Pulangan 200 bila semua mesej diproses (atau tidak berkaitan). 500 bila ada
// ralat sementara, supaya Meta menghantar semula; event yang sudah diproses
// tidak berganda kerana unique (owner_id, sumber_lead, external_event_id).

import { keE164 } from "../_shared/telefon.ts";
import { sahkanLanggan, sahkanTandatangan } from "../_shared/meta.ts";
import { logRalat, RalatSementara, rpc, tangkap } from "../_shared/lead.ts";

type Integ = { id: string; owner_id: string; aktif: boolean };
type Mesej = {
  from?: string; id?: string; timestamp?: string; type?: string;
  text?: { body?: string }; button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  referral?: { headline?: string; source_type?: string };
};

function isiMesej(m: Mesej): string {
  if (m.type === "text") return m.text?.body ?? "";
  if (m.type === "button") return m.button?.text ?? "[butang]";
  if (m.type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[interaktif]";
  return `[${m.type ?? "mesej"}]`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "GET") return sahkanLanggan(req, Deno.env.get("WHATSAPP_VERIFY_TOKEN"));
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const mentah = await req.text();
  if (!(await sahkanTandatangan(mentah, req.headers.get("x-hub-signature-256"), Deno.env.get("META_APP_SECRET")))) {
    return new Response("signature", { status: 401 });
  }
  let badan: { object?: string; entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  try { badan = JSON.parse(mentah); } catch { return new Response("json", { status: 400 }); }
  if (badan.object !== "whatsapp_business_account") return new Response("ok");

  const cache = new Map<string, Integ | null>();
  let gagalSementara = false;

  for (const entry of badan.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "messages" || !ch.value) continue;
      const v = ch.value as {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: Mesej[];
      };
      const pnid = v.metadata?.phone_number_id;
      if (!pnid || !v.messages?.length) continue;   // status penghantaran dsb. diabaikan

      if (!cache.has(pnid)) {
        try {
          const r = await rpc<Integ[]>("cari_integrasi", { p_jenis: "whatsapp", p_external_id: pnid });
          cache.set(pnid, r[0] ?? null);
        } catch (e) {
          console.error("whatsapp-webhook: cari_integrasi", String(e));
          gagalSementara = true; continue;
        }
      }
      const integ = cache.get(pnid);
      if (!integ || !integ.aktif) { console.warn("whatsapp-webhook: nombor tidak didaftarkan/aktif", pnid); continue; }

      for (const m of v.messages) {
        if (!m.id || !m.from) continue;
        const nama = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? "";
        const iklan = m.referral?.source_type === "ad" ? " (dari iklan Click-to-WhatsApp)" : "";
        try {
          await tangkap({
            owner: integ.owner_id,
            sumber: "whatsapp",
            eventId: m.id,
            telefon: keE164(m.from),
            nama,
            mesej: isiMesej(m) + iklan,
            diterima: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
            integrasi: integ.id,
            kaedah: "webhook",
            asas: "whatsapp_inbound",
          });
        } catch (e) {
          const s = e instanceof RalatSementara;
          gagalSementara ||= s;
          await logRalat(integ.id, integ.owner_id, "whatsapp", m.id, String(e), s);
        }
      }
    }
  }
  return new Response(gagalSementara ? "retry" : "ok", { status: gagalSementara ? 500 : 200 });
}
