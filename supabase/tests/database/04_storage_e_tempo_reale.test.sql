-- Storage e tempo reale per progetto (docs/PROGETTI.md, «Storage e tempo reale»): le immagini restano dove sono e
-- seguono i ruoli del progetto della loro prima cartella (un'idea, un questionario, un gruppo di spese o una chat);
-- la presenza online ha un canale board:<id del progetto> per progetto, aperto a chi può leggere quel progetto.
begin;
select plan(106);

-- Identificativi fissi: ogni test si legge da solo.
create schema t04;

create function t04.id(p_key text)
returns uuid
language sql
immutable
as $$
  select (case p_key
    when 'P' then 'aaaaaaaa-0000-4000-8000-000000000001'
    when 'Q' then 'bbbbbbbb-0000-4000-8000-000000000002'
    when 'R' then 'cccccccc-0000-4000-8000-000000000003'
    when 'idea_p' then '11111111-0000-4000-8000-000000000011'
    when 'survey_p' then '12121212-0000-4000-8000-000000000012'
    when 'group_p' then '13131313-0000-4000-8000-000000000013'
    when 'chat_p' then '14141414-0000-4000-8000-000000000014'
    when 'note_p' then '15151515-0000-4000-8000-000000000015'
    when 'idea_q' then '21212121-0000-4000-8000-000000000021'
    when 'survey_q' then '22222222-0000-4000-8000-000000000022'
    when 'chat_q' then '23232323-0000-4000-8000-000000000023'
    when 'idea_r' then '31313131-0000-4000-8000-000000000031'
    when 'twin' then '41414141-0000-4000-8000-000000000041'
    when 'chosen' then '42424242-0000-4000-8000-000000000042'
    when 'nowhere' then '0e0e0e0e-0000-4000-8000-00000000000e'
  end)::uuid
$$;

-- Percorso di un'immagine come lo crea il sito: <cartella>/<uuid>.jpg.
create function t04.img(p_folder text, p_n integer)
returns text
language sql
immutable
as $$ select t04.id(p_folder)::text || '/f0000000-0000-4000-8000-' || lpad(p_n::text, 12, '0') || '.jpg' $$;

-- Cancella come chi è entrato e dice quante righe ha tolto: le regole di accesso non danno errori, nascondono.
create function t04.remove(p_bucket text, p_name text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  delete from storage.objects o where o.bucket_id = p_bucket and o.name = p_name;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Senza where valgono solo le regole di cancellazione: «questionari-immagini» non ha una regola di lettura, apposta,
-- e con un where Postgres chiederebbe anche quella.
create function t04.remove_all()
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  delete from storage.objects;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Entra come quell'utente e si collega al canale p_topic.
create function t04.join(p_user text, p_topic text, p_aal text default 'aal2')
returns void
language plpgsql
as $$
begin
  perform tests.login(p_user, p_aal);
  perform set_config('realtime.topic', p_topic, false);
end
$$;

grant usage on schema t04 to authenticated;
grant execute on all functions in schema t04 to authenticated;

-- a: admin di P e di R (che verrà archiviato); b: membro di P e advisor di Q; c: advisor di P; e: admin di Q;
-- d: in nessun progetto; f: amministratore della piattaforma, membro di nessun progetto.
select tests.create_user(u) from unnest(array['b', 'c', 'd', 'e', 'f']) u;
insert into public.projects (id, name) values (t04.id('P'), 'Alfa'), (t04.id('Q'), 'Beta'), (t04.id('R'), 'Gamma');
insert into public.profiles (user_id, display_name, color) values
  (tests.uid('a'), 'Anna', '#4f5bd5'),
  (tests.uid('b'), 'Bruno', '#d94f4f'),
  (tests.uid('c'), 'Carla', '#2e9e6b'),
  (tests.uid('e'), 'Elena', '#c77d1a'),
  (tests.uid('f'), 'Franco', '#7a4fd5')
on conflict (user_id) do update set display_name = excluded.display_name, color = excluded.color;
insert into public.members (project_id, user_id, role) values
  (t04.id('P'), tests.uid('a'), 'admin'),
  (t04.id('P'), tests.uid('b'), 'member'),
  (t04.id('P'), tests.uid('c'), 'advisor'),
  (t04.id('Q'), tests.uid('e'), 'admin'),
  (t04.id('Q'), tests.uid('b'), 'advisor'),
  (t04.id('R'), tests.uid('a'), 'admin');
insert into public.platform_admins (user_id) values (tests.uid('f'));

insert into public.items (id, project_id, kind, title, status) values
  (t04.id('idea_p'), t04.id('P'), 'idea', 'Integratori su misura', 'esplorazione'),
  (t04.id('idea_q'), t04.id('Q'), 'idea', 'App per la spesa', 'nuova'),
  (t04.id('idea_r'), t04.id('R'), 'idea', 'Idea messa da parte', 'nuova');
insert into public.items (id, project_id, kind, title, status, data, idea_id) values
  (t04.id('survey_p'), t04.id('P'), 'survey', 'Nutrizionisti', 'bozza',
   jsonb_build_object('cover', jsonb_build_object('path', t04.img('survey_p', 1))), t04.id('idea_p')),
  (t04.id('survey_q'), t04.id('Q'), 'survey', 'Famiglie', 'bozza', '{}', t04.id('idea_q')),
  (t04.id('note_p'), t04.id('P'), 'note', 'Riunione', null,
   jsonb_build_object('body', 'Lavagna: ![foto](immagine:' || t04.img('idea_p', 1) || ')'), t04.id('idea_p'));
insert into public.items (id, project_id, kind, title, status, data) values
  (t04.id('group_p'), t04.id('P'), 'expensegroup', 'Costi', null, '{"currency":"EUR","people":[]}');
insert into public.chats (id, project_id, title) values (t04.id('chat_p'), t04.id('P'), 'Lancio'), (t04.id('chat_q'), t04.id('Q'), 'Spesa');
insert into public.chat_messages (chat_id, body) values (t04.id('chat_p'), 'Foto: ![lavagna](immagine:' || t04.img('chat_p', 3) || ')');

-- Immagini private: 1 in una nota di P, 3 in un messaggio di P, 2 4 7 9 orfane di P, 5 8 10 di Q, 6 di R; 7 e 8 vecchie di due giorni.
insert into storage.objects (bucket_id, name, created_at) values
  ('note-immagini', t04.img('idea_p', 1), now()),
  ('note-immagini', t04.img('idea_p', 2), now()),
  ('note-immagini', t04.img('chat_p', 3), now()),
  ('note-immagini', t04.img('group_p', 4), now()),
  ('note-immagini', t04.img('idea_q', 5), now()),
  ('note-immagini', t04.img('idea_r', 6), now()),
  ('note-immagini', t04.img('idea_p', 7), now() - interval '2 days'),
  ('note-immagini', t04.img('idea_q', 8), now() - interval '2 days'),
  ('note-immagini', t04.img('idea_p', 9), now()),
  ('note-immagini', t04.img('idea_q', 10), now());
-- Immagini dei questionari: 1 copertina del questionario di P, 2 e 4 orfane di P, 3 e 5 orfane di Q; 4 e 5 vecchie di due giorni.
insert into storage.objects (bucket_id, name, created_at) values
  ('questionari-immagini', t04.img('survey_p', 1), now()),
  ('questionari-immagini', t04.img('survey_p', 2), now()),
  ('questionari-immagini', t04.img('survey_q', 3), now()),
  ('questionari-immagini', t04.img('survey_p', 4), now() - interval '2 days'),
  ('questionari-immagini', t04.img('survey_q', 5), now() - interval '2 days');

update public.projects set archived_at = now() where id = t04.id('R');

-- =========================================================================
-- storage_project(name): la prima cartella del percorso dice il progetto
-- =========================================================================

select has_function('public', 'storage_project', array['text'], 'storage_project(name) exists');
select function_returns('public', 'storage_project', array['text'], 'uuid', 'storage_project gives the id of a project');
select is(public.storage_project(t04.img('idea_p', 1)), t04.id('P'), 'the folder of an idea gives the project of the idea');
select is(public.storage_project(t04.img('survey_p', 1)), t04.id('P'), 'the folder of a survey gives the project of the survey');
select is(public.storage_project(t04.img('group_p', 4)), t04.id('P'), 'the folder of an expense group gives the project of the group');
select is(public.storage_project(t04.img('chat_p', 3)), t04.id('P'), 'the folder of a chat gives the project of the chat');
select is(public.storage_project(t04.img('idea_q', 5)), t04.id('Q'), 'the folder of an idea of another project gives that other project');
select is(public.storage_project(t04.img('chat_q', 1)), t04.id('Q'), 'the folder of a chat of another project gives that other project');
select is(public.storage_project(t04.img('nowhere', 1)), null::uuid, 'a folder that is nothing of any project gives null');
select is(public.storage_project('cartella/foto.jpg'), null::uuid, 'a folder that is not an id gives null, without errors');
select is(public.storage_project('f0000000-0000-4000-8000-000000000001.jpg'), null::uuid, 'a file outside any folder gives null');
select is(public.storage_project(null), null::uuid, 'no name gives null');
select ok(has_function_privilege('authenticated', 'public.storage_project(text)', 'execute'), 'the storage rules of signed-in users can call storage_project');
select ok(not has_function_privilege('anon', 'public.storage_project(text)', 'execute'), 'anon cannot call storage_project');
select is(public.storage_project(t04.id('note_p')::text || '/f0000000-0000-4000-8000-000000000001.jpg'), null::uuid, 'a note is not a folder of images: only ideas, surveys, expense groups and chats are');
-- Written by the SQL Editor, which can still choose ids: an idea of Q and a chat of P with the same id.
insert into public.items (id, project_id, kind, title, status) values (t04.id('twin'), t04.id('Q'), 'idea', 'Gemella', 'nuova');
insert into public.chats (id, project_id, title) values (t04.id('twin'), t04.id('P'), 'Gemella');
select is(public.storage_project(t04.img('twin', 1)), null::uuid, 'a folder that is both an item and a chat belongs to no project');

-- Who is signed in learns the project of a folder only when they can read that project.
select tests.login('c');
select is(public.storage_project(t04.img('chat_p', 3)), t04.id('P'), 'a member of P learns that a chat folder of P belongs to P');
select tests.login('e');
select is(public.storage_project(t04.img('chat_p', 3)), null::uuid, 'a member of another project does not learn the project of a folder of P');
select tests.login('d');
select is(public.storage_project(t04.img('idea_p', 1)), null::uuid, 'nor does a user in no project');
select tests.login('c', 'aal1');
select is(public.storage_project(t04.img('idea_p', 1)), null::uuid, 'nor a member of P with only the password');
select tests.logout();

-- =========================================================================
-- note-immagini: leggere
-- =========================================================================

select tests.login('c');
select set_eq(
  $$ select name from storage.objects where bucket_id = 'note-immagini' $$,
  array[t04.img('idea_p', 1), t04.img('idea_p', 2), t04.img('chat_p', 3), t04.img('group_p', 4), t04.img('idea_p', 7), t04.img('idea_p', 9)],
  'an advisor of P reads every private image of P and nothing else'
);
select tests.login('e');
select set_eq(
  $$ select name from storage.objects where bucket_id = 'note-immagini' $$,
  array[t04.img('idea_q', 5), t04.img('idea_q', 8), t04.img('idea_q', 10)],
  'a member of Q reads the images of Q and none of P'
);
select tests.login('b');
select set_eq(
  $$ select name from storage.objects where bucket_id = 'note-immagini' $$,
  array[t04.img('idea_p', 1), t04.img('idea_p', 2), t04.img('chat_p', 3), t04.img('group_p', 4), t04.img('idea_p', 7), t04.img('idea_p', 9),
        t04.img('idea_q', 5), t04.img('idea_q', 8), t04.img('idea_q', 10)],
  'who is in two projects reads the images of both'
);
select tests.login('a');
select is_empty(
  $$ select name from storage.objects where name = t04.img('idea_r', 6) $$,
  'nobody reads the images of an archived project, not even its admin'
);
select tests.login('d');
select is_empty($$ select name from storage.objects $$, 'a user in no project reads no image');
select tests.login('f');
select is_empty($$ select name from storage.objects $$, 'a platform admin who is not a member reads no image of the projects');
select tests.login('c', 'aal1');
select is_empty($$ select name from storage.objects $$, 'without the second factor nobody reads images');

-- =========================================================================
-- note-immagini: caricare
-- =========================================================================

select tests.login('c');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_p', 20)) $$,
  'an advisor of P uploads an image under an idea of P'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('chat_p', 21)) $$,
  'and under a chat of P'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('nowhere', 28)) $$,
  '42501', null,
  'nobody uploads under a folder that belongs to no project'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.id('idea_p')::text || '/f0000000-0000-4000-8000-000000000029.png') $$,
  '42501', null,
  'the file must still be a jpg named by a uuid'
);
select tests.login('b');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('group_p', 22)) $$,
  'a member of P uploads a receipt under an expense group of P'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_q', 23)) $$,
  'an advisor of Q uploads an image under an idea of Q'
);
select tests.login('e');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_q', 24)) $$,
  'the admin of Q uploads an image under an idea of Q'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_p', 25)) $$,
  '42501', null,
  'a member of Q cannot upload under an idea of P'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('chat_p', 26)) $$,
  '42501', null,
  'nor under a chat of P'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('group_p', 27)) $$,
  '42501', null,
  'nor under an expense group of P'
);
select tests.login('a');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_r', 27)) $$,
  '42501', null,
  'nobody uploads under an idea of an archived project, not even its admin'
);
select tests.login('c', 'aal1');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_p', 30)) $$,
  '42501', null,
  'without the second factor nobody uploads'
);
select tests.login('f');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_p', 31)) $$,
  '42501', null,
  'a platform admin who is not a member cannot upload in the project'
);
select tests.login('d');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('idea_p', 32)) $$,
  '42501', null,
  'a user in no project cannot upload'
);

