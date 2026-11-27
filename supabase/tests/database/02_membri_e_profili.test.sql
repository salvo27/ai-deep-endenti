-- Members and profiles (docs/PROGETTI.md): a person is in each project with a role of that project, while name,
-- colour and language live in one profile valid everywhere. Who adds, promotes and removes people, who sees whom.
begin;
select plan(149);

-- =========================================================================
-- What exists
-- =========================================================================

select has_table('public', 'profiles', 'there is a table of profiles');
select columns_are('public', 'profiles', array['user_id', 'display_name', 'color', 'language', 'created_at'], 'a profile holds name, colour and language of a person');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.profiles')), false), 'profiles are protected by row level security');
select columns_are('public', 'members', array['project_id', 'user_id', 'role', 'created_at'], 'a membership is a project, a person and a role: name and colour moved to profiles');
select col_is_pk('public', 'members', array['project_id', 'user_id'], 'a person is in a project at most once, and can be in many projects');
select ok(not has_table_privilege('authenticated', 'public.members', 'INSERT'), 'nobody joins a project by writing members directly');
select ok(not has_table_privilege('anon', 'public.members', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), 'someone without an account cannot touch members');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), 'someone without an account cannot touch profiles');

select has_function('public', 'my_role', array['uuid'], 'my_role(p_project) exists');
select has_function('public', 'can_read', array['uuid'], 'can_read(p_project) exists');
select has_function('public', 'can_write', array['uuid'], 'can_write(p_project) exists');
select has_function('public', 'is_admin', array['uuid'], 'is_admin(p_project) exists');
select has_function('public', 'can_manage', array['uuid'], 'can_manage(p_project) exists');
select has_function('public', 'add_member', array['uuid', 'text', 'text', 'text'], 'add_member(p_project, p_email, p_display_name, p_role) exists');
select has_function('public', 'members_overview', array['uuid'], 'members_overview(p_project) exists');
select hasnt_function('public', 'my_role', array[]::name[], 'my_role without a project no longer exists');
select hasnt_function('public', 'can_read', array[]::name[], 'can_read without a project no longer exists');
select hasnt_function('public', 'can_write', array[]::name[], 'can_write without a project no longer exists');
select hasnt_function('public', 'is_admin', array[]::name[], 'is_admin without a project no longer exists');
select hasnt_function('public', 'members_overview', array[]::name[], 'members_overview without a project no longer exists');
select hasnt_function('public', 'add_member', array['text', 'text', 'text'], 'add_member without a project no longer exists');

select ok(bool_and(has_function_privilege('authenticated', f, 'execute')), 'the site can call the role functions, add_member and members_overview')
from unnest(array[
  'public.my_role(uuid)', 'public.can_read(uuid)', 'public.can_write(uuid)', 'public.is_admin(uuid)', 'public.can_manage(uuid)',
  'public.add_member(uuid, text, text, text)', 'public.members_overview(uuid)'
]) f;
select ok(not bool_or(has_function_privilege('anon', f, 'execute')), 'someone without an account can call none of them')
from unnest(array[
  'public.my_role(uuid)', 'public.can_read(uuid)', 'public.can_write(uuid)', 'public.is_admin(uuid)', 'public.can_manage(uuid)',
  'public.add_member(uuid, text, text, text)', 'public.members_overview(uuid)'
]) f;

-- =========================================================================
-- Cast: a = platform admin in no project; Alfa: b admin, c member, d advisor; Beta: e admin, b member, 2 member;
-- f = registered, in no project; 1 and 3 = registered, without a profile yet.
-- =========================================================================

