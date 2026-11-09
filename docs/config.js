/* Dyno Mini CRM — tetapan awan (Supabase)
   Isi dua nilai ini daripada Supabase → Project Settings → API.
   Kunci "anon" memang direka untuk berada dalam pelayar: ia tidak boleh
   membaca data sesiapa tanpa log masuk, kerana setiap jadual dilindungi
   Row Level Security. JANGAN letak kunci "service_role" di sini.

   Bila kedua-duanya kosong, app berjalan seperti biasa dalam mod telefon
   sahaja, dan ciri awan serta Smart WhatsApp Classification disembunyikan. */
window.DYNO_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
