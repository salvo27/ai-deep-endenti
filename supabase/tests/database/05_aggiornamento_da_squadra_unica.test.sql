-- base: legacy
-- Aggiornamento da squadra unica (docs/PROGETTI.md, «Aggiornamento dei dati esistenti»): si parte dallo schema di prima
-- con dati di ogni tipo, si applica lo schema di adesso e tutto finisce nel progetto ai-deep-endenti, senza revisioni né
-- menzioni nuove e senza email; rieseguire lo schema non cambia più nulla.
begin;
select plan(46);

create schema t05;

-- Righe per tabella in ogni momento del test.
create table t05.counts (phase text not null, tbl text not null, n bigint not null, primary key (phase, tbl));

create function t05.team_tables()
returns text[]
language sql
immutable
as $$
  select array['members', 'items', 'revisions', 'comments', 'chats', 'chat_messages', 'chat_reads', 'mentions', 'survey_responses',
               'survey_events', 'survey_counts', 'email_weekly', 'email_prefs', 'member_activity', 'ai_usage']
$$;

create function t05.snapshot(p_phase text, p_tables text[])
returns void
language plpgsql
as $$
declare
  t text;
begin
  foreach t in array p_tables loop
    execute format('insert into t05.counts (phase, tbl, n) select %L, %L, count(*) from public.%I', p_phase, t, t);
  end loop;
end
$$;

create function t05.item(p_title text)
returns uuid
language sql
stable
as $$ select id from public.items where title = p_title $$;

grant usage on schema t05 to authenticated, anon;
grant execute on all functions in schema t05 to authenticated, anon;

-- =========================================================================
-- La squadra di prima, con dati di ogni tipo (schema tests/db/legacy-schema.sql)
-- =========================================================================

-- Anna admin, Bruno membro, Carla advisor; Elena è entrata ed è uscita (resta nel registro); Dario entrerà più tardi.
select tests.create_user(u) from unnest(array['b', 'c', 'd', 'e']) u;
select public.add_member('admin@test.it', 'Anna Rossi', 'admin');
select public.add_member('membro@test.it', 'Bruno Verdi', 'member');
select public.add_member('advisor@test.it', 'Carla Neri', 'advisor');
select public.add_member('e@test.example', 'Elena Gialli', 'member');
update public.members set color = '#d94f4f' where user_id = tests.uid('a');
update public.members set color = '#2e9e6b' where user_id = tests.uid('b');
update public.members set color = '#c77d1a' where user_id = tests.uid('c');
update public.members set role = 'admin' where user_id = tests.uid('b');
update public.members set role = 'member' where user_id = tests.uid('b');
delete from public.members where user_id = tests.uid('e');

select tests.login('a');
select public.create_item('idea', 'Integratori su misura', 'esplorazione',
  jsonb_build_object('owner', tests.uid('a'), 'next_step', 'Intervistare cinque nutrizionisti'), null, 'prima idea');
select public.save_item(i.id, i.version, 'Integratori su misura per sportivi', i.status, i.data, null, 'titolo più preciso')
from public.items i where i.title = 'Integratori su misura';
select public.create_item('experiment', 'Landing page', 'pianificato', jsonb_build_object('owner', tests.uid('a')), t05.item('Integratori su misura per sportivi'), null);
select public.create_item('canvas', 'Lean canvas', null, '{}'::jsonb, t05.item('Integratori su misura per sportivi'), null);
select public.create_item('interview', 'Intervista a Marco', 'fatta', '{"source":"diretta","commitment":"pilota"}'::jsonb, t05.item('Integratori su misura per sportivi'), null);
select public.create_item('note', 'Riunione del lunedì', null, jsonb_build_object('body', E'Riunione\n\n@[Bruno Verdi] porta i dati'), t05.item('Integratori su misura per sportivi'), null);
select public.create_item('survey', 'Nutrizionisti', 'aperto', jsonb_build_object(
  'token', 'NutrizionistiLink2026a',
  'questions', jsonb_build_array(jsonb_build_object('id', 'interesse', 'type', 'scala', 'label', 'Quanto ti interessa?', 'scale', jsonb_build_object('points', 5)))
), t05.item('Integratori su misura per sportivi'), null);
select public.create_item('decision', 'Partire dagli sportivi', 'presa', '{}'::jsonb, null, null);
select public.create_item('idea', 'App per la spesa', 'nuova', '{}'::jsonb, null, null);
select public.delete_item(t05.item('App per la spesa'), 1, 'non convince');
select public.create_item('criteria', 'Criteri', null, '{}'::jsonb, null, null);
select public.create_item('expensegroup', 'Costi comuni', null,
  jsonb_build_object('currency', 'EUR', 'people', jsonb_build_array(jsonb_build_object('id', 'anna', 'name', 'Anna', 'member', tests.uid('a')), jsonb_build_object('id', 'bruno', 'name', 'Bruno'))), null, null);
