-- Email per progetto (docs/PROGETTI.md, «Email»): i dati per la funzione notify portano progetto, nome del progetto e
-- lingua di chi riceve; il riepilogo del lunedì è uno per persona e per progetto; le funzioni le chiama solo la chiave
-- di servizio. Il contratto non fissa le firme: questo file le fissa, con i nomi che la funzione notify passa all'API.
--   notify_recipients()                                 una riga per membro e progetto attivo: project_id, project_name, user_id,
--                                                       display_name, email, language, mentions, weekly
--   notify_pending_mentions(p_since)                    le colonne di prima più project_id, project_name, language;
--                                                       solo di chi è ancora membro del progetto della menzione
--   notify_claim_weekly(p_user, p_project, p_week)      boolean
--   notify_release_weekly(p_user, p_project, p_week)
--   notify_weekly_data(p_project, p_since)              jsonb di quel progetto con project_id, project_name e language in unread
begin;
select plan(44);

create schema t06;

create function t06.id(p_key text)
returns uuid
language sql
immutable
as $$
  select (case p_key
    when 'P' then 'aaaaaaaa-0000-4000-8000-000000000001'
    when 'Q' then 'bbbbbbbb-0000-4000-8000-000000000002'
    when 'R' then 'cccccccc-0000-4000-8000-000000000003'
    when 'idea_p' then '11111111-0000-4000-8000-000000000011'
    when 'chat_p' then '14141414-0000-4000-8000-000000000014'
    when 'idea_q' then '21212121-0000-4000-8000-000000000021'
    when 'chat_q' then '23232323-0000-4000-8000-000000000023'
    when 'idea_r' then '31313131-0000-4000-8000-000000000031'
  end)::uuid
$$;

-- I dati del riepilogo di un progetto negli ultimi sette giorni, come li chiede la funzione notify.
create function t06.weekly(p_project text)
returns jsonb
language plpgsql
as $$
begin
  return public.notify_weekly_data(p_project => t06.id(p_project), p_since => now() - interval '7 days');
end
$$;

-- La riga di una persona nei non letti del riepilogo di un progetto.
create function t06.unread(p_project text, p_user text)
returns jsonb
language plpgsql
as $$
begin
  return (select u from jsonb_array_elements(t06.weekly(p_project) -> 'unread') u where u ->> 'user_id' = tests.uid(p_user)::text);
end
$$;

grant usage on schema t06 to anon, authenticated, service_role;
grant execute on all functions in schema t06 to anon, authenticated, service_role;

-- P (Alfa): a admin (it), b membro (en), c advisor senza app di autenticazione verificata, 9 membro senza email (en).
-- Q (Beta): e admin (lingua del dispositivo), b membro. R (Gamma, archiviato): f admin, b membro. d: in nessun progetto.
select tests.create_user(u) from unnest(array['b', 'd', 'e', 'f', '9']) u;
update auth.users set email = '' where id = tests.uid('9');
insert into auth.mfa_factors (user_id, status) values (tests.uid('c'), 'unverified');

insert into public.projects (id, name) values (t06.id('P'), 'Alfa'), (t06.id('Q'), 'Beta'), (t06.id('R'), 'Gamma');
insert into public.profiles (user_id, display_name, color, language) values
  (tests.uid('a'), 'Anna', '#4f5bd5', 'it'),
  (tests.uid('b'), 'Bruna', '#d94f4f', 'en'),
  (tests.uid('c'), 'Carlo', '#2e9e6b', null),
  (tests.uid('e'), 'Elena', '#c77d1a', null),
  (tests.uid('f'), 'Franco', '#7a4fd5', 'it'),
  (tests.uid('9'), 'Nove', '#1a8fc7', 'en')
on conflict (user_id) do update set display_name = excluded.display_name, color = excluded.color, language = excluded.language;
-- Entrati ieri: i messaggi di oggi sono non letti per loro.
insert into public.members (project_id, user_id, role, created_at) values
  (t06.id('P'), tests.uid('a'), 'admin', now() - interval '1 day'),
  (t06.id('P'), tests.uid('b'), 'member', now() - interval '1 day'),
  (t06.id('P'), tests.uid('c'), 'advisor', now() - interval '1 day'),
  (t06.id('P'), tests.uid('9'), 'member', now() - interval '1 day'),
  (t06.id('Q'), tests.uid('e'), 'admin', now() - interval '1 day'),
  (t06.id('Q'), tests.uid('b'), 'member', now() - interval '1 day'),
  (t06.id('R'), tests.uid('f'), 'admin', now() - interval '1 day'),
  (t06.id('R'), tests.uid('b'), 'member', now() - interval '1 day');
