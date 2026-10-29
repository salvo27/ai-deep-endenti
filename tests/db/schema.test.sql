-- Test del database: permessi, 2FA, storico, conflitti, registro di sicurezza, questionari e link pubblico.
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

\echo 'ok - anon esegue solo le tre funzioni del link pubblico dei questionari e non ha permessi su tabelle e sequenze'
do $$
begin
  assert (
    select array_agg(p.proname::text order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  ) = array['public_survey', 'submit_survey', 'survey_event'], 'anon esegue altre funzioni';
  assert not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and (
      (c.relkind in ('r', 'v', 'm', 'p') and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger'))
      or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage, select, update'))
    )
  ), 'anon ha permessi su tabelle o sequenze';
  perform test.expect_error('select count(*) from public.survey_responses', 'permission denied');
  perform test.expect_error('select count(*) from public.survey_events', 'permission denied');
  perform test.expect_error('select count(*) from public.survey_limits', 'permission denied');
  perform test.expect_error('select count(*) from public.survey_salts', 'permission denied');
  perform test.expect_error('select count(*) from public.member_activity', 'permission denied');
  perform test.expect_error($q$insert into public.survey_responses (survey_id, answers) values (gen_random_uuid(), '{}')$q$, 'permission denied');
  perform test.expect_error('select public.survey_funnel(gen_random_uuid())', 'permission denied');
  perform test.expect_error('select public.delete_survey_responses(gen_random_uuid())', 'permission denied');
  perform test.expect_error('select public.survey_client(gen_random_uuid())', 'permission denied');
  perform test.expect_error($q$select public.survey_public_questions('{}')$q$, 'permission denied');
  perform test.expect_error($q$select * from public.survey_by_token('TokenCheNonEsiste00000')$q$, 'permission denied');
  perform test.expect_error('select public.touch_activity()', 'permission denied');
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

-- Questionari. Link di prova: aperto (poi rinnovato), secondo (senza domande obbligatorie), terzo (chiuso).
reset role;
create function test.survey_data(p_token text, p_experiment uuid default null)
returns jsonb
language sql
as $$
  select jsonb_strip_nulls(jsonb_build_object('token', p_token, 'experiment_id', p_experiment)) || $j${
    "intro": "Ci aiuti a capire come organizzi i turni.",
    "privacy": "Le risposte le legge solo il team.",
    "thanks": "Grazie del tempo.",
    "layout": "sezioni",
    "progress": "barra",
    "show_time": false,
    "appearance": {"theme": "scuro", "accent": "#aa3300"},
    "cover": {"path": "aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg", "alt": "Il gruppo di ricerca"},
    "thanks_image": {"path": "aaaaaaaa-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000005.jpg", "alt": "A presto"},
    "thanks_contact": "Ti scriviamo nei prossimi giorni.",
    "questions": [
      {"id": "s-1", "type": "sezione", "label": "Chi sei", "help": "Due domande veloci"},
      {"id": "ruolo", "type": "scelta", "label": "Che lavoro fai?", "required": true, "role": "persona",
       "options": [{"id": "a", "label": "Medico"}, {"id": "b", "label": "Infermiere"}, {"id": "non-rispondo", "label": "Id riservato"}], "allow_other": true},
      {"id": "canali", "type": "scelte", "label": "Dove ti informi?", "role": "persona", "prefer_not": true,
       "options": [{"id": "web", "label": "Siti"}, {"id": "riviste", "label": "Riviste"}], "allow_other": true,
       "other_label": "Un software o un'app", "other_placeholder": "Quale? Scrivi il nome"},
      {"id": "fatica", "type": "scala", "label": "Quanto ti pesa?", "required": true, "role": "problema",
       "scale": {"points": 7, "min_label": "Poco", "max_label": "Molto"}},
      {"id": "ore", "type": "numero", "label": "Quante ore a settimana?", "number": {"min": 0, "max": 80}},
      {"id": "parola", "type": "breve", "label": "In una parola?"},
      {"id": "racconto", "type": "lunga", "label": "Raccontaci l'ultima volta"},
      {"id": "mail", "type": "email", "label": "La tua email", "role": "contatto"},
      {"id": "mail-2", "type": "email", "label": "Un'altra email"},
      {"id": "vuota", "type": "scelta", "label": "Senza opzioni"},
      {"id": "Non Valida", "type": "breve", "label": "Id non valido"}
    ]
  }$j$::jsonb
$$;
-- Un invio completo in una volta sola: sessione nuova e ultimo invio, salvo diversa indicazione in p_meta.
create function test.send(p_token text, p_answers jsonb, p_meta jsonb default '{}')
returns jsonb
language sql
as $$
  select public.submit_survey(p_token, p_answers, jsonb_build_object('session', gen_random_uuid(), 'final', true) || p_meta)
$$;
set role authenticated;
select test.login('a');

\echo 'ok - questionari: stati, titolo, idea, link, impostazioni, aspetto ed esperimento controllati dal database'
do $$
declare
  v_idea uuid := (public.create_item('idea', 'Idea dei questionari', 'esplorazione', '{}')).id;
  v_exp uuid := (public.create_item('experiment', 'Sondaggio online', 'pianificato', '{}', v_idea)).id;
  v_other_exp uuid := (public.create_item('experiment', 'Esperimento di un''altra idea', 'pianificato', '{}', current_setting('test.idea')::uuid)).id;
  v_many jsonb := jsonb_build_object('questions', (select jsonb_agg(jsonb_build_object('id', 'q' || g, 'type', 'breve', 'label', 'D')) from generate_series(1, 41) g));
  s public.items;
begin
  perform set_config('test.sidea', v_idea::text, false);
  perform set_config('test.sexp', v_exp::text, false);
  perform test.expect_error($q$select public.create_item('survey', 'Q', 'bozza', '{}')$q$, 'appartenere a un''idea');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'nuova', '{}', %L)$q$, v_idea), 'Stato non valido');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', null, '{}', %L)$q$, v_idea), 'Stato non valido');
  perform test.expect_error(format($q$select public.create_item('survey', '  ', 'bozza', '{}', %L)$q$, v_idea), 'titolo');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"token":"corto"}', %L)$q$, v_idea), 'link pubblico');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"token":"Token con spazi e punti."}', %L)$q$, v_idea), 'link pubblico');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"token":1234567890123456789012}', %L)$q$, v_idea), 'link pubblico');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"layout":"tutte"}', %L)$q$, v_idea), 'Impostazioni');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"progress":"percentuale"}', %L)$q$, v_idea), 'Impostazioni');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"show_time":"si"}', %L)$q$, v_idea), 'Impostazioni');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"questions":{}}', %L)$q$, v_idea), 'Impostazioni');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', %L, %L)$q$, v_many, v_idea), 'Impostazioni');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"appearance":{"theme":"rosa"}}', %L)$q$, v_idea), 'Aspetto');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"appearance":{"accent":"red"}}', %L)$q$, v_idea), 'Aspetto');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"appearance":{"accent":"#AA3300"}}', %L)$q$, v_idea), 'Aspetto');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"appearance":{"accent":"#aa3300; background: url(x)"}}', %L)$q$, v_idea), 'Aspetto');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"appearance":{"font":"Comic Sans"}}', %L)$q$, v_idea), 'Aspetto');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"appearance":"scuro"}', %L)$q$, v_idea), 'Aspetto');
  perform public.create_item('survey', 'Seppia', 'bozza', '{"appearance":{"theme":"seppia"}}', v_idea::uuid, null);
  perform public.create_item('survey', 'Contrasto', 'bozza', '{"appearance":{"theme":"contrasto"}}', v_idea::uuid, null);
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"cover":"x.jpg"}', %L)$q$, v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"thanks_image":{"path":"https://altro.example/x.jpg"}}', %L)$q$, v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"thanks_image":{"path":"aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg","css":"x"}}', %L)$q$, v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"cover":{"path":"https://altro.example/x.jpg"}}', %L)$q$, v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"cover":{"path":"%1$s"}}', %2$L)$q$, replace('aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg', '.jpg', '.png'), v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"cover":{"path":"aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg","url":"https://altro.example"}}', %L)$q$, v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"cover":{"path":"aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg","alt":12}}', %L)$q$, v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', %L, %L)$q$, jsonb_build_object('cover', jsonb_build_object('path', 'aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg', 'alt', repeat('x', 201))), v_idea), 'Immagine');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"experiment_id":"x"}', %L)$q$, v_idea), 'esperimento collegato non è valido');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"experiment_id":%s}', %L)$q$, to_jsonb(v_other_exp::text), v_idea), 'stessa idea');
  perform test.expect_error(format($q$select public.create_item('survey', 'Q', 'bozza', '{"experiment_id":%s}', %L)$q$, to_jsonb(v_idea::text), v_idea), 'stessa idea');

  s := public.create_item('survey', 'Turni in reparto', 'bozza', test.survey_data('TokenDiProvaAperto0001', v_exp), v_idea, 'nuovo questionario');
  assert s.version = 1 and s.status = 'bozza' and s.idea_id = v_idea, 'questionario non creato';
  perform set_config('test.survey', s.id::text, false);
  perform test.expect_error(format($q$select public.create_item('survey', 'Copia', 'bozza', '{"token":"TokenDiProvaAperto0001"}', %L)$q$, v_idea), 'items_survey_token_idx');
  perform test.expect_error(
    format($q$select public.save_item(%L, 1, 'Turni in reparto', 'bozza', test.survey_data('TokenDiProvaAperto0001', %L), %L)$q$, s.id, v_exp, current_setting('test.idea')),
    'stessa idea'
  );
  perform set_config('test.survey2', (public.create_item('survey', 'Seconda', 'aperto', '{"token":"TokenDiProvaSecondo_02","questions":[{"id":"nota","type":"breve","label":"Qualcosa da aggiungere?"}]}', v_idea)).id::text, false);
  perform set_config('test.survey3', (public.create_item('survey', 'Chiuso', 'chiuso', '{"token":"TokenDiProvaTerzo-0003","questions":[{"id":"nota","type":"breve","label":"Nota"}]}', v_idea)).id::text, false);
