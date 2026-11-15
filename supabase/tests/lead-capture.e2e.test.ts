// Ujian hujung ke hujung Automatic Lead Capture.
//
// Fungsi Edge sebenar (handler.ts) + Postgres sebenar (migrasi sebenar).
// Disimulasi secara tempatan: gerbang Supabase (auth + /rest/v1/rpc -> Postgres
// sebagai service_role) dan Meta Graph API.
//
// Keperluan: Postgres tempatan dengan supabase/tests/stub-auth.sql dan kedua-dua
// migrasi sudah dijalankan. PGURL=postgres://postgres@localhost:54329/lead
//   deno run -A supabase/tests/lead-capture.e2e.test.ts
import pg from "npm:pg@8.13.1";

const PGURL = Deno.env.get("PGURL") ?? "postgres://postgres@localhost:54329/lead";
const db = new pg.Client({ connectionString: PGURL });
await db.connect();
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";

// ---------- gerbang Supabase palsu ----------
let gangguanDb = false;
const proretset = new Map<string, boolean>();
Deno.serve({ port: 8702, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/auth/v1/user") {
    const t = req.headers.get("authorization");
    const id = t === "Bearer jwt-A" ? A : t === "Bearer jwt-B" ? B : null;
    if (!id) return Response.json({ msg: "invalid jwt" }, { status: 401 });
    return Response.json({ id, aud: "authenticated", role: "authenticated", email: id === A ? "a@x.my" : "b@x.my", app_metadata: {}, user_metadata: {}, created_at: "" });
  }
  const m = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
  if (m) {
    if (gangguanDb) return Response.json({ message: "upstream unavailable" }, { status: 503 });
    const fn = m[1], args = await req.json();
    if (!proretset.has(fn)) {
      const r = await db.query("select proretset from pg_proc where proname=$1", [fn]);
      proretset.set(fn, r.rows[0]?.proretset ?? false);
    }
    const keys = Object.keys(args), named = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
    const vals = keys.map((k) => args[k]);
    const sql = proretset.get(fn) ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]') r from ${fn}(${named}) t` : `select to_jsonb(${fn}(${named})) r`;
    try {
      await db.query("set role service_role");
      const r = await db.query(sql, vals);
      return Response.json(r.rows[0]?.r ?? null);
    } catch (e) {
      return Response.json({ code: (e as { code?: string }).code, message: String((e as Error).message) }, { status: 400 });
    } finally {
      await db.query("reset role");
    }
  }
  return new Response("nf", { status: 404 });
});