insert into public.email_prefs (user_id, mentions, weekly) values (tests.uid('b'), true, false);
insert into public.items (id, project_id, kind, title, status) values
  (t06.id('idea_p'), t06.id('P'), 'idea', 'Idea alfa', 'esplorazione'),
  (t06.id('idea_q'), t06.id('Q'), 'idea', 'Idea beta', 'nuova'),
  (t06.id('idea_r'), t06.id('R'), 'idea', 'Idea gamma', 'nuova');
insert into public.chats (id, project_id, title) values (t06.id('chat_p'), t06.id('P'), 'Lancio'), (t06.id('chat_q'), t06.id('Q'), 'Spesa');

-- Menzioni scritte dalle persone: b e c in P (chat), a in P (commento), b in Q (commento); un messaggio in Q.
select tests.login('a');
insert into public.chat_messages (chat_id, body) values (t06.id('chat_p'), 'Riunione domani: @[Bruna] e @[Carlo] ci siete?');
select tests.login('b');
insert into public.comments (item_id, body) values (t06.id('idea_p'), 'Fatto, @[Anna] guarda i numeri');
select tests.login('e');
insert into public.comments (item_id, body) values (t06.id('idea_q'), '@[Bruna] puoi controllare il preventivo?');
insert into public.chat_messages (chat_id, body) values (t06.id('chat_q'), 'Ciao a tutti');
select tests.logout();
update public.projects set archived_at = now() where id = t06.id('R');
create table t06.mention_ids as select array_agg(id order by id) as ids from public.mentions;
grant select on t06.mention_ids to service_role;

-- =========================================================================
-- Destinatari
-- =========================================================================

set role service_role;
select set_eq(
  $$ select project_id, user_id from public.notify_recipients() $$,
  $$ values (t06.id('P'), tests.uid('a')), (t06.id('P'), tests.uid('b')), (t06.id('Q'), tests.uid('b')), (t06.id('Q'), tests.uid('e')) $$,
  'recipients are the members with an email and a verified authenticator app, once for each active project'
);
select set_eq(
  $$ select project_id, project_name, user_id, display_name, email, language, mentions, weekly from public.notify_recipients() $$,
  $$ values
       (t06.id('P'), 'Alfa', tests.uid('a'), 'Anna', 'admin@test.it', 'it', true, true),
       (t06.id('P'), 'Alfa', tests.uid('b'), 'Bruna', 'membro@test.it', 'en', true, false),
       (t06.id('Q'), 'Beta', tests.uid('b'), 'Bruna', 'membro@test.it', 'en', true, false),
       (t06.id('Q'), 'Beta', tests.uid('e'), 'Elena', 'e@test.example', null, true, true) $$,
  'each recipient comes with the project name, the name of their profile, their language and their email choices'
);
select is_empty(
  $$ select 1 from public.notify_recipients() where project_id = t06.id('R') $$,
  'nobody receives emails for an archived project'
);
select is_empty(
  $$ select 1 from public.notify_recipients() where user_id = tests.uid('c') $$,
  'a member whose authenticator app is not verified receives nothing'
);
select is_empty(
  $$ select 1 from public.notify_recipients() where user_id = tests.uid('9') $$,
  'a member without an email address receives nothing'
);
select is_empty(
  $$ select 1 from public.notify_recipients() where user_id = tests.uid('d') $$,
  'a user in no project receives nothing'
);

-- =========================================================================
-- Menzioni
-- =========================================================================

select set_eq(
  $$ select user_id, project_id, project_name, language from public.notify_pending_mentions(now() - interval '1 day') $$,
  $$ values
       (tests.uid('b'), t06.id('P'), 'Alfa', 'en'),
       (tests.uid('c'), t06.id('P'), 'Alfa', null),
       (tests.uid('a'), t06.id('P'), 'Alfa', 'it'),
       (tests.uid('b'), t06.id('Q'), 'Beta', 'en') $$,
  'each pending mention comes with its project, the project name and the language of who receives it'
);
select results_eq(
  $$ select author_name from public.notify_pending_mentions(now() - interval '1 day') where user_id = tests.uid('a') $$,
  array['Bruna'],
  'the name of the author comes from their profile'
);
select is(
  (select count(*)::int from public.notify_claim_mentions((select ids from t06.mention_ids))), 4,
  'mentions of every project are claimed by id'
);
select is_empty(
  $$ select 1 from public.notify_pending_mentions(now() - interval '1 day') $$,
  'claimed mentions are no longer pending'
);
select public.notify_release_mentions((select ids from t06.mention_ids));
select is(
  (select count(*)::int from public.notify_pending_mentions(now() - interval '1 day')), 4,
  'released mentions are pending again'
);

