-- ai-deep-endenti: schema del database.
-- Va eseguito per intero nel SQL Editor di Supabase. Si può rieseguire: non cancella dati.

-- =========================================================================
-- Membri del team
-- =========================================================================

create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'member' check (role in ('admin', 'member', 'advisor')),
  color text not null default '#4f5bd5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.members m where m.user_id = auth.uid()
$$;

create or replace function public.has_mfa()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function public.can_read()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.has_mfa() and public.my_role() is not null
$$;

create or replace function public.can_write()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.has_mfa() and coalesce(public.my_role() in ('admin', 'member'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.has_mfa() and coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.members_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Solo un admin può cambiare i ruoli';
    end if;
    if old.role = 'admin' and not exists (
      select 1 from public.members m where m.role = 'admin' and m.user_id <> old.user_id
    ) then
      raise exception 'Deve restare almeno un admin';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists members_before_update on public.members;
create trigger members_before_update
  before update on public.members
  for each row execute function public.members_before_update();

-- Aggiunge un utente già creato in Authentication > Users.
-- Dal SQL Editor funziona sempre; dal sito solo per gli admin.
create or replace function public.add_member(p_email text, p_display_name text, p_role text default 'member')
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  r public.members;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo un admin può aggiungere membri';
  end if;
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'Nessun utente con email %: crealo prima in Authentication > Users', p_email;
  end if;
  insert into public.members (user_id, display_name, role)
  values (v_user_id, btrim(p_display_name), p_role)
  on conflict (user_id) do update
    set display_name = excluded.display_name, role = excluded.role
  returning * into r;
  return r;
end
$$;

-- Ultimo accesso reale: login, rinnovo della sessione, attività salvata dal sito, modifiche, commenti, chat e menzioni lette.
-- Le sessioni si cancellano a ogni uscita: member_activity resta, così l'ultimo accesso non torna indietro.
create or replace function public.members_overview()
returns table (
  user_id uuid,
  display_name text,
  role text,
  color text,
  email text,
  last_sign_in_at timestamptz,
  mfa_enabled boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    m.user_id,
    m.display_name,
    m.role,
    m.color,
    u.email::text,
    greatest(
      u.last_sign_in_at,
      (select max(greatest(s.updated_at, s.refreshed_at at time zone 'utc')) from auth.sessions s where s.user_id = m.user_id),
      (select max(r.created_at) from public.revisions r where r.author_id = m.user_id),
      (select max(c.created_at) from public.comments c where c.author_id = m.user_id),
      (select a.last_seen_at from public.member_activity a where a.user_id = m.user_id),
      (select max(x.created_at) from public.chat_messages x where x.author_id = m.user_id),
      (select max(cr.last_read_at) from public.chat_reads cr where cr.user_id = m.user_id),
      (select max(mn.read_at) from public.mentions mn where mn.user_id = m.user_id)
    ),
    exists (
      select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified'
    ),
    m.created_at
  from public.members m
  join auth.users u on u.id = m.user_id
  where public.can_read()
  order by m.created_at;
end
$$;

-- Ultima attività sul sito: una data per persona, letta e scritta solo dalle funzioni qui sotto.
create table if not exists public.member_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.member_activity enable row level security;

-- Chiamata dal sito all'apertura e ogni 5 minuti di uso; più spesso non scrive nulla.
create or replace function public.touch_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_read() then
    return;
  end if;
  insert into public.member_activity (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at
    where public.member_activity.last_seen_at < now() - interval '4 minutes';
end
$$;

alter table public.members enable row level security;

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using ((select public.can_read()));

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.can_read())))
  with check ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.can_read())));

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using ((select public.is_admin()) and user_id <> (select auth.uid()));

-- =========================================================================
-- Elementi delle board e storico
-- =========================================================================

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  idea_id uuid references public.items (id),
  title text not null default '' check (char_length(title) <= 200),
  status text check (status is null or char_length(status) <= 40),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint items_data_size check (octet_length(data::text) < 500000)
);

-- Il vincolo sui tipi si ricrea a ogni installazione, così aggiungere un tipo basta rieseguire lo schema.
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (
  kind in (
    'idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors',
    'note', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap'
  )
);

create index if not exists items_kind_idx on public.items (kind);
create index if not exists items_idea_idx on public.items (idea_id);
drop index if exists public.items_singleton_idx;
create unique index items_singleton_idx on public.items (kind)
  where kind in ('criteria', 'generator', 'teamcanvas', 'equity');
create unique index if not exists items_one_score_per_member_idx on public.items (created_by)
  where kind = 'score';

create table if not exists public.revisions (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items (id) on delete cascade,
  version integer not null,
  op text not null check (op in ('create', 'update', 'delete', 'restore', 'revert')),
  kind text not null,
  idea_id uuid,
  title text not null,
  status text,
  data jsonb not null,
  changed text[] not null default '{}',
  author_id uuid references auth.users (id) on delete set null,
  message text check (message is null or char_length(message) <= 500),
  created_at timestamptz not null default now(),
  unique (item_id, version)
);

create index if not exists revisions_created_idx on public.revisions (created_at desc);
create index if not exists revisions_idea_idx on public.revisions (idea_id, created_at desc);
create index if not exists revisions_author_idx on public.revisions (author_id, created_at desc);