// ---------- Meta Graph API palsu ----------
let graphGagal = false;
const leadData: Record<string, unknown> = {
  "70001": { created_time: "2026-11-10T02:00:00+0000", field_data: [
    { name: "full_name", values: ["Siti Aminah"] }, { name: "phone_number", values: ["012-778 8990"] },
    { name: "email", values: ["siti@contoh.my"] }, { name: "nak_demo_bila?", values: ["minggu_depan"] }] },
  "70002": { created_time: "2026-11-10T03:00:00+0000", field_data: [{ name: "full_name", values: ["Tiada Nombor"] }] },
  "70003": { created_time: "2026-11-10T04:00:00+0000", field_data: [{ name: "first_name", values: ["Lim"] }, { name: "last_name", values: ["Ah Kow"] }, { name: "phone_number", values: ["+65 8123 4567"] }] },
};
Deno.serve({ port: 8703, onListen() {} }, (req) => {
  const u = new URL(req.url), p = u.pathname.replace(/^\/v24\.0\//, "");
  if (req.headers.get("authorization") !== "Bearer PAGE-TOKEN-OK-1234567890") return Response.json({ error: { message: "Invalid OAuth access token", code: 190 } }, { status: 400 });
  if (graphGagal) return Response.json({ error: { message: "Service temporarily unavailable", code: 2 } }, { status: 503 });
  if (p === "445566778899") return Response.json({ id: "445566778899", name: "Kedai Kek Siti" });
  if (p === "445566778899/subscribed_apps" && req.method === "POST") return Response.json({ success: u.searchParams.get("subscribed_fields") === "leadgen" });
  if (p === "1098765432101") return Response.json({ id: "1098765432101", display_phone_number: "+60 3-1234 5678", verified_name: "Dyno Demo" });
  if (leadData[p]) return Response.json({ id: p, ...(leadData[p] as object) });
  return Response.json({ error: { message: "Unsupported get request", code: 100 } }, { status: 400 });
});

const SECRET = "app-secret-uji";
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:8702");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
Deno.env.set("META_APP_SECRET", SECRET);
Deno.env.set("WHATSAPP_VERIFY_TOKEN", "wa-verify");
Deno.env.set("META_VERIFY_TOKEN", "meta-verify");
Deno.env.set("META_GRAPH_BASE", "http://127.0.0.1:8703");
Deno.env.set("META_GRAPH_VERSION", "v24.0");
Deno.env.set("INTEGRATION_ENC_KEY", btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
Deno.env.set("CRON_SECRET", "cron-rahsia");
Deno.env.set("ALLOWED_ORIGINS", "https://minicrm.my");

const wa = (await import("../functions/whatsapp-webhook/handler.ts")).handler;
const meta = (await import("../functions/meta-leads-webhook/handler.ts")).handler;
const cap = (await import("../functions/lead-capture/handler.ts")).handler;
const integ = (await import("../functions/integrasi/handler.ts")).handler;
const retry = (await import("../functions/lead-retry/handler.ts")).handler;

let gagal = 0;
const semak = (n: string, c: boolean, extra?: unknown) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) { gagal++; if (extra !== undefined) console.log("   ", extra); } };
const q = async (sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows;
async function tandatangan(b: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "sha256=" + Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(b))), (x) => x.toString(16).padStart(2, "0")).join("");
}
async function webhook(h: (r: Request) => Promise<Response>, body: unknown, sig?: string) {
  const s = JSON.stringify(body);
  return h(new Request("https://x/fn", { method: "POST", body: s, headers: { "x-hub-signature-256": sig ?? await tandatangan(s), "content-type": "application/json" } }));
}
async function post(h: (r: Request) => Promise<Response>, token: string, body: unknown) {
  const r = await h(new Request("https://x/fn", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "https://minicrm.my" } }));
  return { status: r.status, body: await r.json().catch(() => null) };
}
const waMsg = (id: string, from: string, nama: string, teks: string, pnid = "1098765432101") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "60312345678", phone_number_id: pnid },
    contacts: [{ profile: { name: nama }, wa_id: from }], messages: [{ from, id, timestamp: "1762740000", type: "text", text: { body: teks } }] } }] }],
});
const leadgen = (leadgen_id: string, page_id = "445566778899") => ({ object: "page", entry: [{ id: page_id, time: 1762740000, changes: [{ field: "leadgen", value: { leadgen_id, page_id, form_id: "9988", ad_id: "1234", created_time: 1762740000 } }] }] });
const kenalanA = (tel: string) => q("select * from contacts where owner_id=$1 and telefon=$2", [A, tel]);

// ---------- Sambung integrasi (pemilikan disahkan melalui Graph) ----------
let r = await post(integ, "jwt-A", { tindakan: "whatsapp", phone_number_id: "1098765432101", access_token: "PAGE-TOKEN-OK-1234567890" });
semak("Sambung WhatsApp (token sah)", r.status === 200, r);
r = await post(integ, "jwt-A", { tindakan: "meta_page", page_id: "445566778899", page_token: "PAGE-TOKEN-OK-1234567890" });
semak("Sambung Page Meta + langgan leadgen", r.status === 200 && r.body.nama === "Kedai Kek Siti", r);
const tok = await q("select token_rahsia from integrations where external_id='445566778899'");
semak("Token Page disimpan tersulit (bukan teks biasa)", tok[0].token_rahsia.startsWith("v1:") && !tok[0].token_rahsia.includes("PAGE-TOKEN"));
r = await post(integ, "jwt-B", { tindakan: "meta_page", page_id: "445566778899", page_token: "PAGE-TOKEN-OK-1234567890" });
semak("Akaun lain tidak boleh tuntut Page yang sama (409)", r.status === 409, r);
r = await post(integ, "jwt-A", { tindakan: "whatsapp", phone_number_id: "1098765432101", access_token: "TOKEN-SALAH-12345678901" });
semak("Token salah ditolak", r.status === 400, r);
r = await post(integ, "jwt-A", { tindakan: "kunci_api", nama: "Zapier" });
const kunci = r.body?.kunci as string;
semak("Kunci API dicipta (dipapar sekali)", r.status === 200 && /^dyno_[0-9a-f]{48}$/.test(kunci));
semak("Hanya hash kunci disimpan", (await q("select count(*)::int n from integrations where kunci_hash is not null and kunci_awalan=$1", [kunci.slice(0, 13)]))[0].n === 1
  && (await q("select count(*)::int n from integrations where token_rahsia like '%'||$1||'%'", [kunci]))[0].n === 0);

