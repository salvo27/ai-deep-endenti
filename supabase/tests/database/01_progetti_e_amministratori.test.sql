-- Projects and platform admins (docs/PROGETTI.md): who creates, renames, archives and reactivates a project,
-- who manages the platform admins, what a platform admin can and cannot read, and what the security log keeps.
begin;
select plan(119);

-- =========================================================================
-- What exists
-- =========================================================================

select has_table('public', 'projects', 'there is a table of projects');
select has_table('public', 'platform_admins', 'there is a table of platform admins');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.projects')), false), 'projects are protected by row level security');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.platform_admins')), false), 'platform admins are protected by row level security');
select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT, UPDATE, DELETE, TRUNCATE'), 'the site cannot write projects directly, only through the functions');
select ok(not has_table_privilege('authenticated', 'public.platform_admins', 'INSERT, UPDATE, DELETE, TRUNCATE'), 'the site cannot write platform admins directly, only through the functions');
select ok(not has_table_privilege('anon', 'public.projects', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), 'someone without an account cannot touch projects');
select ok(not has_table_privilege('anon', 'public.platform_admins', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), 'someone without an account cannot touch platform admins');

select has_function('public', 'is_platform_admin', array[]::name[], 'is_platform_admin() exists');
select has_function('public', 'my_projects', array[]::name[], 'my_projects() exists');
select has_function('public', 'all_projects', array[]::name[], 'all_projects() exists');
select has_function('public', 'create_project', array['text'], 'create_project(p_name) exists');
select has_function('public', 'rename_project', array['uuid', 'text'], 'rename_project(p_project, p_name) exists');
select has_function('public', 'archive_project', array['uuid'], 'archive_project(p_project) exists');
select has_function('public', 'unarchive_project', array['uuid'], 'unarchive_project(p_project) exists');
select has_function('public', 'add_platform_admin', array['text'], 'add_platform_admin(p_email) exists');
select has_function('public', 'remove_platform_admin', array['uuid'], 'remove_platform_admin(p_user) exists');

select ok(bool_and(has_function_privilege('authenticated', f, 'execute')), 'the site can call every project and platform admin function')
from unnest(array[
  'public.is_platform_admin()', 'public.my_projects()', 'public.all_projects()', 'public.create_project(text)',
  'public.rename_project(uuid, text)', 'public.archive_project(uuid)', 'public.unarchive_project(uuid)',
  'public.add_platform_admin(text)', 'public.remove_platform_admin(uuid)'
]) f;
select ok(not bool_or(has_function_privilege('anon', f, 'execute')), 'someone without an account can call none of them')
from unnest(array[
  'public.is_platform_admin()', 'public.my_projects()', 'public.all_projects()', 'public.create_project(text)',
  'public.rename_project(uuid, text)', 'public.archive_project(uuid)', 'public.unarchive_project(uuid)',
  'public.add_platform_admin(text)', 'public.remove_platform_admin(uuid)'
]) f;

-- =========================================================================
-- Cast: a = platform admin in no project, e = becomes the second platform admin, b = admin of Alfa,
-- c = member of Alfa and advisor of Beta, d = advisor of Alfa, f = admin of Beta, 1 = registered, in no project.
-- =========================================================================

select tests.create_user(u) from unnest(array['a', 'b', 'c', 'd', 'e', 'f', '1']) u;
insert into public.platform_admins (user_id) values (tests.uid('a')) on conflict do nothing;
-- Whatever the install left behind, here a is the only platform admin.
delete from public.platform_admins where user_id <> tests.uid('a');

-- Written as the SQL Editor does, so these projects do not depend on create_project, tested below.
insert into public.projects (name, created_by) values ('Alfa', tests.uid('a')), ('Beta', tests.uid('a'));
insert into public.profiles (user_id, display_name, color) values
  (tests.uid('b'), 'Bruno', '#336699'),
  (tests.uid('c'), 'Carla', '#993366'),
  (tests.uid('d'), 'Dario', '#669933'),
  (tests.uid('f'), 'Fabio', '#996633');
insert into public.members (project_id, user_id, role)
select p.id, tests.uid(m.u), m.role
from (values ('Alfa', 'b', 'admin'), ('Alfa', 'c', 'member'), ('Alfa', 'd', 'advisor'), ('Beta', 'f', 'admin'), ('Beta', 'c', 'advisor')) m (project, u, role)
join public.projects p on p.name = m.project;

insert into public.items (project_id, kind, title, status)
select id, 'idea', 'Idea di Alfa', 'nuova' from public.projects where name = 'Alfa';
insert into public.chats (project_id, title)
select id, 'Chat di Alfa' from public.projects where name = 'Alfa';