create or replace function public.items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.kind := old.kind;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if not (
    (new.kind = 'idea' and new.status in ('nuova', 'esplorazione', 'validazione', 'scelta', 'parcheggiata', 'scartata'))
    or (new.kind = 'experiment' and new.status in ('pianificato', 'in_corso', 'concluso'))
    or (new.kind = 'interview' and new.status in ('da_fare', 'fatta', 'analizzata'))
    or (new.kind = 'decision' and new.status in ('proposta', 'presa', 'rivista'))
    or (new.kind = 'contact' and new.status in ('da_contattare', 'contattata', 'fissata', 'in_contatto', 'chiusa'))
    or (new.kind in ('canvas', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap')
        and new.status is null)
  ) then
    raise exception 'Stato non valido per questo tipo di elemento';
  end if;
  if new.kind in ('idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note', 'scoresnap')
     and btrim(new.title) = '' then
    raise exception 'Il titolo è obbligatorio';
  end if;
  if new.kind in ('canvas', 'experiment', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors') and new.idea_id is null then
    raise exception 'Questo elemento deve appartenere a un''idea';
  end if;
  if new.kind in ('idea', 'decision', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap') and new.idea_id is not null then
    raise exception 'Questo elemento non può appartenere a un''idea';
  end if;
  if new.idea_id is not null and new.idea_id is distinct from (case when tg_op = 'UPDATE' then old.idea_id end)
     and not exists (select 1 from public.items i where i.id = new.idea_id and i.kind = 'idea') then
    raise exception 'idea_id deve indicare un''idea esistente';
  end if;

  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.title is not distinct from old.title
     and new.status is not distinct from old.status
     and new.data is not distinct from old.data
     and new.idea_id is not distinct from old.idea_id
     and new.deleted_at is not distinct from old.deleted_at then
    new.version := old.version;
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
    return new;
  end if;

  new.version := old.version + 1;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;

-- Ogni modifica reale diventa una revisione. Le revisioni non si possono modificare né cancellare.
create or replace function public.items_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op text;
  v_changed text[] := '{}';
  v_message text := nullif(btrim(coalesce(current_setting('app.commit_message', true), '')), '');
  v_revert text := nullif(current_setting('app.revert_from', true), '');
begin
  if tg_op = 'INSERT' then
    v_op := 'create';
  else
    if new.version = old.version then
      return null;
    end if;
    if new.deleted_at is not null and old.deleted_at is null then
      v_op := 'delete';
    elsif new.deleted_at is null and old.deleted_at is not null then
      v_op := 'restore';
    elsif v_revert is not null then
      v_op := 'revert';
    else
      v_op := 'update';
    end if;
    if new.title is distinct from old.title then
      v_changed := v_changed || 'title'::text;
    end if;
    if new.status is distinct from old.status then
      v_changed := v_changed || 'status'::text;
    end if;
    if new.idea_id is distinct from old.idea_id then
      v_changed := v_changed || 'idea_id'::text;
    end if;
    select v_changed || coalesce(array_agg(d.k order by d.k), '{}'::text[])
      into v_changed
      from (
        select coalesce(n.key, o.key) as k
        from jsonb_each(new.data) n
        full join jsonb_each(old.data) o on o.key = n.key
        where n.value is distinct from o.value
      ) d;
  end if;

  insert into public.revisions (item_id, version, op, kind, idea_id, title, status, data, changed, author_id, message)
  values (new.id, new.version, v_op, new.kind, new.idea_id, new.title, new.status, new.data, v_changed, auth.uid(), left(v_message, 500));
  return null;
end
$$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write
  before insert or update on public.items
  for each row execute function public.items_before_write();

drop trigger if exists items_after_write on public.items;
create trigger items_after_write
  after insert or update on public.items
  for each row execute function public.items_after_write();

alter table public.items enable row level security;
alter table public.revisions enable row level security;

drop policy if exists items_select on public.items;
create policy items_select on public.items
  for select to authenticated
  using ((select public.can_read()));

-- Gli advisor possono gestire solo i propri voti.
drop policy if exists items_insert on public.items;
create policy items_insert on public.items
  for insert to authenticated
  with check (
    (select public.can_read())
    and ((select public.can_write()) or kind = 'score')
  );

drop policy if exists items_update on public.items;
create policy items_update on public.items
  for update to authenticated
  using (
    (select public.can_read())
    and (
      (kind = 'score' and created_by = (select auth.uid()))
      or (kind <> 'score' and (select public.can_write()))
    )
  )
  with check (
    (select public.can_read())
    and (
      (kind = 'score' and created_by = (select auth.uid()))
      or (kind <> 'score' and (select public.can_write()))
    )
  );

drop policy if exists revisions_select on public.revisions;
create policy revisions_select on public.revisions
  for select to authenticated
  using ((select public.can_read()));

-- =========================================================================
-- Operazioni stile git (usate dal sito)
-- =========================================================================

create or replace function public.create_item(
  p_kind text,
  p_title text,
  p_status text,
  p_data jsonb,
  p_idea_id uuid default null,
  p_message text default null
)
returns public.items
language plpgsql
set search_path = ''
as $$
declare
  r public.items;
begin
  perform set_config('app.commit_message', coalesce(p_message, ''), true);
  insert into public.items (kind, title, status, data, idea_id)
  values (p_kind, coalesce(p_title, ''), p_status, coalesce(p_data, '{}'::jsonb), p_idea_id)
  returning * into r;
  return r;
end
$$;

create or replace function public.item_write_result(p_id uuid, p_base_version integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.items;
begin
  select * into r from public.items where id = p_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  elsif r.deleted_at is not null then
    return jsonb_build_object('status', 'deleted', 'item', to_jsonb(r));
  elsif r.version <> p_base_version then
    return jsonb_build_object('status', 'conflict', 'item', to_jsonb(r));
  end if;
  return jsonb_build_object('status', 'forbidden', 'item', to_jsonb(r));
end
$$;

-- Salva solo se nessuno ha salvato nel frattempo (p_base_version), come un push senza force.
create or replace function public.save_item(
  p_id uuid,
  p_base_version integer,
  p_title text,
  p_status text,
  p_data jsonb,
  p_idea_id uuid default null,
  p_message text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.items;
begin
  perform set_config('app.commit_message', coalesce(p_message, ''), true);
  update public.items
     set title = coalesce(p_title, ''),
         status = p_status,
         data = coalesce(p_data, '{}'::jsonb),
         idea_id = p_idea_id
   where id = p_id and version = p_base_version and deleted_at is null
  returning * into r;
  if found then
    return jsonb_build_object('status', 'ok', 'item', to_jsonb(r));
  end if;
  return public.item_write_result(p_id, p_base_version);
end
$$;

create or replace function public.delete_item(p_id uuid, p_base_version integer, p_message text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.items;
begin
  perform set_config('app.commit_message', coalesce(p_message, ''), true);
  update public.items
     set deleted_at = now()
   where id = p_id
     and version = p_base_version
     and deleted_at is null
     and kind not in ('criteria', 'generator', 'score', 'teamcanvas', 'equity')
  returning * into r;
  if found then
    return jsonb_build_object('status', 'ok', 'item', to_jsonb(r));
  end if;
  return public.item_write_result(p_id, p_base_version);
end
$$;

create or replace function public.restore_item(p_id uuid, p_message text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.items;
begin
  perform set_config('app.commit_message', coalesce(p_message, ''), true);
  update public.items set deleted_at = null where id = p_id and deleted_at is not null
  returning * into r;
  if found then
    return jsonb_build_object('status', 'ok', 'item', to_jsonb(r));
  end if;
  select * into r from public.items where id = p_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  elsif r.deleted_at is null then
    return jsonb_build_object('status', 'ok', 'item', to_jsonb(r));
  end if;
  return jsonb_build_object('status', 'forbidden', 'item', to_jsonb(r));
end
$$;

-- Riporta un elemento a una versione precedente creando una nuova revisione, come git revert.
create or replace function public.revert_item(
  p_id uuid,
  p_to_version integer,
  p_base_version integer,
  p_message text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.revisions;
  r public.items;
  v_ok boolean;
begin
  select * into v from public.revisions where item_id = p_id and version = p_to_version;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform set_config(
    'app.commit_message',
    coalesce(nullif(btrim(p_message), ''), 'Ripristinata la versione ' || p_to_version),
    true
  );
  perform set_config('app.revert_from', p_to_version::text, true);
  update public.items
     set title = v.title, status = v.status, data = v.data, idea_id = v.idea_id
   where id = p_id and version = p_base_version and deleted_at is null
  returning * into r;
  v_ok := found;
  perform set_config('app.revert_from', '', true);
  if v_ok then
    return jsonb_build_object('status', 'ok', 'item', to_jsonb(r));
  end if;
  return public.item_write_result(p_id, p_base_version);
end
$$;

-- =========================================================================
-- Commenti
-- =========================================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  ai_task text check (
    ai_task is null
    or ai_task in ('critique', 'next_experiment', 'interview_questions', 'interview_synthesis', 'cell_ideas')
  ),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists comments_item_idx on public.comments (item_id, created_at);

create or replace function public.comments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    return new;
  end if;
  new.id := old.id;
  new.item_id := old.item_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  new.ai_task := old.ai_task;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists comments_before_write on public.comments;
create trigger comments_before_write
  before insert or update on public.comments
  for each row execute function public.comments_before_write();

alter table public.comments enable row level security;

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using ((select public.can_read()));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check ((select public.can_read()));

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using ((select public.can_read()) and author_id = (select auth.uid()))
  with check ((select public.can_read()) and author_id = (select auth.uid()));

-- =========================================================================
-- Chat della squadra
-- =========================================================================

-- Una chat «Generale» sempre presente e chat per argomento, collegabili a un'idea. Si archiviano, non si cancellano.
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  idea_id uuid references public.items (id),
  is_general boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists chats_one_general_idx on public.chats (is_general) where is_general;

create or replace function public.chats_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Dal sito non si crea un'altra chat generale; dal SQL Editor (senza utente) sì, una volta sola.
    if auth.uid() is not null then
      new.is_general := false;
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.archived_at := null;
  else
    new.id := old.id;
    new.is_general := old.is_general;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if old.is_general then
      new.archived_at := null;
      new.idea_id := null;
    end if;
  end if;
  new.title := btrim(new.title);
  if new.idea_id is not null
     and (tg_op = 'INSERT' or new.idea_id is distinct from old.idea_id)
     and not exists (select 1 from public.items i where i.id = new.idea_id and i.kind = 'idea') then
    raise exception 'La chat si può collegare solo a un''idea';
  end if;
  return new;
end
$$;

drop trigger if exists chats_before_write on public.chats;
create trigger chats_before_write
  before insert or update on public.chats
  for each row execute function public.chats_before_write();

insert into public.chats (title, is_general)
select 'Generale', true
where not exists (select 1 from public.chats where is_general);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

-- Risposta a un messaggio specifico, come su WhatsApp.
alter table public.chat_messages add column if not exists reply_to uuid references public.chat_messages (id) on delete set null;

create index if not exists chat_messages_chat_idx on public.chat_messages (chat_id, created_at desc);

create or replace function public.chat_messages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    if exists (select 1 from public.chats c where c.id = new.chat_id and c.archived_at is not null) then
      raise exception 'Questa chat è archiviata';
    end if;
    if new.reply_to is not null
       and not exists (select 1 from public.chat_messages m where m.id = new.reply_to and m.chat_id = new.chat_id) then
      raise exception 'Si può rispondere solo a un messaggio della stessa chat';
    end if;
    return new;
  end if;
  new.id := old.id;
  new.chat_id := old.chat_id;
  new.reply_to := old.reply_to;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  if old.deleted_at is not null then
    raise exception 'Il messaggio è già stato eliminato';
  end if;
  -- Un messaggio eliminato perde davvero il testo.
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := 'eliminato';
    new.edited_at := old.edited_at;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists chat_messages_before_write on public.chat_messages;
create trigger chat_messages_before_write
  before insert or update on public.chat_messages
  for each row execute function public.chat_messages_before_write();

create table if not exists public.chat_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);

alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

-- Come i commenti: scrivono tutti i membri con 2FA, advisor compresi; ognuno modifica solo i propri messaggi.
drop policy if exists chats_select on public.chats;
create policy chats_select on public.chats
  for select to authenticated
  using ((select public.can_read()));

drop policy if exists chats_insert on public.chats;
create policy chats_insert on public.chats
  for insert to authenticated
  with check ((select public.can_read()));

drop policy if exists chats_update on public.chats;
create policy chats_update on public.chats
  for update to authenticated
  using ((select public.can_read()))
  with check ((select public.can_read()));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using ((select public.can_read()));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check ((select public.can_read()));

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
  for update to authenticated
  using ((select public.can_read()) and author_id = (select auth.uid()))
  with check ((select public.can_read()) and author_id = (select auth.uid()));

drop policy if exists chat_reads_select on public.chat_reads;
create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using ((select public.can_read()) and user_id = (select auth.uid()));

-- Per ogni chat: ultimo messaggio e messaggi degli altri non ancora letti da chi chiede.
-- Senza letture registrate si parte da quando la persona è entrata nel team.
create or replace function public.chat_overview()
returns table (chat_id uuid, last_message_at timestamptz, unread integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    (select max(m.created_at) from public.chat_messages m where m.chat_id = c.id and m.deleted_at is null),
    (
      select count(*)::integer
      from public.chat_messages m
      where m.chat_id = c.id
        and m.deleted_at is null
        and m.author_id is distinct from auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.chat_reads r where r.chat_id = c.id and r.user_id = auth.uid()),
          (select mb.created_at from public.members mb where mb.user_id = auth.uid())
        )
    )
  from public.chats c
  where public.can_read()
$$;

create or replace function public.mark_chat_read(p_chat uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.chat_reads (user_id, chat_id, last_read_at)
  select auth.uid(), c.id, now()
  from public.chats c
  where c.id = p_chat and public.can_read()
  on conflict (user_id, chat_id) do update set last_read_at = excluded.last_read_at
$$;

-- =========================================================================
-- Menzioni: @[Nome Cognome] o @[tutti] in messaggi, commenti e note
-- =========================================================================

-- Le crea solo il database, dai testi salvati; ognuno vede solo le proprie.
create table if not exists public.mentions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('chat', 'comment', 'note')),
  source_id uuid not null,
  chat_id uuid references public.chats (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  excerpt text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, source, source_id)
);

create index if not exists mentions_user_idx on public.mentions (user_id, created_at desc);

alter table public.mentions enable row level security;

drop policy if exists mentions_select on public.mentions;
create policy mentions_select on public.mentions
  for select to authenticated
  using ((select public.can_read()) and user_id = (select auth.uid()));

-- Chi è menzionato in un testo: i membri il cui nome compare come @[Nome], tutti con @[tutti], mai chi scrive.
create or replace function public.mentioned_users(p_text text, p_author uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select m.user_id
  from public.members m
  where m.user_id is distinct from p_author
    and (
      coalesce(p_text, '') ~* '@\[tutti\]'
      or exists (
        select 1 from regexp_matches(coalesce(p_text, ''), '@\[([^]\n]{1,80})\]', 'g') as x(name)
        where lower(btrim(x.name[1])) = lower(m.display_name)
      )
    )
$$;

-- Una menzione per persona e per testo: modificando si aggiungono solo le persone nuove.
create or replace function public.record_mentions(p_source text, p_source_id uuid, p_text text, p_author uuid, p_chat uuid, p_item uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.mentions (user_id, author_id, source, source_id, chat_id, item_id, excerpt)
  select
    u, p_author, p_source, p_source_id, p_chat, p_item,
    left(btrim(regexp_replace(regexp_replace(regexp_replace(p_text, '!\[[^]\n]*\]\([^)]*\)', '[immagine]', 'g'), '@\[([^]\n]{1,80})\]', '@\1', 'g'), '\s+', ' ', 'g')), 200)
  from public.mentioned_users(p_text, p_author) as u
  on conflict (user_id, source, source_id) do nothing
$$;

create or replace function public.chat_messages_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    delete from public.mentions where source = 'chat' and source_id = new.id;
  else
    perform public.record_mentions('chat', new.id, new.body, new.author_id, new.chat_id, null);
  end if;
  return null;
end
$$;

drop trigger if exists chat_messages_mentions on public.chat_messages;
create trigger chat_messages_mentions
  after insert or update on public.chat_messages
  for each row execute function public.chat_messages_mentions();

create or replace function public.comments_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    delete from public.mentions where source = 'comment' and source_id = new.id;
  else
    perform public.record_mentions('comment', new.id, new.body, new.author_id, null, new.item_id);
  end if;
  return null;
end
$$;

drop trigger if exists comments_mentions on public.comments;
create trigger comments_mentions
  after insert or update on public.comments
  for each row execute function public.comments_mentions();

create or replace function public.notes_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'note' and new.deleted_at is null then
    perform public.record_mentions('note', new.id, new.data ->> 'body', new.updated_by, null, new.id);
  end if;
  return null;
end
$$;

drop trigger if exists notes_mentions on public.items;
create trigger notes_mentions
  after insert or update on public.items
  for each row execute function public.notes_mentions();

create or replace function public.mark_mentions_read(p_ids bigint[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mentions
  set read_at = now()
  where user_id = auth.uid() and read_at is null and public.can_read() and (p_ids is null or id = any (p_ids))
$$;

-- =========================================================================
-- Immagini delle note
-- =========================================================================

-- Spazio privato per le immagini di note e chat: solo JPEG già ridotti nel browser, letti e caricati dai membri con 2FA,
-- cancellati da chi può modificare.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-immagini', 'note-immagini', false, 1048576, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists note_images_select on storage.objects;
create policy note_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'note-immagini' and (select public.can_read()));

drop policy if exists note_images_insert on storage.objects;
create policy note_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-immagini'
    and (select public.can_read())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );

drop policy if exists note_images_delete on storage.objects;
create policy note_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-immagini' and (select public.can_write()));

-- Immagini senza puntatore in nessuna nota (cestino compreso) e in nessun messaggio. Senza elenco: quelle caricate da più di 24 ore
-- (le altre possono essere in una nota non ancora salvata). Il sito poi le cancella con le API di Storage.
create or replace function public.note_image_orphans(p_paths text[] default null)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'note-immagini'
    and public.can_write()
    and (case when p_paths is null then o.created_at < now() - interval '24 hours' else o.name = any (p_paths) end)
    and not exists (
      select 1 from public.items i
      where i.kind = 'note' and strpos(coalesce(i.data ->> 'body', ''), '(immagine:' || o.name || ')') > 0
    )
    and not exists (
      select 1 from public.chat_messages m
      where m.deleted_at is null and strpos(m.body, '(immagine:' || o.name || ')') > 0
    )
$$;

-- =========================================================================
-- Uso di Claude (scritto solo dalla Edge Function)
-- =========================================================================

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using ((select public.can_read()) and (user_id = (select auth.uid()) or (select public.is_admin())));

-- =========================================================================
-- Registro di sicurezza: chi entra nel team, chi esce, chi cambia ruolo
-- =========================================================================

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  event text not null check (event in ('member_added', 'member_role_changed', 'member_removed')),
  actor_id uuid,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

create or replace function public.members_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (event, actor_id, target_id, details)
    values ('member_added', auth.uid(), new.user_id, jsonb_build_object('role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      insert into public.audit_log (event, actor_id, target_id, details)
      values ('member_role_changed', auth.uid(), new.user_id, jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  else
    insert into public.audit_log (event, actor_id, target_id, details)
    values ('member_removed', auth.uid(), old.user_id, jsonb_build_object('role', old.role));
  end if;
  return null;
end
$$;

drop trigger if exists members_audit on public.members;
create trigger members_audit
  after insert or update or delete on public.members
  for each row execute function public.members_audit();

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- =========================================================================
-- Email: menzioni non lette e riepilogo del lunedì (Edge Function notify)
-- =========================================================================

-- Preferenze di ciascuno: senza riga sono accese tutte e due. Si cambiano solo con set_email_prefs.
create table if not exists public.email_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mentions boolean not null default true,
  weekly boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.email_prefs enable row level security;

drop policy if exists email_prefs_select on public.email_prefs;
create policy email_prefs_select on public.email_prefs
  for select to authenticated
  using ((select public.can_read()) and user_id = (select auth.uid()));

-- Un riepilogo per persona e per settimana: la riga si scrive prima dell'invio, così un nuovo tentativo non lo rimanda.
create table if not exists public.email_weekly (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.email_weekly enable row level security;

-- emailed_at: menzione già gestita (inviata, saltata per preferenza o già presente all'installazione).
-- La colonna nasce qui una volta sola, insieme al segno sulle menzioni esistenti: rieseguire lo schema non tocca le nuove.
do $$
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.mentions'::regclass and attname = 'emailed_at' and not attisdropped
  ) then
    alter table public.mentions add column emailed_at timestamptz;
    update public.mentions set emailed_at = now();
  end if;
end
$$;

create index if not exists mentions_email_pending_idx on public.mentions (created_at) where emailed_at is null;

create or replace function public.set_email_prefs(p_mentions boolean default null, p_weekly boolean default null)
returns public.email_prefs
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.email_prefs;
begin
  if not public.can_read() then
    raise exception 'Serve un account del team con la verifica in due passaggi';
  end if;
  insert into public.email_prefs (user_id, mentions, weekly)
  values (auth.uid(), coalesce(p_mentions, true), coalesce(p_weekly, true))
  on conflict (user_id) do update
    set mentions = coalesce(p_mentions, public.email_prefs.mentions),
        weekly = coalesce(p_weekly, public.email_prefs.weekly),
        updated_at = now()
  returning * into r;
  return r;
end
$$;

-- Le funzioni notify_* le chiama solo la Edge Function con la chiave di servizio.
-- Destinatari: membri con email e 2FA attiva, come chi può leggere il sito.
create or replace function public.notify_recipients()
returns table (user_id uuid, display_name text, email text, mentions boolean, weekly boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.display_name, u.email::text, coalesce(p.mentions, true), coalesce(p.weekly, true)
  from public.members m
  join auth.users u on u.id = m.user_id
  left join public.email_prefs p on p.user_id = m.user_id
  where coalesce(u.email, '') <> ''
    and exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified')
  order by m.created_at
$$;

create or replace function public.notify_pending_mentions(p_since timestamptz)
returns table (
  id bigint,
  user_id uuid,
  author_id uuid,
  author_name text,
  source text,
  source_id uuid,
  chat_id uuid,
  chat_title text,
  item_id uuid,
  item_title text,
  item_kind text,
  excerpt text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select mn.id, mn.user_id, mn.author_id, a.display_name, mn.source, mn.source_id, mn.chat_id, c.title,
         mn.item_id, i.title, i.kind, mn.excerpt, mn.created_at, mn.read_at
  from public.mentions mn
  left join public.members a on a.user_id = mn.author_id
  left join public.chats c on c.id = mn.chat_id
  left join public.items i on i.id = mn.item_id
  where mn.emailed_at is null and mn.read_at is null and mn.created_at > p_since
  order by mn.user_id, mn.created_at
$$;

-- Segna le menzioni prima dell'invio: restituisce solo quelle ancora da gestire e non lette, così nessuna parte due volte.
create or replace function public.notify_claim_mentions(p_ids bigint[])
returns table (id bigint)
language sql
security definer
set search_path = ''
as $$
  update public.mentions m
  set emailed_at = now()
  where m.id = any (p_ids) and m.emailed_at is null and m.read_at is null
  returning m.id
$$;

-- Solo quando il servizio email ha rifiutato l'invio: le menzioni tornano da gestire.
create or replace function public.notify_release_mentions(p_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mentions set emailed_at = null where id = any (p_ids)
$$;

create or replace function public.notify_claim_weekly(p_user uuid, p_week date)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.email_weekly (user_id, week_start)
    values (p_user, p_week)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from ins)
$$;

create or replace function public.notify_release_weekly(p_user uuid, p_week date)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.email_weekly where user_id = p_user and week_start = p_week
$$;

-- Dati del riepilogo: le scelte (cosa mostrare a chi) le fa la funzione notify.
-- Dei contatti esterni si manda solo il ruolo, mai il nome (il titolo della scheda).
-- reached: interviste fatte, esperimenti conclusi e decisioni prese per la prima volta dopo p_since.
create or replace function public.notify_weekly_data(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'owner', i.data ->> 'owner', 'next_step', i.data ->> 'next_step') order by i.created_at)
      from public.items i
      where i.kind = 'idea' and i.deleted_at is null and i.status not in ('scartata', 'parcheggiata')
        and coalesce(i.data ->> 'owner', '') <> ''
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'role', i.data ->> 'role', 'idea_title', idea.title, 'owner', i.data ->> 'owner', 'next_date', i.data ->> 'next_date'
      ) order by i.data ->> 'next_date')
      from public.items i
      join public.items idea on idea.id = i.idea_id and idea.deleted_at is null
      where i.kind = 'contact' and i.deleted_at is null and i.status <> 'chiusa'
        and coalesce(i.data ->> 'owner', '') <> '' and coalesce(i.data ->> 'next_date', '') <> ''
    ), '[]'::jsonb),
    'experiments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'title', i.title, 'idea_title', idea.title, 'owner', i.data ->> 'owner', 'status', i.status,
        'start_date', i.data ->> 'start_date', 'end_date', i.data ->> 'end_date'
      ) order by i.created_at)
      from public.items i
      join public.items idea on idea.id = i.idea_id and idea.deleted_at is null
      where i.kind = 'experiment' and i.deleted_at is null and i.status <> 'concluso'
        and coalesce(i.data ->> 'owner', '') <> ''
    ), '[]'::jsonb),
    'new_ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title) order by i.created_at)
      from public.items i
      where i.kind = 'idea' and i.deleted_at is null and i.created_at >= p_since
    ), '[]'::jsonb),
    'busy_ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'changes', x.n) order by x.n desc, x.title)
      from (
        select idea.id, idea.title, count(*)::integer as n
        from public.revisions r
        join public.items idea on idea.id = case when r.kind = 'idea' then r.item_id else r.idea_id end
        where r.created_at >= p_since and idea.kind = 'idea' and idea.deleted_at is null
        group by idea.id, idea.title
        order by n desc, idea.title
        limit 5
      ) x
    ), '[]'::jsonb),
    'reached', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'title', i.title, 'source', i.data ->> 'source', 'commitment', i.data ->> 'commitment'
      ) order by i.updated_at)
      from public.items i
      join (values
        ('interview', array['fatta', 'analizzata']),
        ('experiment', array['concluso']),
        ('decision', array['presa', 'rivista'])
      ) as s (kind, statuses) on s.kind = i.kind
      where i.deleted_at is null
        and i.status = any (s.statuses)
        and exists (select 1 from public.revisions r where r.item_id = i.id and r.created_at >= p_since and r.status = any (s.statuses))
        and not exists (select 1 from public.revisions r where r.item_id = i.id and r.created_at < p_since and r.status = any (s.statuses))
    ), '[]'::jsonb),
    'unread', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', mb.user_id,
        'mentions', (select count(*) from public.mentions mn where mn.user_id = mb.user_id and mn.read_at is null),
        'chat', (
          select count(*)
          from public.chat_messages m
          where m.deleted_at is null
            and m.author_id is distinct from mb.user_id
            and m.created_at > coalesce(
              (select r.last_read_at from public.chat_reads r where r.chat_id = m.chat_id and r.user_id = mb.user_id),
              mb.created_at
            )
        )
      ))
      from public.members mb
    ), '[]'::jsonb)
  )
