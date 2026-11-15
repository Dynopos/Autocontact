package my.dynopro.autocontact

import android.annotation.TargetApi
import android.app.Notification
import android.app.Person
import android.content.ComponentName
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import my.dynopro.autocontact.core.BarisGilir
import my.dynopro.autocontact.core.Hasil
import my.dynopro.autocontact.core.MesejNotis
import my.dynopro.autocontact.core.NotisMentah
import my.dynopro.autocontact.core.Pengekstrak

/**
 * Membaca notifikasi WhatsApp Business (hanya selepas pengguna memberi akses notifikasi
 * DAN bersetuju dalam app). Tiada Accessibility Service, tiada bacaan pangkalan data
 * WhatsApp, tiada tindakan ke atas notifikasi — hanya baca.
 */
class PendengarNotis : NotificationListenerService() {

    override fun onListenerConnected() {
        val t = Tetapan(this)
        t.tanda("disambung")
        LogApp.tulis(this, "status", "Pendengar notifikasi disambung")
        // Tangkap notifikasi yang masih ada semasa pendengar terputus (app dimatikan, kemas kini, but semula)
        try {
            activeNotifications?.forEach { proses(it) }
        } catch (e: Exception) {
            LogApp.tulis(this, "ralat", "Tidak dapat membaca notifikasi aktif: ${e.javaClass.simpleName}")
        }
    }

    override fun onListenerDisconnected() {
        Tetapan(this).tanda("terputus")
        LogApp.tulis(this, "amaran", "Pendengar notifikasi terputus — meminta sambung semula")
        requestRebind(ComponentName(this, PendengarNotis::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn != null) proses(sbn)
    }

    private fun proses(sbn: StatusBarNotification) {
        val t = Tetapan(this)
        if (!t.persetujuan) return
        // packageName ditetapkan oleh sistem Android — app lain tidak boleh menyamar sebagai WhatsApp Business
        if (sbn.packageName !in t.pakej) return
        val hasil = try {
            Pengekstrak.ekstrak(tukar(sbn), t.pakej, t.hantarPratonton)
        } catch (e: Exception) {
            LogApp.tulis(this, "ralat", "Notifikasi tidak dapat dibaca: ${e.javaClass.simpleName}")
            return
        }
        if (hasil !is Hasil.Lead) return
        val baru = BarisGilir(StoranPrefs(this)).tambah(hasil.calon, t.idPeranti)
        if (baru == 0) return
        t.tanda("lead_terakhir")
        val c = hasil.calon.last()
        val jenis = when {
            c.telefon != null && c.username != null -> "nombor + username"
            c.telefon != null -> "nombor (${c.sumberPengenal})"
            c.username != null -> "username"
            else -> "nama sahaja — perlu disahkan dalam Mini CRM"
        }
        LogApp.tulis(this, "lead", "$baru mesej baharu dikesan: $jenis" + if (c.pratontonTersembunyi) " · pratonton disembunyikan" else "")
        PekerjaHantar.jadual(this)
    }

    companion object {
        /** StatusBarNotification -> NotisMentah (hanya medan yang dibaca). */
        @Suppress("DEPRECATION")
        fun tukar(sbn: StatusBarNotification): NotisMentah {
            val n = sbn.notification
            val e: Bundle = n.extras
            val mesej = mutableListOf<MesejNotis>()
            val arr: Array<Parcelable>? = e.getParcelableArray(Notification.EXTRA_MESSAGES)
            arr?.forEach { item ->
                val b = item as? Bundle ?: return@forEach
                val (namaOrang, uriOrang) = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) Api28.pengirim(b) else (null to null)
                mesej += MesejNotis(
                    teks = b.getCharSequence("text")?.toString(),
                    masa = b.getLong("time"),
                    pengirim = namaOrang ?: b.getCharSequence("sender")?.toString(),
                    pengirimUri = uriOrang,
                )
            }
            val orangUri: List<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                Api28.uriOrang(e)
            } else {
                e.getStringArray(Notification.EXTRA_PEOPLE)?.toList() ?: emptyList()
            }
            return NotisMentah(
                pakej = sbn.packageName,
                kunci = sbn.key,
                tag = sbn.tag,
                shortcutId = n.shortcutId,
                masaPos = sbn.postTime,
                kategori = n.category,
                ringkasanKumpulan = (n.flags and Notification.FLAG_GROUP_SUMMARY) != 0,
                tajuk = e.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
                teks = e.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
                tajukPerbualan = e.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString(),
                perbualanKumpulan = e.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false),
                mesej = mesej,
                orangUri = orangUri,
            )
        }
    }
}

/** android.app.Person hanya wujud pada Android 9 (API 28)+; dipanggil hanya selepas semakan versi. */
@TargetApi(Build.VERSION_CODES.P)
private object Api28 {
    @Suppress("DEPRECATION")
    fun pengirim(b: Bundle): Pair<String?, String?> {
        val p: Person? = b.getParcelable("sender_person")
        return p?.name?.toString() to p?.uri
    }

    @Suppress("DEPRECATION")
    fun uriOrang(e: Bundle): List<String> =
        e.getParcelableArrayList<Person>(Notification.EXTRA_PEOPLE_LIST)?.mapNotNull { it.uri } ?: emptyList()
}
