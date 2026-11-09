-- Ujian lead capture (SQL). Jalankan selepas stub-auth.sql dan kedua-dua migrasi.
\set QUIET 1
set role service_role;
\echo '-- setup integrations'
select daftar_integrasi('11111111-1111-1111-1111-111111111111','whatsapp','WA Kedai','1098765432101',null,null,null) as wa_a \gset
select daftar_integrasi('11111111-1111-1111-1111-111111111111','meta_lead_ads','Page A','2233445566',null,null,'ciphertext') as meta_a \gset
\echo '-- cannot claim another account phone_number_id:'
select daftar_integrasi('22222222-2222-2222-2222-222222222222','whatsapp','Curi','1098765432101',null,null,null);
\echo '-- T1 new WhatsApp lead -> created'
select capture_lead('11111111-1111-1111-1111-111111111111','whatsapp','wamid.AAA1','+60123456789','Ahmad','Nak tanya harga POS','2026-11-10 09:00+08',:'wa_a');
\echo '-- T2 same number new message -> updated, no duplicate'
reset role; update contacts set status='prospek', nota='VIP, jangan lupa' where telefon='+60123456789'; set role service_role;
select capture_lead('11111111-1111-1111-1111-111111111111','whatsapp','wamid.AAA2','+60123456789','Ahmad Baru','Ada promo?','2026-11-10 15:00+08',:'wa_a');
select count(*) as contacts_60123456789, max(status) status, max(nota) nota, max(nama) nama, max(mesej_pertama) first_msg, max(last_contact_at) last_contact from contacts where telefon='+60123456789';
\echo '-- T3 new Meta Lead Ads lead -> created with source Meta Ads'
select capture_lead('11111111-1111-1111-1111-111111111111','meta_lead_ads','lead-9001','+60198887777','Siti','Borang: Nak demo','2026-11-10 10:00+08',:'meta_a');
select sumber, sumber_lead, status, susulan from contacts where telefon='+60198887777';
\echo '-- T5 same event twice -> processed once'
select capture_lead('11111111-1111-1111-1111-111111111111','meta_lead_ads','lead-9001','+60198887777','Siti','Borang: Nak demo','2026-11-10 10:00+08',:'meta_a');
select count(*) as events_lead_9001 from lead_events where external_event_id='lead-9001';
\echo '-- T7 invalid phone -> rejected, no contact'
select capture_lead('11111111-1111-1111-1111-111111111111','meta_lead_ads','lead-9002',null,'Tiada nombor','', now(), :'meta_a');
select capture_lead('11111111-1111-1111-1111-111111111111','api','api-1','0123',' X','', now(), null, 'api');
select count(*) as total_contacts_A from contacts where owner_id='11111111-1111-1111-1111-111111111111';
select keputusan, sebab from lead_events where external_event_id in ('lead-9002','api-1') order by external_event_id;
\echo '-- integration stats'
select nama, jumlah_event, last_success_at is not null ok from integrations order by nama;
\echo '-- errors + retry list'
select log_ralat_integrasi(:'meta_a','11111111-1111-1111-1111-111111111111','meta_lead_ads','lead-9100','graph 503',true);
select log_ralat_integrasi(:'meta_a','11111111-1111-1111-1111-111111111111','meta_lead_ads','lead-9100','graph 503 lagi',true);
select external_event_id, percubaan from ralat_untuk_dicuba(null, 10);
select selesai_ralat(:'meta_a','lead-9100');
select count(*) as pending_after from ralat_untuk_dicuba(null, 10);
reset role;
\echo '-- RLS: user A sees integrations but NOT token/hash'
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select count(*) as a_integrations from integrations;
select token_rahsia from integrations;
select nama, aktif from integrations order by nama;
select count(*) as a_events from lead_events;
\echo '-- A cannot insert integration directly:'
insert into integrations (owner_id, jenis, external_id) values ('11111111-1111-1111-1111-111111111111','whatsapp','555555');
\echo '-- A cannot call capture_lead directly:'
select capture_lead('11111111-1111-1111-1111-111111111111','whatsapp','x','+60111111111');
\echo '-- user B sees nothing'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (select count(*) from integrations) i, (select count(*) from lead_events) e, (select count(*) from integration_errors) r, (select count(*) from contacts) c;
\echo '-- new status Contacted allowed'
reset role; update contacts set status='dihubungi' where telefon='+60198887777'; select status from contacts where telefon='+60198887777';
\echo '-- retention purge'
update lead_events set created_at = now() - interval '200 days' where external_event_id='wamid.AAA1';
set role service_role; select purge_lead_data(); reset role;
select count(*) as events_left, (select count(*) from contacts where telefon='+60123456789') as contact_kept from lead_events;
