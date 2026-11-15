package my.dynopro.autocontact.core

import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PengekstrakTest {
    private val wab = setOf(Pakej.WHATSAPP_BUSINESS)
    private val t0 = 1_762_740_000_000L

    private fun notis(
        tajuk: String? = "Ahmad",
        teks: String? = "Salam, nak tanya harga POS",
        tag: String? = null,
        shortcut: String? = null,
        mesej: List<MesejNotis>? = null,
        pakej: String = Pakej.WHATSAPP_BUSINESS,
        kategori: String? = "msg",
        ringkasan: Boolean = false,
        kumpulan: Boolean = false,
        tajukPerbualan: String? = null,
        orangUri: List<String> = emptyList(),
    ) = NotisMentah(
        pakej = pakej, kunci = "0|$pakej|1|$tag|10123", tag = tag, shortcutId = shortcut, masaPos = t0,
        kategori = kategori, ringkasanKumpulan = ringkasan, tajuk = tajuk, teks = teks,
        tajukPerbualan = tajukPerbualan, perbualanKumpulan = kumpulan,
        mesej = mesej ?: listOf(MesejNotis(teks, t0, tajuk)), orangUri = orangUri,
    )

    private fun lead(h: Hasil): List<CalonLead> = (h as? Hasil.Lead)?.calon ?: error("dijangka Lead, dapat $h")

    // ---------- TEST A: nombor kelihatan ----------
    @Test fun `A - nombor dari JID perbualan (tag)`() {
        val c = lead(Pengekstrak.ekstrak(notis(tajuk = "Ahmad", tag = "60123456789@s.whatsapp.net"), wab)).single()
        assertEquals("+60123456789", c.telefon); assertEquals("jid", c.sumberPengenal); assertEquals("Ahmad", c.nama)
    }

    @Test fun `A - nombor dari shortcut ID`() {
        val c = lead(Pengekstrak.ekstrak(notis(shortcut = "60198887777@s.whatsapp.net"), wab)).single()
        assertEquals("+60198887777", c.telefon)
    }

    @Test fun `A - tajuk ialah nombor (pengirim tidak disimpan dalam kenalan)`() {
        val c = lead(Pengekstrak.ekstrak(notis(tajuk = "+60 12-345 6789"), wab)).single()
        assertEquals("+60123456789", c.telefon); assertEquals("tajuk", c.sumberPengenal); assertEquals("", c.nama)
    }

    @Test fun `A - URI tel pada orang`() {
        val c = lead(Pengekstrak.ekstrak(notis(orangUri = listOf("tel:+6581234567")), wab)).single()
        assertEquals("+6581234567", c.telefon); assertEquals("tel_uri", c.sumberPengenal)
    }

    // ---------- TEST B: username ----------
    @Test fun `B - username sahaja bila tajuk ialah @username`() {
        val c = lead(Pengekstrak.ekstrak(notis(tajuk = "@Nurul.Bakery"), wab)).single()
        assertEquals("nurul.bakery", c.username); assertNull(c.telefon); assertEquals("", c.nama)
    }

    @Test fun `B - nombor tidak diteka dari username, username tidak diteka dari nombor`() {
        val c = lead(Pengekstrak.ekstrak(notis(tajuk = "@ali_123"), wab)).single()
        assertNull(c.telefon)
        val d = lead(Pengekstrak.ekstrak(notis(tajuk = "+60 12-345 6789"), wab)).single()
        assertNull(d.username)
    }

    // ---------- TEST D: nama sahaja ----------
    @Test fun `D - nama sahaja - tiada pengenal, tiada tekaan`() {
        val c = lead(Pengekstrak.ekstrak(notis(tajuk = "Kak Ani Butik 0123"), wab)).single()
        assertNull(c.telefon); assertNull(c.username); assertFalse(c.adaPengenal); assertEquals("Kak Ani Butik 0123", c.nama)
    }

    @Test fun `D - nama yang mengandungi nombor tempatan tidak dijadikan nombor`() {
        val c = lead(Pengekstrak.ekstrak(notis(tajuk = "Ali 0123456789"), wab)).single()
        assertNull(c.telefon)
    }

    @Test fun `ID lid dalaman bukan nombor telefon`() {
        val c = lead(Pengekstrak.ekstrak(notis(tajuk = "Siti", tag = "112233445566778@lid"), wab)).single()
        assertNull(c.telefon); assertFalse(c.adaPengenal)
    }

    // ---------- Sumber notifikasi ----------
    @Test fun `pakej lain diabaikan`() {
        assertEquals(Hasil.Abai("pakej_lain"), Pengekstrak.ekstrak(notis(pakej = "com.evil.fake"), wab))
        assertEquals(Hasil.Abai("pakej_lain"), Pengekstrak.ekstrak(notis(pakej = Pakej.WHATSAPP), wab))
        assertTrue(Pengekstrak.ekstrak(notis(pakej = Pakej.WHATSAPP), wab + Pakej.WHATSAPP) is Hasil.Lead)
    }

    @Test fun `kumpulan, ringkasan, panggilan dan status diabaikan`() {
        assertEquals(Hasil.Abai("kumpulan"), Pengekstrak.ekstrak(notis(kumpulan = true), wab))
        assertEquals(Hasil.Abai("kumpulan"), Pengekstrak.ekstrak(notis(tag = "1203630@g.us"), wab))
        assertEquals(Hasil.Abai("kumpulan"), Pengekstrak.ekstrak(notis(tag = "status@broadcast"), wab))
        assertEquals(Hasil.Abai("ringkasan"), Pengekstrak.ekstrak(notis(ringkasan = true), wab))
        assertEquals(Hasil.Abai("bukan_mesej"), Pengekstrak.ekstrak(notis(kategori = "call"), wab))
    }

    @Test fun `mesej sendiri sahaja diabaikan`() {
        val h = Pengekstrak.ekstrak(notis(mesej = listOf(MesejNotis("ok terima kasih", t0, null))), wab)
        assertEquals(Hasil.Abai("mesej_sendiri"), h)
    }

    // ---------- Pratonton tersembunyi ----------
    @Test fun `pratonton tersembunyi - tiada teks palsu dihantar`() {
        for (teks in listOf("2 new messages", "New message", "3 mesej baharu", "1 pesan baru", "", null)) {
            val c = lead(Pengekstrak.ekstrak(notis(teks = teks, tag = "60123456789@s.whatsapp.net"), wab)).single()
            assertTrue(c.pratontonTersembunyi, "teks=$teks"); assertEquals("", c.mesej)
            assertEquals("+60123456789", c.telefon)
        }
    }

    @Test fun `pengguna matikan penghantaran pratonton`() {
        val c = lead(Pengekstrak.ekstrak(notis(tag = "60123456789@s.whatsapp.net"), wab, hantarPratonton = false)).single()
        assertEquals("", c.mesej); assertFalse(c.pratontonTersembunyi)
    }

    // ---------- TEST E & pendua ----------
    @Test fun `E - notifikasi sama diproses semula menghasilkan ID event yang sama`() {
        val a = lead(Pengekstrak.ekstrak(notis(tag = "60123456789@s.whatsapp.net"), wab)).single()
        val b = lead(Pengekstrak.ekstrak(notis(tag = "60123456789@s.whatsapp.net"), wab)).single()
        assertEquals(a.eventId, b.eventId)
    }

    @Test fun `MessagingStyle - mesej lama dalam notifikasi dikemas kini tidak menjadi event baharu`() {
        val m1 = MesejNotis("Salam", t0, "Ahmad"); val m2 = MesejNotis("Harga?", t0 + 60_000, "Ahmad")
        val pertama = lead(Pengekstrak.ekstrak(notis(tag = "60123456789@s.whatsapp.net", mesej = listOf(m1)), wab))
        val kedua = lead(Pengekstrak.ekstrak(notis(tag = "60123456789@s.whatsapp.net", mesej = listOf(m1, MesejNotis("baik", t0 + 30_000, null), m2)), wab))
        assertEquals(2, kedua.size)                         // mesej pengguna sendiri diabaikan
        assertEquals(pertama[0].eventId, kedua[0].eventId)   // m1 sama -> ID sama
        assertNotEquals(kedua[0].eventId, kedua[1].eventId)
    }

    @Test fun `berbilang peranti - mesej yang sama pada dua telefon menghasilkan ID event yang sama`() {
        val telefon1 = notis(tag = "60123456789@s.whatsapp.net").copy(kunci = "0|w4b|1|x|111", masaPos = t0 + 5_000)
        val telefon2 = notis(tag = "60123456789@s.whatsapp.net").copy(kunci = "0|w4b|9|y|999", masaPos = t0 + 9_000)
        assertEquals(lead(Pengekstrak.ekstrak(telefon1, wab))[0].eventId, lead(Pengekstrak.ekstrak(telefon2, wab))[0].eventId)
    }

    @Test fun `nama sama dengan pengenal berbeza menghasilkan ID event berbeza`() {
        val a = lead(Pengekstrak.ekstrak(notis(tajuk = "Ahmad", tag = "60123456789@s.whatsapp.net"), wab)).single()
        val b = lead(Pengekstrak.ekstrak(notis(tajuk = "Ahmad", tag = "60123456780@s.whatsapp.net"), wab)).single()
        assertNotEquals(a.eventId, b.eventId)
    }
}