-- The ids of the projects stay put while their names change.
create schema t01;
grant usage on schema t01 to authenticated;
create table t01.project (key text primary key, id uuid not null);
insert into t01.project select lower(name), id from public.projects where name in ('Alfa', 'Beta');
create table t01.count (key text primary key, n bigint not null);
grant select on t01.project, t01.count to authenticated;
create function t01.id(p_key text) returns uuid language sql stable as $$ select id from t01.project where key = p_key $$;

-- The rows a query gives to whoever is logged in. The contract does not say whether a function refuses (42501)
-- or simply returns nothing to who may not use it: both count as nothing.
create function t01.rows(p_query text)
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
grant execute on function t01.id(text), t01.rows(text) to authenticated;

-- =========================================================================
-- Who is a platform admin
-- =========================================================================

select tests.login('a');
select ok(public.is_platform_admin(), 'a platform admin is recognised as such');
select tests.login('b');
select ok(not public.is_platform_admin(), 'the admin of a project is not a platform admin');
select tests.login('1');
select ok(not public.is_platform_admin(), 'someone in no project is not a platform admin');

-- =========================================================================
-- my_projects: the projects of the caller, with their role
-- =========================================================================

select tests.login('b');
select results_eq(
  $$select id, name::text, role::text from public.my_projects()$$,
  $$select t01.id('alfa'), 'Alfa'::text, 'admin'::text$$,
  'my_projects lists the projects of the caller with id, name and role'
);
select tests.login('c');
select results_eq(
  $$select name::text, role::text from public.my_projects() order by name$$,
  $$values ('Alfa'::text, 'member'::text), ('Beta', 'advisor')$$,
  'someone in two projects gets both, each with their own role'
);
select tests.login('1');
select is_empty($$select * from public.my_projects()$$, 'someone in no project gets no project');
select tests.login('a');
select is_empty($$select * from public.my_projects()$$, 'a platform admin gets only the projects they are a member of, here none');
select tests.login('b', 'aal1');
select is(t01.rows('select * from public.my_projects()'), 0::bigint, 'with only the password nobody gets any project');

-- =========================================================================
-- all_projects: every project, for the platform admin only
-- =========================================================================

select tests.login('a');
select results_eq(
  $$select name::text, member_count::int, admin_count::int from public.all_projects() where id in (t01.id('alfa'), t01.id('beta')) order by name$$,
  $$values ('Alfa'::text, 3, 1), ('Beta', 2, 1)$$,
  'a platform admin sees every project with how many people and how many admins it has'
);
select tests.login('b');
select is(t01.rows('select * from public.all_projects()'), 0::bigint, 'the admin of a project does not get the list of all projects');
select tests.login('a', 'aal1');
select is(t01.rows('select * from public.all_projects()'), 0::bigint, 'nor does a platform admin with only the password');

-- =========================================================================
-- A platform admin manages projects but does not read them
-- =========================================================================

select tests.login('a');
select ok(not public.can_read(t01.id('alfa')), 'a platform admin is not a reader of a project they are not in');
select ok(not public.can_write(t01.id('alfa')), 'nor a writer');
select is_empty($$select 1 from public.items where project_id = t01.id('alfa')$$, 'a platform admin outside the project sees none of its items');
select is_empty($$select 1 from public.chats where project_id = t01.id('alfa')$$, 'nor its chats');
select tests.login('c');
select is((select count(*)::int from public.items where project_id = t01.id('alfa')), 1, 'a member of the project sees its items');

-- =========================================================================
-- create_project
-- =========================================================================

select tests.login('a');
select lives_ok($$select public.create_project('Gamma')$$, 'a platform admin creates a project');
select tests.logout();
select is((select created_by from public.projects where name = 'Gamma'), tests.uid('a'), 'the project remembers who created it');
select is((select archived_at from public.projects where name = 'Gamma'), null, 'a new project is not archived');
select is(
  (select count(*)::int from public.chats c join public.projects p on p.id = c.project_id where p.name = 'Gamma' and c.is_general and c.title = 'Generale'),
  1,
  'a new project starts with its own Generale chat'
);

select tests.login('a');
select lives_ok($$select public.create_project('  Delta  ')$$, 'spaces around the name do not stop the creation');
select tests.logout();
select ok(exists (select 1 from public.projects where name = 'Delta'), 'the name is stored without the spaces around it');

