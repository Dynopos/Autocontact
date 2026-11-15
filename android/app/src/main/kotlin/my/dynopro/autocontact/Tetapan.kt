package my.dynopro.autocontact

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import my.dynopro.autocontact.core.Pakej
import my.dynopro.autocontact.core.Storan
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Tetapan & status app. Kunci peranti disulitkan dengan Android Keystore. */
class Tetapan(ctx: Context) {
    private val p: SharedPreferences = ctx.applicationContext.getSharedPreferences("dyno_auto_contact", Context.MODE_PRIVATE)

    var persetujuan: Boolean
        get() = p.getBoolean("persetujuan", false)
        set(v) = p.edit().putBoolean("persetujuan", v).apply()

    var hantarPratonton: Boolean
        get() = p.getBoolean("hantar_pratonton", true)
        set(v) = p.edit().putBoolean("hantar_pratonton", v).apply()

    var pantauWhatsAppBiasa: Boolean
        get() = p.getBoolean("pantau_wa_biasa", false)
        set(v) = p.edit().putBoolean("pantau_wa_biasa", v).apply()

    /** Hanya WhatsApp Business secara lalai; WhatsApp biasa hanya jika pengguna memilih. */
    val pakej: Set<String>
        get() = if (pantauWhatsAppBiasa) setOf(Pakej.WHATSAPP_BUSINESS, Pakej.WHATSAPP) else setOf(Pakej.WHATSAPP_BUSINESS)

    val idPeranti: String
        get() = p.getString("id_peranti", null) ?: run {
            val model = Build.MODEL.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').take(30)
            val id = "$model-${UUID.randomUUID().toString().take(8)}"
            p.edit().putString("id_peranti", id).apply(); id
        }

    val url: String? get() = p.getString("url", null)
    fun kunci(): String? = p.getString("kunci_sulit", null)?.let { KunciSelamat.buka(it) }
    fun simpanSambungan(url: String, kunci: String) =
        p.edit().putString("url", url).putString("kunci_sulit", KunciSelamat.sulit(kunci)).remove("ralat").apply()
    fun putusSambungan() = p.edit().remove("url").remove("kunci_sulit").apply()

    // ---- Status untuk skrin utama ----
    fun tanda(kunci: String, nilai: Long = System.currentTimeMillis()) = p.edit().putLong(kunci, nilai).apply()
    fun masa(kunci: String): Long = p.getLong(kunci, 0L)
    fun tandaRalat(teks: String) = p.edit().putString("ralat", teks).putLong("ralat_masa", System.currentTimeMillis()).apply()
    fun padamRalat() = p.edit().remove("ralat").apply()
    val ralat: String? get() = p.getString("ralat", null)
}

/** Kunci AES dalam Android Keystore — tidak boleh dieksport dari peranti. */
object KunciSelamat {
    private const val ALIAS = "dyno_auto_contact_kunci"

    private fun kunci(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return g.generateKey()
    }

    fun sulit(teks: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, kunci())
        return java.util.Base64.getEncoder().encodeToString(c.iv + c.doFinal(teks.toByteArray(Charsets.UTF_8)))
    }

    fun buka(simpan: String): String? = try {
        val b = java.util.Base64.getDecoder().decode(simpan)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, kunci(), GCMParameterSpec(128, b.copyOfRange(0, 12)))
        String(c.doFinal(b.copyOfRange(12, b.size)), Charsets.UTF_8)
    } catch (e: Exception) {
        null
    }
}

/** Baris gilir & ID yang sudah dilihat, disimpan dalam SharedPreferences (kekal selepas app dimatikan). */
class StoranPrefs(ctx: Context) : Storan {
    private val p = ctx.applicationContext.getSharedPreferences("dyno_baris_gilir", Context.MODE_PRIVATE)

    override fun baris(): List<Map<String, Any?>> {
        val a = JSONArray(p.getString("baris", "[]"))
        return (0 until a.length()).map { i ->
            val o = a.getJSONObject(i)
            o.keys().asSequence().associateWith { k -> if (o.isNull(k)) null else o.get(k) }
        }
    }

    override fun simpanBaris(baris: List<Map<String, Any?>>) {
        p.edit().putString("baris", JSONArray(baris.map { keJsonObjek(it) }).toString()).commit()
    }

    override fun idDilihat(): List<String> {
        val a = JSONArray(p.getString("dilihat", "[]"))
        return (0 until a.length()).map { a.getString(it) }
    }

    override fun simpanIdDilihat(id: List<String>) {
        p.edit().putString("dilihat", JSONArray(id).toString()).commit()
    }
}

fun keJsonObjek(m: Map<String, Any?>): JSONObject {
    val o = JSONObject()
    for ((k, v) in m) {
        when (v) {
            null -> o.put(k, JSONObject.NULL)
            is Map<*, *> -> @Suppress("UNCHECKED_CAST") o.put(k, keJsonObjek(v as Map<String, Any?>))
            is List<*> -> o.put(k, JSONArray(v.map { if (it is Map<*, *>) @Suppress("UNCHECKED_CAST") keJsonObjek(it as Map<String, Any?>) else it }))
            else -> o.put(k, v)
        }
    }
    return o
}

/** Log ringkas untuk skrin status. Tiada isi mesej direkodkan. */
object LogApp {
    fun tulis(ctx: Context, jenis: String, teks: String) {
        val p = ctx.applicationContext.getSharedPreferences("dyno_log", Context.MODE_PRIVATE)
        val a = JSONArray(p.getString("log", "[]"))
        val baru = JSONArray().put(JSONObject().put("t", System.currentTimeMillis()).put("j", jenis).put("m", teks.take(200)))
        for (i in 0 until minOf(a.length(), 199)) baru.put(a.get(i))
        p.edit().putString("log", baru.toString()).apply()
    }

    fun baca(ctx: Context, had: Int = 40): List<Triple<Long, String, String>> {
        val a = JSONArray(ctx.applicationContext.getSharedPreferences("dyno_log", Context.MODE_PRIVATE).getString("log", "[]"))
        return (0 until minOf(a.length(), had)).map { val o = a.getJSONObject(it); Triple(o.getLong("t"), o.getString("j"), o.getString("m")) }
    }
}
