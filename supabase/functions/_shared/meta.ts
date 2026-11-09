// Meta (WhatsApp Cloud API & Lead Ads): pengesahan webhook, Graph API, penyulitan token.

const GRAPH_BASE = () => (Deno.env.get("META_GRAPH_BASE") ?? "https://graph.facebook.com").replace(/\/$/, "");
// Semak versi terkini di Meta Graph API changelog dan tetapkan META_GRAPH_VERSION.
const GRAPH_VERSI = () => Deno.env.get("META_GRAPH_VERSION") ?? "v24.0";

// ---------- Pengesahan webhook ----------
/* GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=... */
export function sahkanLanggan(req: Request, tokenSah: string | undefined): Response {
  const u = new URL(req.url);
  if (tokenSah && u.searchParams.get("hub.mode") === "subscribe" &&
      samaMasaTetap(u.searchParams.get("hub.verify_token") ?? "", tokenSah)) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

function samaMasaTetap(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let beza = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) beza |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return beza === 0;
}

/* X-Hub-Signature-256: "sha256=" + HMAC-SHA256(app secret, badan mentah) */
export async function sahkanTandatangan(badanMentah: string, kepala: string | null, rahsia: string | undefined): Promise<boolean> {
  if (!rahsia || !kepala || !kepala.startsWith("sha256=")) return false;
  const kunci = await crypto.subtle.importKey("raw", new TextEncoder().encode(rahsia), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", kunci, new TextEncoder().encode(badanMentah));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return samaMasaTetap(hex, kepala.slice(7).toLowerCase());
}

// ---------- Graph API ----------
export class RalatGraph extends Error {
  constructor(m: string, public sementara: boolean, public status: number, public kod?: number) { super(m); }
}

export async function graph(laluan: string, token: string, opsyen: { method?: string; params?: Record<string, string> } = {}) {
  const u = new URL(`${GRAPH_BASE()}/${GRAPH_VERSI()}/${laluan.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(opsyen.params ?? {})) u.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(u, {
      method: opsyen.method ?? "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new RalatGraph(`Graph API tidak dapat dihubungi: ${String(e).slice(0, 120)}`, true, 0);
  }
  const badan = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (badan as { error?: { message?: string; code?: number } }).error ?? {};
    // 5xx, 429 dan had kadar Graph (kod 4, 17, 32, 613) = sementara
    const sementara = res.status >= 500 || res.status === 429 || [1, 2, 4, 17, 32, 613].includes(err.code ?? -1);
    throw new RalatGraph(`Graph ${res.status}${err.code ? ` (kod ${err.code})` : ""}: ${(err.message ?? "").slice(0, 200)}`, sementara, res.status, err.code);
  }
  return badan as Record<string, unknown>;
}

// ---------- Data borang Lead Ads ----------
type MedanBorang = { name?: string; values?: unknown[] };

/* field_data: [{ name: "phone_number", values: ["+60..."] }, { name: "full_name", ... }, ...] */
export function huraiBorang(field_data: unknown): { telefon: string; nama: string; jawapan: string } {
  const medan = (Array.isArray(field_data) ? field_data : []) as MedanBorang[];
  const nilai = (m: MedanBorang) => (Array.isArray(m.values) ? m.values.map((v) => String(v ?? "")).join(", ") : "").trim();
  const nama = (n: string) => (n || "").toLowerCase();
  const cari = (pred: (n: string) => boolean) => medan.find((m) => pred(nama(m.name ?? "")));

  const tel = cari((n) => n === "phone_number") ?? cari((n) => /phone|telefon|mobile|whatsapp|no_hp|handphone/.test(n));
  const penuh = cari((n) => n === "full_name") ?? cari((n) => n === "name" || n === "nama");
  const depan = cari((n) => n === "first_name"), belakang = cari((n) => n === "last_name");
  const namaPenuh = penuh ? nilai(penuh) : [depan && nilai(depan), belakang && nilai(belakang)].filter(Boolean).join(" ");

  // Jawapan soalan lain (bukan nombor/emel/nama) — disimpan sebagai mesej pertama
  const abai = new Set([tel, penuh, depan, belakang].filter(Boolean));
  const jawapan = medan
    .filter((m) => !abai.has(m) && !/email|e-mel|emel/.test(nama(m.name ?? "")))
    .map((m) => `${(m.name ?? "").replace(/_/g, " ")}: ${nilai(m)}`)
    .filter((s) => !s.endsWith(": "))
    .join("; ");
  return { telefon: tel ? nilai(tel) : "", nama: namaPenuh, jawapan };
}

// ---------- Penyulitan token Page (AES-256-GCM) ----------
// INTEGRATION_ENC_KEY = 32 bait rawak dalam base64 (openssl rand -base64 32)
async function kunciSulit(): Promise<CryptoKey> {
  const b64 = Deno.env.get("INTEGRATION_ENC_KEY");
  if (!b64) throw new Error("INTEGRATION_ENC_KEY belum ditetapkan");
  const mentah = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (mentah.length !== 32) throw new Error("INTEGRATION_ENC_KEY mesti 32 bait (base64)");
  return crypto.subtle.importKey("raw", mentah, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sulitkan(teks: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await kunciSulit(), new TextEncoder().encode(teks)));
  const gabung = new Uint8Array(12 + ct.length); gabung.set(iv); gabung.set(ct, 12);
  return "v1:" + btoa(String.fromCharCode(...gabung));
}
export async function nyahsulit(simpan: string): Promise<string> {
  if (!simpan.startsWith("v1:")) throw new Error("format token tidak dikenali");
  const b = Uint8Array.from(atob(simpan.slice(3)), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await kunciSulit(), b.slice(12));
  return new TextDecoder().decode(pt);
}