select tests.login('a');
select lives_ok(format('select public.create_project(%L)', repeat('x', 80)), 'a name of 80 characters is accepted');
select throws_ok(format('select public.create_project(%L)', repeat('x', 81)), '22023', 'invalid_project_name', 'a name of 81 characters is refused');
select throws_ok($$select public.create_project('')$$, '22023', 'invalid_project_name', 'an empty name is refused');
select throws_ok($$select public.create_project('   ')$$, '22023', 'invalid_project_name', 'a name made only of spaces is refused');
select throws_ok($$select public.create_project(null)$$, '22023', 'invalid_project_name', 'a missing name is refused');

select tests.login('b');
select throws_ok($$select public.create_project('Progetto di Bruno')$$, '42501', 'not_allowed', 'the admin of a project cannot create projects');
select tests.login('1');
select throws_ok($$select public.create_project('Progetto di Uno')$$, '42501', 'not_allowed', 'nor can someone in no project');
select tests.login('a', 'aal1');
select throws_ok($$select public.create_project('Progetto senza 2FA')$$, '42501', 'not_allowed', 'a platform admin with only the password cannot create projects');
select tests.logout();
select is(
  (select count(*)::int from public.projects where name in ('Progetto di Bruno', 'Progetto di Uno', 'Progetto senza 2FA')),
  0,
  'refused creations leave no project behind'
);

-- =========================================================================
-- rename_project: platform admins, and the admins of that project
-- =========================================================================

select tests.login('b');
select lives_ok($$select public.rename_project(t01.id('alfa'), 'Alfa Uno')$$, 'the admin of a project renames it');
select tests.logout();
select is((select name::text from public.projects where id = t01.id('alfa')), 'Alfa Uno', 'and the new name is saved');

select tests.login('a');
select lives_ok($$select public.rename_project(t01.id('beta'), '  Beta Due  ')$$, 'a platform admin renames a project they are not in');
select tests.logout();
select is((select name::text from public.projects where id = t01.id('beta')), 'Beta Due', 'a new name is stored without the spaces around it');

select tests.login('f');
select throws_ok($$select public.rename_project(t01.id('alfa'), 'Presa da Fabio')$$, '42501', 'not_allowed', 'the admin of another project cannot rename it');
select tests.login('c');
select throws_ok($$select public.rename_project(t01.id('alfa'), 'Presa da Carla')$$, '42501', 'not_allowed', 'a member cannot rename the project');
select tests.login('d');
select throws_ok($$select public.rename_project(t01.id('alfa'), 'Presa da Dario')$$, '42501', 'not_allowed', 'nor can an advisor');
select tests.login('1');
select throws_ok($$select public.rename_project(t01.id('alfa'), 'Presa da Uno')$$, '42501', 'not_allowed', 'nor someone in no project');
select tests.login('b', 'aal1');
select throws_ok($$select public.rename_project(t01.id('alfa'), 'Senza 2FA')$$, '42501', 'not_allowed', 'the admin of the project with only the password cannot rename it');
select tests.login('b');
select throws_ok($$select public.rename_project(t01.id('alfa'), '  ')$$, '22023', 'invalid_project_name', 'renaming checks the name as creating does: not empty');
select throws_ok(format('select public.rename_project(t01.id(%L), %L)', 'alfa', repeat('x', 81)), '22023', 'invalid_project_name', 'and not over 80 characters');
select tests.login('a');
select throws_ok($$select public.rename_project(gen_random_uuid(), 'Nessuno')$$, 'P0002', 'project_not_found', 'renaming a project that does not exist says so');
select tests.logout();
select is((select name::text from public.projects where id = t01.id('alfa')), 'Alfa Uno', 'refused renames leave the name as it was');

-- =========================================================================
-- archive_project and unarchive_project: platform admins only; the data stay, nobody reads or writes them
-- =========================================================================

select tests.login('b');
select throws_ok($$select public.archive_project(t01.id('alfa'))$$, '42501', 'not_allowed', 'the admin of a project cannot archive it');
select tests.login('c');
select throws_ok($$select public.archive_project(t01.id('alfa'))$$, '42501', 'not_allowed', 'nor can a member');
select tests.login('a', 'aal1');
select throws_ok($$select public.archive_project(t01.id('alfa'))$$, '42501', 'not_allowed', 'nor a platform admin with only the password');
select tests.login('a');
select throws_ok($$select public.archive_project(gen_random_uuid())$$, 'P0002', 'project_not_found', 'archiving a project that does not exist says so');
select lives_ok($$select public.archive_project(t01.id('alfa'))$$, 'a platform admin archives a project');
select throws_ok($$select public.rename_project(t01.id('alfa'), 'Rinominata')$$, 'P0002', 'project_not_found', 'an archived project is not found for renaming, even by a platform admin');
select throws_ok($$select public.add_member(t01.id('alfa'), '1@test.example', 'Uno', 'member')$$, 'P0002', 'project_not_found', 'nor for adding people to it');
select tests.logout();
select isnt((select archived_at from public.projects where id = t01.id('alfa')), null, 'the archived project keeps its row, with when it was archived');
select is((select count(*)::int from public.items where project_id = t01.id('alfa')), 1, 'and keeps its data');

