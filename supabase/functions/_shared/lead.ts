// Teras penangkapan lead — dikongsi oleh semua Edge Function lead.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export const SUMBER = ["whatsapp", "meta_lead_ads", "auto_contact", "manual", "import", "api"] as const;
export type Sumber = (typeof SUMBER)[number];

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export class RalatSementara extends Error {}

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ralat dari Postgres (kod SQLSTATE 5 aksara) yang bukan masalah sambungan
// ialah ralat kekal — mengulang tidak membantu.
function kekal(e: { code?: string } | null): boolean {
  return !!e?.code && /^(22|23|42|P0)/.test(e.code);
}

/* Panggil RPC dengan cubaan semula untuk ralat sementara (rangkaian, 5xx,
   pangkalan data tidak tersedia). Selepas 3 cubaan, buang RalatSementara
   supaya pemanggil boleh membalas 5xx dan penghantar webhook mencuba lagi. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let akhir: unknown = null;
  for (let i = 0; i < 3; i++) {
    if (i > 0) await tidur(200 * 3 ** (i - 1));
    let res;
    try {
      res = await admin().rpc(fn, args);
    } catch (e) {
      akhir = e; // rangkaian / pelayan tidak dapat dihubungi
      continue;
    }
    if (!res.error) return res.data as T;
    if (kekal(res.error)) throw new Error(`${fn}: ${res.error.message}`);
    akhir = res.error;
  }
  const m = akhir && typeof akhir === "object" && "message" in akhir ? String((akhir as Error).message) : String(akhir);
  throw new RalatSementara(`${fn}: ${m}`);
}

export type Tangkap = {
  owner: string;
  sumber: Sumber;
  eventId: string;
  telefon: string | null;
  nama?: string;
  mesej?: string;
  diterima?: Date;
  integrasi?: string | null;
  kaedah?: "webhook" | "api" | "manual";
  asas?: string;
};
export type HasilTangkap = {
  status: "dicipta" | "dikemas_kini" | "ditolak" | "duplikat_event";
  contact_id?: string;
  sebab?: string;
};

export function tangkap(t: Tangkap): Promise<HasilTangkap> {
  return rpc<HasilTangkap>("capture_lead", {
    p_owner: t.owner,
    p_sumber: t.sumber,
    p_event_id: t.eventId.slice(0, 200),
    p_telefon: t.telefon,
    p_nama: (t.nama ?? "").slice(0, 120),
    p_mesej: (t.mesej ?? "").slice(0, 1000),
    p_diterima: (t.diterima ?? new Date()).toISOString(),
    p_integration: t.integrasi ?? null,
    p_kaedah: t.kaedah ?? "webhook",
    p_asas: t.asas ?? "",
  });
}

export async function logRalat(
  integrasi: string | null, owner: string | null, sumber: string, eventId: string | null, ralat: string, sementara: boolean,
) {
  try {
    await rpc("log_ralat_integrasi", {
      p_integration: integrasi, p_owner: owner, p_sumber: sumber, p_event_id: eventId,
      p_ralat: ralat.slice(0, 500), p_sementara: sementara,
    });
  } catch (e) {
    // Pangkalan data sendiri tidak tersedia: log platform sahaja (tanpa data peribadi)
    console.error("log_ralat_integrasi gagal", sumber, eventId, String(e));
  }
}

// ---------- HTTP ----------
export function asalDibenarkan(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "https://minicrm.my").split(",").map((s) => s.trim()).filter(Boolean);
}
export function kepala(asal: string | null, cors = false): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
  if (cors) {
    h["Vary"] = "Origin";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    if (asal && asalDibenarkan().includes(asal)) h["Access-Control-Allow-Origin"] = asal;
  }
  return h;
}
export function jawab(status: number, badan: unknown, asal: string | null = null, cors = false): Response {
  return new Response(JSON.stringify(badan), { status, headers: kepala(asal, cors) });
}

export async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

/* Pengguna dari JWT Supabase (app), atau null */
export async function penggunaJwt(token: string): Promise<{ id: string; email?: string } | null> {
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email };
}

export function tokenBearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}