end
$$;

\echo 'ok - questionari: il link pubblico mostra solo i questionari aperti, senza identificativi interni'
reset role;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$
begin
  assert public.public_survey('TokenDiProvaAperto0001') = '{"status":"chiuso"}'::jsonb, 'una bozza è visibile';
  assert public.public_survey('TokenDiProvaTerzo-0003') = '{"status":"chiuso"}'::jsonb, 'un questionario chiuso è visibile';
  assert public.public_survey('TokenCheNonEsiste00000') = '{"status":"non_trovato"}'::jsonb, 'link inesistente';
  assert public.public_survey($q$x' or '1'='1$q$) ->> 'status' = 'non_trovato', 'link malformato';
  assert public.public_survey(null) ->> 'status' = 'non_trovato', 'link vuoto';
end
$$;
reset role;
set role authenticated;
select test.login('a');
select public.save_item(current_setting('test.survey')::uuid, 1, 'Turni in reparto', 'aperto', test.survey_data('TokenDiProvaAperto0001', current_setting('test.sexp')::uuid), current_setting('test.sidea')::uuid, 'aperto');
reset role;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$
declare
  r jsonb := public.public_survey('TokenDiProvaAperto0001');
  q jsonb := (select jsonb_object_agg(x ->> 'id', x) from jsonb_array_elements(r -> 'questions') x);
  v_id text;