-- =========================================================================
-- note-immagini: cancellare (con un where, come fa Storage)
-- =========================================================================

select tests.login('c');
select is(t04.remove('note-immagini', t04.img('idea_p', 9)), 0, 'an advisor of P cannot delete the images of P');
select tests.login('e');
select is(t04.remove('note-immagini', t04.img('idea_p', 9)), 0, 'a member of Q cannot delete the images of P');
select tests.login('b');
select is(t04.remove('note-immagini', t04.img('idea_q', 10)), 0, 'an advisor of Q cannot delete the images of Q, even if they can in P');
select tests.login('a');
select is(t04.remove('note-immagini', t04.img('idea_r', 6)), 0, 'nobody deletes the images of an archived project');
select tests.login('b');
select is(t04.remove('note-immagini', t04.img('idea_p', 9)), 1, 'a member of P deletes an image of P');
select tests.login('e');
select is(t04.remove('note-immagini', t04.img('idea_q', 10)), 1, 'the admin of Q deletes an image of Q');

-- =========================================================================
-- Nobody takes over the folder of another project by choosing the id of a new item or chat
-- =========================================================================

-- A chat id is easy to know (links, messages with images, a former member's browser): the database picks the ids.
select tests.login('e');
select lives_ok(
  $$ insert into public.items (id, project_id, kind, title, status) values (t04.id('chat_p'), t04.id('Q'), 'idea', 'Presa', 'nuova') $$,
  'a member of Q may send an id with a new item'
);
select lives_ok(
  $$ insert into public.chats (id, project_id, title) values (t04.id('idea_p'), t04.id('Q'), 'Presa') $$,
  'and with a new chat'
);
select tests.login('b');
select lives_ok(
  $$ insert into public.items (id, project_id, kind, title, status) values (t04.id('chosen'), t04.id('Q'), 'score', '', null) $$,
  'an advisor of Q may send an id with their scores'
);
select tests.logout();
select is_empty(
  $$ select 1 from public.items where id in (t04.id('chat_p'), t04.id('chosen')) union all select 1 from public.chats where id = t04.id('idea_p') $$,
  'but the database gives every new item and chat an id of its own'
);
select is(
  (select count(*)::int from public.items where project_id = t04.id('Q') and title = 'Presa') + (select count(*)::int from public.chats where project_id = t04.id('Q') and title = 'Presa'),
  2,
  'the item and the chat are still created, in Q'
);
select is(public.storage_project(t04.img('chat_p', 3)), t04.id('P'), 'an item with the id of a chat of another project does not move that chat''s images');
select is(public.storage_project(t04.img('idea_p', 1)), t04.id('P'), 'nor does a chat with the id of an idea of another project');
select tests.login('e');
select is_empty(
  $$ select 1 from storage.objects where name in (t04.img('chat_p', 3), t04.img('idea_p', 1)) $$,
  'so the member of Q still reads none of those images'
);
select is(t04.remove('note-immagini', t04.img('chat_p', 3)), 0, 'and cannot delete them');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('chat_p', 40)) $$,
  '42501', null,
  'nor upload into the chat of P'
);
select tests.login('a');
select set_eq(
  $$ select name from storage.objects where name in (t04.img('chat_p', 3), t04.img('idea_p', 1)) $$,
  array[t04.img('chat_p', 3), t04.img('idea_p', 1)],
  'while the admin of P still reads them'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-immagini', t04.img('chat_p', 41)) $$,
  'and still uploads into the chat of P'
);