select public.create_item('expense', 'Dominio', null, jsonb_build_object(
  'group', t05.item('Costi comuni'), 'type', 'spesa', 'amount', 1250, 'currency', 'EUR', 'rate', 1, 'date', '2026-10-31', 'paid_by', 'anna',
  'split', jsonb_build_object('mode', 'parti', 'shares', jsonb_build_object('anna', 1, 'bruno', 1))
), null, null);
select public.create_item('score', 'Voti', null, '{}'::jsonb, null, null);
select public.create_item('availability', 'Impegni', null, '{"busy":{"lun":[9,10]}}'::jsonb, null, null);
select public.create_item('timesheet', 'Ore lavorate', null,
  '{"week":"2025-01-06","entries":[{"id":"r1","day":"lun","start":540,"end":600,"area":"prodotto"}]}'::jsonb, null, null);
insert into public.comments (item_id, body) values (t05.item('Integratori su misura per sportivi'), 'Partiamo dai nutrizionisti');
insert into public.chats (title, idea_id) values ('Lancio', t05.item('Integratori su misura per sportivi'));
insert into public.chat_messages (chat_id, body) select id, 'Ciao @[tutti], domani call alle 10' from public.chats where title = 'Lancio';
select public.touch_activity();

select tests.login('b');
insert into public.comments (item_id, body) values (t05.item('Integratori su misura per sportivi'), 'Bella idea @[Anna Rossi]');
insert into public.chat_messages (chat_id, body, reply_to)
select m.chat_id, 'Ci sono', m.id from public.chat_messages m join public.chats c on c.id = m.chat_id where c.title = 'Lancio';
insert into public.chat_messages (chat_id, body) select id, 'Buongiorno a tutti' from public.chats where is_general;
select public.mark_chat_read((select id from public.chats where title = 'Lancio'));
select public.set_email_prefs(true, false);
select public.create_item('score', 'Voti', null, '{}'::jsonb, null, null);

select tests.login('c');
insert into public.comments (item_id, body) values (t05.item('Integratori su misura per sportivi'), 'Attenzione ai costi @[tutti]');
select public.create_item('score', 'Voti', null, '{}'::jsonb, null, null);
select public.create_item('availability', 'Impegni', null, '{"busy":{"mar":[14,15]}}'::jsonb, null, null);
select public.mark_mentions_read();

select tests.anon();
select public.survey_event('NutrizionistiLink2026a', 'view');
select public.survey_event('NutrizionistiLink2026a', 'start');
select public.submit_survey('NutrizionistiLink2026a', '{"interesse":4}',
  '{"session":"11111111-1111-4111-8111-111111111111","final":true,"device":"telefono","duration_seconds":95}');
select public.submit_survey('NutrizionistiLink2026a', '{"interesse":2}', '{"session":"22222222-2222-4222-9222-222222222222","final":false}');

