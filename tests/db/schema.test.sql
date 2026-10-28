-- Test del database: permessi, 2FA, storico, conflitti, registro di sicurezza.
-- Utenti di prova: a = admin, b = membro, c = advisor, d = estraneo (account senza ruolo nel team).

\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\o /dev/null

create schema test;
grant usage on schema test to authenticated, anon;

create function test.login(p_user text, p_aal text default 'aal2')
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000000' || p_user, 'aal', p_aal, 'role', 'authenticated')::text,
    false
  );
$$;

create function test.uid(p_user text)
returns uuid
language sql
immutable
as $$ select ('00000000-0000-0000-0000-00000000000' || p_user)::uuid $$;

create function test.expect_error(p_sql text, p_like text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike '%' || p_like || '%' then
      raise exception 'Errore inatteso per [%]: % (atteso: %)', p_sql, sqlerrm, p_like;
    end if;
    return;
  end;
  raise exception 'Nessun errore per [%], atteso: %', p_sql, p_like;
end
$$;

grant execute on all functions in schema test to authenticated, anon;

select public.add_member('admin@test.it', 'Admin', 'admin');
select public.add_member('membro@test.it', 'Membro', 'member');
select public.add_member('advisor@test.it', 'Advisor', 'advisor');

\echo 'ok - tutte le tabelle pubbliche hanno la RLS attiva'
do $$
begin
  assert not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ), 'Una tabella pubblica non ha la RLS';
end
$$;

\echo 'ok - lo schema rifiuta una tabella senza RLS'
create table public.senza_rls (id int);
do $$
begin
  perform test.expect_error($sql$
    do $inner$
    declare t text;
    begin
      for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
        raise exception 'La tabella public.% non ha la Row Level Security attiva', t;
      end loop;
    end $inner$
  $sql$, 'non ha la Row Level Security');
end
$$;
drop table public.senza_rls;

set role anon;

\echo 'ok - le funzioni dei trigger non sono chiamabili dall''esterno'
do $$
declare
  f text;
begin
  foreach f in array array['items_before_write', 'items_after_write', 'comments_before_write', 'members_before_update', 'members_audit'] loop
    assert not has_function_privilege('authenticated', format('public.%I()', f), 'execute'), f || ' eseguibile da authenticated';
    assert not has_function_privilege('anon', format('public.%I()', f), 'execute'), f || ' eseguibile da anon';
  end loop;
end
$$;

\echo 'ok - anon non legge e non scrive nulla'
do $$
begin
  perform test.expect_error('select count(*) from public.items', 'permission denied');
  perform test.expect_error('select count(*) from public.members', 'permission denied');
  perform test.expect_error('select count(*) from public.revisions', 'permission denied');
  perform test.expect_error($q$select public.create_item('idea', 'x', 'nuova', '{}')$q$, 'permission denied');
  perform test.expect_error($q$select public.add_member('x@test.it', 'X')$q$, 'permission denied');
end
$$;

reset role;
set role authenticated;

\echo 'ok - senza 2FA un membro non vede e non scrive nulla'
select test.login('a', 'aal1');
do $$
begin
  assert (select count(*) from public.members) = 0, 'members visibili senza 2FA';
  assert (select count(*) from public.members_overview()) = 0, 'overview visibile senza 2FA';
  perform test.expect_error($q$select public.create_item('idea', 'x', 'nuova', '{}')$q$, 'row-level security');
  assert public.my_role() = 'admin', 'my_role deve rispondere anche senza 2FA';
  assert not public.can_read(), 'can_read senza 2FA';
end
$$;

\echo 'ok - un estraneo con 2FA non vede e non scrive nulla'
select test.login('d');
do $$
begin
  assert public.my_role() is null, 'un estraneo non ha ruolo';
  assert (select count(*) from public.members) = 0, 'estraneo vede i membri';
  perform test.expect_error($q$select public.create_item('idea', 'x', 'nuova', '{}')$q$, 'row-level security');
  perform test.expect_error($q$select public.add_member('membro@test.it', 'X', 'admin')$q$, 'Solo un admin');
end
$$;

\echo 'ok - con 2FA un membro crea un idea e nasce la prima revisione'
select test.login('a');
select set_config('test.idea', (public.create_item('idea', 'Idea alfa', 'nuova', '{"pitch":"uno","problem":"p1"}', null, 'prima versione')).id::text, false);
do $$
declare
  r public.revisions;
begin
  select * into r from public.revisions where item_id = current_setting('test.idea')::uuid;
  assert r.version = 1 and r.op = 'create', 'prima revisione errata';
  assert r.message = 'prima versione', 'messaggio non salvato';
  assert r.author_id = test.uid('a'), 'autore errato';
  assert (select created_by from public.items where id = r.item_id) = test.uid('a'), 'created_by non forzato';
end
$$;

\echo 'ok - i dati inviati dal client non possono falsificare autore e versione'
do $$
declare
  i public.items;
begin
  insert into public.items (kind, title, status, data, version, created_by, created_at)
  values ('idea', 'Falsa', 'nuova', '{}', 77, test.uid('c'), '2000-01-01')
  returning * into i;
  assert i.version = 1 and i.created_by = test.uid('a') and i.created_at > '2020-01-01', 'campi protetti accettati';
end
$$;

