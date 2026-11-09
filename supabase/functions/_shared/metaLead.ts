// Proses satu lead Meta Lead Ads: ambil butiran dari Graph API, normalisasi, simpan.
// Dikongsi oleh meta-leads-webhook (masa nyata) dan lead-retry (cuba semula).
import { keE164 } from "./telefon.ts";
import { graph, huraiBorang, nyahsulit } from "./meta.ts";
import { type HasilTangkap, tangkap } from "./lead.ts";

export type IntegrasiMeta = { id: string; owner_id: string; aktif: boolean; token_rahsia: string | null };

function tarikh(v: unknown, sandaran?: number): Date {
  if (typeof v === "string") {
    const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")); // "+0000" -> "+00:00"
    if (!isNaN(d.getTime())) return d;
  }
  if (sandaran) return new Date(sandaran * 1000);
  return new Date();
}

export async function prosesLeadMeta(integ: IntegrasiMeta, leadgenId: string, masaWebhook?: number): Promise<HasilTangkap> {
  if (!integ.token_rahsia) throw new Error("Token Page belum disambung");
  const token = await nyahsulit(integ.token_rahsia);
  const lead = await graph(encodeURIComponent(leadgenId), token, {
    params: { fields: "created_time,field_data,form_id,ad_id" },
  });
  const f = huraiBorang(lead.field_data);
  return tangkap({
    owner: integ.owner_id,
    sumber: "meta_lead_ads",
    eventId: leadgenId,
    telefon: keE164(f.telefon),
    nama: f.nama,
    mesej: ["Borang Meta Ads", f.jawapan].filter(Boolean).join(" — "),
    diterima: tarikh(lead.created_time, masaWebhook),
    integrasi: integ.id,
    kaedah: "webhook",
    asas: "meta_lead_form",
  });
}
