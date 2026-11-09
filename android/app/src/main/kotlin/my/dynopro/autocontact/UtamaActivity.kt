package my.dynopro.autocontact

import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import my.dynopro.autocontact.core.BarisGilir
import my.dynopro.autocontact.core.KodSambungan
import my.dynopro.autocontact.core.Pakej
import java.text.DateFormat
import java.util.Date

/** Skrin status & persediaan. UI dibina dalam kod supaya app kekal kecil tanpa pustaka tambahan. */
class UtamaActivity : Activity() {

    private val UNGU = Color.parseColor("#5B1094")
    private val MERAH_JAMBU = Color.parseColor("#C040D8")
    private val PERAK = Color.parseColor("#F1F2F6")
    private val KELABU = Color.parseColor("#6B6480")
    private lateinit var t: Tetapan
    private lateinit var bekas: LinearLayout
    private val h = Handler(Looper.getMainLooper())
    private val segar = object : Runnable { override fun run() { bina(); h.postDelayed(this, 5_000) } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        t = Tetapan(this)
        bekas = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(18), dp(18), dp(28)) }
        setContentView(ScrollView(this).apply { setBackgroundColor(PERAK); addView(bekas) })
        PekerjaHantar.jadualBerkala(this)
        if (!t.persetujuan) mintaPersetujuan()
    }

    override fun onResume() { super.onResume(); h.post(segar) }
    override fun onPause() { super.onPause(); h.removeCallbacks(segar) }

    private fun mintaPersetujuan() {
        AlertDialog.Builder(this)
            .setTitle("Kebenaran membaca notifikasi WhatsApp Business")
            .setMessage(
                "Dyno Auto Contact akan membaca notifikasi dari app WhatsApp Business di telefon ini untuk " +
                    "menyimpan lead baharu ke Dyno Mini CRM anda.\n\n" +
                    "• Hanya notifikasi WhatsApp Business (bukan app lain).\n" +
                    "• Hanya nombor atau username yang benar-benar dipaparkan dalam notifikasi. Tiada nombor diteka.\n" +
                    "• Jika hanya nama dipaparkan, lead masuk ke 'Lead belum disahkan' untuk anda sahkan.\n" +
                    "• Chat kumpulan diabaikan. Tiada mesej dihantar kepada pelanggan.\n" +
                    "• Pratonton mesej dihantar ke akaun Mini CRM anda (boleh dimatikan).\n\n" +
                    "Anda boleh menarik balik kebenaran pada bila-bila masa dalam Tetapan > Akses notifikasi."
            )
            .setPositiveButton("Saya setuju") { _, _ -> t.persetujuan = true; LogApp.tulis(this, "status", "Persetujuan diberikan"); bina() }
            .setNegativeButton("Tidak") { _, _ -> bina() }
            .setCancelable(false)
            .show()
    }

    private fun aksesNotifikasi(): Boolean {
        val dibenar = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val kami = ComponentName(this, PendengarNotis::class.java).flattenToString()
        return dibenar.split(':').any { it == kami }
    }

    private fun dipasang(pakej: String) = try { packageManager.getPackageInfo(pakej, 0); true } catch (_: PackageManager.NameNotFoundException) { false }

    private fun bateriDikecualikan() = (getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)

    private fun bila(ms: Long): String = if (ms == 0L) "belum" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(ms))

    private fun bina() {
        bekas.removeAllViews()
        teks("Dyno Auto Contact", 24f, UNGU, tebal = true)
        teks("Setiap Lead Berharga. Jangan Biar Ia Hilang.", 14f, MERAH_JAMBU, tebal = true)
        ruang(10)

        val akses = aksesNotifikasi()
        val sambung = t.url != null && t.kunci() != null
        val semuaOk = t.persetujuan && akses && sambung && dipasang(Pakej.WHATSAPP_BUSINESS)
        kad {
            teks(if (semuaOk) "✅ Tangkapan lead automatik AKTIF" else "⚠️ Belum lengkap — ikut langkah di bawah", 16f, if (semuaOk) Color.parseColor("#1E8E4A") else Color.parseColor("#B26A00"), tebal = true, dalam = it)
        }

        kad { k ->
            baris(k, "1. Persetujuan anda", if (t.persetujuan) "Diberikan" else "Belum", t.persetujuan)
            if (!t.persetujuan) butang(k, "Baca & beri persetujuan") { mintaPersetujuan() }
            baris(k, "2. Akses notifikasi", if (akses) "Dibenarkan" else "Belum dibenarkan", akses)
            if (!akses) {
                teks("Jika suis dikelabukan (app dipasang di luar Play Store): Tetapan > Apps > Dyno Auto Contact > ⋮ > Benarkan tetapan terhad, kemudian cuba lagi.", 12f, KELABU, dalam = k)
                butang(k, "Buka tetapan akses notifikasi") { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
            }
            val wab = dipasang(Pakej.WHATSAPP_BUSINESS)
            baris(k, "3. WhatsApp Business", if (wab) "Dipasang" else "Tidak dijumpai", wab)
            baris(k, "4. Sambungan Mini CRM", if (sambung) "Disambung · ${t.idPeranti}" else "Belum disambung", sambung)
            if (!sambung) {
                teks("Dalam Mini CRM: Lead Automatik > Telefon Android > Cipta kod sambungan. Tampal kod di sini:", 12f, KELABU, dalam = k)
                val input = EditText(this).apply { hint = "Kod sambungan"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS; isSingleLine = true }
                k.addView(input)
                butang(k, "Simpan kod sambungan") {
                    val s = KodSambungan.huraikan(input.text.toString())
                    if (s == null) {
                        input.error = "Kod tidak sah. Salin semula dari Mini CRM."
                    } else {
                        t.simpanSambungan(s.url, s.kunci)
                        LogApp.tulis(this, "status", "Disambung ke Mini CRM")
                        PekerjaHantar.jadual(this); bina()
                    }
                }
            } else {
                butang(k, "Putuskan sambungan") { t.putusSambungan(); LogApp.tulis(this, "status", "Sambungan diputuskan"); bina() }
            }
            val bateri = bateriDikecualikan()
            baris(k, "5. Pengoptimuman bateri", if (bateri) "Dikecualikan" else "Aktif (lead mungkin lewat)", bateri)
            if (!bateri) butang(k, "Buka tetapan bateri") { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }

        kad { k ->
            teks("Status", 15f, UNGU, tebal = true, dalam = k)
            val gilir = BarisGilir(StoranPrefs(this)).bilangan()
            baris(k, "Pendengar disambung", bila(t.masa("disambung")), t.masa("disambung") > 0)
            baris(k, "Lead terakhir dikesan", bila(t.masa("lead_terakhir")), true)
            baris(k, "Hantar terakhir ke CRM", bila(t.masa("hantar_terakhir")), true)
            baris(k, "Menunggu dihantar", "$gilir lead", gilir == 0)
            t.ralat?.let { teks("Ralat: $it", 12f, Color.parseColor("#C0392B"), dalam = k) }
            butang(k, "Hantar sekarang") { PekerjaHantar.jadual(this); LogApp.tulis(this, "status", "Penghantaran dimulakan"); bina() }
        }

        kad { k ->
            teks("Pilihan", 15f, UNGU, tebal = true, dalam = k)
            suis(k, "Hantar pratonton mesej ke Mini CRM", t.hantarPratonton) { t.hantarPratonton = it }
            suis(k, "Pantau juga WhatsApp (bukan Business)", t.pantauWhatsAppBiasa) { t.pantauWhatsAppBiasa = it }
            butang(k, "Tarik balik persetujuan") { t.persetujuan = false; LogApp.tulis(this, "status", "Persetujuan ditarik balik"); bina() }
        }

        kad { k ->
            teks("Log (tanpa isi mesej)", 15f, UNGU, tebal = true, dalam = k)
            val log = LogApp.baca(this)
            if (log.isEmpty()) teks("Belum ada aktiviti.", 13f, KELABU, dalam = k)
            log.forEach { (masa, jenis, m) -> teks("${bila(masa)} · $jenis · $m", 12f, if (jenis == "ralat") Color.parseColor("#C0392B") else Color.DKGRAY, dalam = k) }
        }

        teks("Had: app ini hanya membaca notifikasi. Jika notifikasi chat dibisukan, dimatikan, atau telefon membunuh app di latar belakang, lead boleh terlepas. Nombor hanya ditangkap bila WhatsApp memaparkannya.", 11f, KELABU)
    }

    // ---------- Pembantu UI ----------
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun ruang(v: Int) = bekas.addView(View(this), LinearLayout.LayoutParams(1, dp(v)))

    private fun teks(s: String, saiz: Float, warna: Int, tebal: Boolean = false, dalam: LinearLayout = bekas) {
        dalam.addView(TextView(this).apply {
            text = s; textSize = saiz; setTextColor(warna); if (tebal) setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(3), 0, dp(3))
        })
    }

    private fun kad(isi: (LinearLayout) -> Unit) {
        val k = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(14).toFloat() }
        }
        isi(k)
        bekas.addView(k, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    }

    private fun baris(k: LinearLayout, label: String, nilai: String, ok: Boolean) {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(5), 0, dp(5)) }
        r.addView(TextView(this).apply { text = label; textSize = 14f; setTextColor(Color.BLACK) }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        r.addView(TextView(this).apply { text = nilai; textSize = 13f; gravity = Gravity.END; setTextColor(if (ok) Color.parseColor("#1E8E4A") else Color.parseColor("#B26A00")); setTypeface(typeface, Typeface.BOLD) },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        k.addView(r)
    }

    private fun butang(k: LinearLayout, label: String, klik: () -> Unit) {
        k.addView(Button(this).apply {
            text = label; isAllCaps = false; setTextColor(Color.WHITE)
            background = GradientDrawable().apply { setColor(UNGU); cornerRadius = dp(12).toFloat() }
            setOnClickListener { klik() }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) })
    }

    @Suppress("UseSwitchCompatOrMaterialCode")
    private fun suis(k: LinearLayout, label: String, nilai: Boolean, tukar: (Boolean) -> Unit) {
        k.addView(Switch(this).apply { text = label; isChecked = nilai; textSize = 14f; setPadding(0, dp(6), 0, dp(6)); setOnCheckedChangeListener { _, b -> tukar(b) } })
    }
}
