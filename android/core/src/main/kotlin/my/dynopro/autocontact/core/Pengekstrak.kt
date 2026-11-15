package my.dynopro.autocontact.core

import java.security.MessageDigest

/**
 * Tukar satu notifikasi WhatsApp Business kepada calon lead.
 *
 * Prinsip:
 *  - Hanya notifikasi dari pakej yang dibenarkan pengguna (lalai: WhatsApp Business sahaja).
 *  - Hanya data yang BENAR-BENAR ada dalam notifikasi. Nombor tidak diteka dari nama;
 *    username tidak diteka dari nombor atau nama.
 *  - Nombor dianggap boleh dipercayai hanya bila:
 *      (a) ID perbualan (tag / shortcut) ialah JID nombor "<digit>@s.whatsapp.net", atau
 *      (b) URI orang ialah "tel:+…", atau
 *      (c) tajuk notifikasi KESELURUHANNYA nombor antarabangsa (WhatsApp memaparkan nombor
 *          bila pengirim tidak disimpan dalam kenalan telefon).
 *  - Username hanya bila tajuk/pengirim KESELURUHANNYA "@nama.pengguna".
 *  - ID "@lid" (ID dalaman WhatsApp) BUKAN nombor telefon dan tidak dihantar; ia hanya
 *    membantu mengesan pendua.
 *  - Chat kumpulan, status, panggilan dan notifikasi ringkasan diabaikan.
 */
object Pengekstrak {

    private val JID_NOMBOR = Regex("^(\\d{6,15})@s\\.whatsapp\\.net$")
    private val JID_LID = Regex("^(\\d{6,25})@lid$")
    private val JID_KUMPULAN = Regex("@(g\\.us|broadcast|newsletter)$")
    private val USERNAME = Regex("^@([A-Za-z0-9._]{3,35})$")

    // Teks pengganti bila pratonton mesej disembunyikan (WhatsApp, pelbagai bahasa)
    private val PRATONTON_TERSEMBUNYI = listOf(
        Regex("^\\d+\\s+(new\\s+)?messages?$", RegexOption.IGNORE_CASE),
        Regex("^new\\s+message$", RegexOption.IGNORE_CASE),
        Regex("^\\d+\\s+mesej(\\s+baharu|\\s+baru)?$", RegexOption.IGNORE_CASE),
        Regex("^mesej\\s+(baharu|baru)$", RegexOption.IGNORE_CASE),
        Regex("^\\d+\\s+pesan(\\s+baru)?$", RegexOption.IGNORE_CASE),
        Regex("^pesan\\s+baru$", RegexOption.IGNORE_CASE),
    )

    fun ekstrak(n: NotisMentah, pakejDibenarkan: Set<String>, hantarPratonton: Boolean = true): Hasil {
        if (n.pakej !in pakejDibenarkan) return Hasil.Abai("pakej_lain")
        if (n.ringkasanKumpulan) return Hasil.Abai("ringkasan")
        if (n.kategori != null && n.kategori != "msg") return Hasil.Abai("bukan_mesej")
        if (n.perbualanKumpulan) return Hasil.Abai("kumpulan")

        val idPerbualan = listOfNotNull(n.tag, n.shortcutId).map { it.trim() }
        if (idPerbualan.any { JID_KUMPULAN.containsMatchIn(it) }) return Hasil.Abai("kumpulan")

        // ---- Pengenal yang boleh dipercayai ----
        var telefon: String? = null
        var sumberPengenal = "tiada"
        for (id in idPerbualan) {
            JID_NOMBOR.matchEntire(id)?.let { m ->
                Telefon.keE164("+" + m.groupValues[1])?.let { telefon = it; sumberPengenal = "jid" }
            }
            if (telefon != null) break
        }
        val lid = idPerbualan.firstNotNullOfOrNull { JID_LID.matchEntire(it)?.groupValues?.get(1) }

        val mesejPelanggan = n.mesej.filter { it.pengirim != null }    // pengirim null = pengguna sendiri
        val urlOrang = n.orangUri + mesejPelanggan.mapNotNull { it.pengirimUri }
        if (telefon == null) {
            urlOrang.firstOrNull { it.startsWith("tel:") }?.let { u ->
                Telefon.keE164(u.removePrefix("tel:"))?.let { telefon = it; sumberPengenal = "tel_uri" }
            }
        }

        val tajuk = (n.tajukPerbualan ?: n.tajuk ?: mesejPelanggan.lastOrNull()?.pengirim)?.trim().orEmpty()
        if (tajuk.isEmpty() && telefon == null && lid == null) return Hasil.Abai("tiada_pengirim")
        if (telefon == null) {
            Telefon.teksIalahNombor(tajuk)?.let { telefon = it; sumberPengenal = "tajuk" }
        }
        var username: String? = null
        USERNAME.matchEntire(tajuk)?.let { m ->
            val u = m.groupValues[1].lowercase()
            if (u.any { it in 'a'..'z' }) { username = u; if (sumberPengenal == "tiada") sumberPengenal = "username" }
        }
        // Nama paparan: tajuk, kecuali jika tajuk itu sendiri nombor/username
        val nama = if (Telefon.teksIalahNombor(tajuk) != null || USERNAME.matches(tajuk)) "" else tajuk.take(120)

        // ---- Mesej ----
        val senarai = if (mesejPelanggan.isNotEmpty()) mesejPelanggan
        else if (n.mesej.isEmpty()) listOf(MesejNotis(n.teks, n.masaPos, tajuk)) else emptyList()
        if (senarai.isEmpty()) return Hasil.Abai("mesej_sendiri")

        val kunciIdentiti = telefon ?: username?.let { "@$it" } ?: lid?.let { "lid:$it" } ?: "nama:${tajuk.lowercase()}"
        val calon = senarai.map { m ->
            val teks = m.teks?.trim().orEmpty()
            val tersembunyi = teks.isEmpty() || PRATONTON_TERSEMBUNYI.any { it.matches(teks) }
            val mesej = if (tersembunyi || !hantarPratonton) "" else teks.take(1000)
            CalonLead(
                eventId = idEvent(kunciIdentiti, m.masa, if (tersembunyi) "" else teks),
                telefon = telefon,
                username = username,
                nama = nama,
                mesej = mesej,
                pratontonTersembunyi = tersembunyi,
                masa = m.masa,
                sumberPengenal = sumberPengenal,
            )
        }
        return Hasil.Lead(calon)
    }

    /**
     * ID event yang stabil: sama untuk notifikasi yang sama walaupun dipos semula, diproses
     * semula selepas sambung semula, atau diterima pada telefon lain dalam akaun yang sama
     * (bergantung pada masa mesej WhatsApp yang sama pada kedua-dua telefon).
     */
    fun idEvent(kunciIdentiti: String, masa: Long, teks: String): String {
        val bahan = "${kunciIdentiti.lowercase()}|${masa / 1000}|${teks.trim()}"
        val h = MessageDigest.getInstance("SHA-256").digest(bahan.toByteArray(Charsets.UTF_8))
        return "wa-" + h.take(16).joinToString("") { "%02x".format(it) }
    }
}