class TelefonTest {
    @Test fun `format berbeza menjadi E164 yang sama`() {
        for (f in listOf("0123456789", "60123456789", "+60123456789", "+60 12-345 6789", "6012-3456789", "0060123456789"))
            assertEquals("+60123456789", Telefon.keE164(f), f)
    }
    @Test fun `nombor tidak sah ditolak`() {
        for (f in listOf("", "123", "abc", "+60 12 345", "0111222333", null)) assertNull(Telefon.keE164(f), "$f")
    }
    @Test fun `antarabangsa`() { assertEquals("+6581234567", Telefon.keE164("+65 8123 4567")) }
}

class BarisGilirTest {
    private fun calon(id: String, tel: String? = "+60123456789") =
        CalonLead(id, tel, null, "Ahmad", "hai", false, 1_762_740_000_000L, "jid")

    @Test fun `pendua ditapis sebelum masuk baris gilir`() {
        val g = BarisGilir(StoranMemori())
        assertEquals(2, g.tambah(listOf(calon("a"), calon("b")), "p1"))
        assertEquals(0, g.tambah(listOf(calon("a"), calon("b")), "p1"))
        assertEquals(1, g.tambah(listOf(calon("a"), calon("c")), "p1"))
        assertEquals(3, g.bilangan())
    }

