-- Rules between projects that docs/PROGETTI.md implies but the contract files do not check one by one:
-- links that must stay inside a project, what an archived project still exposes, who may leave a project,
-- and counts that belong to one project only.
--   P "Alfa": a admin, b member, c advisor        Q "Beta": d admin, b member (joined after the messages of Q)
--   R "Gamma": e its only admin, without an authenticator app    f: platform admin, in no project
begin;
select plan(24);

create schema t07;
grant usage on schema t07 to anon, authenticated, service_role;

create function t07.id(p_key text)
returns uuid
language sql
immutable
as $$
  select (case p_key
    when 'P' then 'aaaaaaaa-0000-4000-8000-000000000001'
    when 'Q' then 'bbbbbbbb-0000-4000-8000-000000000002'
    when 'R' then 'cccccccc-0000-4000-8000-000000000003'
    when 'idea_p' then '11111111-0000-4000-8000-000000000011'
    when 'group_p' then '13131313-0000-4000-8000-000000000013'
    when 'survey_p' then '12121212-0000-4000-8000-000000000012'
    when 'chat_q' then '23232323-0000-4000-8000-000000000023'
  end)::uuid
$$;

-- A valid expense of 12.50 euro in the given group.
create function t07.expense(p_group uuid)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'group', p_group, 'type', 'spesa', 'amount', 1250, 'currency', 'EUR', 'rate', 1, 'date', '2026-10-31', 'paid_by', 'anna',
    'split', jsonb_build_object('mode', 'parti', 'shares', jsonb_build_object('anna', 1))
  )
$$;

-- Rows a statement really touched: the access rules hide rows instead of refusing them.
create function t07.touched(p_sql text)
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

grant execute on all functions in schema t07 to anon, authenticated, service_role;

select tests.create_user(u) from unnest(array['a', 'b', 'c', 'd', 'f']) u;
select tests.create_user('e', false);
insert into public.platform_admins (user_id) values (tests.uid('f'));
insert into public.projects (id, name) values (t07.id('P'), 'Alfa'), (t07.id('Q'), 'Beta'), (t07.id('R'), 'Gamma');
insert into public.profiles (user_id, display_name, color) values
  (tests.uid('a'), 'Anna', '#4f5bd5'), (tests.uid('b'), 'Bruno', '#d94f4f'), (tests.uid('c'), 'Carla', '#2e9e6b'),
  (tests.uid('d'), 'Dario', '#c77d1a'), (tests.uid('e'), 'Elena', '#7a4fd5'), (tests.uid('f'), 'Franco', '#1a8fc7')
on conflict (user_id) do nothing;
insert into public.members (project_id, user_id, role, created_at) values
  (t07.id('P'), tests.uid('a'), 'admin', now() - interval '10 days'),
  (t07.id('P'), tests.uid('b'), 'member', now() - interval '10 days'),
  (t07.id('P'), tests.uid('c'), 'advisor', now() - interval '10 days'),
  (t07.id('Q'), tests.uid('d'), 'admin', now() - interval '10 days'),
  (t07.id('R'), tests.uid('e'), 'admin', now() - interval '10 days');
insert into public.items (id, project_id, kind, title, status) values (t07.id('idea_p'), t07.id('P'), 'idea', 'Integratori', 'nuova');
insert into public.items (id, project_id, kind, title, status, data) values
  (t07.id('group_p'), t07.id('P'), 'expensegroup', 'Costi di Alfa', null, '{"currency":"EUR","people":[{"id":"anna","name":"Anna"}]}');
insert into public.items (id, project_id, kind, title, status, data, idea_id) values
  (t07.id('survey_p'), t07.id('P'), 'survey', 'Nutrizionisti', 'aperto',
   '{"token":"TokenAlfaRegole0000001","questions":[{"id":"nota","type":"breve","label":"Cosa manca?"}]}', t07.id('idea_p'));
insert into public.chats (id, project_id, title) values (t07.id('chat_q'), t07.id('Q'), 'Consegne');

-- Q talks before b joins it: none of these messages is unread for b in Q, whatever b does in P.
-- In a transaction now() stands still, so b's arrival in Q is put a minute after the messages.
select tests.login('d');
insert into public.chat_messages (chat_id, body) values (t07.id('chat_q'), 'Partiamo lunedì'), (t07.id('chat_q'), 'Chi porta i furgoni?');
select tests.logout();
insert into public.members (project_id, user_id, role, created_at) values (t07.id('Q'), tests.uid('b'), 'member', now() + interval '1 minute');

-- =========================================================================
-- Links stay inside a project
-- =========================================================================

select tests.login('b');
select lives_ok(
  $$select public.create_item(t07.id('P'), 'expense', 'Dominio', null, t07.expense(t07.id('group_p')))$$,
  'an expense joins an expense group of its own project'
);
select throws_ok(
  $$select public.create_item(t07.id('Q'), 'expense', 'Dominio', null, t07.expense(t07.id('group_p')))$$,
  'P0001', 'cross_project',
  'an expense cannot join an expense group of another project, even for a member of both'
);
select tests.login('d');
select throws_ok(
  $$select public.create_item(t07.id('Q'), 'expense', 'Dominio', null, t07.expense(t07.id('group_p')))$$,
  'P0001', 'Il gruppo di spese non esiste',
  'for who cannot see it, an expense group of another project does not exist'
);