-- =========================================================================
-- note_image_orphans(p_project, p_paths): solo le immagini di quel progetto
-- =========================================================================

select tests.logout();
select has_function('public', 'note_image_orphans', array['uuid', 'text[]'], 'note_image_orphans takes a project and a list of paths');
select hasnt_function('public', 'note_image_orphans', array['text[]'], 'the version without a project is gone');
select tests.login('b');
select set_eq(
  $$ select * from public.note_image_orphans(t04.id('P'), array[t04.img('idea_p', 1), t04.img('idea_p', 2), t04.img('chat_p', 3), t04.img('group_p', 4), t04.img('idea_q', 5)]) $$,
  array[t04.img('idea_p', 2), t04.img('group_p', 4)],
  'the orphans of P are the listed images of P that no note or message points to, never those of Q'
);
select set_eq(
  $$ select * from public.note_image_orphans(t04.id('P'), null) $$,
  array[t04.img('idea_p', 7)],
  'without a list, the orphans of P are its images older than a day, not those of Q'
);
select is_empty(
  $$ select * from public.note_image_orphans(t04.id('Q'), array[t04.img('idea_q', 5)]) $$,
  'an advisor of Q finds no orphan in Q, even if member of P'
);
select tests.login('e');
select set_eq(
  $$ select * from public.note_image_orphans(t04.id('Q'), null) $$,
  array[t04.img('idea_q', 8)],
  'the admin of Q finds the old orphans of Q and none of P'
);
select is_empty(
  $$ select * from public.note_image_orphans(t04.id('P'), array[t04.img('idea_p', 2)]) $$,
  'a member of Q finds no orphan in P'
);
select tests.login('c');
select is_empty(
  $$ select * from public.note_image_orphans(t04.id('P'), array[t04.img('idea_p', 2)]) $$,
  'an advisor of P finds no orphan to delete'
);
select tests.login('a');
select is_empty(
  $$ select * from public.note_image_orphans(t04.id('R'), array[t04.img('idea_r', 6)]) $$,
  'nobody looks for orphans in an archived project'
);