select tests.login('b');
select is_empty($$select 1 from public.my_projects() where id = t01.id('alfa')$$, 'an archived project disappears from my_projects');
select ok(not public.can_read(t01.id('alfa')), 'its admin can no longer read it');
-- The contract only says the project is not found: which of the two errors comes first is up to the implementation.
select throws_ok($$select public.rename_project(t01.id('alfa'), 'Rinominata')$$, null::char(5), null, 'nor rename it');
select throws_ok($$select public.unarchive_project(t01.id('alfa'))$$, '42501', 'not_allowed', 'nor reactivate it: only a platform admin can');
select tests.login('c');
select is_empty($$select 1 from public.items where project_id = t01.id('alfa')$$, 'its members no longer see its items');
select throws_ok($$insert into public.chats (project_id, title) values (t01.id('alfa'), 'Ancora qui?')$$, '42501', null, 'nor can they write in it');
select results_eq(
  $$select name::text from public.my_projects()$$,
  $$values ('Beta Due'::text)$$,
  'the other projects of the same person are not touched'
);

select tests.login('a');
select ok(exists (select 1 from public.all_projects() where id = t01.id('alfa')), 'a platform admin still finds the archived project among all projects');
select throws_ok($$select public.unarchive_project(gen_random_uuid())$$, 'P0002', 'project_not_found', 'reactivating a project that does not exist says so');
select lives_ok($$select public.unarchive_project(t01.id('alfa'))$$, 'a platform admin reactivates an archived project');
select tests.logout();
select is((select archived_at from public.projects where id = t01.id('alfa')), null, 'a reactivated project is no longer archived');
select is((select name::text from public.projects where id = t01.id('alfa')), 'Alfa Uno', 'and has kept its name');
select tests.login('c');
select is((select count(*)::int from public.items where project_id = t01.id('alfa')), 1, 'its members read it again, with all its data');
select tests.login('b');
select results_eq(
  $$select name::text, role::text from public.my_projects()$$,
  $$values ('Alfa Uno'::text, 'admin'::text)$$,
  'and find it again in my_projects with their role'
);

-- =========================================================================
-- To read a project a platform admin must join it, and that is recorded
-- =========================================================================

select tests.login('a');
select lives_ok($$select public.add_member(t01.id('alfa'), 'admin@test.it', 'Anna', 'member')$$, 'a platform admin can add themselves to a project');
select ok(public.can_read(t01.id('alfa')), 'and then reads it');
select is((select count(*)::int from public.items where project_id = t01.id('alfa')), 1, 'with its items');
select tests.logout();
select ok(
  exists (
    select 1 from public.audit_log
    where event = 'member_added' and project_id = t01.id('alfa') and actor_id = tests.uid('a') and target_id = tests.uid('a')
  ),
  'joining a project leaves a trace in the security log of that project'
);

-- =========================================================================
-- add_platform_admin and remove_platform_admin
-- =========================================================================

select tests.login('b');
select throws_ok($$select public.add_platform_admin('e@test.example')$$, '42501', 'not_allowed', 'the admin of a project cannot make platform admins');
select tests.login('a', 'aal1');
select throws_ok($$select public.add_platform_admin('e@test.example')$$, '42501', 'not_allowed', 'nor can a platform admin with only the password');
select tests.logout();
select ok(not exists (select 1 from public.platform_admins where user_id = tests.uid('e')), 'refused attempts make nobody a platform admin');

select tests.login('a');
select throws_ok($$select public.add_platform_admin('nessuno@test.example')$$, 'P0002', 'user_not_found', 'an email without an account is refused');
select lives_ok($$select public.add_platform_admin('e@test.example')$$, 'a platform admin makes another registered person a platform admin');
select tests.logout();
select is((select created_by from public.platform_admins where user_id = tests.uid('e')), tests.uid('a'), 'the new platform admin remembers who added them');
select tests.login('e');
select ok(public.is_platform_admin(), 'and that person is now a platform admin');