\echo 'ok - stati, titoli e collegamenti non validi vengono rifiutati'
do $$
begin
  perform test.expect_error($q$select public.create_item('idea', 'x', 'inventato', '{}')$q$, 'Stato non valido');
  perform test.expect_error($q$select public.create_item('canvas', 'x', 'nuova', '{}', current_setting('test.idea')::uuid)$q$, 'Stato non valido');
  perform test.expect_error($q$select public.create_item('idea', '   ', 'nuova', '{}')$q$, 'titolo');
  perform test.expect_error($q$select public.create_item('experiment', 'Esp', 'pianificato', '{}')$q$, 'appartenere a un''idea');
  perform test.expect_error($q$select public.create_item('decision', 'Dec', 'presa', '{}', current_setting('test.idea')::uuid)$q$, 'non può appartenere');
  perform test.expect_error($q$select public.create_item('idea', 'x', 'nuova', '[1,2]')$q$, 'check constraint');
  perform test.expect_error($q$select public.create_item('idea', repeat('x', 201), 'nuova', '{}')$q$, 'check constraint');
  perform test.expect_error($q$select public.create_item('boh', 'x', null, '{}')$q$, 'non valido');
end
$$;

\echo 'ok - idea_id deve indicare un idea'
do $$
declare
  v_canvas uuid;
begin
  v_canvas := (public.create_item('canvas', 'Canvas', null, '{}', current_setting('test.idea')::uuid)).id;
  perform test.expect_error(format($q$select public.create_item('canvas', 'C2', null, '{}', %L)$q$, v_canvas), 'idea esistente');
end
$$;

\echo 'ok - i nuovi tipi rispettano stati, idea e unicità'
do $$
declare
  v_equity uuid;
  res jsonb;
begin
  perform public.create_item('persona', 'Persona', null, '{}', current_setting('test.idea')::uuid);
  perform public.create_item('contact', 'Chi sentire', 'da_contattare', '{}', current_setting('test.idea')::uuid);
  perform public.create_item('competitors', 'Concorrenti', null, '{"rivals":[{"id":"c-a","name":"A","type":"diretto"}]}', current_setting('test.idea')::uuid);
  perform test.expect_error($q$select public.create_item('contact', 'x', 'sentita', '{}', current_setting('test.idea')::uuid)$q$, 'Stato non valido');
  perform test.expect_error($q$select public.create_item('market', 'Mercato', null, '{}')$q$, 'appartenere a un''idea');
  perform test.expect_error($q$select public.create_item('vpc', '  ', null, '{}', current_setting('test.idea')::uuid)$q$, 'titolo');
  perform public.create_item('teamcanvas', 'Team Canvas', null, '{}');
  perform test.expect_error($q$select public.create_item('teamcanvas', 'Secondo', null, '{}')$q$, 'items_singleton_idx');
  perform test.expect_error($q$select public.create_item('equity', 'Quote', null, '{}', current_setting('test.idea')::uuid)$q$, 'non può appartenere');
  v_equity := (public.create_item('equity', 'Quote', null, '{}')).id;
  res := public.delete_item(v_equity, 1, null);
  assert res ->> 'status' <> 'ok', 'le quote non si archiviano';
end
$$;

\echo 'ok - un membro salva partendo dall ultima versione'
select test.login('b');
do $$
declare
  res jsonb;
  r public.revisions;
begin
  res := public.save_item(current_setting('test.idea')::uuid, 1, 'Idea alfa', 'esplorazione', '{"pitch":"due","problem":"p1","risks":"r"}', null, 'aggiornato pitch');
  assert res ->> 'status' = 'ok', 'salvataggio fallito: ' || res::text;
  assert (res -> 'item' ->> 'version')::int = 2, 'versione non incrementata';
  select * into r from public.revisions where item_id = current_setting('test.idea')::uuid and version = 2;
  assert r.op = 'update' and r.author_id = test.uid('b'), 'revisione 2 errata';
  assert r.changed = array['status', 'pitch', 'risks'], 'campi cambiati errati: ' || array_to_string(r.changed, ',');
end
$$;

\echo 'ok - chi salva da una versione vecchia riceve un conflitto'
select test.login('a');
do $$
declare
  res jsonb;
begin
  res := public.save_item(current_setting('test.idea')::uuid, 1, 'X', 'nuova', '{}');
  assert res ->> 'status' = 'conflict', 'conflitto non rilevato';
  assert (res -> 'item' ->> 'version')::int = 2, 'il conflitto deve restituire la versione attuale';
  assert (select title from public.items where id = current_setting('test.idea')::uuid) = 'Idea alfa', 'il conflitto ha sovrascritto';
end
$$;

\echo 'ok - un salvataggio senza modifiche non crea revisioni'
do $$
declare
  n int := (select count(*) from public.revisions);
  res jsonb;
begin
  res := public.save_item(current_setting('test.idea')::uuid, 2, 'Idea alfa', 'esplorazione', '{"risks":"r","pitch":"due","problem":"p1"}');
  assert res ->> 'status' = 'ok' and (res -> 'item' ->> 'version')::int = 2, 'versione cambiata senza modifiche';
  assert (select count(*) from public.revisions) = n, 'revisione creata senza modifiche';
end
$$;

\echo 'ok - un advisor non crea e non modifica le board'
select test.login('c');
do $$
begin
  perform test.expect_error($q$select public.create_item('idea', 'Idea advisor', 'nuova', '{}')$q$, 'row-level security');
  assert public.save_item(current_setting('test.idea')::uuid, 2, 'Hack', 'nuova', '{}') ->> 'status' = 'forbidden', 'advisor ha modificato';
  assert public.delete_item(current_setting('test.idea')::uuid, 2) ->> 'status' = 'forbidden', 'advisor ha archiviato';
end
$$;

\echo 'ok - un advisor vota e commenta, ma solo a nome proprio'
do $$
declare
  v_score uuid;
  c public.comments;