-- =========================================================================
-- questionari-immagini: caricare
-- =========================================================================

select tests.login('b');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('questionari-immagini', t04.img('survey_p', 10)) $$,
  'a member of P uploads an image for a survey of P'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('questionari-immagini', t04.img('survey_q', 14)) $$,
  '42501', null,
  'an advisor of Q cannot upload for a survey of Q, even if member of P'
);
select tests.login('c');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('questionari-immagini', t04.img('survey_p', 11)) $$,
  '42501', null,
  'an advisor of P cannot upload survey images'
);
select tests.login('e');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('questionari-immagini', t04.img('survey_p', 12)) $$,
  '42501', null,
  'a member of Q cannot upload an image for a survey of P'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('questionari-immagini', t04.img('survey_q', 13)) $$,
  'the admin of Q uploads an image for a survey of Q'
);

-- =========================================================================
-- survey_image_orphans(p_project, p_paths): solo le immagini di quel progetto
-- =========================================================================

select tests.logout();
select has_function('public', 'survey_image_orphans', array['uuid', 'text[]'], 'survey_image_orphans takes a project and a list of paths');
select hasnt_function('public', 'survey_image_orphans', array['text[]'], 'the version without a project is gone');
select tests.login('b');
select set_eq(
  $$ select * from public.survey_image_orphans(t04.id('P'), array[t04.img('survey_p', 1), t04.img('survey_p', 2), t04.img('survey_q', 3)]) $$,
  array[t04.img('survey_p', 2)],
  'the survey orphans of P are the listed images of P that no survey uses, never those of Q'
);
select set_eq(
  $$ select * from public.survey_image_orphans(t04.id('P'), null) $$,
  array[t04.img('survey_p', 4)],
  'without a list, the survey orphans of P are its images older than a day, not those of Q'
);
select tests.login('e');
select set_eq(
  $$ select * from public.survey_image_orphans(t04.id('Q'), null) $$,
  array[t04.img('survey_q', 5)],
  'the admin of Q finds the old survey orphans of Q and none of P'
);
select is_empty(
  $$ select * from public.survey_image_orphans(t04.id('P'), array[t04.img('survey_p', 2)]) $$,
  'a member of Q finds no survey orphan in P'
);
select tests.login('c');
select is_empty(
  $$ select * from public.survey_image_orphans(t04.id('P'), array[t04.img('survey_p', 2)]) $$,
  'an advisor of P finds no survey orphan to delete'
);