-- Dario entra dopo i messaggi con @[tutti]: un aggiornamento che riscrivesse i testi gli creerebbe menzioni nuove.
select tests.logout();
select public.add_member('estraneo@test.it', 'Dario Blu', 'member');
update public.mentions set emailed_at = '2026-11-20 08:00:00+00' where source = 'note';
insert into public.email_weekly (user_id, week_start) values (tests.uid('a'), '2026-11-23');
insert into public.ai_usage (user_id, task, model, input_tokens, output_tokens) values (tests.uid('a'), 'critique', 'claude-test', 1200, 800);

select t05.snapshot('before', t05.team_tables());
create table t05.members_before as select user_id, display_name, color, role, created_at from public.members;
create table t05.mentions_before as select id, emailed_at, read_at from public.mentions;
create table t05.revisions_before as select id from public.revisions;
create table t05.items_before as select id, kind, idea_id, version, deleted_at from public.items;
create table t05.messages_before as select id, chat_id, reply_to from public.chat_messages;
create table t05.audit_before as select id from public.audit_log;
create table t05.general_before as select id from public.chats where is_general;
create table t05.published_before as select tablename::text from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';

select is_empty(
  $$ select tbl from t05.counts where phase = 'before' and n = 0 $$,
  'before the upgrade every table of the team has rows'
);
select ok(
  (select bool_or(emailed_at is null) and bool_or(emailed_at is not null) from public.mentions),
  'before the upgrade some mentions are already emailed and others are waiting'
);

-- =========================================================================
-- Prima esecuzione dello schema di adesso, dal SQL Editor
-- =========================================================================

\ir ../../schema.sql
set search_path = public, extensions;
select tests.logout();

select results_eq(
  $$ select name from public.projects $$,
  array['ai-deep-endenti'],
  'the upgrade creates exactly one project, named ai-deep-endenti'
);
select ok((select archived_at is null from public.projects where name = 'ai-deep-endenti'), 'and the project is active');