begin
  v_score := (public.create_item('score', 'Voti di Advisor', null, '{"scores":{}}')).id;
  assert public.save_item(v_score, 1, 'Voti di Advisor', null, '{"scores":{"x":{"a":4}}}') ->> 'status' = 'ok', 'advisor non riesce a votare';
  insert into public.comments (item_id, body, author_id) values (current_setting('test.idea')::uuid, 'Ottimo', test.uid('a')) returning * into c;
  assert c.author_id = test.uid('c'), 'autore del commento falsificabile';
  perform test.expect_error(format($q$insert into public.comments (item_id, body, ai_task) values (%L, 'x', 'inventato')$q$, current_setting('test.idea')), 'check constraint');
  perform test.expect_error(format($q$insert into public.comments (item_id, body) values (%L, '   ')$q$, current_setting('test.idea')), 'check constraint');
end
$$;

\echo 'ok - un membro ha un solo foglio voti e non tocca quello degli altri'
select test.login('b');
do $$
declare
  v_other uuid := (select id from public.items where kind = 'score' and created_by = test.uid('c'));
  n int;
begin
  assert public.save_item(v_other, 2, 'Hack', null, '{}') ->> 'status' = 'forbidden', 'voti altrui modificati';
  perform public.create_item('score', 'Voti di Membro', null, '{"scores":{}}');
  perform test.expect_error($q$select public.create_item('score', 'Secondo', null, '{}')$q$, 'items_one_score_per_member_idx');
  with x as (update public.comments set body = 'hack' where author_id = test.uid('c') returning 1) select count(*) into n from x;
  assert n = 0, 'commento altrui modificato';
end
$$;

\echo 'ok - criteri e griglia del generatore esistono una sola volta e non si archiviano'
do $$
declare
  v_criteria uuid;
begin
  v_criteria := (public.create_item('criteria', 'Criteri', null, '{"criteria":[]}')).id;
  perform test.expect_error($q$select public.create_item('criteria', 'Criteri 2', null, '{}')$q$, 'items_singleton_idx');
  assert public.delete_item(v_criteria, 1) ->> 'status' = 'forbidden', 'criteri archiviati';
end
$$;

\echo 'ok - le fotografie della valutazione sono più di una, con un nome, e si archiviano'
do $$
declare
  v_photo uuid;
begin
  v_photo := (public.create_item('scoresnap', 'Prima della riunione', null, '{"criteria":[],"ideas":[],"votes":{}}')).id;
  perform public.create_item('scoresnap', 'Dopo la riunione', null, '{}');
  perform test.expect_error($q$select public.create_item('scoresnap', '  ', null, '{}')$q$, 'titolo');
  perform test.expect_error($q$select public.create_item('scoresnap', 'X', 'nuova', '{}')$q$, 'Stato non valido');
  perform test.expect_error(format($q$select public.create_item('scoresnap', 'X', null, '{}', %L)$q$, current_setting('test.idea')), 'non può appartenere');
  assert public.delete_item(v_photo, 1) ->> 'status' = 'ok', 'fotografia non archiviata';
end
$$;

\echo 'ok - archiviare e ripristinare lascia traccia e blocca le modifiche nel frattempo'
do $$
declare
  v uuid := current_setting('test.idea')::uuid;
begin
  assert public.delete_item(v, 2, 'non serve') ->> 'status' = 'ok', 'archiviazione fallita';
  assert public.save_item(v, 3, 'X', 'nuova', '{}') ->> 'status' = 'deleted', 'salvato un elemento archiviato';
  assert public.restore_item(v, 'ci ripensiamo') ->> 'status' = 'ok', 'ripristino fallito';
  assert public.restore_item(v) ->> 'status' = 'ok', 'il secondo ripristino deve essere innocuo';
  assert (select array_agg(op order by version) from public.revisions where item_id = v) = array['create', 'update', 'delete', 'restore'], 'storico errato';
end
$$;

\echo 'ok - ripristinare una versione crea una nuova revisione, come git revert'
do $$
declare
  v uuid := current_setting('test.idea')::uuid;
  res jsonb;
  r public.revisions;
begin
  res := public.revert_item(v, 1, 4);
  assert res ->> 'status' = 'ok', 'revert fallito: ' || res::text;
  select * into r from public.revisions where item_id = v and version = 5;
  assert r.op = 'revert' and r.message = 'Ripristinata la versione 1', 'revisione di revert errata';
  assert (select data from public.items where id = v) = '{"pitch":"uno","problem":"p1"}'::jsonb, 'dati non ripristinati';
  assert public.revert_item(v, 1, 4) ->> 'status' = 'conflict', 'revert da versione vecchia accettato';
  assert public.revert_item(v, 99, 5) ->> 'status' = 'not_found', 'revert verso versione inesistente';
  res := public.save_item(v, 5, 'Idea alfa', 'esplorazione', '{"pitch":"tre"}');
  assert (select op from public.revisions where item_id = v and version = 6) = 'update', 'il flag di revert è rimasto attivo';
end
$$;

\echo 'ok - un update diretto senza RPC non aggira i campi protetti'
do $$
declare
  i public.items;
begin
  update public.items set version = 99, created_by = test.uid('c'), kind = 'canvas', title = 'Idea alfa estesa'
   where id = current_setting('test.idea')::uuid
  returning * into i;
  assert i.version = 7 and i.kind = 'idea' and i.created_by = test.uid('a'), 'campi protetti modificati';
  assert (select message from public.revisions where item_id = i.id and version = 7) is null, 'messaggio inventato';
end
$$;