select tests.login('b');
select throws_ok($$select public.remove_platform_admin(tests.uid('a'))$$, '42501', 'not_allowed', 'the admin of a project cannot remove platform admins');
select tests.login('e');
select lives_ok($$select public.remove_platform_admin(tests.uid('a'))$$, 'a platform admin removes another one');
select tests.login('a');
select ok(not public.is_platform_admin(), 'who was removed is no longer a platform admin');
select throws_ok($$select public.create_project('Progetto di Anna')$$, '42501', 'not_allowed', 'and can no longer create projects');
-- The last platform admin can only be the one asking: nobody else may call the function.
select tests.login('e');
select throws_ok($$select public.remove_platform_admin(tests.uid('e'))$$, 'P0001', 'last_platform_admin', 'the last platform admin cannot be removed');
select ok(public.is_platform_admin(), 'and stays a platform admin');

-- =========================================================================
-- Security log: what is recorded and who reads it
-- =========================================================================

select tests.logout();
select ok(
  exists (
    select 1 from public.audit_log l join public.projects p on p.id = l.project_id
    where p.name = 'Gamma' and l.actor_id = tests.uid('a') and l.event not like 'member%'
  ),
  'creating a project is recorded in its security log, with who created it'
);
select ok(
  exists (select 1 from public.audit_log where project_id = t01.id('alfa') and actor_id = tests.uid('b') and event not like 'member%'),
  'renaming a project is recorded, with who renamed it'
);
select is(
  (select count(distinct event)::int from public.audit_log where project_id = t01.id('alfa') and actor_id = tests.uid('a') and event not like 'member%'),
  2,
  'archiving and reactivating are recorded as two different events'
);
select ok(
  exists (select 1 from public.audit_log where project_id is null and actor_id = tests.uid('a') and target_id = tests.uid('e')),
  'adding a platform admin is recorded as a platform event, outside every project'
);
select ok(
  exists (
    select 1 from public.audit_log r
    where r.project_id is null and r.actor_id = tests.uid('e') and r.target_id = tests.uid('a')
      and r.event not in (select a.event from public.audit_log a where a.project_id is null and a.actor_id = tests.uid('a') and a.target_id = tests.uid('e'))
  ),
  'removing a platform admin is recorded as a different platform event'
);

-- The admin of a project reads its log: what a platform admin did there without being its admin says so, so that it does
-- not read as the work of someone who left the team.
select ok(
  (select bool_and(l.details ->> 'by' = 'platform_admin') from public.audit_log l join public.projects p on p.id = l.project_id
   where p.name = 'Gamma' and l.event = 'project_created'),
  'a project created by a platform admin is marked in its log as created by a platform admin'
);
select ok(
  (select bool_and(details ->> 'by' = 'platform_admin') from public.audit_log
   where project_id = t01.id('alfa') and event in ('project_archived', 'project_unarchived')),
  'archiving and reactivating are marked as done by a platform admin'
);
select ok(
  (select bool_and(not details ? 'by') from public.audit_log where project_id = t01.id('alfa') and event = 'project_renamed' and actor_id = tests.uid('b')),
  'a rename by the admin of the project is not marked'
);
select ok(
  (select bool_and(details ->> 'by' = 'platform_admin') from public.audit_log
   where project_id = t01.id('alfa') and event = 'member_added' and actor_id = tests.uid('a') and target_id = tests.uid('a')),
  'a platform admin joining a project is marked as a platform admin'
);

insert into t01.count select 'audit', count(*) from public.audit_log;
select tests.login('e');
select is((select count(*) from public.audit_log), (select n from t01.count where key = 'audit'), 'a platform admin reads the whole security log, every project and the platform');
select tests.login('b');
select ok(exists (select 1 from public.audit_log where project_id = t01.id('alfa')), 'the admin of a project reads the security log of their project');
select is_empty($$select 1 from public.audit_log where project_id is distinct from t01.id('alfa')$$, 'and nothing else: neither other projects nor platform events');
select tests.login('f');
select is_empty($$select 1 from public.audit_log where project_id = t01.id('alfa')$$, 'the admin of another project does not read it');
select tests.login('c');
select is_empty($$select 1 from public.audit_log$$, 'a member reads no security log');
select tests.login('e', 'aal1');
select is_empty($$select 1 from public.audit_log$$, 'a platform admin with only the password reads nothing');
select tests.logout();
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'INSERT, UPDATE, DELETE, TRUNCATE'), 'nobody writes the security log from the site');

select * from finish();
rollback;
