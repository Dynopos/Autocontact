// Mock Anthropic + Supabase, then load the real edge function.
const seen: any = { anthropic: [], rpc: [] };
let mode = "ok"; let quotaOk = true;
Deno.serve({ port: 8701, onListen() {} }, async (req) => {
  const body = await req.json();
  seen.anthropic.push({ url: new URL(req.url).pathname, beta: req.headers.get("anthropic-beta"), body });
  const text = JSON.stringify({ kategori: "prospek_hampir", keyakinan: 1.7, produk: "Kek lapis", ringkasan: "Nak order 2 biji, hubungi 0123456789", tindakan: "Hantar akaun bank", susulan_hari: 99, bukti_pembelian: "x", sebab: "Tanya cara bayar" });
  const msg = { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: mode === "refusal" ? [] : [{ type: "text", text }], stop_reason: mode === "refusal" ? "refusal" : "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
  return Response.json(msg);
});
Deno.serve({ port: 8702, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/auth/v1/user") {
    if (req.headers.get("authorization") !== "Bearer good") return Response.json({ msg: "bad jwt" }, { status: 401 });
    return Response.json({ id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "a@b.my", app_metadata: {}, user_metadata: {}, created_at: "" });
  }
  if (u.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = u.pathname.split("/").pop(); seen.rpc.push(fn);
    if (fn === "ai_usage_claim") return Response.json(quotaOk ? { ok: true, had: 20, jumlah: 3 } : { ok: false, had: 20 });
    return Response.json(null);
  }
  return new Response("nf", { status: 404 });
});
Deno.env.set("ANTHROPIC_API_KEY", "sk-test"); Deno.env.set("ANTHROPIC_BASE_URL", "http://127.0.0.1:8701");
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:8702"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
Deno.env.set("ALLOWED_ORIGINS", "https://minicrm.my,http://localhost:8765");
await import(new URL("../functions/classify-chat/index.ts", import.meta.url).href);
await new Promise((r) => setTimeout(r, 300));
const call = (body: unknown, auth = "good", origin = "https://minicrm.my") => fetch("http://127.0.0.1:8000", { method: "POST", headers: { authorization: `Bearer ${auth}`, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
const good = { mesej: [{ dari: "pelanggan", teks: "Salam, harga kek lapis? call saya 012-345 6789 atau ali@gmail.com IC 900101-14-5678", tarikh: "2026-11-08" }, { dari: "penjual", teks: "RM45 sebiji" }, { dari: "pelanggan", teks: "ok nak 2, bank apa?" }], produk_sedia: ["Kek lapis 1kg"] };
const check = (n: string, c: boolean) => console.log((c ? "PASS " : "FAIL ") + n);
let r = await call(good, "bad"); check("401 bad jwt", r.status === 401); await r.body?.cancel();
r = await call(good, "good", "https://evil.example"); check("403 bad origin", r.status === 403); await r.body?.cancel();
r = await call({ mesej: [] }); check("400 empty", r.status === 400); await r.body?.cancel();
r = await call({ mesej: [{ dari: "penjual", teks: "hi" }] }); check("400 no customer msg", r.status === 400); await r.body?.cancel();
r = await call(good); const j = await r.json();
check("200 ok", r.status === 200);
check("cors header", r.headers.get("access-control-allow-origin") === "https://minicrm.my");
check("keyakinan clamped", j.keputusan.keyakinan === 1);
check("susulan clamped", j.keputusan.susulan_hari === 14);
check("ringkasan phone redacted", !/0123456789/.test(j.keputusan.ringkasan) && /\[NOMBOR\]/.test(j.keputusan.ringkasan));
check("bukti cleared for non-customer", j.keputusan.bukti_pembelian === "");
const a = seen.anthropic.at(-1);
check("model opus 5.5", a.body.model === "claude-opus-5-5");
check("fallbacks default + beta", a.body.fallbacks === "default" && /server-side-fallback-2026-07-01/.test(a.beta ?? ""));
check("structured output", a.body.output_config?.format?.type === "json_schema" && a.body.output_config.effort === "low");
const sent = JSON.stringify(a.body.messages);
check("no phone/email/IC sent to AI", !/012-345 6789|ali@gmail|900101/.test(sent) && /\[NOMBOR\]/.test(sent) && /\[EMEL\]/.test(sent) && /\[IC\]/.test(sent));
check("betas not leaked into body", a.body.betas === undefined);
mode = "refusal"; seen.rpc = [];
r = await call(good); await r.body?.cancel(); check("422 refusal + refund", r.status === 422 && seen.rpc.includes("ai_usage_refund"));
mode = "ok"; quotaOk = false;
r = await call(good); const q = await r.json(); check("429 quota", r.status === 429 && q.ralat === "had_bulanan");
Deno.exit(0);