$$;

-- Chiamata dai job di pg_cron: legge indirizzo e segreto dal Vault e invia la richiesta con pg_net.
-- Senza Vault, pg_net o uno dei due segreti non fa nulla.
create or replace function public.notify_call(p_job text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  if p_job is null or p_job not in ('mentions', 'weekly') then
    raise exception 'Invio sconosciuto: %', p_job;
  end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute $q$
    select max(decrypted_secret) filter (where name = 'notify_url'), max(decrypted_secret) filter (where name = 'notify_secret')
    from vault.decrypted_secrets
    where name in ('notify_url', 'notify_secret')
  $q$ into v_url, v_secret;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  execute 'select net.http_post(url => $1, body => $2, headers => $3, timeout_milliseconds => 60000)'
    into v_id
    using v_url, jsonb_build_object('job', p_job), jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret);
  return v_id;
end
$$;

-- =========================================================================
-- Permessi
-- =========================================================================

revoke all on public.members, public.items, public.revisions, public.comments, public.ai_usage, public.audit_log, public.chats, public.chat_messages, public.chat_reads, public.mentions, public.email_prefs, public.email_weekly from anon;
revoke all on public.members, public.items, public.revisions, public.comments, public.ai_usage, public.audit_log, public.chats, public.chat_messages, public.chat_reads, public.mentions, public.email_prefs, public.email_weekly from authenticated;
grant select on public.email_prefs to authenticated;
grant select on public.audit_log to authenticated;
grant select, update, delete on public.members to authenticated;
grant select, insert, update on public.items to authenticated;
grant select on public.revisions to authenticated;
grant select, insert, update on public.comments to authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update on public.chats to authenticated;
grant select, insert, update on public.chat_messages to authenticated;
grant select on public.chat_reads to authenticated;
grant select on public.mentions to authenticated;