begin
  assert r ->> 'status' = 'aperto', 'questionario aperto non visibile: ' || r::text;
  assert (select array_agg(k order by k) from jsonb_object_keys(r) k)
    = array['appearance', 'cover', 'intro', 'layout', 'median_seconds', 'privacy', 'progress', 'questions', 'show_time', 'status', 'thanks', 'thanks_contact', 'thanks_image', 'title'], 'campi inattesi: ' || r::text;
  assert r -> 'thanks_image' = '{"path":"aaaaaaaa-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000005.jpg","alt":"A presto"}'::jsonb and r ->> 'thanks_contact' = 'Ti scriviamo nei prossimi giorni.', 'grazie: ' || r::text;
  assert r -> 'cover' = '{"path":"aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg","alt":"Il gruppo di ricerca"}'::jsonb, 'immagine: ' || (r -> 'cover')::text;
  assert r -> 'median_seconds' = 'null'::jsonb, 'durata mediana senza risposte';
  assert r ->> 'title' = 'Turni in reparto' and r ->> 'intro' = 'Ci aiuti a capire come organizzi i turni.' and r ->> 'thanks' = 'Grazie del tempo.', 'testi';
  assert r ->> 'layout' = 'sezioni' and r ->> 'progress' = 'barra' and r -> 'show_time' = 'false'::jsonb, 'impostazioni';
  assert r -> 'appearance' = '{"theme":"scuro","accent":"#aa3300"}'::jsonb, 'aspetto: ' || (r -> 'appearance')::text;
  assert (select array_agg(x ->> 'id' order by n) from jsonb_array_elements(r -> 'questions') with ordinality e (x, n))
    = array['s-1', 'ruolo', 'canali', 'fatica', 'ore', 'parola', 'racconto', 'mail'], 'domande mostrate: ' || (r -> 'questions')::text;
  assert q -> 'ruolo' = '{"id":"ruolo","type":"scelta","label":"Che lavoro fai?","help":"","required":true,"options":[{"id":"a","label":"Medico"},{"id":"b","label":"Infermiere"}],"allow_other":true,"prefer_not":false,"other_label":"Altro","other_placeholder":""}'::jsonb,
    'scelta, senza l''opzione con l''id riservato: ' || (q -> 'ruolo')::text;
  assert q -> 'canali' -> 'prefer_not' = 'true'::jsonb, '«Preferisco non rispondere» mancante';
  assert q -> 'canali' ->> 'other_label' = 'Un software o un''app' and q -> 'canali' ->> 'other_placeholder' = 'Quale? Scrivi il nome', 'voce «Altro» rinominata';
  assert q -> 's-1' = '{"id":"s-1","type":"sezione","label":"Chi sei","help":"Due domande veloci","required":false}'::jsonb, 'sezione: ' || (q -> 's-1')::text;
  assert q -> 'fatica' -> 'scale' = '{"points":7,"min_label":"Poco","max_label":"Molto"}'::jsonb, 'scala';
  assert q -> 'ore' -> 'number' = '{"min":0,"max":80}'::jsonb, 'limiti del numero';
  assert not exists (select 1 from jsonb_array_elements(r -> 'questions') x where x ? 'role'), 'il ruolo interno delle domande è pubblico';
  foreach v_id in array array[current_setting('test.survey'), current_setting('test.sidea'), current_setting('test.sexp'), test.uid('a')::text, 'TokenDiProvaAperto0001'] loop
    assert position(v_id in r::text) = 0, 'identificativo interno nel questionario pubblico: ' || v_id;
  end loop;
end
$$;

\echo 'ok - questionari: ogni risposta si controlla nel database contro le domande salvate'
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}', false);
do $$
declare
  t text := 'TokenDiProvaAperto0001';
  r jsonb;
