-- Data isolation between projects (docs/PROGETTI.md): every content table belongs to a project, the database
-- writes project_id itself and the access rules show everyone only the projects they are a member of.
-- Two projects: P "Alfa Salute" and Q "Beta Logistica".
--   a Anna Ferri    admin of P
--   b Bruno Galli   member of P and of Q
--   c Carla Neri    advisor in P, member in Q
--   1 Marco Rossi   member of P
--   d Dario Conti   admin of Q
--   e Marco Rossi   member of Q (same name as the Marco of P)
--   f               platform admin, creates the two projects
begin;
select plan(129);

-- Helpers of this file, rolled back with it.
create schema iso;
grant usage on schema iso to anon, authenticated, service_role;
create table iso.ids (name text primary key, id uuid not null);
grant select, insert on iso.ids to anon, authenticated, service_role;

create function iso.id(p_name text)
returns uuid
language sql
stable
as $$ select id from iso.ids where name = p_name $$;

-- How a statement went for whoever is logged in: the SQLSTATE it raised, '00000' if none
-- (not 'ok': the runner would count that row as a passed test).
-- Used where the contract allows either a silent fix or a refusal, and the test then checks the data.
create function iso.outcome(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return '00000';
exception when others then
  return sqlstate;
end
$$;

-- Rows an update really touched: the access rules hide the rows of other projects, so 0.
create function iso.touched(p_sql text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end
$$;

-- What a read function gives back, or null when it refuses with 42501: for an outsider both mean "nothing".
create function iso.seen(p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  execute p_sql into v;
  return v;
exception when insufficient_privilege then
  return null;
end
$$;

-- A week of hours with no rows, p_weeks_ago Mondays back (Italian time, as the database).
create function iso.timesheet(p_weeks_ago integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('week', (t.today - extract(isodow from t.today)::int + 1 - 7 * p_weeks_ago)::text, 'entries', '[]'::jsonb)
  from (select (now() at time zone 'Europe/Rome')::date as today) t
$$;

grant execute on all functions in schema iso to anon, authenticated, service_role;

-- =========================================================================
-- Structure: every content table carries its project
-- =========================================================================

select col_not_null('public', 'items', 'project_id', 'every item belongs to a project');
select col_not_null('public', 'revisions', 'project_id', 'every revision belongs to a project');
select col_not_null('public', 'comments', 'project_id', 'every comment belongs to a project');
select col_not_null('public', 'chats', 'project_id', 'every chat belongs to a project');
select col_not_null('public', 'chat_messages', 'project_id', 'every chat message belongs to a project');
select col_not_null('public', 'mentions', 'project_id', 'every mention belongs to a project');
select col_not_null('public', 'survey_responses', 'project_id', 'every survey response belongs to a project');
select col_not_null('public', 'survey_events', 'project_id', 'every survey visit belongs to a project');
select is_empty(
  $$select t from unnest(array['items', 'revisions', 'comments', 'chats', 'chat_messages', 'mentions', 'survey_responses', 'survey_events']) t
    where not exists (
      select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
      where i.indrelid = ('public.' || t)::regclass and a.attname = 'project_id'
    )$$,
  'every content table has an index that starts with project_id'
);
select has_function(
  'public', 'create_item', array['uuid', 'text', 'text', 'text', 'jsonb', 'uuid', 'text'],
  'create_item takes the project as its first argument'
);

-- =========================================================================
-- Two projects and their people
-- =========================================================================

select tests.create_user(u) from unnest(array['a', 'b', 'c', 'd', 'e', '1', 'f']) u;
insert into public.platform_admins (user_id) values (tests.uid('f'));

-- Projects are created only through the function, which also opens their Generale chat.
select tests.login('f');
select public.create_project('Alfa Salute');
select public.create_project('Beta Logistica');
select tests.logout();
insert into iso.ids (name, id) select 'P', id from public.projects where name = 'Alfa Salute';
insert into iso.ids (name, id) select 'Q', id from public.projects where name = 'Beta Logistica';
insert into iso.ids (name, id) select 'gen_p', id from public.chats where project_id = iso.id('P') and is_general;
insert into iso.ids (name, id) select 'gen_q', id from public.chats where project_id = iso.id('Q') and is_general;

insert into public.profiles (user_id, display_name, color) values
  (tests.uid('a'), 'Anna Ferri', '#4f5bd5'),
  (tests.uid('b'), 'Bruno Galli', '#2a9d8f'),
  (tests.uid('c'), 'Carla Neri', '#e76f51'),
  (tests.uid('1'), 'Marco Rossi', '#f4a261'),
  (tests.uid('d'), 'Dario Conti', '#264653'),
  (tests.uid('e'), 'Marco Rossi', '#8a5cf6'),
  (tests.uid('f'), 'Federica Moro', '#6c757d')
on conflict (user_id) do nothing;

insert into public.members (project_id, user_id, role) values
  (iso.id('P'), tests.uid('a'), 'admin'),
  (iso.id('P'), tests.uid('b'), 'member'),
  (iso.id('P'), tests.uid('c'), 'advisor'),
  (iso.id('P'), tests.uid('1'), 'member'),
  (iso.id('Q'), tests.uid('d'), 'admin'),
  (iso.id('Q'), tests.uid('b'), 'member'),
  (iso.id('Q'), tests.uid('c'), 'member'),
  (iso.id('Q'), tests.uid('e'), 'member');

-- =========================================================================
-- One Generale chat per project
-- =========================================================================

select is((select count(*)::int from public.chats where project_id = iso.id('P') and is_general), 1, 'a new project starts with its own Generale chat');
select is((select count(*)::int from public.chats where project_id = iso.id('Q') and is_general), 1, 'so two projects have one each');

-- From the SQL Editor a second general chat in the same project is either refused or not general.
select iso.outcome($$insert into public.chats (project_id, title, is_general) values (iso.id('P'), 'Generale bis', true)$$);
select is((select count(*)::int from public.chats where project_id = iso.id('P') and is_general), 1, 'a project never gets a second Generale chat');

select tests.login('b');
select iso.outcome($$insert into public.chats (project_id, title, is_general) values (iso.id('Q'), 'Annunci', true)$$);
select tests.logout();
select is((select count(*)::int from public.chats where project_id = iso.id('Q') and is_general), 1, 'nor can a member turn a new chat into a second Generale');

-- =========================================================================
-- Items
-- =========================================================================

select tests.login('a');
insert into iso.ids (name, id)
select 'idea_p', r.id from public.create_item(iso.id('P'), 'idea', 'Agenda condivisa per studi dentistici', 'nuova', '{}'::jsonb, null, 'prima idea') r;
select is((select project_id from public.items where id = iso.id('idea_p')), iso.id('P'), 'an item created in a project belongs to that project');
-- The contract does not say which check comes first for a missing project: not found, not allowed or not null all refuse it.
select ok(
  iso.outcome($$select public.create_item(null, 'idea', 'Idea senza progetto', 'nuova', '{}'::jsonb, null, null)$$) in ('P0002', '42501', '23502'),
  'an item cannot be created without a project'
);

-- Ids are the database's: one chosen by the client could copy an id of another project (an image folder is named by it).
select tests.login('b');
select lives_ok(
  $$insert into public.items (id, project_id, kind, title, status) values ('5e1ec7ed-0000-4000-8000-000000000001', iso.id('P'), 'idea', 'Id scelto da Bruno', 'nuova')$$,
  'a member may send an id with an item written directly'
);
select lives_ok(
  $$insert into public.chats (id, project_id, title) values ('5e1ec7ed-0000-4000-8000-000000000002', iso.id('P'), 'Chat con id scelto')$$,
  'and with a chat'
);
select tests.logout();
select ok(
  exists (select 1 from public.items where title = 'Id scelto da Bruno' and project_id = iso.id('P'))
  and not exists (select 1 from public.items where id = '5e1ec7ed-0000-4000-8000-000000000001'),
  'a member cannot choose the id of a new item: the database gives it one'
);
select ok(
  exists (select 1 from public.chats where title = 'Chat con id scelto' and project_id = iso.id('P'))
  and not exists (select 1 from public.chats where id = '5e1ec7ed-0000-4000-8000-000000000002'),
  'nor the id of a new chat'
);

select tests.login('d');
select throws_ok(
  $$select public.create_item(iso.id('P'), 'idea', 'Idea intrusa', 'nuova', '{}'::jsonb, null, null)$$,
  '42501', null,
  'a member of another project cannot create items in it'
);
insert into iso.ids (name, id)
select 'idea_q', r.id from public.create_item(iso.id('Q'), 'idea', 'Consegne a domicilio', 'nuova', '{}'::jsonb, null, null) r;
select is((select project_id from public.items where id = iso.id('idea_q')), iso.id('Q'), 'the admin of Q creates items in Q');
select throws_ok(
  $$select public.create_item(iso.id('Q'), 'canvas', 'Canvas alla cieca', null, '{}'::jsonb, iso.id('idea_p'), null)$$,
  'P0001', null,
  'a member of Q cannot hang an item of Q under an idea of P it cannot even see'
);

select tests.login('b');
select lives_ok(
  $$insert into iso.ids (name, id)
    select 'canvas_p', r.id from public.create_item(iso.id('P'), 'canvas', 'Lean canvas agenda', null, '{}'::jsonb, iso.id('idea_p'), null) r$$,
  'a child item hangs under an idea of its own project'
);
select throws_ok(
  $$select public.create_item(iso.id('Q'), 'canvas', 'Canvas incrociato', null, '{}'::jsonb, iso.id('idea_p'), null)$$,
  'P0001', 'cross_project',
  'a child item cannot hang under an idea of another project, even for a member of both'
);
select throws_ok(
  $$select public.save_item(iso.id('canvas_p'), 1, 'Lean canvas agenda', null, '{}'::jsonb, iso.id('idea_q'), null)$$,
  'P0001', 'cross_project',
  'nor be moved under an idea of another project later'
);
select iso.outcome($$update public.items set project_id = iso.id('Q') where id = iso.id('idea_p')$$);
select tests.logout();
select is((select project_id from public.items where id = iso.id('idea_p')), iso.id('P'), 'the project of an item never changes, even when an update asks for it');
select tests.login('b');
select is(
  iso.touched($$update public.items set title = 'Agenda condivisa per studi e cliniche' where id = iso.id('idea_p')$$), 1,
  'a member of both projects still edits the item where it is'
);

select tests.login('a');
select is((select count(*)::int from public.items where id in (iso.id('idea_p'), iso.id('canvas_p'))), 2, 'a member sees the items of their project');
select is((select count(*)::int from public.items where id = iso.id('idea_q')), 0, 'a member of P alone sees none of the items of Q');
select tests.login('b');
select is((select count(*)::int from public.items where id in (iso.id('idea_p'), iso.id('idea_q'))), 2, 'a member of both projects sees the items of both');
select tests.login('d');
select is((select count(*)::int from public.items where id in (iso.id('idea_p'), iso.id('canvas_p'))), 0, 'a member of another project sees none of its items');
select is(iso.touched($$update public.items set title = 'Agenda di Dario' where id = iso.id('idea_p')$$), 0, 'nor edits them directly');
select iso.outcome($$select public.save_item(iso.id('idea_p'), 2, 'Agenda di Dario', 'nuova', '{}'::jsonb, null, null)$$);
select tests.logout();
select is((select title from public.items where id = iso.id('idea_p')), 'Agenda condivisa per studi e cliniche', 'nor through save_item');

-- =========================================================================
-- Revisions
-- =========================================================================

select set_eq(
  $$select distinct project_id from public.revisions where item_id in (iso.id('idea_p'), iso.id('canvas_p'))$$,
  array[iso.id('P')],
  'the history of the items of P belongs to P'
);
select set_eq(
  $$select distinct project_id from public.revisions where item_id = iso.id('idea_q')$$,
  array[iso.id('Q')],
  'the history of the items of Q belongs to Q'
);
select tests.login('a');
select is((select count(*)::int from public.revisions where item_id = iso.id('idea_p')), 2, 'the members of a project read the history of its items');
select tests.login('d');
select is((select count(*)::int from public.revisions where item_id in (iso.id('idea_p'), iso.id('canvas_p'))), 0, 'a member of another project cannot read it');

-- =========================================================================
-- Comments
-- =========================================================================

select tests.login('b');
select lives_ok(
  $$with c as (
      insert into public.comments (item_id, body, project_id) values (iso.id('idea_p'), 'Sentiamo tre studi a Bologna', iso.id('Q')) returning id
    )
    insert into iso.ids (name, id) select 'comment_p', id from c$$,
  'a comment is accepted even if the client sends the wrong project'
);
select tests.logout();
select is((select project_id from public.comments where id = iso.id('comment_p')), iso.id('P'), 'and it lands in the project of its item');
select tests.login('b');
select iso.outcome($$update public.comments set project_id = iso.id('Q') where id = iso.id('comment_p')$$);
select tests.logout();
select is((select project_id from public.comments where id = iso.id('comment_p')), iso.id('P'), 'editing a comment cannot move it to another project');

select tests.login('d');
select throws_ok(
  $$insert into public.comments (item_id, body, project_id) values (iso.id('idea_p'), 'Commento intruso', iso.id('Q'))$$,
  '42501', null,
  'a member of another project cannot comment its items by sending their own project'
);
select is((select count(*)::int from public.comments where item_id = iso.id('idea_p')), 0, 'nor read their comments');
select tests.login('a');
select is((select count(*)::int from public.comments where item_id = iso.id('idea_p')), 1, 'the members of the project read them');

-- =========================================================================
-- Chats
-- =========================================================================

select tests.login('b');
select lives_ok(
  $$with c as (
      insert into public.chats (project_id, title, idea_id) values (iso.id('P'), 'Prezzi agenda', iso.id('idea_p')) returning id
    )
    insert into iso.ids (name, id) select 'chat_p', id from c$$,
  'a member opens a chat in a project, linked to an idea of that project'
);
select is((select project_id from public.chats where id = iso.id('chat_p')), iso.id('P'), 'the chat belongs to the project it was opened in');
select throws_ok(
  $$insert into public.chats (project_id, title, idea_id) values (iso.id('Q'), 'Prezzi incrociati', iso.id('idea_p'))$$,
  'P0001', 'cross_project',
  'a chat cannot be linked to an idea of another project'
);
with c as (insert into public.chats (project_id, title) values (iso.id('Q'), 'Giri di consegna') returning id)
insert into iso.ids (name, id) select 'chat_q', id from c;
select throws_ok(
  $$update public.chats set idea_id = iso.id('idea_p') where id = iso.id('chat_q')$$,
  'P0001', 'cross_project',
  'nor be linked to it later'
);
select lives_ok(
  $$update public.chats set idea_id = iso.id('idea_q') where id = iso.id('chat_q')$$,
  'while linking a chat to an idea of its own project works'
);
select iso.outcome($$update public.chats set project_id = iso.id('Q') where id = iso.id('chat_p')$$);
select tests.logout();
select is((select project_id from public.chats where id = iso.id('chat_p')), iso.id('P'), 'the project of a chat never changes');

select tests.login('d');
select throws_ok(
  $$insert into public.chats (project_id, title) values (iso.id('P'), 'Chat intrusa')$$,
  '42501', null,
  'a member of another project cannot open chats in it'
);
select is((select count(*)::int from public.chats where id = iso.id('chat_p')), 0, 'nor see its chats');
select tests.login('a');
select is((select count(*)::int from public.chats where is_general), 1, 'a member of one project sees only its own Generale chat');
select tests.login('b');
select is((select count(*)::int from public.chats where is_general), 2, 'a member of two projects sees the Generale chat of both');

-- =========================================================================
-- Chat messages
-- =========================================================================

select tests.login('b');
select lives_ok(
  $$with m as (
      insert into public.chat_messages (chat_id, body, project_id) values (iso.id('chat_p'), 'Quanto lo facciamo pagare al mese?', iso.id('Q')) returning id
    )
    insert into iso.ids (name, id) select 'msg_p', id from m$$,
  'a chat message is accepted even if the client sends the wrong project'
);
select tests.logout();
select is((select project_id from public.chat_messages where id = iso.id('msg_p')), iso.id('P'), 'and it lands in the project of its chat');

select tests.login('d');
select throws_ok(
  $$insert into public.chat_messages (chat_id, body, project_id) values (iso.id('chat_p'), 'Ciao a tutti', iso.id('Q'))$$,
  '42501', null,
  'a member of another project cannot write in its chats by sending their own project'
);
select is((select count(*)::int from public.chat_messages where chat_id = iso.id('chat_p')), 0, 'nor read them');
select tests.login('a');
select is((select count(*)::int from public.chat_messages where chat_id = iso.id('chat_p')), 1, 'the members of the project read them');

select tests.login('b');
select lives_ok(
  $$insert into public.chat_messages (chat_id, body, reply_to) values (iso.id('chat_p'), 'Direi 29 euro', iso.id('msg_p'))$$,
  'a reply quotes a message of the same chat'
);
select throws_ok(
  $$insert into public.chat_messages (chat_id, body, reply_to) values (iso.id('chat_q'), 'Anche qui 29 euro', iso.id('msg_p'))$$,
  'P0001', null,
  'a reply cannot quote a message of a chat of another project'
);
select iso.outcome($$update public.chat_messages set project_id = iso.id('Q') where id = iso.id('msg_p')$$);
select tests.logout();
select is((select project_id from public.chat_messages where id = iso.id('msg_p')), iso.id('P'), 'editing a chat message cannot move it to another project');

-- =========================================================================
-- Chat reads and overview
-- =========================================================================

select tests.login('a');
select public.mark_chat_read(iso.id('chat_p'));
select tests.login('d');
select iso.outcome($$select public.mark_chat_read(iso.id('chat_p'))$$);
select tests.logout();
select ok(
  exists (select 1 from public.chat_reads where user_id = tests.uid('a') and chat_id = iso.id('chat_p')),
  'a member records reading a chat of their project'
);
select ok(
  not exists (select 1 from public.chat_reads where user_id = tests.uid('d') and chat_id = iso.id('chat_p')),
  'a member of another project cannot mark its chats as read'
);

select tests.login('a');
select ok(
  exists (select 1 from public.chat_overview(iso.id('P')) o where o.chat_id = iso.id('chat_p')),
  'the chat overview of a project lists its chats'
);
select tests.login('b');
select ok(
  not exists (select 1 from public.chat_overview(iso.id('Q')) o where o.chat_id in (iso.id('chat_p'), iso.id('gen_p'))),
  'the overview of another project does not list them, even for a member of both'
);
select tests.login('d');
select is(
  coalesce(iso.seen($$select count(*) from public.chat_overview(iso.id('P'))$$), '0'), '0',
  'someone outside a project gets no overview of its chats'
);

-- =========================================================================
-- Mentions
-- =========================================================================

select tests.login('b');
with m as (
  insert into public.chat_messages (chat_id, body) values (iso.id('chat_p'), '@[tutti] domani demo con lo studio Bianchi') returning id
)
insert into iso.ids (name, id) select 'msg_tutti', id from m;
select tests.logout();
select set_eq(
  $$select user_id from public.mentions
    where source_id = iso.id('msg_tutti') and user_id in (tests.uid('a'), tests.uid('c'), tests.uid('1'))$$,
  array[tests.uid('a'), tests.uid('c'), tests.uid('1')],
  '@[tutti] reaches every member of the project of the text'
);
select is(
  (select count(*)::int from public.mentions where source_id = iso.id('msg_tutti') and user_id in (tests.uid('d'), tests.uid('e'))), 0,
  '@[tutti] does not reach the members of other projects'
);
select set_eq(
  $$select distinct project_id from public.mentions where source_id = iso.id('msg_tutti')$$,
  array[iso.id('P')],
  'a mention belongs to the project of its text'
);

select tests.login('a');
with c as (
  insert into public.comments (item_id, body) values (iso.id('idea_p'), '@[Marco Rossi] e @[Dario Conti], potete chiamare lo studio?') returning id
)
insert into iso.ids (name, id) select 'comment_marco', id from c;
select tests.logout();
select ok(
  exists (select 1 from public.mentions where source_id = iso.id('comment_marco') and user_id = tests.uid('1')),
  '@[Name] reaches the member of the project with that name'
);
select ok(
  not exists (select 1 from public.mentions where source_id = iso.id('comment_marco') and user_id = tests.uid('e')),
  'a member of another project with the same name is not mentioned'
);
select ok(
  not exists (select 1 from public.mentions where source_id = iso.id('comment_marco') and user_id = tests.uid('d')),
  'naming someone who is only in another project mentions nobody'
);

select tests.login('d');
with m as (
  insert into public.chat_messages (chat_id, body) values (iso.id('chat_q'), '@[Marco Rossi] e @[Bruno Galli], ci vediamo alle 10?') returning id
)
insert into iso.ids (name, id) select 'msg_q', id from m;
select tests.logout();
select set_eq(
  $$select user_id from public.mentions
    where source_id = iso.id('msg_q') and user_id in (tests.uid('1'), tests.uid('e'), tests.uid('b'))$$,
  array[tests.uid('e'), tests.uid('b')],
  'in Q the same names reach the members of Q: the Marco of Q, not the Marco of P'
);
select set_eq(
  $$select distinct project_id from public.mentions where source_id = iso.id('msg_q')$$,
  array[iso.id('Q')],
  'and those mentions belong to Q'
);

select tests.login('a');
insert into iso.ids (name, id)
select 'note_p', r.id
from public.create_item(iso.id('P'), 'note', 'Verbale con lo studio Bianchi', null, '{"body": "@[tutti] ecco il verbale della riunione"}'::jsonb, null, null) r;
select tests.logout();
select set_eq(
  $$select user_id from public.mentions
    where source_id = iso.id('note_p') and user_id in (tests.uid('b'), tests.uid('c'), tests.uid('1'), tests.uid('d'), tests.uid('e'))$$,
  array[tests.uid('b'), tests.uid('c'), tests.uid('1')],
  '@[tutti] in a note reaches only the members of the project of the note'
);
select tests.login('b');
select is(
  (select count(*)::int from public.mentions where source_id in (iso.id('msg_q'), iso.id('note_p'))), 2,
  'a member of two projects reads their mentions from both'
);

-- «Mark all as read» in one project: the mentions of the other project stay unread, and their email still goes out.
select has_function('public', 'mark_mentions_read', array['uuid', 'bigint[]'], 'marking mentions as read takes the project');
select hasnt_function('public', 'mark_mentions_read', array['bigint[]'], 'the version without a project is gone');
select public.mark_mentions_read(iso.id('Q'), array(select id from public.mentions where source_id = iso.id('note_p')));
select is(
  (select read_at from public.mentions where source_id = iso.id('note_p')), null,
  'the ids of mentions of another project are ignored'
);
select public.mark_mentions_read(iso.id('P'));
select isnt(
  (select read_at from public.mentions where source_id = iso.id('note_p')), null,
  'marking all as read in P marks the mentions of P'
);
select is(
  (select read_at from public.mentions where source_id = iso.id('msg_q')), null,
  'and leaves those of Q unread'
);
select tests.logout();
set role service_role;
select is(
  (select count(*)::int from public.notify_pending_mentions(now() - interval '1 day') where user_id = tests.uid('b') and project_id = iso.id('Q')),
  1,
  'so the mention of Q still waits for its email'
);
reset role;

-- =========================================================================
-- Surveys and their public link
-- =========================================================================

select tests.login('a');
insert into iso.ids (name, id)
select 'survey_p', r.id
from public.create_item(
  iso.id('P'), 'survey', 'Agenda: cosa serve agli studi', 'aperto',
  '{"token": "TokenAlfaSalute0000001", "questions": [{"id": "nota", "type": "breve", "label": "Cosa ti farebbe risparmiare tempo?"}]}'::jsonb,
  iso.id('idea_p'), null
) r;

select tests.login('d');
select throws_ok(
  $$select public.create_item(iso.id('Q'), 'survey', 'Copia', 'bozza', '{"token": "TokenAlfaSalute0000001"}'::jsonb, iso.id('idea_q'), null)$$,
  '23505', null,
  'the public link code of a survey stays unique across all projects'
);
insert into iso.ids (name, id)
select 'survey_q', r.id
from public.create_item(
  iso.id('Q'), 'survey', 'Corrieri: orari e consegne', 'aperto',
  '{"token": "TokenBetaLogistic00002", "questions": [{"id": "nota", "type": "breve", "label": "Quando preferisci ricevere i pacchi?"}]}'::jsonb,
  iso.id('idea_q'), null
) r;

select tests.anon();
select is(
  public.submit_survey(
    'TokenAlfaSalute0000001', '{"nota": "Promemoria automatici ai pazienti"}'::jsonb,
    '{"session": "11111111-1111-4111-8111-111111111111", "final": true}'::jsonb
  ) ->> 'status',
  'ok',
  'someone without an account answers a survey of P through its public link'
);
select public.submit_survey(
  'TokenBetaLogistic00002', '{"nota": "Dopo le 18"}'::jsonb,
  '{"session": "22222222-2222-4222-8222-222222222222", "final": true}'::jsonb
);
select public.survey_event('TokenAlfaSalute0000001', 'view');
select public.survey_event('TokenBetaLogistic00002', 'view');
select tests.logout();
select is((select project_id from public.survey_responses where survey_id = iso.id('survey_p')), iso.id('P'), 'the answer lands in the project of the survey');
select is((select project_id from public.survey_responses where survey_id = iso.id('survey_q')), iso.id('Q'), 'and an answer to a survey of Q lands in Q');
select is((select project_id from public.survey_events where survey_id = iso.id('survey_p')), iso.id('P'), 'so does a visit of the public page');

select tests.login('a');
select is((select count(*)::int from public.survey_responses where survey_id = iso.id('survey_p')), 1, 'the team of P reads the answers of its survey');
select is((select count(*)::int from public.survey_responses where project_id = iso.id('Q')), 0, 'but none of the answers of Q');
select tests.login('d');
select is((select count(*)::int from public.survey_responses where survey_id = iso.id('survey_p')), 0, 'a member of another project cannot read the answers of a survey of P');
select tests.login('b');
select is(
  (select count(*)::int from public.survey_responses where survey_id in (iso.id('survey_p'), iso.id('survey_q'))), 2,
  'a member of both projects reads the answers of both'
);

select tests.login('a');
select ok(
  public.survey_funnel(iso.id('survey_p')) @> '{"views": 1, "completed": 1}'::jsonb,
  'the funnel of a survey counts the visits and answers of its own page only'
);
select tests.login('d');
select ok(iso.seen($$select public.survey_funnel(iso.id('survey_p'))::text$$) is null, 'the funnel of a survey of P shows nothing to another project');

select iso.outcome($$select public.delete_survey_responses(iso.id('survey_p'))$$);
select tests.logout();
select is((select count(*)::int from public.survey_responses where survey_id = iso.id('survey_p')), 1, 'the admin of another project cannot delete the answers of a survey of P');
select tests.login('c');
select iso.outcome($$select public.delete_survey_responses(iso.id('survey_p'))$$);
select tests.logout();
select is((select count(*)::int from public.survey_responses where survey_id = iso.id('survey_p')), 1, 'nor can an advisor of P');
select tests.login('a');
select is(public.delete_survey_responses(iso.id('survey_p')), 1, 'the admin of P deletes the answers of its survey');
select tests.logout();
select is((select count(*)::int from public.survey_responses where survey_id = iso.id('survey_q')), 1, 'which leaves the answers of Q alone');
select tests.login('c');
select is(public.delete_survey_responses(iso.id('survey_q')), 1, 'and the advisor of P deletes answers in Q, where they are a member');

-- =========================================================================
-- Uniqueness per project
-- =========================================================================

select tests.login('b');
select lives_ok($$select public.create_item(iso.id('P'), 'criteria', 'Criteri', null, '{}'::jsonb, null, null)$$, 'a project has its own criteria board');
select lives_ok($$select public.create_item(iso.id('Q'), 'criteria', 'Criteri', null, '{}'::jsonb, null, null)$$, 'another project has its own criteria board too');
select throws_ok(
  $$select public.create_item(iso.id('P'), 'criteria', 'Criteri bis', null, '{}'::jsonb, null, null)$$,
  '23505', null,
  'but a project never has two criteria boards'
);
select lives_ok($$select public.create_item(iso.id('P'), 'generator', 'Generatore', null, '{}'::jsonb, null, null)$$, 'a project has its own idea generator');
select lives_ok($$select public.create_item(iso.id('Q'), 'generator', 'Generatore', null, '{}'::jsonb, null, null)$$, 'another project has its own idea generator too');
select throws_ok(
  $$select public.create_item(iso.id('P'), 'generator', 'Generatore bis', null, '{}'::jsonb, null, null)$$,
  '23505', null,
  'but a project never has two idea generators'
);
select lives_ok($$select public.create_item(iso.id('P'), 'teamcanvas', 'Team canvas', null, '{}'::jsonb, null, null)$$, 'a project has its own team canvas');
select lives_ok($$select public.create_item(iso.id('Q'), 'teamcanvas', 'Team canvas', null, '{}'::jsonb, null, null)$$, 'another project has its own team canvas too');
select throws_ok(
  $$select public.create_item(iso.id('P'), 'teamcanvas', 'Team canvas bis', null, '{}'::jsonb, null, null)$$,
  '23505', null,
  'but a project never has two team canvases'
);
select lives_ok($$select public.create_item(iso.id('P'), 'equity', 'Equity', null, '{}'::jsonb, null, null)$$, 'a project has its own equity split');
select lives_ok($$select public.create_item(iso.id('Q'), 'equity', 'Equity', null, '{}'::jsonb, null, null)$$, 'another project has its own equity split too');
select throws_ok(
  $$select public.create_item(iso.id('P'), 'equity', 'Equity bis', null, '{}'::jsonb, null, null)$$,
  '23505', null,
  'but a project never has two equity splits'
);

select tests.login('c');
select lives_ok($$select public.create_item(iso.id('P'), 'score', 'Voti', null, '{}'::jsonb, null, null)$$, 'an advisor gives their scores in the project where they advise');
select lives_ok($$select public.create_item(iso.id('Q'), 'score', 'Voti', null, '{}'::jsonb, null, null)$$, 'and has separate scores in another project');
select throws_ok(
  $$select public.create_item(iso.id('P'), 'score', 'Voti bis', null, '{}'::jsonb, null, null)$$,
  '23505', null,
  'but only one score per person in each project'
);
select lives_ok(
  $$select public.create_item(iso.id('P'), 'availability', 'Impegni', null, '{"busy": {"lun": [9, 10]}}'::jsonb, null, null)$$,
  'an advisor keeps their availability in the project where they advise'
);
select lives_ok(
  $$select public.create_item(iso.id('Q'), 'availability', 'Impegni', null, '{"busy": {"mar": [14]}}'::jsonb, null, null)$$,
  'and a separate availability in another project'
);
select throws_ok(
  $$select public.create_item(iso.id('P'), 'availability', 'Impegni', null, '{"busy": {"ven": [8]}}'::jsonb, null, null)$$,
  '23505', null,
  'but only one availability per person in each project'
);

select tests.login('b');
select lives_ok(
  $$select public.create_item(iso.id('P'), 'timesheet', 'Ore lavorate', null, iso.timesheet(1), null, null)$$,
  'a member logs a week of hours in a project'
);
select lives_ok(
  $$select public.create_item(iso.id('Q'), 'timesheet', 'Ore lavorate', null, iso.timesheet(1), null, null)$$,
  'and the same week in another project'
);
select throws_ok(
  $$select public.create_item(iso.id('P'), 'timesheet', 'Ore lavorate', null, iso.timesheet(1), null, null)$$,
  '23505', null,
  'but never the same week twice in the same project'
);
select lives_ok(
  $$select public.create_item(iso.id('P'), 'timesheet', 'Ore lavorate', null, iso.timesheet(2), null, null)$$,
  'while another week in the same project is fine'
);

-- =========================================================================
-- Advisors keep their limits project by project
-- =========================================================================

select tests.login('c');
select throws_ok(
  $$select public.create_item(iso.id('P'), 'idea', 'Idea di un advisor', 'nuova', '{}'::jsonb, null, null)$$,
  '42501', null,
  'an advisor of P cannot create items in P'
);
select lives_ok(
  $$select public.create_item(iso.id('Q'), 'idea', 'Ritiro dei resi in negozio', 'nuova', '{}'::jsonb, null, null)$$,
  'the same person creates items in Q, where they are a member'
);
select is(iso.touched($$update public.items set title = 'Agenda di Carla' where id = iso.id('idea_p')$$), 0, 'an advisor of P cannot edit the items of P');
select is(iso.touched($$update public.items set title = 'Consegne a domicilio in giornata' where id = iso.id('idea_q')$$), 1, 'but edits the items of Q');
select lives_ok(
  $$insert into public.comments (item_id, body) values (iso.id('idea_p'), 'Ottimo spunto, sentiamo anche gli igienisti')$$,
  'an advisor still comments in the project where they advise'
);
select lives_ok(
  $$insert into public.chat_messages (chat_id, body) values (iso.id('chat_p'), 'Concordo sul prezzo')$$,
  'and writes in its chats'
);
select throws_ok(
  $$select public.create_item(iso.id('P'), 'timesheet', 'Ore lavorate', null, iso.timesheet(1), null, null)$$,
  '42501', null,
  'an advisor of P cannot log hours in P'
);
select lives_ok(
  $$select public.create_item(iso.id('Q'), 'timesheet', 'Ore lavorate', null, iso.timesheet(1), null, null)$$,
  'but logs hours in Q, where they are a member'
);

select * from finish();
rollback;