select tests.create_user(u) from unnest(array['a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3']) u;
insert into public.platform_admins (user_id) values (tests.uid('a')) on conflict do nothing;
-- Written as the SQL Editor does, so this file does not depend on create_project.
insert into public.projects (name, created_by) values ('Alfa', tests.uid('a')), ('Beta', tests.uid('a'));
insert into public.profiles (user_id, display_name, color) values
  (tests.uid('a'), 'Anna', '#111111'),
  (tests.uid('b'), 'Bruno', '#222222'),
  (tests.uid('c'), 'Carla', '#333333'),
  (tests.uid('d'), 'Dario', '#444444'),
  (tests.uid('e'), 'Elena', '#555555'),
  (tests.uid('f'), 'Franco', '#666666'),
  (tests.uid('2'), 'Ginevra', '#777777');
insert into public.members (project_id, user_id, role)
select p.id, tests.uid(m.u), m.role
from (values ('Alfa', 'b', 'admin'), ('Alfa', 'c', 'member'), ('Alfa', 'd', 'advisor'), ('Beta', 'e', 'admin'), ('Beta', 'b', 'member'), ('Beta', '2', 'member')) m (project, u, role)
join public.projects p on p.name = m.project;

create schema t02;
grant usage on schema t02 to authenticated;
create table t02.project (key text primary key, id uuid not null);
insert into t02.project select lower(name), id from public.projects where name in ('Alfa', 'Beta');
grant select on t02.project to authenticated;
create function t02.id(p_key text) returns uuid language sql stable as $$ select id from t02.project where key = p_key $$;