begin
  r := test.send(
    t,
    '{"ruolo":"a","canali":["web","riviste"],"canali:altro":"Podcast","fatica":6,"ore":12,"parola":"Stress","racconto":"Ieri sera...","mail":"  Persona@Esempio.IT "}',
    '{"duration_seconds":95.4,"recontact":true,"device":"computer","altro":"ignorato"}'
  );
  assert r = '{"status":"ok"}'::jsonb, 'risposta valida rifiutata: ' || r::text;
  r := test.send(t, '{"ruolo:altro":"Farmacista","fatica":1,"parola":null}');
  assert r ->> 'status' = 'ok', '«Altro» non vale come risposta: ' || r::text;
  r := test.send(t, '{"ruolo":"b","fatica":2,"canali":["non-rispondo"]}');
  assert r ->> 'status' = 'ok', '«Preferisco non rispondere» rifiutato: ' || r::text;

  r := test.send(t, '{"ruolo":"z","fatica":3}');
  assert r ->> 'status' = 'errore' and r ->> 'question' = 'ruolo' and r ->> 'reason' = 'Risposte non valide.', 'opzione inventata: ' || r::text;
  assert test.send(t, '{"ruolo":"non-rispondo","fatica":3}') ->> 'question' = 'ruolo', '«Preferisco non rispondere» dove non è previsto';
  assert test.send(t, '{"ruolo":"a","fatica":3,"canali":["non-rispondo","web"]}') ->> 'reason' like '%una sola%', '«Preferisco non rispondere» insieme a un''opzione';
  assert test.send(t, '{"ruolo":"a","fatica":3,"canali":["non-rispondo"],"canali:altro":"Radio"}') ->> 'reason' like '%una sola%', '«Preferisco non rispondere» insieme ad «Altro»';
  assert test.send(t, '{"ruolo":"a","fatica":3,"canali":["web","web"]}') ->> 'question' = 'canali', 'opzioni ripetute';
  assert test.send(t, '{"ruolo":"a","fatica":3,"canali":["tv"]}') ->> 'question' = 'canali', 'opzione multipla inventata';
  assert test.send(t, '{"ruolo":"a","fatica":3,"canali":"web"}') ->> 'question' = 'canali', 'scelta multipla senza elenco';
  assert test.send(t, '{"ruolo":["a"],"fatica":3}') ->> 'question' = 'ruolo', 'scelta singola con elenco';
  r := test.send(t, '{"ruolo":"a"}');
  assert r ->> 'reason' like '%obbligatorie%' and r ->> 'question' = 'fatica', 'domanda obbligatoria mancante: ' || r::text;
  assert test.send(t, '{"ruolo":"","fatica":3}') ->> 'question' = 'ruolo', 'una risposta vuota vale come data';
  assert test.send(t, '{"ruolo":"a","ruolo:altro":"Farmacista","fatica":3}') ->> 'reason' like '%una sola%', 'opzione e «Altro» insieme';
  assert test.send(t, jsonb_build_object('ruolo', 'a', 'fatica', 3, 'parola', repeat('x', 301))) ->> 'reason' like '%troppo lunga%', 'risposta breve troppo lunga';
  assert test.send(t, jsonb_build_object('ruolo', 'a', 'fatica', 3, 'racconto', repeat('x', 3001))) ->> 'question' = 'racconto', 'risposta lunga troppo lunga';
  assert test.send(t, jsonb_build_object('ruolo', 'a', 'fatica', 3, 'canali:altro', repeat('x', 301))) ->> 'question' = 'canali', '«Altro» troppo lungo';
  assert test.send(t, jsonb_build_object('racconto', repeat('x', 25000))) ->> 'reason' like '%troppo lunghe%', 'oltre 20 KB';
  foreach r in array array[
    '{"ruolo":"a","fatica":3,"boh":"x"}', '{"ruolo":"a","fatica":3,"s-1":"x"}', '{"ruolo":"a","fatica":3,"mail-2":"a@esempio.it"}',
    '{"ruolo":"a","fatica":3,"parola:altro":"x"}', '{"ruolo":"a","fatica":3,"vuota":"a"}', '{"ruolo":"a","fatica":3,"Non Valida":"x"}',
    '{"ruolo":"a","fatica":3,":altro":"x"}', '{"ruolo":"a","fatica":3,"parola":5}', '{"ruolo":"a","fatica":3,"s-1":null}'
  ]::jsonb[] loop
    assert test.send(t, r) ->> 'reason' = 'Risposte non valide.', 'chiave o tipo non ammessi: ' || r::text;
  end loop;
  foreach r in array array['{"fatica":8}', '{"fatica":0}', '{"fatica":2.5}', '{"fatica":"3"}']::jsonb[] loop
    assert test.send(t, r || '{"ruolo":"a"}') ->> 'question' = 'fatica', 'scala fuori misura: ' || r::text;
  end loop;
  assert test.send(t, '{"ruolo":"a","fatica":3,"ore":81}') ->> 'reason' like '%intervallo%', 'numero oltre il massimo';
  assert test.send(t, '{"ruolo":"a","fatica":3,"ore":-1}') ->> 'reason' like '%intervallo%', 'numero sotto il minimo';
  assert test.send(t, '{"ruolo":"a","fatica":3,"ore":1.5}') ->> 'reason' like '%intero%', 'numero con decimali';
  assert test.send(t, '{"ruolo":"a","fatica":3,"ore":"12"}') ->> 'reason' like '%intero%', 'numero come testo';
  assert test.send(t, '{"ruolo":"a","fatica":3,"mail":"non-una-mail"}') ->> 'reason' like '%email%', 'email non valida';
  assert test.send(t, jsonb_build_object('ruolo', 'a', 'fatica', 3, 'mail', repeat('x', 250) || '@esempio.it')) ->> 'reason' like '%email%', 'email troppo lunga';
  assert test.send(t, '{"ruolo":"a","fatica":3}', '{"recontact":true}') ->> 'reason' like '%ricontattare%', 'ricontatto senza email';
  assert test.send(t, '{"ruolo":"a","fatica":3,"mail":"a@esempio.it"}', '{"recontact":"si"}') ->> 'reason' = 'Risposte non valide.', 'ricontatto non booleano';
  assert test.send(t, '{"ruolo":"a","fatica":3}', '{"device":"tablet"}') ->> 'reason' = 'Risposte non valide.', 'dispositivo inventato';
  assert test.send(t, '{"ruolo":"a","fatica":3}', '{"final":"si"}') ->> 'reason' = 'Risposte non valide.', 'ultimo invio non booleano';
  foreach r in array array['{"session":null}', '{"session":"x"}', '{"session":5}', '{"session":"6ba7b810-9dad-11d1-80b4-00c04fd430c8"}']::jsonb[] loop
    assert test.send(t, '{"ruolo":"a","fatica":3}', r) ->> 'reason' like '%Sessione%', 'sessione non valida accettata: ' || r::text;
  end loop;
  assert test.send(t, '{"ruolo":"a","fatica":3}', '{"website":"https://spam.example"}') = '{"status":"ok"}'::jsonb, 'il bot si accorge della trappola';
  assert test.send(t, '[1]') ->> 'reason' = 'Risposte non valide.', 'risposte non oggetto';
  assert test.send(t, null) ->> 'status' = 'errore', 'risposte assenti';
  assert public.submit_survey(t, '{"ruolo":"a","fatica":3}', '[1]') ->> 'status' = 'errore', 'meta non oggetto';
  assert test.send('TokenDiProvaTerzo-0003', '{"nota":"x"}') ->> 'reason' like '%chiuso%', 'risposta a un questionario chiuso';
  assert test.send('TokenCheNonEsiste00000', '{"nota":"x"}') ->> 'reason' like '%non trovato%', 'risposta a un link inesistente';
  assert test.send('TokenDiProvaSecondo_02', '{}') ->> 'reason' like '%almeno una%', 'risposta vuota';
  assert test.send('TokenDiProvaSecondo_02', '{"nota":"   "}') ->> 'reason' like '%almeno una%', 'risposta di soli spazi';