\echo 'ok - lo storico è immutabile e niente si cancella'
do $$
begin
  perform test.expect_error($q$update public.revisions set message = 'falso'$q$, 'permission denied');
  perform test.expect_error($q$delete from public.revisions$q$, 'permission denied');
  perform test.expect_error($q$insert into public.revisions (item_id, version, op, kind, title, data) select id, 50, 'update', 'idea', 'x', '{}' from public.items limit 1$q$, 'permission denied');
  perform test.expect_error($q$delete from public.items$q$, 'permission denied');
end
$$;

\echo 'ok - ruoli: nessuno si promuove da solo, l admin gestisce il team'
do $$
declare
  n int;
begin
  perform test.expect_error(format($q$update public.members set role = 'admin' where user_id = %L$q$, test.uid('b')), 'Solo un admin');
  with x as (update public.members set display_name = 'Membro Due' where user_id = test.uid('b') returning 1) select count(*) into n from x;
  assert n = 1, 'il membro non riesce a cambiare il proprio nome';
  with x as (update public.members set display_name = 'Hack' where user_id = test.uid('a') returning 1) select count(*) into n from x;
  assert n = 0, 'nome altrui modificato';
  with x as (delete from public.members where user_id = test.uid('c') returning 1) select count(*) into n from x;
  assert n = 0, 'un membro ha rimosso qualcuno';
  perform test.expect_error($q$select public.add_member('estraneo@test.it', 'Intruso', 'admin')$q$, 'Solo un admin');
end
$$;

select test.login('a');
do $$
declare
  n int;
begin
  with x as (update public.members set role = 'advisor' where user_id = test.uid('b') returning 1) select count(*) into n from x;
  assert n = 1, 'admin non cambia i ruoli';
  perform test.expect_error(format($q$update public.members set role = 'member' where user_id = %L$q$, test.uid('a')), 'almeno un admin');
  with x as (delete from public.members where user_id = test.uid('a') returning 1) select count(*) into n from x;
  assert n = 0, 'admin ha rimosso se stesso';
  perform public.add_member('estraneo@test.it', 'Nuovo', 'member');
  with x as (delete from public.members where user_id = test.uid('d') returning 1) select count(*) into n from x;
  assert n = 1, 'admin non rimuove un membro';
  perform test.expect_error($q$select public.add_member('nessuno@test.it', 'X')$q$, 'Nessun utente');
end
$$;

\echo 'ok - il registro di sicurezza traccia ingressi, uscite e cambi di ruolo e lo vede solo l admin'
do $$
begin
  assert (select array_agg(event order by id) from public.audit_log where target_id = test.uid('d')) = array['member_added', 'member_removed'], 'ingresso e uscita non tracciati';
  assert exists (
    select 1 from public.audit_log
    where event = 'member_role_changed' and target_id = test.uid('b') and actor_id = test.uid('a')
      and details = '{"from":"member","to":"advisor"}'::jsonb
  ), 'cambio di ruolo non tracciato';
  perform test.expect_error($q$update public.audit_log set event = 'member_added'$q$, 'permission denied');
  perform test.expect_error($q$delete from public.audit_log$q$, 'permission denied');
end
$$;

select test.login('b');
do $$
begin
  assert (select count(*) from public.audit_log) = 0, 'un non admin legge il registro';
  assert (select count(*) from public.ai_usage) = 0, 'ai_usage visibile';
  perform test.expect_error($q$insert into public.ai_usage (user_id, task) values (auth.uid(), 'critique')$q$, 'permission denied');
end
$$;

\echo 'ok - members_overview mostra 2FA e ultimo accesso reale ai membri'
reset role;
update auth.users set last_sign_in_at = now() - interval '3 days' where id = test.uid('c');
insert into auth.sessions (user_id, updated_at, refreshed_at) values (test.uid('c'), now() - interval '2 hours', (now() - interval '1 hour') at time zone 'utc');
select test.login('a');
do $$
begin
  assert (select count(*) from public.members_overview()) = 3, 'overview incompleta';
  assert (select mfa_enabled from public.members_overview() where user_id = test.uid('a')), '2FA non rilevata';
  assert not (select mfa_enabled from public.members_overview() where user_id = test.uid('c')), '2FA inventata';
  assert (select last_sign_in_at >= now() - interval '61 minutes' from public.members_overview() where user_id = test.uid('c')), 'ultimo accesso fermo al login, rinnovo della sessione ignorato';
end
$$;

\echo 'ok - l ultima attività resta quando la sessione si chiude, al massimo una scrittura ogni pochi minuti, mai per gli estranei'
set role authenticated;
select test.login('c');
select public.touch_activity();
reset role;
delete from auth.sessions where user_id = test.uid('c');
update auth.users set last_sign_in_at = now() - interval '8 days' where id = test.uid('c');
update public.member_activity set last_seen_at = now() - interval '2 minutes' where user_id = test.uid('c');
set role authenticated;
select test.login('c');
select public.touch_activity();
select test.login('d');
select public.touch_activity();
reset role;
do $$
begin
  assert (select last_seen_at between now() - interval '3 minutes' and now() - interval '1 minute' from public.member_activity where user_id = test.uid('c')),
    'attività persa con la sessione, o riscritta troppo spesso';
  assert not exists (select 1 from public.member_activity where user_id = test.uid('d')), 'un estraneo salva la sua attività';
end
$$;
update public.member_activity set last_seen_at = '2100-01-01 00:00:00+00' where user_id = test.uid('c');
set role authenticated;
select test.login('a');
do $$
begin
  assert (select count(*) from public.member_activity) = 0, 'la tabella delle attività si legge direttamente';
  assert (select last_sign_in_at = '2100-01-01 00:00:00+00' from public.members_overview() where user_id = test.uid('c')), 'l ultimo accesso ignora l attività salvata';