// ---------- Pengesahan webhook ----------
let res = await wa(new Request("https://x/fn?hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=12345"));
semak("WhatsApp GET verify -> challenge", res.status === 200 && await res.text() === "12345");
res = await wa(new Request("https://x/fn?hub.mode=subscribe&hub.verify_token=salah&hub.challenge=1"));
semak("WhatsApp GET token salah -> 403", res.status === 403);
res = await webhook(wa, waMsg("wamid.X", "60123456789", "Ahmad", "hai"), "sha256=deadbeef");
semak("Tandatangan palsu -> 401, tiada kenalan", res.status === 401 && (await kenalanA("+60123456789")).length === 0);

// ---------- TEST 1: lead WhatsApp baharu ----------
res = await webhook(wa, waMsg("wamid.T1", "60123456789", "Ahmad", "Nak tanya harga POS"));
let k = await kenalanA("+60123456789");
semak("TEST 1: WhatsApp baharu -> kenalan dicipta (New Lead, WhatsApp)", res.status === 200 && k.length === 1 && k[0].status === "lead" && k[0].sumber === "WhatsApp" && k[0].nama === "Ahmad" && k[0].mesej_pertama === "Nak tanya harga POS", k);

// ---------- TEST 2: nombor sama, mesej lain ----------
await q("update contacts set status='prospek', nota='Pelanggan VIP' where telefon='+60123456789'");
const sebelum = k[0].last_contact_at;
const m2 = waMsg("wamid.T2", "60123456789", "Ahmad Bin Ali", "Ada promo?"); (m2.entry[0].changes[0].value.messages[0] as { timestamp: string }).timestamp = "1762750000";
res = await webhook(wa, m2);
k = await kenalanA("+60123456789");
semak("TEST 2: nombor sedia ada -> dikemas kini, tiada pendua, status & nota kekal", res.status === 200 && k.length === 1 && k[0].status === "prospek" && k[0].nota === "Pelanggan VIP" && k[0].nama === "Ahmad" && new Date(k[0].last_contact_at) > new Date(sebelum), k);
semak("TEST 2: aktiviti lead direkodkan", (await q("select count(*)::int n from lead_events where contact_id=$1", [k[0].id]))[0].n === 2);

// ---------- TEST 3: Meta Lead Ads baharu ----------
res = await webhook(meta, leadgen("70001"));
k = await kenalanA("+60127788990");
semak("TEST 3: Meta Lead Ads baharu -> kenalan dicipta (sumber Meta Ads)", res.status === 200 && k.length === 1 && k[0].sumber === "Meta Ads" && k[0].sumber_lead === "meta_lead_ads" && k[0].nama === "Siti Aminah" && k[0].status === "lead", k);
semak("TEST 3: jawapan borang disimpan, emel tidak", /nak demo bila\?: minggu_depan/.test(k[0].mesej_pertama) && !/siti@contoh/.test(k[0].mesej_pertama), k[0]?.mesej_pertama);
res = await webhook(meta, leadgen("70003"));
semak("Nombor antarabangsa (+65) diterima dalam E.164", res.status === 200 && (await kenalanA("+6581234567")).length === 1 && (await kenalanA("+6581234567"))[0].nama === "Lim Ah Kow");

// ---------- TEST 4: format nombor berbeza ----------
for (const [i, f] of ["012-345 6789", "60123456789", "+60 12 345 6789", "6012-3456789", "0060123456789"].entries()) {
  r = await post(cap, kunci, { phone_number: f, contact_name: "Ahmad", lead_source: "api", first_message: "x", external_lead_id: `fmt-${i}` });
  if (r.status !== 200 || r.body.keputusan[0].status !== "dikemas_kini") semak(`TEST 4: format ${f}`, false, r.body);
}
semak("TEST 4: 5 format berbeza -> kenalan yang sama (+60123456789)", (await kenalanA("+60123456789")).length === 1 && (await q("select count(*)::int n from contacts where owner_id=$1 and telefon like '%123456789'", [A]))[0].n === 1);

// ---------- TEST 5: event sama dua kali ----------
res = await webhook(wa, waMsg("wamid.T1", "60123456789", "Ahmad", "Nak tanya harga POS"));
const res5b = await webhook(meta, leadgen("70001"));
semak("TEST 5: event berganda diproses sekali sahaja", res.status === 200 && res5b.status === 200 &&
  (await q("select count(*)::int n from lead_events where external_event_id in ('wamid.T1','70001')"))[0].n === 2, await q("select external_event_id from lead_events"));