-- =========================================================================
-- questionari-immagini: cancellare
-- =========================================================================

-- Restano solo le immagini dei questionari: così ogni cancellazione qui sotto tocca solo loro.
select tests.logout();
delete from storage.objects where bucket_id = 'note-immagini';
select tests.login('c');
select is(t04.remove_all(), 0, 'an advisor of P deletes no survey image');
select tests.login('d');
select is(t04.remove_all(), 0, 'a user in no project deletes no survey image');
select tests.login('b');
select is(t04.remove_all(), 4, 'a member of P deletes the four survey images of P');
select tests.logout();
select set_eq(
  $$ select name from storage.objects $$,
  array[t04.img('survey_q', 3), t04.img('survey_q', 5), t04.img('survey_q', 13)],
  'and none of Q, where they are only advisor'
);
insert into storage.objects (bucket_id, name) values ('questionari-immagini', t04.img('survey_p', 2));
select tests.login('e');
select t04.remove_all();
select tests.logout();
select set_eq(
  $$ select name from storage.objects $$,
  array[t04.img('survey_p', 2)],
  'the admin of Q deletes the survey images of Q and none of P'
);

-- =========================================================================
-- Presenza online: un canale board:<progetto> per progetto
-- =========================================================================

-- Come farà lo stub: realtime.topic() è il canale a cui ci si sta collegando.
create or replace function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
-- Su Supabase chi è entrato legge e scrive i messaggi del tempo reale, sempre attraverso le regole di accesso.
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;
-- Un messaggio per ogni canale provato, così un canale vuoto è vuoto per le regole e non per mancanza di righe.
insert into realtime.messages (topic, extension, payload)
select t, 'presence', '{}'::jsonb
from unnest(array[
  'board:' || t04.id('P'), 'board:' || t04.id('Q'), 'board:' || t04.id('R'), 'board', 'board:', 'board:not-a-uuid',
  'board:' || t04.id('P') || ':extra', 'board:' || t04.id('nowhere'), 'chat:' || t04.id('P'), ''
]) t;

