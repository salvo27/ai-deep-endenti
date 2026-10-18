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

\echo 'ok - members_overview mostra 2FA e ultimo accesso ai membri'
select test.login('a');
do $$
begin
  assert (select count(*) from public.members_overview()) = 3, 'overview incompleta';
  assert (select mfa_enabled from public.members_overview() where user_id = test.uid('a')), '2FA non rilevata';
  assert not (select mfa_enabled from public.members_overview() where user_id = test.uid('c')), '2FA inventata';
end
$$;

reset role;
\echo 'tutti i test del database sono passati'