r = await post(cap, kunci, { phone_number: "0198887777", external_lead_id: "dup-1", lead_source: "api" });
const r5 = await post(cap, kunci, { phone_number: "0198887777", external_lead_id: "dup-1", lead_source: "api" });
semak("TEST 5: API — external_lead_id sama -> duplikat_event", r.body.keputusan[0].status === "dicipta" && r5.body.keputusan[0].status === "duplikat_event");

// ---------- TEST 6: CRM tidak tersedia ----------
gangguanDb = true;
const t6 = Date.now();
res = await webhook(wa, waMsg("wamid.T6", "601112223334", "Zul", "Hello"));
semak("TEST 6: DB tidak tersedia -> 500 (Meta akan hantar semula), dengan cubaan semula dalaman", res.status === 500 && Date.now() - t6 >= 700);
r = await post(cap, kunci, { phone_number: "0111222444", external_lead_id: "t6-api", lead_source: "api" });
semak("TEST 6: API -> 503 'sementara'", r.status === 503 && r.body.ralat === "sementara", r);
gangguanDb = false;
semak("TEST 6: tiada kenalan separa dicipta semasa gangguan", (await kenalanA("+601112223334")).length === 0);
res = await webhook(wa, waMsg("wamid.T6", "601112223334", "Zul", "Hello"));
const res6b = await webhook(wa, waMsg("wamid.T6", "601112223334", "Zul", "Hello"));
semak("TEST 6: penghantaran semula selepas pulih -> dicipta sekali", res.status === 200 && res6b.status === 200 && (await kenalanA("+601112223334")).length === 1
  && (await q("select count(*)::int n from lead_events where external_event_id='wamid.T6'"))[0].n === 1);
// Graph API gagal sementara -> direkod, kemudian lead-retry
graphGagal = true;
res = await webhook(meta, leadgen("70004"));
leadData["70004"] = { created_time: "2026-11-10T05:00:00+0000", field_data: [{ name: "full_name", values: ["Rina"] }, { name: "phone_number", values: ["0135556666"] }] };
const err = await q("select ralat, sementara, selesai from integration_errors where external_event_id='70004'");
semak("TEST 6: Graph gagal -> ralat dilog + 500", res.status === 500 && err.length === 1 && err[0].sementara && !err[0].selesai, err);
semak("Status integrasi menunjukkan ralat terakhir", (await q("select last_error from integrations where external_id='445566778899'"))[0].last_error !== null);
graphGagal = false;
r = await post(retry, "jwt-B", {});
semak("lead-retry: pengguna lain tidak nampak ralat A", r.status === 200 && r.body.dicuba === 0, r);
r = await post(retry, "cron-rahsia", {});
semak("lead-retry (tugas berjadual) -> lead dipulihkan", r.status === 200 && r.body.berjaya === 1 && (await kenalanA("+60135556666")).length === 1
  && (await q("select selesai from integration_errors where external_event_id='70004'"))[0].selesai, r);

// ---------- TEST 7: tiada nombor sah ----------
const sebelum7 = (await q("select count(*)::int n from contacts where owner_id=$1", [A]))[0].n;
res = await webhook(meta, leadgen("70002"));
r = await post(cap, kunci, { leads: [
  { phone_number: "", external_lead_id: "t7-a", lead_source: "api" },
  { phone_number: "12345", external_lead_id: "t7-b", lead_source: "api" },
  { phone_number: "abc-def", external_lead_id: "t7-c", lead_source: "api" },
  { phone_number: "+60 12 345", external_lead_id: "t7-d", lead_source: "api" }] });
const selepas7 = (await q("select count(*)::int n from contacts where owner_id=$1", [A]))[0].n;
semak("TEST 7: lead tanpa nombor sah -> ditolak, tiada kenalan", res.status === 200 && r.status === 200 && r.body.keputusan.every((x: { status: string }) => x.status === "ditolak") && selepas7 === sebelum7, r.body);
semak("TEST 7: penolakan direkod untuk audit", (await q("select count(*)::int n from lead_events where keputusan='ditolak' and sebab='nombor_tidak_sah'"))[0].n === 5);

