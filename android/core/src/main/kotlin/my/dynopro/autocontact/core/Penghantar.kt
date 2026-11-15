package my.dynopro.autocontact.core

/** Storan kekal (SharedPreferences dalam app; memori dalam ujian). */
interface Storan {
    fun baris(): List<Map<String, Any?>>
    fun simpanBaris(baris: List<Map<String, Any?>>)
    fun idDilihat(): List<String>
    fun simpanIdDilihat(id: List<String>)
}

class StoranMemori : Storan {
    private var b: List<Map<String, Any?>> = emptyList()
    private var d: List<String> = emptyList()
    override fun baris() = b
    override fun simpanBaris(baris: List<Map<String, Any?>>) { b = baris }
    override fun idDilihat() = d
    override fun simpanIdDilihat(id: List<String>) { d = id }
}

/**
 * Baris gilir lead dalam telefon. Lead disimpan dahulu, kemudian dihantar; jika telefon
 * luar talian, app dimatikan oleh sekatan bateri, atau pelayan sibuk, lead kekal dalam
 * baris gilir dan dihantar semula kemudian. Pendua ditapis dengan ID event.
 */
class BarisGilir(
    private val storan: Storan,
    private val hadBaris: Int = 500,
    private val hadDilihat: Int = 3000,
) {
    /** Tambah calon; pulangkan bilangan yang benar-benar baharu (bukan pendua). */
    @Synchronized
    fun tambah(calon: List<CalonLead>, idPeranti: String): Int {
        val dilihat = LinkedHashSet(storan.idDilihat())
        val baru = calon.filter { dilihat.add(it.eventId) }
        if (baru.isEmpty()) return 0
        val baris = storan.baris() + baru.map { muatan(it, idPeranti) }
        storan.simpanBaris(baris.takeLast(hadBaris))
        storan.simpanIdDilihat(dilihat.toList().takeLast(hadDilihat))
        return baru.size
    }

    fun bilangan() = storan.baris().size

    @Synchronized
    fun ambil(had: Int) = storan.baris().take(had)

    @Synchronized
    fun buang(idEvent: Set<String>) {
        storan.simpanBaris(storan.baris().filterNot { it["external_lead_id"] in idEvent })
    }

    companion object {
        /** Muatan API lead-capture. Tiada ID berskop perniagaan — notifikasi tidak menyediakannya. */
        fun muatan(c: CalonLead, idPeranti: String): Map<String, Any?> = linkedMapOf(
            "phone_number" to c.telefon,
            "whatsapp_username" to c.username,
            "contact_name" to c.nama,
            "first_message" to c.mesej,
            "external_lead_id" to c.eventId,
            "received_at" to java.time.Instant.ofEpochMilli(c.masa).toString(),
            "device_id" to idPeranti,
            "preview_hidden" to c.pratontonTersembunyi,
        )
    }
}

/** Antara muka HTTP minimum supaya penghantaran boleh diuji tanpa rangkaian. */
fun interface Http {
    /** Pulangkan (kod status, badan). Buang IOException bila rangkaian gagal. */
    fun post(url: String, kunci: String, badanJson: String): Pair<Int, String>
}

sealed class KeputusanHantar {
    data class Berjaya(val dihantar: Int, val baki: Int) : KeputusanHantar()
    data class CubaLagi(val sebab: String) : KeputusanHantar()
    data class GagalKekal(val sebab: String) : KeputusanHantar()
    object Kosong : KeputusanHantar()
}

class Penghantar(
    private val gilir: BarisGilir,
    private val http: Http,
    private val keJson: (Map<String, Any?>) -> String,
) {
    /** Hantar satu kelompok. Hanya item yang disahkan pelayan dibuang dari baris gilir. */
    fun hantar(url: String, kunci: String, kelompok: Int = 50): KeputusanHantar {
        val item = gilir.ambil(kelompok)
        if (item.isEmpty()) return KeputusanHantar.Kosong
        val badan = keJson(mapOf("leads" to item))
        val (kod, jawapan) = try {
            http.post(url, kunci, badan)
        } catch (e: java.io.IOException) {
            return KeputusanHantar.CubaLagi("rangkaian: ${e.message}")
        }
        return when {
            kod == 200 -> {
                gilir.buang(item.mapNotNull { it["external_lead_id"] as? String }.toSet())
                KeputusanHantar.Berjaya(item.size, gilir.bilangan())
            }
            kod == 401 -> KeputusanHantar.GagalKekal("kod_sambungan_tidak_sah")
            kod == 429 || kod >= 500 -> KeputusanHantar.CubaLagi("pelayan $kod")
            kod == 400 || kod == 413 -> {
                // Kelompok rosak tidak boleh menyekat baris gilir selama-lamanya
                gilir.buang(item.mapNotNull { it["external_lead_id"] as? String }.toSet())
                KeputusanHantar.GagalKekal("ditolak_pelayan $kod: ${jawapan.take(120)}")
            }
            else -> KeputusanHantar.CubaLagi("kod $kod")
        }
    }
}
