// POST /functions/v1/integrasi — sambung integrasi (pengguna log masuk sahaja)
//
// { "tindakan": "kunci_api", "nama": "Zapier" }
//     -> { kunci: "dyno_..." }  (dipaparkan SEKALI; hanya hash disimpan)
// { "tindakan": "meta_page", "page_id": "123...", "page_token": "EAAG..." }
//     -> sahkan token boleh akses Page itu, langgan webhook leadgen untuk Page,
//        simpan token yang disulitkan (AES-GCM).
// { "tindakan": "whatsapp", "phone_number_id": "123...", "access_token": "EAAG..." }
//     -> sahkan token boleh akses nombor itu (bukti pemilikan). Token TIDAK disimpan.
//
// Pengesahan pemilikan menghalang pengguna lain "menuntut" Page atau nombor
// WhatsApp perniagaan anda untuk menerima lead anda.

import { jawab, kepala, penggunaJwt, rpc, sha256Hex, tokenBearer } from "../_shared/lead.ts";
import { graph, RalatGraph, sulitkan } from "../_shared/meta.ts";

const ID = /^[0-9]{5,30}$/;

export async function handler(req: Request): Promise<Response> {
  const asal = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: kepala(asal, true) });
  const j = (s: number, b: unknown) => jawab(s, b, asal, true);
  if (req.method !== "POST") return j(405, { ralat: "kaedah_tidak_sah" });

  const u = await penggunaJwt(tokenBearer(req));
  if (!u) return j(401, { ralat: "perlu_log_masuk" });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return j(400, { ralat: "json_tidak_sah" }); }
  const nama = typeof b.nama === "string" ? b.nama.trim().slice(0, 80) : "";

  try {
    if (b.tindakan === "kunci_api") {
      const rawak = crypto.getRandomValues(new Uint8Array(24));
      const kunci = "dyno_" + Array.from(rawak, (x) => x.toString(16).padStart(2, "0")).join("");
      const id = await rpc<string>("daftar_integrasi", {
        p_owner: u.id, p_jenis: "api", p_nama: nama || "Kunci API", p_external_id: null,
        p_kunci_hash: await sha256Hex(kunci), p_kunci_awalan: kunci.slice(0, 13), p_token: null,
      });
      return j(200, { id, kunci });
    }

    // Peranti Android Dyno Auto Contact: kunci per peranti (boleh dibatalkan satu-satu)
    if (b.tindakan === "peranti_android") {
      const rawak = crypto.getRandomValues(new Uint8Array(24));
      const kunci = "dyno_" + Array.from(rawak, (x) => x.toString(16).padStart(2, "0")).join("");
      const id = await rpc<string>("daftar_integrasi", {
        p_owner: u.id, p_jenis: "android", p_nama: nama || "Telefon Android", p_external_id: null,
        p_kunci_hash: await sha256Hex(kunci), p_kunci_awalan: kunci.slice(0, 13), p_token: null,
      });
      const base = (Deno.env.get("PUBLIC_FUNCTIONS_URL") ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1`).replace(/\/$/, "");
      // Kod sambungan = base64url(JSON) — ditampal sekali dalam app Android
      const kod = btoa(JSON.stringify({ v: 1, u: `${base}/lead-capture`, k: kunci }))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return j(200, { id, kod });
    }

    if (b.tindakan === "meta_page") {
      const pageId = String(b.page_id ?? "").trim(), token = String(b.page_token ?? "").trim();
      if (!ID.test(pageId) || token.length < 20) return j(400, { ralat: "input_tidak_sah", mesej: "Page ID atau token tidak sah." });
      const page = await graph(pageId, token, { params: { fields: "id,name" } });
      if (String(page.id) !== pageId) return j(403, { ralat: "bukan_pemilik", mesej: "Token ini bukan untuk Page tersebut." });
      const langgan = await graph(`${pageId}/subscribed_apps`, token, { method: "POST", params: { subscribed_fields: "leadgen" } });
      if (langgan.success !== true) return j(502, { ralat: "langgan_gagal", mesej: "Page tidak dapat dilanggan untuk webhook leadgen." });
      const id = await rpc<string>("daftar_integrasi", {
        p_owner: u.id, p_jenis: "meta_lead_ads", p_nama: nama || String(page.name ?? "Page Meta"), p_external_id: pageId,
        p_kunci_hash: null, p_kunci_awalan: null, p_token: await sulitkan(token),
      });
      return j(200, { id, nama: page.name });
    }

    if (b.tindakan === "whatsapp") {
      const pnid = String(b.phone_number_id ?? "").trim(), token = String(b.access_token ?? "").trim();
      if (!ID.test(pnid) || token.length < 20) return j(400, { ralat: "input_tidak_sah", mesej: "Phone number ID atau token tidak sah." });
      const n = await graph(pnid, token, { params: { fields: "id,display_phone_number,verified_name" } });
      if (String(n.id) !== pnid) return j(403, { ralat: "bukan_pemilik", mesej: "Token ini bukan untuk nombor tersebut." });
      const label = nama || [n.verified_name, n.display_phone_number].filter(Boolean).join(" · ") || "WhatsApp";
      const id = await rpc<string>("daftar_integrasi", {
        p_owner: u.id, p_jenis: "whatsapp", p_nama: label, p_external_id: pnid,
        p_kunci_hash: null, p_kunci_awalan: null, p_token: null,
      });
      return j(200, { id, nama: label });
    }
    return j(400, { ralat: "tindakan_tidak_sah" });
  } catch (e) {
    if (e instanceof RalatGraph) {
      return j(e.sementara ? 503 : 400, { ralat: "graph", mesej: e.sementara ? "Meta tidak dapat dihubungi. Cuba lagi." : `Meta menolak: ${e.message}` });
    }
    if (String(e).includes("sudah_disambung_akaun_lain")) {
      return j(409, { ralat: "sudah_disambung", mesej: "Page atau nombor ini sudah disambung ke akaun lain." });
    }
    console.error("integrasi:", String(e));
    return j(500, { ralat: "pelayan" });
  }
}