// ---------- Keselamatan & penyewaan ----------
r = await post(cap, "dyno_" + "0".repeat(48), { phone_number: "0123456789", external_lead_id: "x" });
semak("Kunci API salah -> 401", r.status === 401);
r = await post(cap, kunci, { phone_number: "0123456789", lead_source: "api" });
semak("API tanpa external_lead_id -> ditolak", r.body.keputusan[0].sebab === "external_lead_id_diperlukan");
r = await post(cap, "jwt-B", { phone_number: "0123456789", contact_name: "Ahmad (akaun B)", lead_source: "auto_contact" });
semak("Akaun B: nombor sama dicipta dalam akaun B sahaja", r.body.keputusan[0].status === "dicipta" && (await kenalanA("+60123456789"))[0].nama === "Ahmad"
  && (await q("select count(*)::int n from contacts where owner_id=$1", [B]))[0].n === 1);
r = await post(cap, "jwt-B", { phone_number: "0123456789", lead_source: "meta_lead_ads" });
semak("App tidak boleh melabel lead sebagai Meta Ads tanpa integrasi", r.body.keputusan[0].sebab === "lead_source_tidak_sah");
res = await webhook(wa, waMsg("wamid.U1", "60177777777", "Orang", "hai", "999999999"));
semak("Nombor WhatsApp tidak berdaftar -> diabaikan (200), tiada kenalan", res.status === 200 && (await q("select count(*)::int n from contacts where telefon='+60177777777'"))[0].n === 0);
r = await post(cap, "jwt-A", { leads: [{ phone_number: "019-222 3333", contact_name: "Dari Simpan", lead_source: "auto_contact" }, { phone_number: "019-222 3333", lead_source: "auto_contact" }] });
semak("Auto Contact (JWT) -> dicipta, kali kedua duplikat", r.body.keputusan[0].status === "dicipta" && r.body.keputusan[1].status === "duplikat_event", r.body);

// ================= Android: notifikasi WhatsApp Business =================
const kodPeranti = async (nama: string) => {
  const r = await post(integ, "jwt-A", { tindakan: "peranti_android", nama });
  const json = JSON.parse(atob(r.body.kod.replace(/-/g, "+").replace(/_/g, "/")));
  return json as { v: number; u: string; k: string };
};
const telA = await kodPeranti("Telefon kaunter");
const telB = await kodPeranti("Telefon bos");
semak("Kod sambungan peranti mengandungi URL lead-capture + kunci", telA.u.endsWith("/functions/v1/lead-capture") && /^dyno_[0-9a-f]{48}$/.test(telA.k));
const android = (k: string, l: Record<string, unknown>) => post(cap, k, { leads: [l] });
const ev = (n: string) => "and-" + n;

r = await android(telA.k, { phone_number: "+60 13-700 1111", contact_name: "Farid", first_message: "Salam, nak harga", external_lead_id: ev("A"), device_id: "pixel-7", lead_source: "facebook_ads" });
k = await kenalanA("+60137001111");
semak("ANDROID TEST A: nombor kelihatan -> kenalan dicipta automatik", r.body.keputusan[0].status === "dicipta" && k.length === 1, r.body);
semak("ANDROID: sumber WhatsApp (bukan Facebook Ads walaupun diminta)", k[0]?.sumber_lead === "whatsapp" && k[0]?.sumber === "WhatsApp");
r = await android(telA.k, { whatsapp_username: "@Nurul.Bakery", contact_name: "Nurul", first_message: "Ada kek coklat?", external_lead_id: ev("B"), device_id: "pixel-7" });
const kn = await q("select * from contacts where owner_id=$1 and whatsapp_username='nurul.bakery'", [A]);
semak("ANDROID TEST B: username sahaja -> kenalan username dicipta (tiada nombor diteka)", r.body.keputusan[0].status === "dicipta" && kn.length === 1 && kn[0].telefon === null, r.body);
r = await android(telA.k, { phone_number: "0137001111", contact_name: "Farid", first_message: "Lagi", external_lead_id: ev("C"), device_id: "pixel-7" });
semak("ANDROID TEST C: kenalan sedia ada -> dikemas kini, tiada pendua", r.body.keputusan[0].status === "dikemas_kini" && (await kenalanA("+60137001111")).length === 1);
const sebelumD = (await q("select count(*)::int n from contacts where owner_id=$1", [A]))[0].n;
r = await android(telA.k, { contact_name: "Kak Ani Butik", first_message: "Boleh pos ke Sabah?", external_lead_id: ev("D"), device_id: "pixel-7" });
const evD = await q("select keputusan, telefon, whatsapp_username from lead_events where external_event_id=$1", [ev("D")]);
semak("ANDROID TEST D: nama sahaja -> belum_disahkan, tiada kenalan, tiada pengenal diteka",
  r.body.keputusan[0].status === "belum_disahkan" && (await q("select count(*)::int n from contacts where owner_id=$1", [A]))[0].n === sebelumD
  && evD[0].keputusan === "belum_disahkan" && evD[0].telefon === null && evD[0].whatsapp_username === null, { r: r.body, evD });