end
$$;
reset role;
update public.member_activity set last_seen_at = now() where user_id = test.uid('c');
set role authenticated;

\echo 'ok - note: titolo obbligatorio, immagini private solo per il team e orfane trovate dal database'
set role authenticated;
select test.login('a');
do $$
declare
  v_idea text := current_setting('test.idea');
  v_used text := v_idea || '/11111111-1111-4111-8111-111111111111.jpg';
  v_orphan text := v_idea || '/22222222-2222-4222-8222-222222222222.jpg';
begin
  perform test.expect_error($q$select public.create_item('note', '  ', null, '{}', current_setting('test.idea')::uuid)$q$, 'titolo');
  perform public.create_item('note', 'Riunione', null, jsonb_build_object('body', 'Lavagna: ![foto](immagine:' || v_used || ')'), v_idea::uuid, null);
  insert into storage.objects (bucket_id, name) values ('note-immagini', v_used), ('note-immagini', v_orphan);
  perform test.expect_error($q$insert into storage.objects (bucket_id, name) values ('note-immagini', 'cartella/foto.png')$q$, 'row-level security');
  assert (select array_agg(x) from public.note_image_orphans(array[v_used, v_orphan]) x) = array[v_orphan], 'immagine con puntatore considerata orfana';
  assert (select count(*) from public.note_image_orphans()) = 0, 'immagini appena caricate considerate orfane';
end
$$;
select test.login('c');
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'note-immagini') = 2, 'l''advisor non vede le immagini';
  insert into storage.objects (bucket_id, name) values ('note-immagini', current_setting('test.idea') || '/33333333-3333-4333-8333-333333333333.jpg');
  perform test.expect_error($q$insert into storage.objects (bucket_id, name) values ('note-immagini', 'x/y.jpg')$q$, 'row-level security');
  assert (select count(*) from public.note_image_orphans(array['x'])) = 0, 'l''advisor cerca immagini da cancellare';
end
$$;
select test.login('a', 'aal1');
do $$
begin
  assert (select count(*) from storage.objects) = 0, 'immagini visibili senza 2FA';
end
$$;

\echo 'ok - chat: una sola Generale, scrivono anche gli advisor, ognuno modifica i suoi messaggi, non letti per persona'
set role authenticated;
select test.login('a');
do $$
declare
  v_general uuid := (select id from public.chats where is_general);
  v_topic uuid;
  v_msg uuid;
begin
  assert v_general is not null, 'manca la chat Generale';
  insert into public.chats (title, is_general, idea_id) values ('  Nutrizione  ', true, current_setting('test.idea')::uuid) returning id into v_topic;
  assert (select count(*) from public.chats where is_general) = 1, 'creata una seconda chat Generale';
  assert (select title from public.chats where id = v_topic) = 'Nutrizione', 'titolo non ripulito';
  perform test.expect_error(format($q$insert into public.chats (title, idea_id) values ('x', %L)$q$, v_topic), 'solo a un''idea');
  update public.chats set archived_at = now() where id = v_general;
  assert (select archived_at from public.chats where id = v_general) is null, 'archiviata la chat Generale';
  insert into public.chat_messages (chat_id, body, author_id) values (v_topic, 'Ciao', test.uid('c')) returning id into v_msg;
  assert (select author_id from public.chat_messages where id = v_msg) = test.uid('a'), 'autore falsificato';
  perform set_config('test.topic', v_topic::text, false);
  perform set_config('test.msg', v_msg::text, false);
end
$$;
select test.login('c');
do $$
declare
  v_topic uuid := current_setting('test.topic')::uuid;
  v_mine uuid;
begin
  insert into public.chat_messages (chat_id, body) values (v_topic, 'Foto: ![lavagna](immagine:' || current_setting('test.idea') || '/33333333-3333-4333-8333-333333333333.jpg)') returning id into v_mine;
  update public.chat_messages set body = 'cambiato' where id = current_setting('test.msg')::uuid;
  assert (select body from public.chat_messages where id = current_setting('test.msg')::uuid) = 'Ciao', 'modificato il messaggio di un altro';
  perform set_config('test.mine', v_mine::text, false);
  declare
    v_reply uuid;
    v_elsewhere uuid;
  begin
    insert into public.chat_messages (chat_id, body, reply_to) values (v_topic, 'Rispondo', current_setting('test.msg')::uuid) returning id into v_reply;
    assert (select reply_to from public.chat_messages where id = v_reply) = current_setting('test.msg')::uuid, 'risposta non collegata';
    insert into public.chat_messages (chat_id, body) select id, 'Altrove' from public.chats where is_general returning id into v_elsewhere;
    perform test.expect_error(format($q$insert into public.chat_messages (chat_id, body, reply_to) values (%L, 'x', %L)$q$, v_topic, v_elsewhere), 'stessa chat');
    update public.chat_messages set reply_to = v_elsewhere, body = 'Rispondo meglio' where id = v_reply;
    assert (select reply_to from public.chat_messages where id = v_reply) = current_setting('test.msg')::uuid, 'risposta spostata su un altro messaggio';
  end;
end
$$;
select test.login('a');
do $$
declare
  v_topic uuid := current_setting('test.topic')::uuid;
  v_img text := current_setting('test.idea') || '/33333333-3333-4333-8333-333333333333.jpg';
begin
  assert (select unread from public.chat_overview() where chat_id = v_topic) = 2, 'non letti sbagliati';
  perform public.mark_chat_read(v_topic);
  assert (select unread from public.chat_overview() where chat_id = v_topic) = 0, 'lettura non registrata';
  assert (select count(*) from public.note_image_orphans(array[v_img])) = 0, 'immagine di un messaggio considerata orfana';