-- =========================================================================
-- Riepilogo del lunedì: uno per persona, progetto e settimana
-- =========================================================================

select ok(
  public.notify_claim_weekly(p_user => tests.uid('b'), p_project => t06.id('P'), p_week => '2026-11-23'),
  'the weekly summary of P for a person is claimed'
);
select ok(
  not public.notify_claim_weekly(p_user => tests.uid('b'), p_project => t06.id('P'), p_week => '2026-11-23'),
  'and only once'
);
select ok(
  public.notify_claim_weekly(p_user => tests.uid('b'), p_project => t06.id('Q'), p_week => '2026-11-23'),
  'a weekly summary for P does not block the one for Q'
);
select ok(
  public.notify_claim_weekly(p_user => tests.uid('e'), p_project => t06.id('Q'), p_week => '2026-11-23'),
  'nor the one of another person in Q'
);
select ok(
  public.notify_claim_weekly(p_user => tests.uid('b'), p_project => t06.id('P'), p_week => '2026-11-30'),
  'nor the one of the next week'
);
select public.notify_release_weekly(p_user => tests.uid('b'), p_project => t06.id('P'), p_week => '2026-11-23');
select ok(
  not public.notify_claim_weekly(p_user => tests.uid('b'), p_project => t06.id('Q'), p_week => '2026-11-23'),
  'releasing the summary of P leaves the one of Q claimed'
);
select ok(
  public.notify_claim_weekly(p_user => tests.uid('b'), p_project => t06.id('P'), p_week => '2026-11-23'),
  'and the released summary of P can be claimed again'
);

-- =========================================================================
-- Dati del riepilogo di un progetto
-- =========================================================================

select is(t06.weekly('P') ->> 'project_id', t06.id('P')::text, 'the weekly data says which project it is about');
select is(t06.weekly('P') ->> 'project_name', 'Alfa', 'and gives its name');
select set_eq(
  $$ select x ->> 'title' from jsonb_array_elements(t06.weekly('P') -> 'new_ideas') x $$,
  array['Idea alfa'],
  'the new ideas in the summary of P are only those of P'
);
select set_eq(
  $$ select x ->> 'title' from jsonb_array_elements(t06.weekly('Q') -> 'new_ideas') x $$,
  array['Idea beta'],
  'and those in the summary of Q only those of Q'
);
select set_eq(
  $$ select (u ->> 'user_id')::uuid, u ->> 'language' from jsonb_array_elements(t06.weekly('P') -> 'unread') u $$,
  $$ values (tests.uid('a'), 'it'), (tests.uid('b'), 'en'), (tests.uid('c'), null), (tests.uid('9'), 'en') $$,
  'the unread counts of P are for the members of P, each with their language'
);
select set_eq(
  $$ select (u ->> 'user_id')::uuid, u ->> 'language' from jsonb_array_elements(t06.weekly('Q') -> 'unread') u $$,
  $$ values (tests.uid('b'), 'en'), (tests.uid('e'), null) $$,
  'and those of Q for the members of Q'
);
select is((t06.unread('P', 'b') ->> 'mentions')::int, 1, 'unread mentions in the summary of P do not count those of Q');
select is((t06.unread('Q', 'b') ->> 'mentions')::int, 1, 'and the summary of Q counts the one of Q');
select is((t06.unread('P', 'b') ->> 'chat')::int, 1, 'unread chat messages in the summary of P do not count those of Q');
select tests.logout();

select set_eq(
  $$ select user_id, project_id, week_start from public.email_weekly $$,
  $$ values
       (tests.uid('b'), t06.id('P'), '2026-11-23'::date),
       (tests.uid('b'), t06.id('Q'), '2026-11-23'::date),
       (tests.uid('e'), t06.id('Q'), '2026-11-23'::date),
       (tests.uid('b'), t06.id('P'), '2026-11-30'::date) $$,
  'email_weekly keeps one row per person, project and week'
);

