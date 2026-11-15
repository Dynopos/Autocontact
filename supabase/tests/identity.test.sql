-- Ujian identiti WhatsApp (nombor / username / BSUID / nama sahaja). Jalankan selepas stub-auth.sql dan semua migrasi.
\set QUIET 1
\pset tuples_only on
\set O '\'33333333-3333-3333-3333-333333333333\''
insert into auth.users values ('33333333-3333-3333-3333-333333333333') on conflict do nothing;
set role service_role;
\echo '== TEST A: nombor kelihatan -> kenalan dicipta'
select capture_identity(:O,'whatsapp','A1','+60123450001',null,null,'Ahmad','Salam nak tanya harga',now(),null,'android') ->> 'status';
\echo '== TEST B: username sahaja -> kenalan username dicipta'
select capture_identity(:O,'whatsapp','B1',null,'@Siti.Kek',null,'Siti','Ada stok?',now(),null,'android') ->> 'status';
select coalesce(telefon,'(tiada)') || ' | ' || whatsapp_username || ' | ' || status from contacts where whatsapp_username='siti.kek';
\echo '== TEST C: kenalan sedia ada mesej lagi -> dikemas kini, tiada pendua'
select capture_identity(:O,'whatsapp','A2','+60123450001',null,null,'Ahmad','Lagi satu soalan',now()+interval '1 hour',null,'android') ->> 'status';
select capture_identity(:O,'whatsapp','B2',null,'siti.kek',null,'Siti','Hello',now()+interval '1 hour',null,'android') ->> 'status';
select 'kenalan=' || count(*) from contacts where owner_id=:O;
\echo '== TEST D: nama sahaja -> belum_disahkan, tiada kenalan, tiada nombor diteka'
select capture_identity(:O,'whatsapp','D1',null,null,null,'Pak Abu','Boleh COD?',now(),null,'android') ->> 'status';
select 'kenalan=' || count(*) from contacts where owner_id=:O;
select keputusan || ' | telefon=' || coalesce(telefon,'null') || ' | user=' || coalesce(whatsapp_username,'null') from lead_events where external_event_id='D1';
\echo '== TEST E: event sama 3 kali -> satu kenalan, satu event'
select capture_identity(:O,'whatsapp','E1','+60123450002',null,null,'Lim','x',now(),null,'android') ->> 'status';
select capture_identity(:O,'whatsapp','E1','+60123450002',null,null,'Lim','x',now(),null,'android') ->> 'status';
select capture_identity(:O,'whatsapp','E1','+60123450002',null,null,'Lim','x',now(),null,'android') ->> 'status';
select 'kenalan_lim=' || count(*) from contacts where telefon='+60123450002';
\echo '== Tiada gabungan: nombor & username milik kenalan berbeza dalam satu event'
select capture_identity(:O,'whatsapp','M1','+60123450001','siti.kek',null,'X','y',now(),null,'android')::text;
select 'ahmad_user=' || coalesce(whatsapp_username,'null') from contacts where telefon='+60123450001';
select 'siti_tel=' || coalesce(telefon,'null') from contacts where whatsapp_username='siti.kek';
\echo '== Bukti dalam event sama: username baharu dilampirkan pada kenalan nombor'
select capture_identity(:O,'whatsapp','M2','+60123450002','lim.trading',null,'Lim','z',now(),null,'android') ->> 'status';
select 'lim=' || telefon || ' @' || whatsapp_username from contacts where telefon='+60123450002';
\echo '== Nama sama, pengenal berbeza -> TIDAK digabung'
select capture_identity(:O,'whatsapp','N1','+60123450003',null,null,'Ahmad','hi',now(),null,'android') ->> 'status';
select 'ahmad_count=' || count(*) from contacts where nama='Ahmad' and owner_id=:O;
\echo '== Username tidak sah dibuang (tiada kenalan)'
select capture_identity(:O,'whatsapp','U1',null,'a',null,'','x',now(),null,'api') ->> 'status';
select capture_identity(:O,'whatsapp','U2',null,'12345',null,'Nombor','x',now(),null,'android') ->> 'status';
\echo '== Pengesahan manual oleh pemilik'
reset role; set role authenticated; select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false) is not null;
select sahkan_lead((select id from lead_events where external_event_id='D1'), '012-3450004', null) ->> 'status';
select sahkan_lead((select id from lead_events where external_event_id='D1'), '+60123450004', null) ->> 'status';
select sahkan_lead((select id from lead_events where external_event_id='D1'), '+60123450004', null) ->> 'status';
select 'D1=' || keputusan from lead_events where external_event_id='D1';
select 'abu=' || telefon || ' ' || nama || ' ' || status from contacts where telefon='+60123450004';
\echo '== Akaun lain tidak boleh sahkan event akaun ini'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) is not null;
select sahkan_lead((select id from lead_events where external_event_id='U2' limit 1), '+60123450005', null);
reset role;
\echo '== Kenalan tanpa sebarang pengenal ditolak oleh kekangan'
insert into contacts (owner_id, nama) values (:O, 'Tiada pengenal');