-- =========================================================================
-- An archived project closes its public survey link too
-- =========================================================================

select tests.anon();
select is(public.public_survey('TokenAlfaRegole0000001') ->> 'status', 'aperto', 'the public link of a survey opens while its project is active');
select tests.logout();
update public.projects set archived_at = now() where id = t07.id('P');
select tests.anon();
select is(public.public_survey('TokenAlfaRegole0000001') ->> 'status', 'non_trovato', 'once the project is archived its public link is not found');
select is(
  public.submit_survey('TokenAlfaRegole0000001', '{"nota":"Più tempo"}', '{"session":"11111111-1111-4111-8111-111111111111","final":true}') ->> 'status',
  'errore',
  'and takes no answers'
);
select public.survey_event('TokenAlfaRegole0000001', 'view');
select tests.logout();
select is((select count(*)::int from public.survey_responses where survey_id = t07.id('survey_p')), 0, 'no answer is saved for an archived project');
select is((select count(*)::int from public.survey_events where survey_id = t07.id('survey_p')), 0, 'nor any visit');

-- Only in an archived project: nothing to read, so no activity, no email choices and no email.
select tests.login('c');
select public.touch_activity();
select throws_ok($$select public.set_email_prefs(false, false)$$, '42501', 'not_allowed', 'whose only project is archived cannot choose emails');
select tests.logout();
select ok(not exists (select 1 from public.member_activity where user_id = tests.uid('c')), 'and leaves no activity behind');

update public.projects set archived_at = null where id = t07.id('P');
select tests.anon();
select is(public.public_survey('TokenAlfaRegole0000001') ->> 'status', 'aperto', 'a reactivated project opens its public link again');
select tests.logout();

-- =========================================================================
-- Who leaves a project
-- =========================================================================

select tests.login('a');
select is(
  t07.touched($$delete from public.members where project_id = t07.id('P') and user_id = tests.uid('a')$$),
  0,
  'the admin of a project does not remove themselves: another admin does'
);
select tests.login('f');
select lives_ok($$select public.add_member(t07.id('P'), 'f@test.example', 'Franco', 'member')$$, 'a platform admin joins a project to read it');
select is(
  t07.touched($$delete from public.members where project_id = t07.id('P') and user_id = tests.uid('f')$$),
  1,
  'and can leave it again'
);
select tests.logout();
select ok(
  exists (select 1 from public.audit_log where project_id = t07.id('P') and event = 'member_removed' and target_id = tests.uid('f') and actor_id = tests.uid('f')),
  'leaving is recorded in the security log of the project'
);

select tests.login('a');
select throws_ok(
  $$select public.add_member(t07.id('P'), 'admin@test.it', 'Anna', 'member')$$,
  'P0001', 'last_project_admin',
  'adding the only admin again with another role does not leave the project without an admin'
);

-- The SQL Editor cannot remove the last admin either; deleting the account in Authentication still works.
select tests.logout();
select throws_ok(
  $$delete from public.members where project_id = t07.id('R') and user_id = tests.uid('e')$$,
  'P0001', 'last_project_admin',
  'not even the SQL Editor removes the last admin of a project'
);
select lives_ok($$delete from auth.users where id = tests.uid('e')$$, 'but an account deleted in Authentication takes its memberships with it');
select ok(not exists (select 1 from public.members where user_id = tests.uid('e')), 'so the project is left with no row of that person');
select ok(
  exists (select 1 from public.audit_log where project_id = t07.id('R') and event = 'member_removed' and target_id = tests.uid('e')),
  'and the removal is recorded in the security log of that project'
);

-- =========================================================================
-- Counts of one project only
-- =========================================================================

select tests.login('b');
select is(
  (select unread from public.chat_overview(t07.id('Q')) where chat_id = t07.id('chat_q')),
  0,
  'messages written in a project before someone joined it are not unread for them, even if they joined another project earlier'
);
select tests.login('d');
insert into public.chat_messages (chat_id, body) values (t07.id('chat_q'), '@[Bruno] tu porti il furgone?');
select tests.logout();
update public.projects set archived_at = now() where id = t07.id('Q');
set role service_role;
select is_empty(
  $$select 1 from public.notify_pending_mentions(now() - interval '1 day') where project_id = t07.id('Q')$$,
  'no email goes out for a mention in an archived project'
);
select is_empty(
  $$select 1 from public.notify_recipients() where project_id = t07.id('Q')$$,
  'and its members are no recipients for it'
);
reset role;
update public.projects set archived_at = null where id = t07.id('Q');
set role service_role;
select is(
  (select count(*)::int from public.notify_pending_mentions(now() - interval '1 day') where project_id = t07.id('Q') and user_id = tests.uid('b')),
  1,
  'the mention is waiting again once the project is reactivated'
);
reset role;

select * from finish();
rollback;
