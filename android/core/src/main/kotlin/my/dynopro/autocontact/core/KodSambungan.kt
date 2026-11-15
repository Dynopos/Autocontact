package my.dynopro.autocontact.core

/** Kod sambungan dari Mini CRM (integrasi.html): base64url(JSON {"v":1,"u":"https://…/lead-capture","k":"dyno_…"}) */
data class Sambungan(val url: String, val kunci: String)

object KodSambungan {
    fun huraikan(kod: String?): Sambungan? {
        val k = kod?.trim()?.replace(Regex("\\s"), "") ?: return null
        if (k.isEmpty()) return null
        val json = try {
            String(java.util.Base64.getUrlDecoder().decode(k.trimEnd('=')), Charsets.UTF_8)
        } catch (_: IllegalArgumentException) { return null }
        val url = Regex("\"u\"\\s*:\\s*\"([^\"]+)\"").find(json)?.groupValues?.get(1)?.replace("\\/", "/") ?: return null
        val kunci = Regex("\"k\"\\s*:\\s*\"([^\"]+)\"").find(json)?.groupValues?.get(1) ?: return null
        // Hanya HTTPS ke endpoint lead-capture, dan kunci peranti Dyno
        if (!url.startsWith("https://") || !url.endsWith("/lead-capture")) return null
        if (!Regex("^dyno_[0-9a-f]{48}$").matches(kunci)) return null
        return Sambungan(url, kunci)
    }
}
