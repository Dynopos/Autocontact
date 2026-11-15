-- Ujian RLS & peraturan klasifikasi. Untuk Postgres tempatan sahaja (bukan projek Supabase sebenar):
--   psql -f supabase/tests/stub-auth.sql && psql -f supabase/migrations/*.sql && psql -f supabase/tests/rls.test.sql
\set ON_ERROR_STOP 0
\set QUIET 1
-- user A
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into contacts (telefon, nama, status) values ('+60123454567','Kak Nik','lead');
insert into contacts (telefon, nama, status, kategori, kategori_disahkan) values ('+60175558899','Siti','customer','prospek_berminat',true);
insert into contacts (telefon, nama, status, kategori, kategori_disahkan) values ('+60191231234','Ali','prospek','prospek_berminat',true);
\echo '-- T1 duplicate phone rejected:'
insert into contacts (telefon, nama) values ('+60123454567','Dup');
\echo '-- T2 prospek_hampir on lead -> prospek:'
select apply_classification('prospek_hampir', p_telefon=>'+60123454567', p_produk=>'Kuih raya', p_ringkasan=>'Nak order', p_tindakan=>'Hantar harga', p_keyakinan=>0.9, p_susulan=>'2026-11-10');
\echo '-- T3 customer_semak without purchase confirm on lead/prospek -> followup (not customer):'
select apply_classification('customer_semak', p_telefon=>'+60123454567', p_ganti_kategori=>true);
\echo '-- T4 customer_semak WITH purchase confirm -> customer:'
select apply_classification('customer_semak', p_telefon=>'+60123454567', p_pembelian_disahkan=>true, p_ganti_kategori=>true);
\echo '-- T5 confirmed category kept without consent (Ali prospek_berminat -> support):'
select apply_classification('support_pelanggan', p_telefon=>'+60191231234');
select telefon, status, kategori from contacts where telefon='+60191231234';
\echo '-- T6 with consent:'
select apply_classification('support_pelanggan', p_telefon=>'+60191231234', p_ganti_kategori=>true);
\echo '-- T7 existing customer never downgraded (Siti):'
select apply_classification('prospek_harga', p_telefon=>'+60175558899', p_ganti_kategori=>true);
\echo '-- T8 new contact created from phone, no duplicate on repeat:'
select apply_classification('prospek_harga', p_telefon=>'+60139998877', p_nama=>'Baru');
select apply_classification('prospek_harga', p_telefon=>'+60139998877', p_nama=>'Baru lagi');
select count(*) as baru_count from contacts where telefon='+60139998877';
\echo '-- T9 invalid category rejected:'
select apply_classification('customer', p_telefon=>'+60139998877');
\echo '-- T10 cannot raise own AI limit / usage:'
insert into user_plans values ('11111111-1111-1111-1111-111111111111', 9999);
select ai_usage_claim('11111111-1111-1111-1111-111111111111','2026-11');
\echo '-- T11 import dedupe:'
insert into chat_imports (file_hash, file_name) values (repeat('a',64),'chat.txt');
insert into chat_imports (file_hash, file_name) values (repeat('a',64),'chat.txt');
select count(*) a_contacts from contacts;
select count(*) a_classifications from classifications;
-- user B
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
\echo '-- T12 user B sees none of A:'
select count(*) b_sees_contacts from contacts;
select count(*) b_sees_class from classifications;
select count(*) b_sees_imports from chat_imports;
\echo '-- T13 user B cannot update/delete A rows (0 rows):'
update contacts set nama='hack' where telefon='+60123454567';
delete from contacts;
\echo '-- T14 user B cannot apply to A contact id:'
select apply_classification('prospek_harga', p_contact_id=>(select id from contacts limit 1));
reset role; select set_config('request.jwt.claim.sub','',false);
select apply_classification('prospek_harga', p_contact_id=>(select id from contacts where telefon='+60123454567'));
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
\echo '-- T15 user B cannot insert row owned by A:'
insert into contacts (owner_id, telefon) values ('11111111-1111-1111-1111-111111111111','+60111111111');
\echo '-- T16 user B cannot link classification to A contact:'
reset role;
\set aid `echo x`
select id as a_contact from contacts where telefon='+60123454567' \gset
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
insert into classifications (contact_id, kategori) values (:'a_contact','prospek_harga');
\echo '-- T17 anon sees nothing:'
set role anon; select count(*) from contacts;
\echo '-- T18 service role claim within limit, then over limit:'
reset role; set role service_role;
insert into user_plans values ('22222222-2222-2222-2222-222222222222', 2);
select ai_usage_claim('22222222-2222-2222-2222-222222222222','2026-11');
select ai_usage_claim('22222222-2222-2222-2222-222222222222','2026-11');
select ai_usage_claim('22222222-2222-2222-2222-222222222222','2026-11');
select ai_usage_refund('22222222-2222-2222-2222-222222222222','2026-11');
select jumlah from ai_usage where owner_id='22222222-2222-2222-2222-222222222222';
reset role;
\echo '-- Final A state:'
select telefon, nama, status, kategori, kategori_disahkan, produk, susulan from contacts order by telefon;