create table t05.project as select id from public.projects where name = 'ai-deep-endenti';
create function t05.p() returns uuid language sql stable as $$ select id from t05.project $$;
-- Righe di una tabella che non stanno in ai-deep-endenti.
create function t05.outside(p_table text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I where project_id is distinct from $1', p_table) into n using t05.p();
  return n;
end
$$;
grant select on t05.project to authenticated, anon;
grant execute on all functions in schema t05 to authenticated, anon;

select t05.snapshot('after', t05.team_tables());
select results_eq(
  $$ select tbl, n from t05.counts where phase = 'after' order by tbl $$,
  $$ select tbl, n from t05.counts where phase = 'before' order by tbl $$,
  'the upgrade keeps every row of every table and adds none'
);
select is(t05.outside('members'), 0::bigint, 'every member of the team is a member of ai-deep-endenti');
select is(t05.outside('items'), 0::bigint, 'every item is in ai-deep-endenti, trash included');
select is(t05.outside('revisions'), 0::bigint, 'every revision is in ai-deep-endenti');
select is(t05.outside('comments'), 0::bigint, 'every comment is in ai-deep-endenti');
select is(t05.outside('chats'), 0::bigint, 'every chat is in ai-deep-endenti');
select is(t05.outside('chat_messages'), 0::bigint, 'every chat message is in ai-deep-endenti');
select is(t05.outside('mentions'), 0::bigint, 'every mention is in ai-deep-endenti');
select is(t05.outside('survey_responses'), 0::bigint, 'every survey response is in ai-deep-endenti');
select is(t05.outside('survey_events'), 0::bigint, 'every survey visit is in ai-deep-endenti');
select is_empty(
  $$ select id from t05.audit_before except select id from public.audit_log where project_id = t05.p() $$,
  'the security log of the team becomes the log of ai-deep-endenti'
);
select results_eq(
  $$ select user_id, project_id, week_start from public.email_weekly $$,
  $$ values (tests.uid('a'), t05.p(), '2026-11-23'::date) $$,
  'a weekly summary already sent stays sent, for ai-deep-endenti'
);
select set_eq(
  $$ select id from public.revisions $$,
  $$ select id from t05.revisions_before $$,
  'the upgrade creates no revision'
);
select set_eq(
  $$ select id from public.mentions $$,
  $$ select id from t05.mentions_before $$,
  'the upgrade creates no mention, not even for who joined after a message to everyone'
);
select set_eq(
  $$ select id, emailed_at, read_at from public.mentions $$,
  $$ select id, emailed_at, read_at from t05.mentions_before $$,
  'emailed_at and read_at stay as they were, so the upgrade sends no email'
);
select set_eq(
  $$ select id, kind, idea_id, version, deleted_at from public.items $$,
  $$ select id, kind, idea_id, version, deleted_at from t05.items_before $$,
  'every item keeps its id, kind, idea, version and place in the trash'
);
select set_eq(
  $$ select id, chat_id, reply_to from public.chat_messages $$,
  $$ select id, chat_id, reply_to from t05.messages_before $$,
  'every message keeps its chat and the message it replies to'
);
select results_eq(
  $$ select id from public.chats where is_general $$,
  $$ select id from t05.general_before $$,
  'the General chat of the team is the only General chat of ai-deep-endenti'
);
select set_eq(
  $$ select user_id, display_name, color from public.profiles $$,
  $$ select user_id, display_name, color from t05.members_before $$,
  'every member gets a profile with their name and colour, and nobody else does'
);
select set_eq(
  $$ select user_id, language from public.profiles $$,
  $$ select user_id, 'it'::text from t05.members_before $$,
  'every member of before gets Italian, the only language of the site they used'
);
select set_eq(
  $$ select user_id, role, created_at from public.members $$,
  $$ select user_id, role, created_at from t05.members_before $$,
  'members keep their role and the day they joined'
);
select hasnt_column('public', 'members', 'display_name', 'the name of a member lives only in the profile');
select hasnt_column('public', 'members', 'color', 'and so does the colour');
select set_eq(
  $$ select user_id from public.platform_admins $$,
  array[tests.uid('a')],
  'the admin of the team becomes the only platform admin'
);

select tests.anon();
select is(
  public.public_survey('NutrizionistiLink2026a') ->> 'status', 'aperto',
  'the public link of the survey still opens after the upgrade'
);
select is(
  public.submit_survey('NutrizionistiLink2026a', '{"interesse":5}', '{"session":"33333333-3333-4333-a333-333333333333","final":true}') ->> 'status', 'ok',
  'and still saves answers'
);
select tests.logout();
select is(
  (select project_id from public.survey_responses where session = '33333333-3333-4333-a333-333333333333'), t05.p(),
  'an answer given after the upgrade belongs to the project of the survey'
);

-- Le funzioni di prima non sapevano niente dei progetti: create or replace non le toglie, l'aggiornamento sì.
select is_empty(
  $$ select s from unnest(array[
       'public.my_role()', 'public.can_read()', 'public.can_write()', 'public.is_admin()',
       'public.add_member(text, text, text)', 'public.members_overview()', 'public.chat_overview()',
       'public.create_item(text, text, text, jsonb, uuid, text)',
       'public.note_image_orphans(text[])', 'public.survey_image_orphans(text[])',
       'public.notify_claim_weekly(uuid, date)', 'public.notify_release_weekly(uuid, date)', 'public.notify_weekly_data(timestamptz)',
       'public.mark_mentions_read(bigint[])'
     ]) s
     where to_regprocedure(s) is not null $$,
  'the single-team functions, which knew no project, are gone after the upgrade'
);
-- Before the projects every member saw every member; now Realtime would send each removal to everyone signed in.
select ok(
  exists (select 1 from t05.published_before where tablename = 'members')
  and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('members', 'profiles')),
  'after the upgrade members are no longer broadcast live'
);
select is_empty(
  $$ select t from unnest(array['members', 'items', 'revisions', 'comments', 'chats', 'chat_messages', 'mentions', 'survey_responses', 'survey_events']) t
     where not exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = t and c.column_name = 'project_id' and c.is_nullable = 'NO'
     ) $$,
  'after the upgrade every project table requires a project'
);
select throws_ok(
  $$ insert into public.items (kind, title, status) values ('idea', 'Senza progetto', 'nuova') $$,
  '23502', null,
  'even from the SQL Editor an item without a project is refused'
);
select tests.login('a');
select lives_ok(
  $$ select public.create_item(t05.p(), 'idea', 'Nuova idea', 'nuova', '{}'::jsonb, null, null) $$,
  'after the upgrade the admin creates items in ai-deep-endenti'
);
select tests.logout();
select is((select project_id from public.items where title = 'Nuova idea'), t05.p(), 'and they belong to it');