end
$$;
reset role;
do $$
declare
  r public.survey_responses;
begin
  assert (select count(*) from public.survey_responses where survey_id = current_setting('test.survey')::uuid) = 3, 'salvate risposte non valide o della trappola';
  assert (select bool_and(completed) from public.survey_responses), 'un invio completo non risulta completo';
  select * into r from public.survey_responses where survey_id = current_setting('test.survey')::uuid and email is not null;
  assert r.email = 'persona@esempio.it' and r.recontact and r.duration_seconds = 95 and r.device = 'computer' and r.saves = 1, 'email, ricontatto, durata o dispositivo: ' || row_to_json(r)::text;
  assert r.answers = '{"ruolo":"a","canali":["web","riviste"],"canali:altro":"Podcast","fatica":6,"ore":12,"parola":"Stress","racconto":"Ieri sera..."}'::jsonb,
    'risposte salvate: ' || r.answers::text;
  assert exists (
    select 1 from public.survey_responses
    where survey_id = current_setting('test.survey')::uuid and answers = '{"ruolo:altro":"Farmacista","fatica":1}'::jsonb
      and email is null and not recontact and duration_seconds is null and device is null
  ), 'risposta con «Altro» salvata male';
  assert exists (
    select 1 from public.survey_responses
    where survey_id = current_setting('test.survey')::uuid and answers = '{"ruolo":"b","fatica":2,"canali":["non-rispondo"]}'::jsonb
  ), 'risposta con «Preferisco non rispondere» salvata male';
end
$$;

\echo 'ok - questionari: si salva una schermata alla volta, le obbligatorie contano solo all ultimo invio, poi la compilazione è chiusa'
set role anon;
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.99"}', false);
do $$
declare
  t text := 'TokenDiProvaAperto0001';
  m jsonb := jsonb_build_object('session', gen_random_uuid());
  m2 jsonb := jsonb_build_object('session', gen_random_uuid());
  m3 jsonb := jsonb_build_object('session', gen_random_uuid());
  r jsonb;
begin
  perform set_config('test.session', m ->> 'session', false);
  perform set_config('test.session2', m2 ->> 'session', false);
  perform set_config('test.session3', m3 ->> 'session', false);
  assert public.submit_survey(t, '{}', m) = '{"status":"ok"}'::jsonb, 'compilazione appena iniziata rifiutata';
  r := public.submit_survey(t, '{"ruolo":"a"}', m || '{"device":"telefono","duration_seconds":20,"recontact":true}');
  assert r = '{"status":"ok"}'::jsonb, 'salvataggio a metà rifiutato: ' || r::text;
  assert public.submit_survey(t, '{"ruolo":"z"}', m) ->> 'question' = 'ruolo', 'a metà compilazione i valori non si controllano';
  assert public.submit_survey(t, jsonb_build_object('parola', repeat('x', 301)), m) ->> 'question' = 'parola', 'a metà compilazione le lunghezze non si controllano';
  assert public.submit_survey(t, '{"ruolo":"b","parola":"Turni"}', m || '{"duration_seconds":40}') ->> 'status' = 'ok', 'secondo salvataggio rifiutato';
  r := public.submit_survey(t, '{"ruolo":"b","parola":"Turni"}', m || '{"final":true}');
  assert r ->> 'question' = 'fatica', 'obbligatorie non controllate all''ultimo invio: ' || r::text;
  assert public.submit_survey(t, '{"ruolo":"b","parola":"Turni","fatica":5}', m || '{"final":true,"duration_seconds":61}') ->> 'status' = 'ok', 'ultimo invio rifiutato';
  assert public.submit_survey(t, '{"ruolo":"a","fatica":1}', m || '{"final":true}') ->> 'reason' like '%già state inviate%', 'una compilazione conclusa cambia ancora';
  assert public.submit_survey(t, '{"ruolo":"a"}', m) ->> 'reason' like '%già state inviate%', 'una compilazione conclusa torna a metà';

  assert public.submit_survey(t, '{"ruolo":"a","canali":["web"]}', m2) ->> 'status' = 'ok', 'compilazione interrotta non salvata';

  for i in 1..60 loop
    assert public.submit_survey(t, '{"ruolo":"a"}', m3) ->> 'status' = 'ok', 'salvataggio ' || i || ' rifiutato';
  end loop;
  assert public.submit_survey(t, '{"ruolo":"b"}', m3) ->> 'reason' like '%Troppi salvataggi%', 'più di 60 salvataggi a metà';
  assert public.submit_survey(t, '{"ruolo":"b","fatica":3}', m3 || '{"final":true}') ->> 'status' = 'ok', 'dopo 60 salvataggi non si può più concludere';
end
$$;
reset role;
do $$
declare
  r public.survey_responses;
begin
  select * into r from public.survey_responses where session = current_setting('test.session')::uuid;
  assert r.completed and r.saves = 3 and r.answers = '{"ruolo":"b","parola":"Turni","fatica":5}'::jsonb, 'compilazione a schermate: ' || row_to_json(r)::text;
  assert r.device = 'telefono' and r.duration_seconds = 61 and not r.recontact and r.updated_at >= r.created_at, 'dati della compilazione: ' || row_to_json(r)::text;
  select * into r from public.survey_responses where session = current_setting('test.session2')::uuid;
  assert not r.completed and r.answers = '{"ruolo":"a","canali":["web"]}'::jsonb, 'compilazione interrotta persa: ' || row_to_json(r)::text;
  select * into r from public.survey_responses where session = current_setting('test.session3')::uuid;
  assert r.completed and r.saves = 61, 'salvataggi contati male: ' || r.saves;
  assert (select count(*) from public.survey_limits where kind = 'session' and survey_id = current_setting('test.survey')::uuid) = 6,
    'i limiti devono contare le compilazioni nuove, non i salvataggi';
end
$$;

