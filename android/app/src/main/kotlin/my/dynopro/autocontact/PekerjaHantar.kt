package my.dynopro.autocontact

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import my.dynopro.autocontact.core.BarisGilir
import my.dynopro.autocontact.core.Http
import my.dynopro.autocontact.core.KeputusanHantar
import my.dynopro.autocontact.core.Penghantar
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Menghantar baris gilir lead ke Mini CRM (POST /lead-capture) dengan kunci peranti.
 * WorkManager mencuba semula dengan jarak masa eksponen bila tiada internet, pelayan
 * sibuk, atau app dihentikan oleh sekatan bateri — lead kekal dalam telefon sehingga
 * pelayan mengesahkannya.
 */
class PekerjaHantar(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val t = Tetapan(applicationContext)
        val url = t.url
        val kunci = t.kunci()
        if (url == null || kunci == null) return Result.success()   // belum disambung; lead kekal dalam baris gilir
        val p = Penghantar(BarisGilir(StoranPrefs(applicationContext)), HttpPeranti) { keJsonObjek(it).toString() }
        repeat(20) {
            when (val r = withContext(Dispatchers.IO) { p.hantar(url, kunci) }) {
                is KeputusanHantar.Kosong -> return Result.success()
                is KeputusanHantar.Berjaya -> {
                    t.tanda("hantar_terakhir"); t.padamRalat()
                    LogApp.tulis(applicationContext, "hantar", "${r.dihantar} lead dihantar ke Mini CRM")
                }
                is KeputusanHantar.CubaLagi -> {
                    t.tandaRalat("Akan dicuba semula: ${r.sebab}")
                    return Result.retry()
                }
                is KeputusanHantar.GagalKekal -> {
                    t.tandaRalat(if (r.sebab == "kod_sambungan_tidak_sah") "Kod sambungan tidak sah atau telah diputuskan. Cipta kod baharu dalam Mini CRM." else r.sebab)
                    LogApp.tulis(applicationContext, "ralat", r.sebab)
                    if (r.sebab == "kod_sambungan_tidak_sah") return Result.failure()
                }
            }
        }
        return Result.success()
    }

    companion object {
        private val kekangan = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun jadual(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<PekerjaHantar>()
                .setConstraints(kekangan)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("hantar-lead", ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }

        /** Jaring keselamatan: hantar apa-apa yang tertinggal setiap 15 minit. */
        fun jadualBerkala(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<PekerjaHantar>(15, TimeUnit.MINUTES).setConstraints(kekangan).build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("hantar-lead-berkala", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}

object HttpPeranti : Http {
    override fun post(url: String, kunci: String, badanJson: String): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            c.doOutput = true
            c.setRequestProperty("Authorization", "Bearer $kunci")
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            c.outputStream.use { it.write(badanJson.toByteArray(Charsets.UTF_8)) }
            val kod = c.responseCode
            val badan = (if (kod >= 400) c.errorStream else c.inputStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return kod to badan
        } finally {
            c.disconnect()
        }
    }
}