end
$$;
select test.login('c');
do $$
begin
  update public.chat_messages set deleted_at = now() where id = current_setting('test.mine')::uuid;
  assert (select body from public.chat_messages where id = current_setting('test.mine')::uuid) = 'eliminato', 'il testo eliminato resta nel database';
  perform test.expect_error(format($q$update public.chat_messages set body = 'di nuovo' where id = %L$q$, current_setting('test.mine')), 'già stato eliminato');
end
$$;
select test.login('a');
do $$
begin
  assert (select count(*) from public.note_image_orphans(array[current_setting('test.idea') || '/33333333-3333-4333-8333-333333333333.jpg'])) = 1, 'immagine di un messaggio eliminato non considerata orfana';
  update public.chats set archived_at = now() where id = current_setting('test.topic')::uuid;
  perform test.expect_error(format($q$insert into public.chat_messages (chat_id, body) values (%L, 'tardi')$q$, current_setting('test.topic')), 'archiviata');
end
$$;
select test.login('a', 'aal1');
do $$
begin
  assert (select count(*) from public.chats) = 0, 'chat visibili senza 2FA';
  assert (select count(*) from public.chat_messages) = 0, 'messaggi visibili senza 2FA';
end
$$;

\echo 'ok - menzioni: create dal database, solo per chi è taggato, mai per chi scrive, lette e rimosse con il messaggio'
set role authenticated;
select test.login('c');
do $$
declare
  v_msg uuid;
begin
  insert into public.chat_messages (chat_id, body)
  select id, 'Ciao @[Admin], guarda ![foto](immagine:x/y.jpg) e @[Nessuno] e @[Advisor]' from public.chats where is_general
  returning id into v_msg;
  assert (select count(*) from public.mentions) = 0, 'chi scrive vede menzioni sue o di altri';
  perform set_config('test.mention_msg', v_msg::text, false);
  perform test.expect_error($q$insert into public.mentions (user_id, source, source_id) values (auth.uid(), 'chat', gen_random_uuid())$q$, 'permission denied');
end
$$;
select test.login('a');
do $$
begin
  assert (select count(*) from public.mentions where source = 'chat') = 1, 'menzione in chat mancante';
  assert (select excerpt from public.mentions where source = 'chat') = 'Ciao @Admin, guarda [immagine] e @Nessuno e @Advisor', 'estratto sbagliato';
  perform public.mark_mentions_read();
  assert (select read_at from public.mentions where source = 'chat') is not null, 'menzione non segnata come letta';
  insert into public.comments (item_id, body) values (current_setting('test.idea')::uuid, 'Avviso @[tutti]');
  perform public.create_item('note', 'Riunione', null, '{"body":"Riunione\n\n@[Advisor] porta i dati"}'::jsonb, current_setting('test.idea')::uuid, null);
  assert (select count(*) from public.mentions where source <> 'chat') = 0, 'menzionato da se stesso';
end
$$;
select test.login('c');
do $$
begin
  assert (select count(*) from public.mentions where source = 'comment') = 1, '@[tutti] non arriva';
  assert (select count(*) from public.mentions where source = 'note') = 1, 'menzione nella nota mancante';
  assert (select count(*) from public.mentions where user_id <> auth.uid()) = 0, 'menzioni altrui visibili';
  update public.chat_messages set deleted_at = now() where id = current_setting('test.mention_msg')::uuid;
end
$$;
select test.login('a');
do $$
begin
  assert (select count(*) from public.mentions where source = 'chat') = 0, 'menzione di un messaggio eliminato ancora presente';
end
$$;

\echo 'ok - preferenze email: accese di default, ognuno cambia solo le proprie e solo con 2FA'
select test.login('b');
do $$
declare
  r public.email_prefs;
begin
  assert (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('public.email_prefs'::regclass, 'public.email_weekly'::regclass)), 'RLS mancante sulle tabelle delle email';
  assert (select count(*) from public.email_prefs) = 0, 'preferenze presenti prima di sceglierle';
  r := public.set_email_prefs(false, null);
  assert r.user_id = test.uid('b') and not r.mentions and r.weekly, 'preferenza non salvata: ' || row_to_json(r)::text;
  r := public.set_email_prefs(null, false);
  assert not r.mentions and not r.weekly, 'la seconda scelta ha cambiato la prima';
  r := public.set_email_prefs(true);
  assert r.mentions and not r.weekly, 'riaccensione sbagliata';
  perform test.expect_error($q$insert into public.email_prefs (user_id) values (auth.uid())$q$, 'permission denied');
  perform test.expect_error($q$update public.email_prefs set weekly = true$q$, 'permission denied');
  perform test.expect_error($q$select count(*) from public.email_weekly$q$, 'permission denied');
  perform test.expect_error($q$select count(*) from public.notify_recipients()$q$, 'permission denied');
  perform test.expect_error($q$select public.notify_claim_mentions(array[1::bigint])$q$, 'permission denied');
end
$$;
select test.login('a');
do $$
begin
  assert (select count(*) from public.email_prefs) = 0, 'preferenze altrui visibili';
  perform public.set_email_prefs(false);
  assert (select count(*) from public.email_prefs) = 1, 'la propria riga non si vede';
end
$$;
select test.login('a', 'aal1');
do $$
begin
  perform test.expect_error('select public.set_email_prefs(true, true)', 'verifica in due passaggi');
end
$$;
select test.login('d');
do $$
begin
  perform test.expect_error('select public.set_email_prefs(true, true)', 'verifica in due passaggi');
