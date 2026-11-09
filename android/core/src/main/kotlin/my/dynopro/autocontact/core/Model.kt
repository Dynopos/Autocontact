package my.dynopro.autocontact.core

/** Satu mesej dalam notifikasi MessagingStyle. pengirim == null bermaksud mesej oleh pengguna sendiri. */
data class MesejNotis(
    val teks: String?,
    val masa: Long,
    val pengirim: String?,
    val pengirimUri: String? = null,
)

/**
 * Data notifikasi seperti yang diterima oleh NotificationListenerService, ditukar kepada
 * bentuk Kotlin biasa supaya logik boleh diuji tanpa Android.
 * Hanya medan yang benar-benar dibaca dari StatusBarNotification / Notification.extras.
 */
data class NotisMentah(
    val pakej: String,
    val kunci: String,
    val tag: String?,
    val shortcutId: String?,
    val masaPos: Long,
    val kategori: String?,
    val ringkasanKumpulan: Boolean,
    val tajuk: String?,
    val teks: String?,
    val tajukPerbualan: String?,
    val perbualanKumpulan: Boolean,
    val mesej: List<MesejNotis>,
    val orangUri: List<String> = emptyList(),
)

/** Lead yang dikesan dari notifikasi. Pengenal hanya diisi bila benar-benar dipaparkan. */
data class CalonLead(
    val eventId: String,
    val telefon: String?,          // E.164, hanya jika kelihatan dengan jelas
    val username: String?,         // username WhatsApp tanpa '@', hanya jika kelihatan dengan jelas
    val nama: String,              // nama paparan (boleh nama kenalan yang disimpan dalam telefon)
    val mesej: String,             // pratonton mesej ("" jika disembunyikan / pengguna matikan)
    val pratontonTersembunyi: Boolean,
    val masa: Long,
    val sumberPengenal: String,    // dari mana pengenal datang: jid | tel_uri | tajuk | username | tiada
) {
    val adaPengenal: Boolean get() = telefon != null || username != null
}

sealed class Hasil {
    data class Lead(val calon: List<CalonLead>) : Hasil()
    data class Abai(val sebab: String) : Hasil()
}

object Pakej {
    const val WHATSAPP_BUSINESS = "com.whatsapp.w4b"
    const val WHATSAPP = "com.whatsapp"
}