\echo 'ok - questionari: limiti per chi risponde e per questionario, con impronte del giorno al posto degli indirizzi'
set role anon;
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}', false);
do $$
declare
  t text := 'TokenDiProvaAperto0001';
  v jsonb := '{"ruolo":"b","fatica":2}';
  r jsonb;
begin
  for i in 1..2 loop
    assert test.send(t, v) ->> 'status' = 'ok', 'compilazione ' || i || ' rifiutata';
  end loop;
  r := test.send(t, v);
  assert r ->> 'reason' like '%più volte%', 'sesta compilazione in un''ora accettata: ' || r::text;
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.9.9.9"}', false);
  assert test.send(t, v) ->> 'reason' like '%più volte%', 'il limite cambia passando da un altro proxy';
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.4"}', false);
  assert test.send(t, v) ->> 'status' = 'ok', 'un altro indirizzo è bloccato';
  perform set_config('request.headers', '', false);
  assert test.send(t, v) ->> 'status' = 'ok', 'senza intestazione non si risponde';
  perform set_config('request.headers', 'non json', false);
  assert test.send(t, v) ->> 'status' = 'ok', 'con intestazioni malformate non si risponde';
end
$$;
reset role;
do $$
declare
  v_survey uuid := current_setting('test.survey')::uuid;
begin
  assert not exists (select 1 from public.survey_limits where client like '%203.0.113%' or client like '%198.51.100%' or client like '%10.0.0%'), 'indirizzo salvato';
  assert (select bool_and(client ~ '^[0-9a-f]{64}$') from public.survey_limits), 'impronta diversa da un hash';
  assert (select count(distinct client) from public.survey_limits where survey_id = v_survey) = 4, 'impronte: tre indirizzi e chi non ha intestazione';
  assert (select array_agg(day) from public.survey_salts) = array[(now() at time zone 'utc')::date], 'un sale solo, quello di oggi';
  update public.survey_limits set created_at = now() - interval '2 hours' where survey_id = v_survey;
  insert into public.survey_limits (survey_id, client, kind, created_at) values (v_survey, 'vecchia', 'view', now() - interval '25 hours');
  insert into public.survey_salts (day, salt) values ((now() at time zone 'utc')::date - 1, 'sale-di-ieri');
  perform set_config('test.salt', (select salt from public.survey_salts where day = (now() at time zone 'utc')::date), false);
end
$$;
set role anon;
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}', false);
do $$
begin
  assert test.send('TokenDiProvaAperto0001', '{"ruolo":"a","fatica":4}') ->> 'status' = 'ok', 'dopo un''ora il limite non si azzera';
end
$$;
reset role;
do $$
declare
  v_survey uuid := current_setting('test.survey')::uuid;
  v_first text;
begin
  assert (select salt from public.survey_salts) = current_setting('test.salt'), 'il sale di oggi è cambiato, o quello di ieri è ancora presente';
  assert not exists (select 1 from public.survey_limits where client = 'vecchia'), 'limiti più vecchi di 24 ore ancora presenti';
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.7"}', false);
  v_first := public.survey_client(v_survey);
  assert public.survey_client(v_survey) = v_first, 'impronta diversa nello stesso giorno';
  assert public.survey_client(current_setting('test.survey2')::uuid) <> v_first, 'stessa impronta su due questionari';
  delete from public.survey_salts;
  assert public.survey_client(v_survey) <> v_first, 'con il sale nuovo l''impronta resta uguale';
end
$$;
update public.survey_responses set created_at = now() - interval '2 minutes';
set role anon;
do $$
declare
  r jsonb;
begin
  for i in 1..30 loop
    perform set_config('request.headers', format('{"x-forwarded-for":"192.0.2.%s"}', i), false);
    r := test.send('TokenDiProvaAperto0001', '{"ruolo":"a","fatica":5}');
    assert r ->> 'status' = 'ok', format('compilazione %s del minuto rifiutata: %s', i, r);
  end loop;
  perform set_config('request.headers', '{"x-forwarded-for":"192.0.2.200"}', false);
  r := test.send('TokenDiProvaAperto0001', '{"ruolo":"a","fatica":5}');
  assert r ->> 'reason' like '%in questo momento%', 'più di 30 compilazioni nuove in un minuto: ' || r::text;
  r := public.submit_survey('TokenDiProvaAperto0001', '{"ruolo":"b","canali":["web"]}', jsonb_build_object('session', current_setting('test.session2')));
  assert r ->> 'status' = 'ok', 'il limite delle compilazioni nuove blocca chi aveva già iniziato: ' || r::text;
end
$$;

\echo 'ok - questionari: la durata mediana si mostra solo con almeno 20 compilazioni complete, e c è un tetto di 5000 risposte'
reset role;
insert into public.survey_responses (survey_id, session, answers, duration_seconds, completed)
select current_setting('test.survey2')::uuid, gen_random_uuid(), '{"nota":"x"}', g * 10, true from generate_series(1, 19) g;
insert into public.survey_responses (survey_id, session, answers, duration_seconds, completed) values
  (current_setting('test.survey2')::uuid, gen_random_uuid(), '{"nota":"interrotta"}', 5, false),
  (current_setting('test.survey2')::uuid, gen_random_uuid(), '{"nota":"senza durata"}', null, true);
set role anon;
do $$
begin
  assert public.public_survey('TokenDiProvaSecondo_02') -> 'median_seconds' = 'null'::jsonb, 'durata mediana con meno di 20 compilazioni complete';
end
$$;
reset role;
insert into public.survey_responses (survey_id, session, answers, duration_seconds, completed)
values (current_setting('test.survey2')::uuid, gen_random_uuid(), '{"nota":"x"}', 200, true);
set role anon;
do $$
begin
  assert public.public_survey('TokenDiProvaSecondo_02') -> 'median_seconds' = '105'::jsonb,
    'durata mediana sbagliata: ' || (public.public_survey('TokenDiProvaSecondo_02') -> 'median_seconds')::text;