-- A write the access rules may refuse: on a table they either skip the row or answer 42501, so the test
-- checks afterwards, as the owner, that nothing changed. Any other error still stops the file.
create function t02.attempt(p_sql text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
exception when insufficient_privilege then
  null;
end
$$;

-- The rows a query gives to whoever is logged in; a refusal (42501) counts as none.
create function t02.rows(p_query text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format('select count(*) from (%s) q', p_query) into v_count;
  return v_count;
exception when insufficient_privilege then
  return 0;
end
$$;
grant execute on function t02.id(text), t02.attempt(text), t02.rows(text) to authenticated;

-- =========================================================================
-- Roles are per project
-- =========================================================================

select tests.login('b');
select is(public.my_role(t02.id('alfa')), 'admin', 'my_role gives the role in the project asked: admin in Alfa');
select is(public.my_role(t02.id('beta')), 'member', 'and member in Beta for the same person');
select ok(public.is_admin(t02.id('alfa')), 'is_admin is true where the person is admin');
select ok(not public.is_admin(t02.id('beta')), 'and false where they are only a member');
select ok(public.can_manage(t02.id('alfa')), 'can_manage is true for the admin of the project');
select ok(not public.can_manage(t02.id('beta')), 'and false for a member');
select ok(public.can_write(t02.id('beta')), 'a member can write in the project');
select ok(public.can_read(t02.id('beta')), 'and read it');

select tests.login('d');
select is(public.my_role(t02.id('alfa')), 'advisor', 'an advisor has the advisor role');
select ok(public.can_read(t02.id('alfa')), 'an advisor can read the project');
select ok(not public.can_write(t02.id('alfa')), 'but not write its boards');
select ok(not public.can_read(t02.id('beta')), 'and cannot read a project they are not in');

select tests.login('f');
select is(public.my_role(t02.id('alfa')), null, 'someone outside the project has no role in it');
select ok(not public.can_read(t02.id('alfa')), 'and cannot read it');
select ok(not public.can_manage(t02.id('alfa')), 'nor manage it');

select tests.login('a');
select ok(public.can_manage(t02.id('alfa')) and public.can_manage(t02.id('beta')), 'a platform admin can manage every project');
select ok(not public.is_admin(t02.id('alfa')), 'without being the admin of it');
select ok(not public.can_read(t02.id('alfa')), 'nor a reader of its contents');
select is(public.my_role(t02.id('alfa')), null, 'nor having a role in it');

select tests.login('b', 'aal1');
-- Before the projects my_role() ignored the second factor; the contract now asks it of everything.
select is(public.my_role(t02.id('alfa')), null, 'with only the password my_role gives no role');
select ok(not public.can_read(t02.id('alfa')), 'with only the password can_read is false');
select ok(not public.can_write(t02.id('alfa')), 'with only the password can_write is false');
select ok(not public.is_admin(t02.id('alfa')), 'with only the password is_admin is false');
select ok(not public.can_manage(t02.id('alfa')), 'with only the password can_manage is false');
select tests.login('a', 'aal1');
select ok(not public.can_manage(t02.id('alfa')), 'a platform admin with only the password manages nothing');

-- =========================================================================
-- Who sees whom
-- =========================================================================

select tests.login('c');
select set_eq(
  $$select user_id from public.members where project_id = t02.id('alfa')$$,
  array[tests.uid('b'), tests.uid('c'), tests.uid('d')],
  'a member sees who is in their project'
);
select is_empty($$select 1 from public.members where project_id = t02.id('beta')$$, 'and nobody of a project they are not in');
select tests.login('b');
select set_eq(
  $$select project_id, role from public.members where user_id = tests.uid('b')$$,
  $$values (t02.id('alfa'), 'admin'), (t02.id('beta'), 'member')$$,
  'the same person is in two projects with a different role in each'
);
select tests.login('f');
select is_empty($$select 1 from public.members$$, 'someone in no project sees no member at all');
select tests.login('b', 'aal1');
select is_empty($$select 1 from public.members$$, 'with only the password no member is visible');

select tests.login('c');
select ok(exists (select 1 from public.profiles where user_id = tests.uid('b')), 'a person sees the profile of who shares a project with them');
select is_empty($$select 1 from public.profiles where user_id = tests.uid('e')$$, 'but not the profile of who shares no project with them');
select tests.login('b');
select ok(exists (select 1 from public.profiles where user_id = tests.uid('e')), 'sharing any one project is enough');
select ok(exists (select 1 from public.profiles where user_id = tests.uid('b')), 'everyone sees their own profile');
select tests.login('f');
select is_empty($$select 1 from public.profiles where user_id <> tests.uid('f')$$, 'someone in no project sees nobody else''s profile');
select tests.login('a');
select is(
  (select count(*)::int from public.profiles where user_id in (tests.uid('b'), tests.uid('e'), tests.uid('f'))),
  3,
  'a platform admin sees every profile, also of people in no project'
);
select tests.login('c', 'aal1');
select is_empty($$select 1 from public.profiles where user_id <> tests.uid('c')$$, 'with only the password nobody else''s profile is visible');

-- =========================================================================
-- members_overview: the people of one project, with the activity in that project
-- =========================================================================

select tests.login('b');
select set_eq(
  $$select user_id from public.members_overview(t02.id('alfa'))$$,
  array[tests.uid('b'), tests.uid('c'), tests.uid('d')],
  'members_overview lists the people of that project only'
);
select results_eq(
  $$select display_name::text, role::text, color::text, email::text, mfa_enabled from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')$$,
  $$values ('Bruno'::text, 'member'::text, '#222222'::text, 'membro@test.it'::text, true)$$,
  'members_overview takes name and colour from the profile and the role from that project'
);
select is(
  (select role::text from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')),
  'admin',
  'the same person shows the role they have in each project'
);
select tests.login('c');
select is(t02.rows($$select * from public.members_overview(t02.id('alfa'))$$), 3::bigint, 'a member of the project reads its members_overview');
select is(t02.rows($$select * from public.members_overview(t02.id('beta'))$$), 0::bigint, 'someone outside a project gets nothing from its members_overview');
select tests.login('b', 'aal1');
select is(t02.rows($$select * from public.members_overview(t02.id('alfa'))$$), 0::bigint, 'with only the password members_overview gives nothing');

-- b has never signed in nor written anything: the only traces are two chats read, one per project, on different days.
select tests.logout();
insert into public.chats (project_id, title)
select id, 'Lavori di ' || name from public.projects where name in ('Alfa', 'Beta');
insert into public.chat_reads (user_id, chat_id, last_read_at)
select tests.uid('b'), c.id, case c.title when 'Lavori di Alfa' then timestamptz '2026-03-01 09:00:00+00' else timestamptz '2026-03-10 09:00:00+00' end
from public.chats c where c.title in ('Lavori di Alfa', 'Lavori di Beta');
select tests.login('b');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')),
  timestamptz '2026-03-01 09:00:00+00',
  'the last activity in members_overview counts only what the person did in that project'
);
select is(
  (select last_sign_in_at from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')),
  timestamptz '2026-03-10 09:00:00+00',
  'and in another project the activity of that one'
);

-- One trace of each kind in Beta, each on a later day. The database writes the dates of comments and messages
-- itself, so their triggers are off while these rows are written.
select tests.logout();
insert into public.items (project_id, kind, title, status) values (t02.id('beta'), 'idea', 'Idea di Beta', 'nuova');
insert into public.revisions (project_id, item_id, version, op, kind, title, data, author_id, created_at)
select project_id, id, 2, 'update', kind, title, data, tests.uid('b'), timestamptz '2026-04-01 09:00:00+00' from public.items where title = 'Idea di Beta';
select tests.login('b');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')),
  timestamptz '2026-03-01 09:00:00+00',
  'a change made in another project is not activity in this one'
);
select is(
  (select last_sign_in_at from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')),
  timestamptz '2026-04-01 09:00:00+00',
  'it is activity in the project where it was made'
);
select tests.logout();
alter table public.comments disable trigger user;
insert into public.comments (project_id, item_id, author_id, body, created_at)
select project_id, id, tests.uid('b'), 'Rivediamo i numeri', timestamptz '2026-04-02 09:00:00+00' from public.items where title = 'Idea di Beta';
alter table public.comments enable trigger user;
select tests.login('b');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')),
  timestamptz '2026-03-01 09:00:00+00',
  'a comment written in another project is not activity in this one'
);
select is(
  (select last_sign_in_at from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')),
  timestamptz '2026-04-02 09:00:00+00',
  'it is activity in the project of the comment'
);
select tests.logout();
alter table public.chat_messages disable trigger user;
insert into public.chat_messages (project_id, chat_id, author_id, body, created_at)
select project_id, id, tests.uid('b'), 'Ci sono', timestamptz '2026-04-03 09:00:00+00' from public.chats where title = 'Lavori di Beta';
alter table public.chat_messages enable trigger user;
select tests.login('b');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')),
  timestamptz '2026-03-01 09:00:00+00',
  'a chat message written in another project is not activity in this one'
);
select is(
  (select last_sign_in_at from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')),
  timestamptz '2026-04-03 09:00:00+00',
  'it is activity in the project of the chat'
);
select tests.logout();
insert into public.mentions (project_id, user_id, author_id, source, source_id, excerpt, created_at, read_at)
values (t02.id('beta'), tests.uid('b'), tests.uid('e'), 'comment', gen_random_uuid(), 'Bruno guarda qui', timestamptz '2026-04-04 08:00:00+00', timestamptz '2026-04-04 09:00:00+00');
select tests.login('b');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')),
  timestamptz '2026-03-01 09:00:00+00',
  'a mention read in another project is not activity in this one'
);
select is(
  (select last_sign_in_at from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')),
  timestamptz '2026-04-04 09:00:00+00',
  'it is activity in the project of the mention'
);

-- Sign-in, session and the activity the site saves belong to the person, not to a project: for who is in several
-- projects they may come from any of them, so they never show.
select tests.logout();
update auth.users set last_sign_in_at = timestamptz '2030-01-01 09:00:00+00' where id = tests.uid('b');
insert into auth.sessions (user_id, updated_at, refreshed_at) values (tests.uid('b'), timestamptz '2030-01-02 09:00:00+00', timestamp '2030-01-03 09:00:00');
insert into public.member_activity (user_id, last_seen_at) values (tests.uid('b'), timestamptz '2030-01-04 09:00:00+00')
on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
select tests.login('e');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')),
  timestamptz '2026-04-04 09:00:00+00',
  'the admin of a project does not see when someone who is also in other projects signed in or used the site'
);
select tests.login('b');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')),
  timestamptz '2026-03-01 09:00:00+00',
  'nor does any other project of that person'
);
select tests.logout();
update auth.users set last_sign_in_at = timestamptz '2026-06-01 09:00:00+00' where id = tests.uid('c');
select tests.login('b');
select is(
  (select last_sign_in_at from public.members_overview(t02.id('alfa')) where user_id = tests.uid('c')),
  timestamptz '2026-06-01 09:00:00+00',
  'for who is in this project only, signing in is activity in it'
);

-- =========================================================================
-- add_member: the admin of the project or a platform admin
-- =========================================================================

select tests.login('b');
select lives_ok($$select public.add_member(t02.id('alfa'), '1@test.example', 'Ugo', 'member')$$, 'the admin of a project adds a registered person to it');
select tests.logout();
select is(
  (select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('1')),
  'member',
  'who was added is in the project with the role given'
);
select is((select display_name::text from public.profiles where user_id = tests.uid('1')), 'Ugo', 'and gets a profile with the name given, as they had none');
select ok(
  exists (
    select 1 from public.audit_log
    where event = 'member_added' and project_id = t02.id('alfa') and target_id = tests.uid('1') and actor_id = tests.uid('b')
  ),
  'the addition is recorded in the security log of that project, with who did it'
);
select ok(
  (select not details ? 'by' from public.audit_log where event = 'member_added' and project_id = t02.id('alfa') and target_id = tests.uid('1')),
  'an addition by the admin of the project is not marked as done by a platform admin'
);

select tests.login('b');
select lives_ok($$select public.add_member(t02.id('alfa'), '2@test.example', 'Altro nome', 'advisor')$$, 'a person already in another project can be added too');
select tests.logout();
select is((select display_name::text from public.profiles where user_id = tests.uid('2')), 'Ginevra', 'adding never renames an existing profile');
select results_eq(
  $$select role::text, project_id from public.members where user_id = tests.uid('2') order by role$$,
  $$values ('advisor'::text, t02.id('alfa')), ('member', t02.id('beta'))$$,
  'and they keep their role in the other project'
);

-- With many teams on one platform, the admin of a project does not pull in someone who belongs only to other teams, and
-- cannot tell such an account from an address without one: both answers are user_not_found. A new account, in no
-- project yet, is added as before; so is someone the admin already shares a project with.
select tests.create_user('4');
select tests.login('e');
select throws_ok($$select public.add_member(t02.id('beta'), 'advisor@test.it', 'Carla', 'member')$$, 'P0002', 'user_not_found', 'the admin of a project cannot add someone who is only in projects of others');
select throws_ok($$select public.add_member(t02.id('beta'), ' Advisor@Test.IT ', 'Carla', 'member')$$, 'P0002', 'user_not_found', 'whatever the case and spaces of the address');
select throws_ok($$select public.add_member(t02.id('beta'), 'nessuno@test.example', 'Nessuno', 'member')$$, 'P0002', 'user_not_found', 'the same answer as for an address without an account');
select lives_ok($$select public.add_member(t02.id('beta'), '4@test.example', 'Quarto', 'member')$$, 'a new account, in no project yet, is added by the admin of the project');
select tests.logout();
select ok(not exists (select 1 from public.members where project_id = t02.id('beta') and user_id = tests.uid('c')), 'who belongs only to other teams was not added');
select tests.login('a');
select lives_ok($$select public.add_member(t02.id('beta'), 'advisor@test.it', null, 'advisor')$$, 'a platform admin adds anyone, and the addition is in the log');
select tests.logout();
select ok(
  (select details ->> 'by' = 'platform_admin' from public.audit_log where event = 'member_added' and project_id = t02.id('beta') and target_id = tests.uid('c')),
  'an addition by a platform admin is marked as such in the log of the project'
);
delete from public.members where project_id = t02.id('beta') and user_id in (tests.uid('c'), tests.uid('4'));

select tests.login('c');
select throws_ok($$select public.add_member(t02.id('alfa'), '3@test.example', 'Ivo', 'member')$$, '42501', 'not_allowed', 'a member cannot add people');
select tests.login('d');
select throws_ok($$select public.add_member(t02.id('alfa'), '3@test.example', 'Ivo', 'member')$$, '42501', 'not_allowed', 'nor can an advisor');
select tests.login('e');
select throws_ok($$select public.add_member(t02.id('alfa'), '3@test.example', 'Ivo', 'member')$$, '42501', 'not_allowed', 'the admin of another project cannot add people to this one');
select tests.login('f');
select throws_ok($$select public.add_member(t02.id('alfa'), '3@test.example', 'Ivo', 'member')$$, '42501', 'not_allowed', 'nor can someone in no project');
select tests.login('b', 'aal1');
select throws_ok($$select public.add_member(t02.id('alfa'), '3@test.example', 'Ivo', 'member')$$, '42501', 'not_allowed', 'the admin of the project with only the password cannot add people');
select tests.logout();
select ok(not exists (select 1 from public.members where user_id = tests.uid('3')), 'refused additions add nobody');
select ok(not exists (select 1 from public.profiles where user_id = tests.uid('3')), 'and create no profile');

select tests.login('b');
select throws_ok($$select public.add_member(t02.id('alfa'), 'nessuno@test.example', 'Nessuno', 'member')$$, 'P0002', 'user_not_found', 'an email without an account is refused');
select throws_ok($$select public.add_member(t02.id('alfa'), '3@test.example', 'Ivo', 'owner')$$, '22023', 'invalid_role', 'a role other than admin, member and advisor is refused');
select tests.login('a');
select throws_ok($$select public.add_member(gen_random_uuid(), '3@test.example', 'Ivo', 'member')$$, 'P0002', 'project_not_found', 'adding to a project that does not exist says so');
select lives_ok($$select public.add_member(t02.id('beta'), '3@test.example', 'Ivo', 'admin')$$, 'a platform admin adds people to a project they are not in');
select tests.logout();
select is(
  (select role::text from public.members where project_id = t02.id('beta') and user_id = tests.uid('3')),
  'admin',
  'with the role given'
);
select ok(not exists (select 1 from public.members where project_id = t02.id('beta') and user_id = tests.uid('a')), 'without joining the project themselves');

-- =========================================================================
-- Roles and removals: on members, only who can manage the project
-- =========================================================================

select tests.login('c');
select t02.attempt($$update public.members set role = 'admin' where project_id = t02.id('alfa') and user_id = tests.uid('c')$$);
select tests.login('d');
select t02.attempt($$delete from public.members where project_id = t02.id('alfa') and user_id = tests.uid('c')$$);
select tests.login('b');
select t02.attempt($$update public.members set role = 'member' where project_id = t02.id('beta') and user_id = tests.uid('e')$$);
select t02.attempt($$delete from public.members where project_id = t02.id('beta') and user_id = tests.uid('2')$$);
select tests.login('b', 'aal1');
select t02.attempt($$update public.members set role = 'admin' where project_id = t02.id('alfa') and user_id = tests.uid('d')$$);
select tests.logout();
select is((select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('c')), 'member', 'a member cannot change their own role');
select ok(exists (select 1 from public.members where project_id = t02.id('alfa') and user_id = tests.uid('c')), 'an advisor cannot remove anybody');
select is((select role::text from public.members where project_id = t02.id('beta') and user_id = tests.uid('e')), 'admin', 'being admin of one project gives no power over the roles of another');
select ok(exists (select 1 from public.members where project_id = t02.id('beta') and user_id = tests.uid('2')), 'nor over who stays in it');
select is((select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('d')), 'advisor', 'with only the password the admin of the project changes no role');

-- The access rules hide the row from an advisor before the role trigger runs. As the owner of the table, with the
-- token of the advisor, the rules are skipped and the trigger itself must refuse.
select set_config('request.jwt.claims', json_build_object('sub', tests.uid('d'), 'aal', 'aal2', 'role', 'authenticated')::text, false);
select throws_ok(
  $$update public.members set role = 'admin' where project_id = t02.id('alfa') and user_id = tests.uid('d')$$,
  '42501', 'not_allowed',
  'past the access rules, the role trigger still refuses a role change by someone who does not manage the project'
);
select tests.logout();
select is((select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('d')), 'advisor', 'and the role stays as it was');

select tests.login('b');
select lives_ok($$update public.members set role = 'member' where project_id = t02.id('alfa') and user_id = tests.uid('d')$$, 'the admin of a project changes roles in it');
select lives_ok($$delete from public.members where project_id = t02.id('alfa') and user_id = tests.uid('1')$$, 'and removes people from it');
select tests.logout();
select is((select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('d')), 'member', 'the new role is saved');
select ok(not exists (select 1 from public.members where project_id = t02.id('alfa') and user_id = tests.uid('1')), 'who was removed is no longer in the project');

select tests.login('a');
select lives_ok($$update public.members set role = 'advisor' where project_id = t02.id('beta') and user_id = tests.uid('2')$$, 'a platform admin changes roles in a project they are not in');
select lives_ok($$delete from public.members where project_id = t02.id('beta') and user_id = tests.uid('3')$$, 'and removes people from it, even an admin when another one is left');
select tests.logout();
select is((select role::text from public.members where project_id = t02.id('beta') and user_id = tests.uid('2')), 'advisor', 'the role changed by the platform admin is saved');
select ok(not exists (select 1 from public.members where project_id = t02.id('beta') and user_id = tests.uid('3')), 'and who they removed is gone');
select is((select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('2')), 'advisor', 'changing a role in one project leaves the other projects alone');

-- Ginevra (2) is advisor in Alfa and in Beta. The site of before removed people by user only: from who manages
-- several projects that statement would take them out of all of them.
select tests.logout();
update public.members set role = 'admin' where project_id = t02.id('beta') and user_id = tests.uid('b');
select tests.login('b');
select throws_ok(
  $$delete from public.members where user_id = tests.uid('2')$$,
  '42501', 'not_allowed',
  'one statement cannot remove a person from several projects at once, even by who manages them all'
);
select throws_ok(
  $$update public.members set role = 'member' where user_id = tests.uid('2')$$,
  '42501', 'not_allowed',
  'nor change their role in several projects at once'
);
select tests.login('a');
select throws_ok(
  $$delete from public.members where user_id = tests.uid('2')$$,
  '42501', 'not_allowed',
  'not even a platform admin'
);
select tests.logout();
select is((select count(*)::int from public.members where user_id = tests.uid('2') and role = 'advisor'), 2, 'so the person stays in both projects with their roles');
select tests.login('b');
select lives_ok($$delete from public.members where project_id = t02.id('alfa') and user_id = tests.uid('2')$$, 'removing a person from one project at a time works');
select tests.logout();
select results_eq(
  $$select project_id from public.members where user_id = tests.uid('2')$$,
  $$values (t02.id('beta'))$$,
  'and leaves them in the other project'
);
update public.members set role = 'member' where project_id = t02.id('beta') and user_id = tests.uid('b');
insert into public.members (project_id, user_id, role) values (t02.id('alfa'), tests.uid('1'), 'member'), (t02.id('beta'), tests.uid('1'), 'member');
select lives_ok($$delete from public.members where user_id = tests.uid('1')$$, 'the SQL Editor still removes a person from every project in one statement');
select ok(not exists (select 1 from public.members where user_id = tests.uid('1')), 'and they are gone from all of them');

-- =========================================================================
-- The last admin of a project: counted in that project only
-- =========================================================================

-- Alfa has one admin, b; Beta has its own admin, e, who must not count for Alfa.
select tests.login('b');
select throws_ok(
  $$update public.members set role = 'member' where project_id = t02.id('alfa') and user_id = tests.uid('b')$$,
  'P0001', 'last_project_admin',
  'the last admin of a project cannot step down, even if another project has an admin'
);
select tests.login('a');
select throws_ok(
  $$delete from public.members where project_id = t02.id('alfa') and user_id = tests.uid('b')$$,
  'P0001', 'last_project_admin',
  'nor be removed, not even by a platform admin'
);
select tests.logout();
select is((select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('b')), 'admin', 'the project keeps its admin');

select tests.login('b');
select lives_ok($$update public.members set role = 'admin' where project_id = t02.id('alfa') and user_id = tests.uid('c')$$, 'the admin of a project can make someone else admin');
select lives_ok($$update public.members set role = 'member' where project_id = t02.id('alfa') and user_id = tests.uid('b')$$, 'and once there is a second admin can step down');
select tests.logout();
select is((select role::text from public.members where project_id = t02.id('alfa') and user_id = tests.uid('b')), 'member', 'the former admin stays in the project as a member');

-- =========================================================================
-- Profiles: everyone edits their own, and only their own
-- =========================================================================

select tests.login('b');
select lives_ok(
  $$update public.profiles set display_name = 'Bruno B.', color = '#0a0b0c', language = 'en' where user_id = tests.uid('b')$$,
  'a person edits name, colour and language of their own profile'
);
select tests.logout();
select results_eq(
  $$select display_name::text, color::text, language::text from public.profiles where user_id = tests.uid('b')$$,
  $$values ('Bruno B.'::text, '#0a0b0c'::text, 'en'::text)$$,
  'and the changes are saved'
);
select tests.login('b');
select lives_ok($$update public.profiles set language = 'it' where user_id = tests.uid('b')$$, 'Italian is a valid language');
select lives_ok($$update public.profiles set language = null where user_id = tests.uid('b')$$, 'no language means following the device');
select tests.logout();
select is((select language::text from public.profiles where user_id = tests.uid('b')), null, 'and is saved as null');

select tests.login('b');
select throws_ok($$update public.profiles set language = 'fr' where user_id = tests.uid('b')$$, '23514', null, 'a language other than English and Italian is refused');
select throws_ok($$update public.profiles set color = 'rosso' where user_id = tests.uid('b')$$, '23514', null, 'a colour must be written as #rrggbb');
select throws_ok($$update public.profiles set display_name = '' where user_id = tests.uid('b')$$, '23514', null, 'an empty name is refused');
select throws_ok(format('update public.profiles set display_name = %L where user_id = tests.uid(%L)', repeat('x', 81), 'b'), '23514', null, 'a name over 80 characters is refused');

select t02.attempt($$update public.profiles set display_name = 'Preso da Bruno' where user_id = tests.uid('c')$$);
select tests.login('a');
select t02.attempt($$update public.profiles set display_name = 'Preso da Anna' where user_id = tests.uid('c')$$);
select tests.login('b', 'aal1');
select t02.attempt($$update public.profiles set display_name = 'Senza 2FA' where user_id = tests.uid('b')$$);
select tests.logout();
select is((select display_name::text from public.profiles where user_id = tests.uid('c')), 'Carla', 'nobody edits the profile of someone else, not even a platform admin');
select is((select display_name::text from public.profiles where user_id = tests.uid('b')), 'Bruno B.', 'with only the password not even one''s own');
select tests.login('b');
select results_eq(
  $$select display_name::text from public.members_overview(t02.id('alfa')) where user_id = tests.uid('b')
    union all
    select display_name::text from public.members_overview(t02.id('beta')) where user_id = tests.uid('b')$$,
  $$values ('Bruno B.'::text), ('Bruno B.')$$,
  'a new name shows in every project at once'
);

select * from finish();
rollback;
