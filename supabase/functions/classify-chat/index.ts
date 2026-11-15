// Dyno Mini CRM — Edge Function: klasifikasi satu chat WhatsApp dengan Claude
//
// POST /functions/v1/classify-chat
//   Authorization: Bearer <JWT pengguna Supabase>
//   { "mesej": [{ "dari": "pelanggan"|"penjual", "teks": "...", "tarikh": "YYYY-MM-DD" }],
//     "produk_sedia": ["Kek lapis 1kg", ...] }
//
// Pulangan 200: { "keputusan": {...}, "penggunaan": { "jumlah": n, "had": n } }
//
// Keselamatan:
//   * API key Anthropic hanya wujud di sini (Supabase secret), tidak pernah ke telefon.
//   * Setiap panggilan disahkan dengan JWT pengguna dan dikira dalam had bulanan.
//   * Teks chat tidak disimpan dan tidak dilog — hanya keputusan dipulangkan.
//
// Secrets yang diperlukan: ANTHROPIC_API_KEY, ALLOWED_ORIGINS (dipisah koma).
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY disediakan secara automatik.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { binaPrompt, SISTEM, SKEMA, sahkanKeputusan, sahkanPermintaan } from "../_shared/klasifikasi.ts";

const MODEL = "claude-opus-5-5";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const ASAL_DIBENARKAN = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://minicrm.my")
  .split(",").map((s) => s.trim()).filter(Boolean);

function kepala(asal: string | null): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (asal && ASAL_DIBENARKAN.includes(asal)) h["Access-Control-Allow-Origin"] = asal;
  return h;
}

function jawab(status: number, badan: unknown, asal: string | null): Response {
  return new Response(JSON.stringify(badan), { status, headers: kepala(asal) });
}

function bulanIni(): string {
  // Bulan mengikut waktu Malaysia (UTC+8)
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
}

Deno.serve(async (req) => {
  const asal = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: kepala(asal) });
  if (req.method !== "POST") return jawab(405, { ralat: "kaedah_tidak_sah" }, asal);
  if (asal && !ASAL_DIBENARKAN.includes(asal)) return jawab(403, { ralat: "asal_tidak_dibenarkan" }, asal);

  // 1. Siapa pengguna ini?
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return jawab(401, { ralat: "perlu_log_masuk" }, asal);
  const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !auth?.user) return jawab(401, { ralat: "perlu_log_masuk" }, asal);
  const pemilik = auth.user.id;

  // 2. Sahkan dan bersihkan input
  let badan: unknown;
  try {
    badan = await req.json();
  } catch {
    return jawab(400, { ralat: "json_tidak_sah" }, asal);
  }
  const permintaan = sahkanPermintaan(badan);
  if (typeof permintaan === "string") return jawab(400, { ralat: "input_tidak_sah", mesej: permintaan }, asal);

  // 3. Had bulanan — dituntut sebelum memanggil AI, dipulangkan jika gagal
  const bulan = bulanIni();
  const { data: tuntut, error: tuntutErr } = await admin.rpc("ai_usage_claim", { p_owner: pemilik, p_bulan: bulan });
  if (tuntutErr) return jawab(500, { ralat: "pelayan" }, asal);
  if (!tuntut?.ok) return jawab(429, { ralat: "had_bulanan", had: tuntut?.had ?? 0 }, asal);
  const pulangKiraan = () => admin.rpc("ai_usage_refund", { p_owner: pemilik, p_bulan: bulan });

  // 4. Panggil Claude
  try {
    // `fallbacks: "default"` menghantar permintaan yang ditolak oleh pengelas
    // keselamatan kepada model sandaran yang disyorkan, dalam panggilan yang sama.
    const params = {
      model: MODEL,
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SKEMA } },
      system: SISTEM,
      messages: [{ role: "user", content: binaPrompt(permintaan) }],
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
    const res = await anthropic.beta.messages.create(params);

    if (res.stop_reason === "refusal") {
      await pulangKiraan();
      return jawab(422, { ralat: "ai_menolak" }, asal);
    }
    if (res.stop_reason === "max_tokens") {
      await pulangKiraan();
      return jawab(502, { ralat: "ai_tidak_lengkap" }, asal);
    }
    const blok = res.content.find((b) => b.type === "text");
    let mentah: unknown = null;
    try {
      mentah = blok && blok.type === "text" ? JSON.parse(blok.text) : null;
    } catch {
      mentah = null;
    }
    const keputusan = sahkanKeputusan(mentah);
    if (!keputusan) {
      await pulangKiraan();
      return jawab(502, { ralat: "ai_format" }, asal);
    }
    return jawab(200, { keputusan, penggunaan: { jumlah: tuntut.jumlah, had: tuntut.had } }, asal);
  } catch (e) {
    await pulangKiraan();
    if (e instanceof Anthropic.RateLimitError) return jawab(503, { ralat: "ai_sibuk" }, asal);
    if (e instanceof Anthropic.AuthenticationError) return jawab(500, { ralat: "ai_kunci" }, asal);
    if (e instanceof Anthropic.APIError) return jawab(502, { ralat: "ai_ralat", status: e.status }, asal);
    return jawab(500, { ralat: "pelayan" }, asal);
  }
});
