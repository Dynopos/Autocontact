package my.dynopro.autocontact.core

import com.google.i18n.phonenumbers.PhoneNumberUtil

/** Normalisasi & pengesahan nombor ke E.164 (sama dengan pelayan). Tiada nombor diteka. */
object Telefon {
    private val util = PhoneNumberUtil.getInstance()

    fun keE164(mentah: String?, negaraLalai: String = "MY"): String? {
        var s = mentah?.trim() ?: return null
        if (s.isEmpty()) return null
        s = s.replace(Regex("[^\\d+]"), "")
        if (s.indexOf('+') > 0) s = s.replace("+", "")
        if (s.startsWith("00")) s = "+" + s.substring(2)
        if (!Regex("\\d{6,}").containsMatchIn(s)) return null
        val cubaan = when {
            s.startsWith("+") -> listOf(s)
            s.startsWith("0") -> listOf(s)
            else -> listOf("+$s", s)
        }
        for (c in cubaan) {
            val n = try { util.parse(c, negaraLalai) } catch (_: Exception) { null } ?: continue
            if (util.isValidNumber(n)) return util.format(n, PhoneNumberUtil.PhoneNumberFormat.E164)
        }
        return null
    }

    /** Teks yang KESELURUHANNYA nombor telefon antarabangsa (cth. tajuk "+60 12-345 6789"). */
    fun teksIalahNombor(teks: String?): String? {
        val t = teks?.trim()?.replace(' ', ' ')?.replace(' ', ' ') ?: return null
        if (!Regex("^\\+[\\d\\s\\-()]{7,20}$").matches(t)) return null
        return keE164(t)
    }
}