const e1 = await android(telA.k, { phone_number: "+60137002222", contact_name: "Gopal", external_lead_id: ev("E"), device_id: "pixel-7" });
const e2 = await android(telA.k, { phone_number: "+60137002222", contact_name: "Gopal", external_lead_id: ev("E"), device_id: "pixel-7" });
const e3 = await android(telB.k, { phone_number: "+60137002222", contact_name: "Gopal", external_lead_id: ev("E"), device_id: "galaxy-s23" });
semak("ANDROID TEST E: event sama 3x (termasuk dari peranti lain) -> satu kenalan, satu event",
  e1.body.keputusan[0].status === "dicipta" && e2.body.keputusan[0].status === "duplikat_event" && e3.body.keputusan[0].status === "duplikat_event"
  && (await kenalanA("+60137002222")).length === 1 && (await q("select count(*)::int n from lead_events where external_event_id=$1", [ev("E")]))[0].n === 1);
r = await android(telB.k, { phone_number: "+60137002222", contact_name: "Gopal", first_message: "mesej lain", external_lead_id: ev("E2"), device_id: "galaxy-s23" });
semak("ANDROID: peranti kedua, mesej baharu -> kenalan sama dikemas kini", r.body.keputusan[0].status === "dikemas_kini" && (await kenalanA("+60137002222")).length === 1);
r = await android(telA.k, { whatsapp_username: "gopal.trading", whatsapp_business_user_id: "MY.123456", contact_name: "Gopal", external_lead_id: ev("F"), device_id: "pixel-7" });
semak("ANDROID: ID berskop perniagaan diabaikan dari notifikasi; nama sama tidak digabung", r.body.keputusan[0].status === "dicipta"
  && (await q("select count(*)::int n from contacts where owner_id=$1 and whatsapp_bsuid is not null", [A]))[0].n === 0
  && (await q("select count(*)::int n from contacts where owner_id=$1 and nama='Gopal'", [A]))[0].n === 2);
r = await android(telA.k, { phone_number: "+60137001111", contact_name: "Farid" });
semak("ANDROID: tanpa external_lead_id ditolak", r.body.keputusan[0].sebab === "external_lead_id_diperlukan");
semak("ANDROID: peranti direkodkan pada event", (await q("select peranti from lead_events where external_event_id=$1", [ev("E2")]))[0].peranti === "galaxy-s23");
await q("update integrations set aktif=false where kunci_awalan=$1", [telB.k.slice(0, 13)]);
r = await android(telB.k, { phone_number: "+60137003333", external_lead_id: ev("G") });
semak("ANDROID: peranti yang dimatikan -> 401", r.status === 401);
// Cloud API: rujukan iklan rasmi -> Facebook Ads
const ad = waMsg("wamid.AD1", "60137004444", "Iklan", "Saya lihat iklan anda");
(ad.entry[0].changes[0].value.messages[0] as Record<string, unknown>).referral = { source_type: "ad", source_id: "120200", headline: "Promo POS" };
res = await webhook(wa, ad);
k = await kenalanA("+60137004444");
semak("Cloud API dengan metadata iklan rasmi -> sumber Facebook Ads", res.status === 200 && k[0]?.sumber_lead === "facebook_ads" && k[0]?.sumber === "Facebook Ads", k[0]);
// Pengesahan manual oleh pengguna (RPC sahkan_lead melalui RLS)
await db.query("set role authenticated"); await db.query(`select set_config('request.jwt.claim.sub', '${A}', false)`);
const sah = await db.query("select sahkan_lead(id, '013-700 5555', null) r from lead_events where external_event_id=$1", [ev("D")]);
await db.query("reset role");
semak("Lead nama sahaja disahkan manual -> kenalan dengan nombor yang pengguna sahkan", sah.rows[0].r.status === "dicipta" && (await kenalanA("+60137005555"))[0]?.nama === "Kak Ani Butik");

console.log(gagal ? `\n${gagal} GAGAL` : "\nSEMUA LULUS");
await db.end();
Deno.exit(gagal ? 1 : 0);