    @Test fun `notifikasi terlepas - pemprosesan semula semasa sambung semula tidak menggandakan`() {
        val s = StoranMemori(); val g = BarisGilir(s)
        g.tambah(listOf(calon("a")), "p1")
        // app dimatikan & dihidupkan semula: baris gilir baharu dari storan yang sama
        val g2 = BarisGilir(s)
        assertEquals(1, g2.tambah(listOf(calon("a"), calon("b")), "p1"))   // getActiveNotifications() selepas sambung semula
        assertEquals(2, g2.bilangan())
    }

    @Test fun `muatan tidak mengandungi ID berskop perniagaan`() {
        val m = BarisGilir.muatan(calon("a"), "pixel-7")
        assertFalse(m.containsKey("whatsapp_business_user_id"))
        assertEquals("pixel-7", m["device_id"]); assertEquals("a", m["external_lead_id"])
    }

    @Test fun `had baris gilir`() {
        val g = BarisGilir(StoranMemori(), hadBaris = 3)
        g.tambah((1..5).map { calon("e$it") }, "p1")
        assertEquals(listOf("e3", "e4", "e5"), g.ambil(10).map { it["external_lead_id"] })
    }
}

class PenghantarTest {
    private fun gilir(n: Int): BarisGilir {
        val g = BarisGilir(StoranMemori())
        g.tambah((1..n).map { CalonLead("e$it", "+60123456789", null, "A", "", false, 0L, "jid") }, "p1")
        return g
    }
    private val json: (Map<String, Any?>) -> String = { it.toString() }

    @Test fun `berjaya - item dibuang dari baris gilir`() {
        val g = gilir(3)
        val r = Penghantar(g, { _, _, _ -> 200 to "{}" }, json).hantar("u", "k")
        assertEquals(KeputusanHantar.Berjaya(3, 0), r); assertEquals(0, g.bilangan())
    }

    @Test fun `sekatan latar belakang - rangkaian gagal, lead kekal untuk dicuba semula`() {
        val g = gilir(2)
        val r = Penghantar(g, { _, _, _ -> throw IOException("timeout") }, json).hantar("u", "k")
        assertTrue(r is KeputusanHantar.CubaLagi); assertEquals(2, g.bilangan())
    }

    @Test fun `pelayan 503 - cuba semula, tiada kehilangan`() {
        val g = gilir(2)
        assertTrue(Penghantar(g, { _, _, _ -> 503 to "" }, json).hantar("u", "k") is KeputusanHantar.CubaLagi)
        assertEquals(2, g.bilangan())
    }

    @Test fun `kod sambungan dibatalkan - gagal kekal, lead disimpan`() {
        val g = gilir(1)
        assertEquals(KeputusanHantar.GagalKekal("kod_sambungan_tidak_sah"), Penghantar(g, { _, _, _ -> 401 to "" }, json).hantar("u", "k"))
        assertEquals(1, g.bilangan())
    }

    @Test fun `kelompok dihadkan`() {
        val g = gilir(120)
        val dihantar = mutableListOf<Int>()
        val p = Penghantar(g, { _, _, b -> dihantar += Regex("external_lead_id").findAll(b).count(); 200 to "{}" }, json)
        while (p.hantar("u", "k", 50) !is KeputusanHantar.Kosong) { }
        assertEquals(listOf(50, 50, 20), dihantar)
    }
}

class KodSambunganTest {
    private fun kod(json: String) = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray())
    private val kunci = "dyno_" + "ab".repeat(24)

    @Test fun `kod sah`() {
        val s = KodSambungan.huraikan(kod("""{"v":1,"u":"https://abc.supabase.co/functions/v1/lead-capture","k":"$kunci"}"""))
        assertEquals(Sambungan("https://abc.supabase.co/functions/v1/lead-capture", kunci), s)
    }
    @Test fun `kod tidak sah ditolak`() {
        assertNull(KodSambungan.huraikan("bukan-kod"))
        assertNull(KodSambungan.huraikan(kod("""{"u":"http://abc.supabase.co/functions/v1/lead-capture","k":"$kunci"}""")))   // bukan HTTPS
        assertNull(KodSambungan.huraikan(kod("""{"u":"https://evil.example/steal","k":"$kunci"}""")))
        assertNull(KodSambungan.huraikan(kod("""{"u":"https://abc.supabase.co/functions/v1/lead-capture","k":"sk-123"}""")))
    }
}