-- =========================================================================
-- Solo la chiave di servizio
-- =========================================================================

select has_function('public', 'notify_claim_weekly', array['uuid', 'uuid', 'date'], 'notify_claim_weekly takes a person, a project and a week');
select has_function('public', 'notify_release_weekly', array['uuid', 'uuid', 'date'], 'notify_release_weekly takes a person, a project and a week');
select has_function('public', 'notify_weekly_data', array['uuid', 'timestamptz'], 'notify_weekly_data takes a project and a start date');
select hasnt_function('public', 'notify_claim_weekly', array['uuid', 'date'], 'the weekly claim without a project is gone');
select hasnt_function('public', 'notify_weekly_data', array['timestamptz'], 'and so are the weekly data of the whole site');
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'notify\_%' and p.proname <> 'notify_call'
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')) $$,
  'anon and signed-in users cannot execute any notify function'
);
select bag_eq(
  $$ select p.proname::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'notify\_%' and p.proname <> 'notify_call'
       and has_function_privilege('service_role', p.oid, 'execute') $$,
  array['notify_recipients', 'notify_pending_mentions', 'notify_claim_mentions', 'notify_release_mentions',
        'notify_claim_weekly', 'notify_release_weekly', 'notify_weekly_data'],
  'the service key executes each notify function, in one version only'
);
select tests.login('a');
select throws_ok(
  $$ select * from public.notify_recipients() $$,
  '42501', null,
  'a signed-in admin cannot list the recipients'
);
select throws_ok(
  $$ select public.notify_claim_weekly(p_user => tests.uid('a'), p_project => t06.id('P'), p_week => '2026-12-07') $$,
  '42501', null,
  'nor claim a weekly summary'
);
select tests.anon();
select throws_ok(
  $$ select public.notify_weekly_data(p_project => t06.id('P'), p_since => now()) $$,
  '42501', null,
  'anon cannot read the weekly data'
);
select throws_ok(
  $$ select * from public.notify_pending_mentions(now() - interval '1 day') $$,
  '42501', null,
  'nor the pending mentions'
);

-- =========================================================================
-- Chi esce da un progetto non riceve più le sue menzioni
-- =========================================================================

-- b has an unread mention in P and one in Q, then the admin of P removes b from P. b stays a recipient through Q,
-- so the email job must not send the text of P to b.
select tests.login('a');
delete from public.members where project_id = t06.id('P') and user_id = tests.uid('b');
select tests.logout();
set role service_role;
select is_empty(
  $$ select 1 from public.notify_pending_mentions(now() - interval '1 day') where user_id = tests.uid('b') and project_id = t06.id('P') $$,
  'a member removed from a project receives no email for its mentions'
);
select is(
  (select count(*)::int from public.notify_pending_mentions(now() - interval '1 day') where user_id = tests.uid('b') and project_id = t06.id('Q')),
  1,
  'but still for the mentions of the projects they stay in'
);
select results_eq(
  $$ select project_id from public.notify_recipients() where user_id = tests.uid('b') $$,
  $$ values (t06.id('Q')) $$,
  'and is a recipient only for those projects'
);
-- The job reads the pending mentions and claims them a moment later: a removal in between must still stop the email.
select is_empty(
  $$ select * from public.notify_claim_mentions((select ids from t06.mention_ids)) c
     where c.id in (select m.id from public.mentions m where m.user_id = tests.uid('b') and m.project_id = t06.id('P')) $$,
  'nor can the email job claim a mention of a project the person has left'
);
reset role;

-- The general chat is stored as 'Generale' in every project: the email names it in the language of whoever receives it,
-- so each mention says whether it comes from the general chat.
select tests.login('e');
insert into public.chat_messages (chat_id, body)
select c.id, '@[Bruna] domani riunione' from public.chats c where c.project_id = t06.id('Q') and c.is_general;
select tests.logout();
set role service_role;
-- The claims above are let go, so the comment of e in Q is pending again next to the new message.
select public.notify_release_mentions((select ids from t06.mention_ids));
select results_eq(
  $$ select chat_is_general from public.notify_pending_mentions(now() - interval '1 day')
     where user_id = tests.uid('b') and project_id = t06.id('Q') order by source $$,
  $$ values (true), (false) $$,
  'a mention says whether it comes from the general chat: from there true, from anywhere else false'
);
reset role;

select tests.logout();
select * from finish();
rollback;