end
$$;
reset role;
set role anon;
do $$
begin
  perform test.expect_error('select public.set_email_prefs(true, true)', 'permission denied');
end
$$;
reset role;
do $$
begin
  assert (select mentions and not weekly from public.email_prefs where user_id = test.uid('b')), 'preferenze di b cambiate da altri';
  assert (select not mentions and weekly from public.email_prefs where user_id = test.uid('a')), 'preferenze di a sbagliate';
  assert not exists (select 1 from public.email_prefs where user_id = test.uid('d')), 'un estraneo ha salvato preferenze';
end
$$;

\echo 'ok - email: le funzioni di invio le chiama solo la chiave di servizio, destinatari solo membri con 2FA'
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.notify_recipients()', 'public.notify_pending_mentions(timestamptz)', 'public.notify_claim_mentions(bigint[])',
    'public.notify_release_mentions(bigint[])', 'public.notify_claim_weekly(uuid, date)', 'public.notify_release_weekly(uuid, date)',
    'public.notify_weekly_data(timestamptz)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), f || ' eseguibile da anon';
    assert not has_function_privilege('authenticated', f, 'execute'), f || ' eseguibile da authenticated';
    assert has_function_privilege('service_role', f, 'execute'), f || ' non eseguibile dalla funzione';
  end loop;
  foreach f in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_function_privilege(f, 'public.notify_call(text)', 'execute'), 'notify_call eseguibile da ' || f;
  end loop;
end
$$;
insert into auth.mfa_factors (user_id, status) values (test.uid('b'), 'verified'), (test.uid('c'), 'unverified');
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;
set role service_role;
do $$
begin
  assert (select array_agg(user_id order by user_id) from public.notify_recipients()) = array[test.uid('a'), test.uid('b')], 'destinatari sbagliati';
  assert (select email = 'admin@test.it' and not mentions and weekly from public.notify_recipients() where user_id = test.uid('a')), 'email o preferenze di a sbagliate';
  assert (select mentions and not weekly from public.notify_recipients() where user_id = test.uid('b')), 'preferenze di b ignorate';
end
$$;

\echo 'ok - menzioni per email: dettagli per il link, segnate una volta sola, le lette non partono, le rifiutate tornano da inviare'
do $$
declare
  v_ids bigint[];
  v_claimed bigint[];
  m record;
begin
  select array_agg(id order by id) into v_ids from public.notify_pending_mentions(now() - interval '1 day');
  assert array_length(v_ids, 1) >= 3, 'le menzioni nate dopo l''installazione devono essere da inviare';
  select * into m from public.notify_pending_mentions(now() - interval '1 day') where source = 'comment' and user_id = test.uid('b');
  assert m.author_name = 'Admin' and m.item_kind = 'idea' and m.item_title = 'Idea alfa estesa' and m.excerpt = 'Avviso @tutti', 'dettagli della menzione: ' || row_to_json(m)::text;
  assert (select count(*) from public.notify_pending_mentions(now() + interval '1 minute')) = 0, 'filtro per data ignorato';
  update public.mentions set read_at = now() where id = v_ids[1];
  select array_agg(id order by id) into v_claimed from public.notify_claim_mentions(v_ids);
  assert v_claimed = v_ids[2:], 'segnata anche una menzione letta';
  assert (select count(*) from public.notify_claim_mentions(v_ids)) = 0, 'menzioni segnate due volte';
  assert (select count(*) from public.notify_pending_mentions(now() - interval '1 day')) = 0, 'menzioni segnate ancora da inviare';
  perform public.notify_release_mentions(v_claimed);
  assert (select array_agg(id order by id) from public.notify_pending_mentions(now() - interval '1 day')) = v_claimed, 'le rifiutate non tornano da inviare';
end
$$;

\echo 'ok - riepilogo settimanale: uno per persona e per settimana, si può riprovare solo dopo un rifiuto'
do $$
begin
  assert public.notify_claim_weekly(test.uid('a'), '2026-11-02'), 'primo riepilogo non segnato';
  assert not public.notify_claim_weekly(test.uid('a'), '2026-11-02'), 'riepilogo segnato due volte';
  assert public.notify_claim_weekly(test.uid('b'), '2026-11-02'), 'il riepilogo di un altro blocca';
  perform public.notify_release_weekly(test.uid('a'), '2026-11-02');
  assert public.notify_claim_weekly(test.uid('a'), '2026-11-02'), 'dopo un rifiuto non si riprova';
  assert public.notify_claim_weekly(test.uid('a'), '2026-11-09'), 'la settimana dopo non parte';
  assert (select count(*) from public.email_weekly where user_id = test.uid('a')) = 2, 'storico degli invii sbagliato';
end
$$;

\echo 'ok - riepilogo settimanale: interviste fatte, esperimenti conclusi e decisioni prese solo la prima volta, non letti per persona'
reset role;
set role authenticated;
select test.login('a');
select set_config('test.done_before', (public.create_item('interview', 'Intervista vecchia', 'fatta', '{}')).id::text, false);
select public.create_item('interview', 'Intervista nuova', 'fatta', '{"commitment":"pilota","source":"campo"}');
select public.create_item('interview', 'Intervista da fare', 'da_fare', '{}');
select public.create_item('contact', 'Persona da sentire', 'da_contattare', jsonb_build_object('owner', test.uid('a'), 'next_date', '2026-11-03', 'role', 'Ruolo di prova'), current_setting('test.idea')::uuid);
reset role;
update public.revisions set created_at = now() - interval '10 days' where item_id = current_setting('test.done_before')::uuid;
set role authenticated;
select test.login('a');
select public.save_item(current_setting('test.done_before')::uuid, 1, 'Intervista vecchia', 'analizzata', '{}');
reset role;
set role service_role;
do $$
declare
  d jsonb := public.notify_weekly_data(now() - interval '7 days');
  v_reached text[] := (select array_agg(x ->> 'title') from jsonb_array_elements(d -> 'reached') x);