end
$$;
reset role;
insert into public.survey_responses (survey_id, session, answers, completed, created_at)
select current_setting('test.survey2')::uuid, gen_random_uuid(), '{"nota":"x"}', true, now() - interval '1 day'
from generate_series(1, 4999 - (select count(*) from public.survey_responses where survey_id = current_setting('test.survey2')::uuid));
set role anon;
select set_config('request.headers', '{"x-forwarded-for":"192.0.2.250"}', false);
do $$
begin
  assert test.send('TokenDiProvaSecondo_02', '{"nota":"ultima"}') ->> 'status' = 'ok', 'la risposta numero 5000 è rifiutata';
  assert test.send('TokenDiProvaSecondo_02', '{"nota":"una di troppo"}') ->> 'reason' like '%non accetta altre%', 'oltre 5000 risposte';
end
$$;

\echo 'ok - questionari: visite e inizi solo per i questionari aperti, con un limite per chi visita'
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.50"}', false);
do $$
begin
  perform public.survey_event('TokenDiProvaAperto0001', 'view');
  perform public.survey_event('TokenDiProvaAperto0001', 'view');
  perform public.survey_event('TokenDiProvaAperto0001', 'start');
  perform public.survey_event('TokenDiProvaAperto0001', 'click');
  perform public.survey_event('TokenDiProvaAperto0001', null);
  perform public.survey_event('TokenDiProvaTerzo-0003', 'view');
  perform public.survey_event('TokenCheNonEsiste00000', 'view');
  perform public.survey_event(null, 'view');
  for i in 1..40 loop
    perform public.survey_event('TokenDiProvaSecondo_02', 'view');
  end loop;
end
$$;
reset role;
do $$
begin
  assert (select count(*) from public.survey_events where survey_id = current_setting('test.survey')::uuid and kind = 'view') = 2, 'visite contate male';
  assert (select count(*) from public.survey_events where survey_id = current_setting('test.survey')::uuid and kind = 'start') = 1, 'inizi contati male';
  assert not exists (select 1 from public.survey_events where survey_id = current_setting('test.survey3')::uuid), 'visita a un questionario chiuso';
  assert (select count(*) from public.survey_events where survey_id = current_setting('test.survey2')::uuid) = 30, 'nessun limite alle visite di una persona';
  perform set_config('test.survey_n', (select count(*) from public.survey_responses where survey_id = current_setting('test.survey')::uuid)::text, false);
end
$$;
select set_config('request.headers', '', false);

\echo 'ok - questionari: risposte e imbuto li vede il team con 2FA, cancellano solo admin e membri'
set role authenticated;
select test.login('c');
do $$
declare
  v_survey uuid := current_setting('test.survey')::uuid;
  n int := current_setting('test.survey_n')::int;
begin
  assert n = 42, 'risposte di prova: ' || n;
  assert (select count(*) from public.survey_responses where survey_id = v_survey) = n, 'l''advisor non legge le risposte';
  assert (select count(*) from public.survey_responses where survey_id = v_survey and not completed) = 1, 'l''advisor non vede le compilazioni interrotte';
  assert public.survey_funnel(v_survey) = jsonb_build_object('views', 2, 'starts', 1, 'partial', 1, 'completed', n - 1), 'imbuto: ' || public.survey_funnel(v_survey)::text;
  perform test.expect_error(format('select public.delete_survey_responses(%L)', v_survey), 'Solo admin e membri');
  perform test.expect_error(format($q$insert into public.survey_responses (survey_id, answers) values (%L, '{}')$q$, v_survey), 'permission denied');
  perform test.expect_error($q$update public.survey_responses set answers = '{}'$q$, 'permission denied');
  perform test.expect_error('delete from public.survey_responses', 'permission denied');
  perform test.expect_error('select count(*) from public.survey_events', 'permission denied');
  perform test.expect_error('select count(*) from public.survey_limits', 'permission denied');
  perform test.expect_error('select count(*) from public.survey_salts', 'permission denied');
  perform test.expect_error(format('select public.survey_client(%L)', v_survey), 'permission denied');
  perform test.expect_error($q$select public.survey_public_questions('{}')$q$, 'permission denied');
end
$$;
select test.login('d');
do $$
begin
  assert (select count(*) from public.survey_responses) = 0, 'un estraneo legge le risposte';
  assert public.survey_funnel(current_setting('test.survey')::uuid) is null, 'un estraneo vede l''imbuto';
  perform test.expect_error(format('select public.delete_survey_responses(%L)', current_setting('test.survey')), 'Solo admin e membri');
end
$$;
select test.login('a', 'aal1');
do $$
begin
  assert (select count(*) from public.survey_responses) = 0, 'risposte visibili senza 2FA';
  assert public.survey_funnel(current_setting('test.survey')::uuid) is null, 'imbuto visibile senza 2FA';
end
$$;
select test.login('b');
do $$
declare
  v_survey uuid := current_setting('test.survey')::uuid;
  v_survey2 uuid := current_setting('test.survey2')::uuid;
  v_one uuid := (select id from public.survey_responses where survey_id = v_survey order by created_at, id limit 1);
  v_other uuid := (select id from public.survey_responses where survey_id = v_survey2 limit 1);
begin
  assert public.delete_survey_responses(v_survey, array[v_one, v_other]) = 1, 'cancellata la risposta di un altro questionario';
  assert not exists (select 1 from public.survey_responses where id = v_one), 'risposta non cancellata';
  assert exists (select 1 from public.survey_responses where id = v_other), 'risposta di un altro questionario cancellata';
  assert public.delete_survey_responses(v_survey, '{}') = 0, 'un elenco vuoto cancella qualcosa';
  assert public.delete_survey_responses(v_survey2) = 5000, 'non cancellate tutte le risposte';
  assert public.survey_funnel(v_survey2) = '{"views":0,"starts":0,"partial":0,"completed":0}'::jsonb, 'visite e inizi non azzerati: ' || public.survey_funnel(v_survey2)::text;
  assert public.survey_funnel(v_survey) ->> 'views' = '2', 'azzerate le visite di un altro questionario';