-- Le funzioni dei trigger non devono essere chiamabili via API.
revoke execute on function public.items_before_write() from public, anon, authenticated;
revoke execute on function public.items_after_write() from public, anon, authenticated;
revoke execute on function public.comments_before_write() from public, anon, authenticated;
revoke execute on function public.members_before_update() from public, anon, authenticated;
revoke execute on function public.members_audit() from public, anon, authenticated;
revoke execute on function public.chats_before_write() from public, anon, authenticated;
revoke execute on function public.chat_messages_before_write() from public, anon, authenticated;
revoke execute on function public.chat_messages_mentions() from public, anon, authenticated;
revoke execute on function public.comments_mentions() from public, anon, authenticated;
revoke execute on function public.notes_mentions() from public, anon, authenticated;
revoke execute on function public.record_mentions(text, uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mentioned_users(text, uuid) from public, anon, authenticated;

-- Le funzioni delle email: solo la chiave di servizio (Edge Function notify); notify_call solo pg_cron.
revoke execute on function public.notify_recipients() from public, anon, authenticated;
revoke execute on function public.notify_pending_mentions(timestamptz) from public, anon, authenticated;
revoke execute on function public.notify_claim_mentions(bigint[]) from public, anon, authenticated;
revoke execute on function public.notify_release_mentions(bigint[]) from public, anon, authenticated;
revoke execute on function public.notify_claim_weekly(uuid, date) from public, anon, authenticated;
revoke execute on function public.notify_release_weekly(uuid, date) from public, anon, authenticated;
revoke execute on function public.notify_weekly_data(timestamptz) from public, anon, authenticated;
revoke execute on function public.notify_call(text) from public, anon, authenticated, service_role;
grant execute on function public.notify_recipients() to service_role;
grant execute on function public.notify_pending_mentions(timestamptz) to service_role;
grant execute on function public.notify_claim_mentions(bigint[]) to service_role;
grant execute on function public.notify_release_mentions(bigint[]) to service_role;
grant execute on function public.notify_claim_weekly(uuid, date) to service_role;
grant execute on function public.notify_release_weekly(uuid, date) to service_role;
grant execute on function public.notify_weekly_data(timestamptz) to service_role;

revoke execute on function public.my_role() from public, anon;
revoke execute on function public.has_mfa() from public, anon;
revoke execute on function public.can_read() from public, anon;
revoke execute on function public.can_write() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.add_member(text, text, text) from public, anon;
revoke execute on function public.members_overview() from public, anon;
revoke execute on function public.touch_activity() from public, anon;
revoke execute on function public.create_item(text, text, text, jsonb, uuid, text) from public, anon;
revoke execute on function public.item_write_result(uuid, integer) from public, anon;
revoke execute on function public.save_item(uuid, integer, text, text, jsonb, uuid, text) from public, anon;
revoke execute on function public.delete_item(uuid, integer, text) from public, anon;
revoke execute on function public.restore_item(uuid, text) from public, anon;
revoke execute on function public.revert_item(uuid, integer, integer, text) from public, anon;
revoke execute on function public.note_image_orphans(text[]) from public, anon;
revoke execute on function public.chat_overview() from public, anon;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
revoke execute on function public.mark_mentions_read(bigint[]) from public, anon;
revoke execute on function public.set_email_prefs(boolean, boolean) from public, anon;

grant execute on function public.my_role() to authenticated;
grant execute on function public.has_mfa() to authenticated;
grant execute on function public.can_read() to authenticated;
grant execute on function public.can_write() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.add_member(text, text, text) to authenticated;
grant execute on function public.members_overview() to authenticated;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.create_item(text, text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.item_write_result(uuid, integer) to authenticated;
grant execute on function public.save_item(uuid, integer, text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.delete_item(uuid, integer, text) to authenticated;
grant execute on function public.restore_item(uuid, text) to authenticated;
grant execute on function public.revert_item(uuid, integer, integer, text) to authenticated;
grant execute on function public.note_image_orphans(text[]) to authenticated;
grant execute on function public.chat_overview() to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;
grant execute on function public.mark_mentions_read(bigint[]) to authenticated;
grant execute on function public.set_email_prefs(boolean, boolean) to authenticated;

-- =========================================================================
-- Realtime: aggiornamenti dal vivo e presenza
-- =========================================================================

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['items', 'revisions', 'comments', 'members', 'chats', 'chat_messages', 'mentions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

-- Negato di default: lo schema non si installa se una tabella pubblica non ha la RLS attiva.
do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'La tabella public.% non ha la Row Level Security attiva', t;
  end loop;
end
$$;

-- Canale privato "board" per vedere chi è online: solo membri con 2FA.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists board_presence_select on realtime.messages';
    execute $p$
      create policy board_presence_select on realtime.messages
        for select to authenticated
        using ((select public.can_read()) and realtime.topic() = 'board')
    $p$;
    execute 'drop policy if exists board_presence_insert on realtime.messages';
    execute $p$
      create policy board_presence_insert on realtime.messages
        for insert to authenticated
        with check ((select public.can_read()) and realtime.topic() = 'board')
    $p$;
  end if;
end
$$;

-- =========================================================================
-- Email programmate: pg_cron chiama la funzione notify con pg_net
-- =========================================================================

-- Menzioni ogni 10 minuti. Riepilogo il lunedì alle 6:00 UTC (pg_cron ragiona in UTC): sono le 7:00 in Italia
-- con l'ora solare e le 8:00 con l'ora legale, quindi sempre lunedì mattina. Il segreto e l'indirizzo stanno nel Vault:
-- finché mancano, i job non fanno nulla. Dove pg_cron o pg_net non ci sono (il database dei test) non si programma niente.
do $$
begin
  begin
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      create extension if not exists pg_net with schema extensions;
    else
      create extension if not exists pg_net;
    end if;
  exception when others then
    raise notice 'pg_net non disponibile: le email non partono';
  end;
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron non disponibile: le email non sono programmate';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('notify-mentions', '*/10 * * * *', $job$select public.notify_call('mentions')$job$);
    perform cron.schedule('notify-weekly', '0 6 * * 1', $job$select public.notify_call('weekly')$job$);
  end if;
end
$$;