-- =========================================================================
-- La vita continua, poi lo schema si riesegue
-- =========================================================================

-- Il progetto cambia nome, Bruno cambia nome e lingua, l'amministrazione passa a lui, Elena torna, nasce un secondo progetto.
select tests.login('a');
select public.rename_project(t05.p(), 'Nutrizione');
select tests.logout();
update public.profiles set display_name = 'Bruna Verdi', language = 'en' where user_id = tests.uid('b');
select public.add_member(t05.p(), 'e@test.example', 'Elena Gialli', 'member');
select is(
  (select language from public.profiles where user_id = tests.uid('e')), null,
  'a profile born after the upgrade chooses no language: it follows the device'
);
insert into public.platform_admins (user_id) values (tests.uid('b'));
delete from public.platform_admins where user_id = tests.uid('a');
insert into public.projects (id, name) values ('bbbbbbbb-0000-4000-8000-000000000002', 'Beta');
insert into public.items (project_id, kind, title, status) values ('bbbbbbbb-0000-4000-8000-000000000002', 'idea', 'Idea beta', 'nuova');

select t05.snapshot('second', t05.team_tables() || array['audit_log', 'projects', 'platform_admins', 'profiles']);
create table t05.projects_second as select id, name, archived_at from public.projects;
create table t05.items_second as select id, project_id, version from public.items;
create table t05.mentions_second as select id, project_id, emailed_at, read_at from public.mentions;
create table t05.members_second as select project_id, user_id, role from public.members;
create table t05.profiles_second as select user_id, display_name, color, language from public.profiles;

\ir ../../schema.sql
set search_path = public, extensions;
select tests.logout();

select t05.snapshot('third', t05.team_tables() || array['audit_log', 'projects', 'platform_admins', 'profiles']);
select results_eq(
  $$ select tbl, n from t05.counts where phase = 'third' order by tbl $$,
  $$ select tbl, n from t05.counts where phase = 'second' order by tbl $$,
  'running the schema again adds or removes no row anywhere'
);
select set_eq(
  $$ select id, name, archived_at from public.projects $$,
  $$ select id, name, archived_at from t05.projects_second $$,
  'running the schema again creates no project and renames none'
);
select set_eq(
  $$ select id, project_id, version from public.items $$,
  $$ select id, project_id, version from t05.items_second $$,
  'and moves no item between projects'
);
select is(
  (select project_id from public.items where title = 'Idea beta'), 'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
  'the items of a project born after the upgrade stay in it'
);
select set_eq(
  $$ select id, project_id, emailed_at, read_at from public.mentions $$,
  $$ select id, project_id, emailed_at, read_at from t05.mentions_second $$,
  'and leaves mentions and their emails as they were'
);
select set_eq(
  $$ select project_id, user_id, role from public.members $$,
  $$ select project_id, user_id, role from t05.members_second $$,
  'and changes no member or role'
);
select set_eq(
  $$ select user_id, display_name, color, language from public.profiles $$,
  $$ select user_id, display_name, color, language from t05.profiles_second $$,
  'a profile changed after the upgrade is not copied over again'
);
select set_eq(
  $$ select user_id from public.platform_admins $$,
  array[tests.uid('b')],
  'the admins of before are not made platform admins again'
);

select * from finish();
rollback;