end
$$;
reset role;
do $$
begin
  assert not exists (select 1 from public.survey_limits where survey_id = current_setting('test.survey2')::uuid), 'limiti non azzerati';
  assert exists (select 1 from public.survey_limits where survey_id = current_setting('test.survey')::uuid), 'azzerati i limiti di un altro questionario';
end
$$;

\echo 'ok - questionari: con il questionario o l idea nel cestino risposte e link spariscono, e tornano col ripristino'
set role authenticated;
select test.login('a');
do $$
declare
  v_survey uuid := current_setting('test.survey')::uuid;
  v_idea uuid := current_setting('test.sidea')::uuid;
  n int := (select count(*) from public.survey_responses where survey_id = current_setting('test.survey')::uuid);
begin
  assert n > 0, 'nessuna risposta per la prova';
  assert public.delete_item(v_survey, (select version from public.items where id = v_survey)) ->> 'status' = 'ok', 'questionario non archiviato';
  assert (select count(*) from public.survey_responses where survey_id = v_survey) = 0, 'risposte visibili con il questionario nel cestino';
  assert public.survey_funnel(v_survey) is null, 'imbuto visibile con il questionario nel cestino';
  assert public.delete_survey_responses(v_survey) = 0, 'risposte cancellate dal cestino';
  assert public.public_survey('TokenDiProvaAperto0001') ->> 'status' = 'non_trovato', 'link attivo con il questionario nel cestino';
  perform public.restore_item(v_survey);
  assert (select count(*) from public.survey_responses where survey_id = v_survey) = n, 'risposte perse col ripristino';
  assert public.delete_item(v_idea, (select version from public.items where id = v_idea)) ->> 'status' = 'ok', 'idea non archiviata';
  assert (select count(*) from public.survey_responses where survey_id = v_survey) = 0, 'risposte visibili con l''idea nel cestino';
  assert public.public_survey('TokenDiProvaAperto0001') ->> 'status' = 'non_trovato', 'link attivo con l''idea nel cestino';
  perform public.restore_item(v_idea);
  assert (select count(*) from public.survey_responses where survey_id = v_survey) = n, 'risposte perse col ripristino dell''idea';
  assert public.public_survey('TokenDiProvaAperto0001') ->> 'status' = 'aperto', 'link spento dopo il ripristino';
end
$$;

\echo 'ok - questionari: un link nuovo revoca quello vecchio, e cancellare davvero un questionario elimina risposte e visite'
do $$
declare
  v_survey uuid := current_setting('test.survey')::uuid;
  res jsonb;
begin
  res := public.save_item(
    v_survey, (select version from public.items where id = v_survey), 'Turni in reparto', 'aperto',
    test.survey_data('TokenNuovoDopoLaFuga01', current_setting('test.sexp')::uuid), current_setting('test.sidea')::uuid, 'nuovo link'
  );
  assert res ->> 'status' = 'ok', 'link non cambiato: ' || res::text;
  assert public.public_survey('TokenDiProvaAperto0001') ->> 'status' = 'non_trovato', 'il link vecchio funziona ancora';
  assert public.public_survey('TokenNuovoDopoLaFuga01') ->> 'status' = 'aperto', 'il link nuovo non funziona';
end
$$;
reset role;
do $$
declare
  v_closed uuid := current_setting('test.survey3')::uuid;
begin
  insert into public.survey_responses (survey_id, session, answers) values (v_closed, gen_random_uuid(), '{"nota":"x"}');
  insert into public.survey_events (survey_id, kind) values (v_closed, 'view');
  delete from public.items where id = v_closed;
  assert not exists (select 1 from public.survey_responses where survey_id = v_closed), 'risposte rimaste dopo la cancellazione definitiva';
  assert not exists (select 1 from public.survey_events where survey_id = v_closed), 'visite rimaste dopo la cancellazione definitiva';
end
$$;
set role authenticated;

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

\echo 'ok - questionari: immagine della copertina nello spazio pubblico, caricata solo da chi modifica, orfane trovate dal database'
reset role;
do $$
begin
  assert (select public and file_size_limit = 1048576 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'questionari-immagini'), 'spazio delle immagini dei questionari';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and qual like '%questionari-immagini%'), 'regola di lettura: si potrebbero elencare i file';
end
$$;
set role authenticated;
select test.login('a');
do $$
declare
  v_used text := 'aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000002.jpg';
  v_orphan text := 'aaaaaaaa-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000003.jpg';
  v_thanks text := 'aaaaaaaa-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000005.jpg';
begin
  insert into storage.objects (bucket_id, name) values ('questionari-immagini', v_used), ('questionari-immagini', v_orphan), ('questionari-immagini', v_thanks);
  assert (select count(*) from public.survey_image_orphans(array[v_thanks])) = 0, 'immagine del grazie considerata orfana';
  perform test.expect_error($q$insert into storage.objects (bucket_id, name) values ('questionari-immagini', 'cartella/foto.png')$q$, 'row-level security');
  assert (select array_agg(x) from public.survey_image_orphans(array[v_used, v_orphan]) x) = array[v_orphan], 'immagine in uso considerata orfana';
  assert (select count(*) from public.survey_image_orphans()) = 0, 'immagini appena caricate considerate orfane';
end
$$;
select test.login('c');
do $$
begin
  perform test.expect_error($q$insert into storage.objects (bucket_id, name) values ('questionari-immagini', 'aaaaaaaa-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000004.jpg')$q$, 'row-level security');
  assert (select count(*) from public.survey_image_orphans(array['x'])) = 0, 'l''advisor cerca immagini da cancellare';
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