begin
  assert d ?& array['ideas', 'contacts', 'experiments', 'new_ideas', 'busy_ideas', 'reached', 'unread'], 'sezioni mancanti: ' || d::text;
  assert 'Intervista nuova' = any (v_reached), 'intervista fatta questa settimana mancante';
  assert not ('Intervista vecchia' = any (v_reached)), 'intervista già fatta prima contata di nuovo';
  assert not ('Intervista da fare' = any (v_reached)), 'intervista da fare contata';
  assert (select x ->> 'commitment' = 'pilota' and x ->> 'source' = 'campo' from jsonb_array_elements(d -> 'reached') x where x ->> 'title' = 'Intervista nuova'), 'impegno o fonte mancanti';
  assert (select x ->> 'owner' = test.uid('a')::text and x ->> 'next_date' = '2026-11-03' and not x ? 'title' from jsonb_array_elements(d -> 'contacts') x where x ->> 'role' = 'Ruolo di prova'), 'contatto da sentire mancante, o con il nome';
  assert (select (x ->> 'changes')::int > 0 from jsonb_array_elements(d -> 'busy_ideas') x where x ->> 'id' = current_setting('test.idea')), 'modifiche all''idea non contate';
  assert (select (x ->> 'mentions')::int from jsonb_array_elements(d -> 'unread') x where x ->> 'user_id' = test.uid('c')::text)
    = (select count(*) from public.mentions where user_id = test.uid('c') and read_at is null), 'menzioni non lette di c sbagliate';
  assert (select (x ->> 'mentions')::int from jsonb_array_elements(d -> 'unread') x where x ->> 'user_id' = test.uid('c')::text) > 0, 'c non ha menzioni non lette';
  assert (select (x ->> 'chat')::int >= 0 from jsonb_array_elements(d -> 'unread') x where x ->> 'user_id' = test.uid('a')::text), 'non letti in chat mancanti';
end
$$;
reset role;

\echo 'ok - rieseguire lo schema non tocca le menzioni ancora da inviare'
select set_config('request.jwt.claims', '', false);
select set_config('test.pending', (select count(*) from public.mentions where emailed_at is null)::text, false);
set client_min_messages = warning;
\ir ../../supabase/schema.sql
reset client_min_messages;
do $$
begin
  assert current_setting('test.pending')::int > 0, 'nessuna menzione da inviare prima della prova';
  assert (select count(*) from public.mentions where emailed_at is null) = current_setting('test.pending')::int, 'lo schema rieseguito ha segnato menzioni nuove';
end
$$;

\echo 'ok - alla prima installazione le menzioni esistenti si segnano come gestite, quelle dopo restano da inviare'
alter table public.mentions drop column emailed_at;
set client_min_messages = warning;
\ir ../../supabase/schema.sql
reset client_min_messages;
do $$
begin
  assert (select count(*) from public.mentions) > 0, 'nessuna menzione per la prova';
  assert not exists (select 1 from public.mentions where emailed_at is null), 'menzioni esistenti all''installazione ancora da inviare';
end
$$;
set role authenticated;
select test.login('c');
insert into public.chat_messages (chat_id, body) select id, 'Dopo l''installazione @[Admin]' from public.chats where is_general;
reset role;
select set_config('request.jwt.claims', '', false);
set client_min_messages = warning;
\ir ../../supabase/schema.sql
reset client_min_messages;
do $$
begin
  assert (select count(*) from public.mentions where emailed_at is null) = 1, 'la menzione nuova non è da inviare, o lo schema rieseguito l''ha segnata';
  assert (select user_id from public.mentions where emailed_at is null) = test.uid('a'), 'menzione nuova sbagliata';
end
$$;

\echo 'ok - i job programmati non fanno nulla senza Vault, pg_net o segreti, e con i segreti chiamano la funzione'
do $$
begin
  assert public.notify_call('mentions') is null, 'senza Vault e pg_net parte una chiamata';
end
$$;
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create schema net;
create table test.http_calls (url text, body jsonb, headers jsonb, timeout_milliseconds integer);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint
language sql
as $$
  insert into test.http_calls values (url, body, headers, timeout_milliseconds) returning 7::bigint
$$;
do $$
begin
  assert public.notify_call('mentions') is null, 'senza segreti parte una chiamata';
  insert into vault.decrypted_secrets values ('notify_url', 'https://progetto.example/functions/v1/notify');
  assert public.notify_call('mentions') is null, 'senza il segreto condiviso parte una chiamata';
  insert into vault.decrypted_secrets values ('notify_secret', 'segreto-finto-per-i-test');
  assert public.notify_call('weekly') = 7, 'la chiamata non parte';
  assert (select count(*) from test.http_calls) = 1, 'chiamate sbagliate';
  assert (select url = 'https://progetto.example/functions/v1/notify' and body = '{"job":"weekly"}'::jsonb from test.http_calls), 'indirizzo o corpo sbagliati';
  assert (select headers ->> 'x-notify-secret' = 'segreto-finto-per-i-test' from test.http_calls), 'segreto non inviato';
  perform test.expect_error($q$select public.notify_call('tutto')$q$, 'sconosciuto');
end
$$;

reset role;
\echo 'tutti i test del database sono passati'