select t04.join('c', 'board:' || t04.id('P'));
select isnt_empty($$ select 1 from realtime.messages $$, 'an advisor of P receives the presence of board:P');
select lives_ok(
  $$ insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'presence', '{}') $$,
  'and announces their own presence there'
);
select t04.join('e', 'board:' || t04.id('P'));
select is_empty($$ select 1 from realtime.messages $$, 'a member of Q does not receive the presence of P');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'presence', '{}') $$,
  '42501', null,
  'nor announces presence in P'
);
select t04.join('e', 'board:' || t04.id('Q'));
select isnt_empty($$ select 1 from realtime.messages $$, 'the admin of Q receives the presence of board:Q');
select t04.join('b', 'board:' || t04.id('Q'));
select isnt_empty($$ select 1 from realtime.messages $$, 'an advisor of Q receives the presence of board:Q');
select t04.join('a', 'board:' || t04.id('R'));
select is_empty($$ select 1 from realtime.messages $$, 'an archived project has no presence, not even for its admin');
select t04.join('d', 'board:' || t04.id('P'));
select is_empty($$ select 1 from realtime.messages $$, 'a user in no project joins no presence');
select t04.join('f', 'board:' || t04.id('P'));
select is_empty($$ select 1 from realtime.messages $$, 'a platform admin who is not a member does not join the presence of the project');
select t04.join('c', 'board:' || t04.id('P'), 'aal1');
select is_empty($$ select 1 from realtime.messages $$, 'without the second factor nobody joins the presence');
select t04.join('c', 'board');
select is_empty($$ select 1 from realtime.messages $$, 'the old shared channel board is closed');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'presence', '{}') $$,
  '42501', null,
  'and nobody announces presence on it'
);
select t04.join('c', 'board:');
select is_empty($$ select 1 from realtime.messages $$, 'a topic without a project id is refused');
select t04.join('c', 'board:not-a-uuid');
select is_empty($$ select 1 from realtime.messages $$, 'a malformed project id is refused without errors');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'presence', '{}') $$,
  '42501', null,
  'and refused for writing by the access rules, not by a cast error'
);
select t04.join('c', 'board:' || t04.id('P') || ':extra');
select is_empty($$ select 1 from realtime.messages $$, 'extra text after the project id is refused');
select t04.join('c', 'board:' || t04.id('nowhere'));
select is_empty($$ select 1 from realtime.messages $$, 'a project that does not exist has no presence');
select t04.join('c', 'chat:' || t04.id('P'));
select is_empty($$ select 1 from realtime.messages $$, 'only board: topics are open');
select t04.join('c', '');
select is_empty($$ select 1 from realtime.messages $$, 'without a topic nothing is open');

-- =========================================================================
-- Live updates of the tables
-- =========================================================================

-- Realtime checks the access rules on inserts and updates, but sends every deletion to every subscriber of the table
-- with its key: a removal from members would tell everyone signed in who left which project.
select tests.logout();
select is_empty(
  $$ select tablename::text from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('members', 'profiles') $$,
  'members and profiles are not broadcast live, so nobody learns of removals in projects they are not in'
);
select set_eq(
  $$ select tablename::text from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' $$,
  array['items', 'revisions', 'comments', 'projects', 'chats', 'chat_messages', 'mentions'],
  'the boards, their history, comments, chats, mentions and projects are broadcast live'
);

select tests.logout();
select * from finish();
rollback;
