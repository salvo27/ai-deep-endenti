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
    'note', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap', 'survey'
  )
);

create index if not exists items_kind_idx on public.items (kind);
create index if not exists items_idea_idx on public.items (idea_id);
-- Il link pubblico di un questionario porta a un solo questionario.
create unique index if not exists items_survey_token_idx on public.items ((data ->> 'token')) where kind = 'survey';
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

  -- Senza coalesce uno stato mancante dove serve darebbe null e il controllo non scatterebbe.
  if not coalesce(
    (new.kind = 'idea' and new.status in ('nuova', 'esplorazione', 'validazione', 'scelta', 'parcheggiata', 'scartata'))
    or (new.kind = 'experiment' and new.status in ('pianificato', 'in_corso', 'concluso'))
    or (new.kind = 'interview' and new.status in ('da_fare', 'fatta', 'analizzata'))
    or (new.kind = 'decision' and new.status in ('proposta', 'presa', 'rivista'))
    or (new.kind = 'contact' and new.status in ('da_contattare', 'contattata', 'fissata', 'in_contatto', 'chiusa'))
    or (new.kind = 'survey' and new.status in ('bozza', 'aperto', 'chiuso'))
    or (new.kind in ('canvas', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap')
        and new.status is null),
    false
  ) then
    raise exception 'Stato non valido per questo tipo di elemento';
  end if;
  if new.kind in ('idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note', 'scoresnap', 'survey')
     and btrim(new.title) = '' then
    raise exception 'Il titolo è obbligatorio';
  end if;
  if new.kind in ('canvas', 'experiment', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'survey') and new.idea_id is null then
    raise exception 'Questo elemento deve appartenere a un''idea';
  end if;
  if new.kind in ('idea', 'decision', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap') and new.idea_id is not null then
    raise exception 'Questo elemento non può appartenere a un''idea';
  end if;
  if new.idea_id is not null and new.idea_id is distinct from (case when tg_op = 'UPDATE' then old.idea_id end)
     and not exists (select 1 from public.items i where i.id = new.idea_id and i.kind = 'idea') then
    raise exception 'idea_id deve indicare un''idea esistente';
  end if;

  -- Questionari: quello che finisce nella pagina pubblica (link, impostazioni, aspetto) si controlla anche qui.
  if new.kind = 'survey' then
    if new.data ? 'token'
       and (jsonb_typeof(new.data -> 'token') <> 'string' or (new.data ->> 'token') !~ '^[A-Za-z0-9_-]{22}$') then
      raise exception 'Il link pubblico del questionario non è valido';
    end if;
    if (new.data ? 'layout' and coalesce(new.data ->> 'layout', '') not in ('una', 'sezioni'))
       or (new.data ? 'progress' and coalesce(new.data ->> 'progress', '') not in ('contatore', 'barra', 'nessuno'))
       or (new.data ? 'show_time' and jsonb_typeof(new.data -> 'show_time') <> 'boolean')
       or (new.data ? 'questions' and case
             when jsonb_typeof(new.data -> 'questions') = 'array' then jsonb_array_length(new.data -> 'questions') > 40
             else true
           end) then
      raise exception 'Impostazioni del questionario non valide';
    end if;
    -- Aspetto: solo tema e colore, mai altro (caratteri, immagini o CSS aprirebbero la pagina pubblica a contenuti estranei).
    if new.data ? 'appearance' and (case
         when jsonb_typeof(new.data -> 'appearance') = 'object' then exists (
           select 1 from jsonb_each(new.data -> 'appearance') a
           where not (
             (a.key = 'theme' and jsonb_typeof(a.value) = 'string' and (a.value #>> '{}') in ('automatico', 'chiaro', 'scuro', 'seppia', 'contrasto'))
             or (a.key = 'accent' and jsonb_typeof(a.value) = 'string' and (a.value #>> '{}') ~ '^#[0-9a-f]{6}$')
           )
         )
         else true
       end) then
      raise exception 'Aspetto del questionario non valido';
    end if;
    -- Immagini della schermata iniziale e del grazie: solo un file dello spazio «questionari-immagini» e la sua descrizione.
    if new.data ? 'cover' and (case
         when jsonb_typeof(new.data -> 'cover') = 'object' then
           jsonb_typeof(new.data -> 'cover' -> 'path') is distinct from 'string'
           or (new.data -> 'cover' ->> 'path') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
           or (new.data -> 'cover' ? 'alt' and (jsonb_typeof(new.data -> 'cover' -> 'alt') <> 'string' or char_length(new.data -> 'cover' ->> 'alt') > 200))
           or exists (select 1 from jsonb_object_keys(new.data -> 'cover') k where k not in ('path', 'alt'))
         else true
       end) then
      raise exception 'Immagine del questionario non valida';
    end if;
    if new.data ? 'thanks_image' and (case
         when jsonb_typeof(new.data -> 'thanks_image') = 'object' then
           jsonb_typeof(new.data -> 'thanks_image' -> 'path') is distinct from 'string'
           or (new.data -> 'thanks_image' ->> 'path') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
           or (new.data -> 'thanks_image' ? 'alt' and (jsonb_typeof(new.data -> 'thanks_image' -> 'alt') <> 'string' or char_length(new.data -> 'thanks_image' ->> 'alt') > 200))
           or exists (select 1 from jsonb_object_keys(new.data -> 'thanks_image') k where k not in ('path', 'alt'))
         else true
       end) then
      raise exception 'Immagine del questionario non valida';
    end if;
    if new.data ? 'experiment_id' then
      if jsonb_typeof(new.data -> 'experiment_id') <> 'string'
         or (new.data ->> 'experiment_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'L''esperimento collegato non è valido';
      end if;
      if (new.data -> 'experiment_id') is distinct from (case when tg_op = 'UPDATE' then old.data -> 'experiment_id' end)
         or new.idea_id is distinct from (case when tg_op = 'UPDATE' then old.idea_id end) then
        if not exists (
          select 1 from public.items e
          where e.id = (new.data ->> 'experiment_id')::uuid and e.kind = 'experiment' and e.idea_id = new.idea_id
        ) then
          raise exception 'L''esperimento collegato deve essere della stessa idea';
        end if;
      end if;
    end if;
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
-- Immagini dei questionari
-- =========================================================================

-- Spazio pubblico per le immagini della schermata iniziale e del grazie: le vede chiunque abbia il link del questionario, senza account.
-- Solo JPEG già ridotti nel browser, caricati e cancellati da chi può modificare; nessuna regola di lettura, così nessuno
-- può elencare i file: si apre solo quello di cui si conosce il percorso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('questionari-immagini', 'questionari-immagini', true, 1048576, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists survey_images_insert on storage.objects;
create policy survey_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'questionari-immagini'
    and (select public.can_write())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );

drop policy if exists survey_images_delete on storage.objects;
create policy survey_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'questionari-immagini' and (select public.can_write()));

-- Immagini che nessun questionario usa più (cestino compreso). Senza elenco: quelle caricate da più di 24 ore
-- (le altre possono essere in un questionario non ancora salvato). Il sito poi le cancella con le API di Storage.
create or replace function public.survey_image_orphans(p_paths text[] default null)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'questionari-immagini'
    and public.can_write()
    and (case when p_paths is null then o.created_at < now() - interval '24 hours' else o.name = any (p_paths) end)
    and not exists (
      select 1 from public.items i
      where i.kind = 'survey' and o.name in (i.data -> 'cover' ->> 'path', i.data -> 'thanks_image' ->> 'path')
    )
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
-- Questionari: link pubblico per chi risponde, risposte e statistiche per il team
-- =========================================================================

-- L'unica eccezione al «negato di default»: chi non ha un account usa solo public_survey, submit_survey e survey_event.
-- Le tabelle qui sotto non si leggono né si scrivono direttamente; il team legge le risposte e i conteggi.

-- Una riga per compilazione (session, generata dalla pagina): si salva schermata per schermata e diventa completa
-- con l'ultimo invio, dopo il quale non cambia più. Le incomplete restano: chi abbandona lascia comunque le sue risposte.
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.items (id) on delete cascade,
  session uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) < 20480),
  email text check (email is null or (char_length(email) <= 254 and email = lower(email))),
  recontact boolean not null default false,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  device text check (device is null or device in ('telefono', 'computer')),
  completed boolean not null default false,
  saves integer not null default 1 check (saves >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_responses_recontact_email check (not recontact or email is not null),
  constraint survey_responses_session_key unique (survey_id, session)
);

create index if not exists survey_responses_survey_idx on public.survey_responses (survey_id, created_at);

-- Secondi passati su ogni domanda, per vedere nei risultati le risposte date troppo in fretta.
alter table public.survey_responses add column if not exists question_seconds jsonb
  check (question_seconds is null or (jsonb_typeof(question_seconds) = 'object' and octet_length(question_seconds::text) < 8192));

-- Visite della pagina e inizi della compilazione, per l'imbuto: nessun dato su chi risponde.
create table if not exists public.survey_events (
  id bigint generated always as identity primary key,
  survey_id uuid not null references public.items (id) on delete cascade,
  kind text not null check (kind in ('view', 'start')),
  created_at timestamptz not null default now()
);

create index if not exists survey_events_survey_idx on public.survey_events (survey_id, kind, created_at);

-- Limiti per chi risponde: un'impronta (hash con sale del giorno) al posto dell'indirizzo, cancellata dopo 24 ore.
create table if not exists public.survey_limits (
  id bigint generated always as identity primary key,
  survey_id uuid not null references public.items (id) on delete cascade,
  client text not null,
  kind text not null check (kind in ('session', 'view', 'start')),
  created_at timestamptz not null default now()
);

create index if not exists survey_limits_client_idx on public.survey_limits (survey_id, client, created_at);
create index if not exists survey_limits_created_idx on public.survey_limits (created_at);

-- Un sale casuale al giorno, letto solo dalle funzioni qui sotto: cambiando ogni giorno, le impronte non si collegano tra giorni.
create table if not exists public.survey_salts (
  day date primary key,
  salt text not null
);

alter table public.survey_responses enable row level security;
alter table public.survey_events enable row level security;
alter table public.survey_limits enable row level security;
alter table public.survey_salts enable row level security;

-- Il team legge le risposte dei questionari non archiviati di idee non archiviate; nessuno le scrive direttamente.
drop policy if exists survey_responses_select on public.survey_responses;
create policy survey_responses_select on public.survey_responses
  for select to authenticated
  using (
    (select public.can_read())
    and exists (
      select 1
      from public.items s
      join public.items idea on idea.id = s.idea_id
      where s.id = survey_id and s.kind = 'survey' and s.deleted_at is null and idea.deleted_at is null
    )
  );

-- Testo da un valore JSON: solo stringhe, senza caratteri di controllo né spazi ai bordi, al massimo p_max caratteri.
create or replace function public.survey_text(p_value jsonb, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) = 'string'
      then left(btrim(regexp_replace(p_value #>> '{}', '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'), E' \t\r\n'), p_max)
    else ''
  end
$$;

-- Intero da un valore JSON: solo numeri senza decimali tra p_min e p_max.
create or replace function public.survey_int(p_value jsonb, p_min integer, p_max integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) = 'number' then
      case when p_value::numeric = trunc(p_value::numeric) and p_value::numeric between p_min and p_max then p_value::numeric::integer end
  end
$$;

-- Le domande come le vede chi risponde: solo campi noti e ben formati, senza il ruolo interno della domanda.
-- La stessa lista serve a mostrare il questionario e a controllare le risposte.
create or replace function public.survey_public_questions(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_q jsonb;
  v_o jsonb;
  v_out jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_opts jsonb;
  v_opt_ids text[];
  v_id text;
  v_type text;
  v_label text;
  v_item jsonb;
  v_other boolean;
  v_points integer;
  v_min integer;
  v_max integer;
  v_has_email boolean := false;
begin
  if jsonb_typeof(p_data -> 'questions') is distinct from 'array' then
    return v_out;
  end if;
  for v_q in select e.value from jsonb_array_elements(p_data -> 'questions') e loop
    exit when jsonb_array_length(v_out) >= 40;
    continue when jsonb_typeof(v_q) is distinct from 'object';
    v_id := case when jsonb_typeof(v_q -> 'id') = 'string' then v_q ->> 'id' else '' end;
    v_type := case when jsonb_typeof(v_q -> 'type') = 'string' then v_q ->> 'type' else '' end;
    v_label := public.survey_text(v_q -> 'label', 300);
    continue when v_id !~ '^[a-z0-9-]{1,40}$' or v_id = any (v_ids) or v_label = ''
      or v_type not in ('sezione', 'scelta', 'scelte', 'scala', 'numero', 'breve', 'lunga', 'email')
      or (v_type = 'email' and v_has_email);
    v_item := jsonb_build_object(
      'id', v_id,
      'type', v_type,
      'label', v_label,
      'help', public.survey_text(v_q -> 'help', 500),
      'required', v_type <> 'sezione' and coalesce(v_q -> 'required' = 'true'::jsonb, false)
    );
    if v_type in ('scelta', 'scelte') then
      v_opts := '[]'::jsonb;
      v_opt_ids := '{}';
      if jsonb_typeof(v_q -> 'options') = 'array' then
        for v_o in select e.value from jsonb_array_elements(v_q -> 'options') e loop
          exit when jsonb_array_length(v_opts) >= 20;
          continue when jsonb_typeof(v_o) is distinct from 'object' or jsonb_typeof(v_o -> 'id') is distinct from 'string';
          -- non-rispondo è riservato a «Preferisco non rispondere».
          continue when (v_o ->> 'id') !~ '^[a-z0-9-]{1,40}$' or (v_o ->> 'id') = any (v_opt_ids) or (v_o ->> 'id') = 'non-rispondo'
            or public.survey_text(v_o -> 'label', 120) = '';
          v_opt_ids := v_opt_ids || (v_o ->> 'id');
          v_opts := v_opts || jsonb_build_array(jsonb_build_object('id', v_o ->> 'id', 'label', public.survey_text(v_o -> 'label', 120)));
        end loop;
      end if;
      v_other := coalesce(v_q -> 'allow_other' = 'true'::jsonb, false);
      -- Una domanda a scelta senza opzioni e senza «Altro» non ha risposte possibili: non si mostra.
      continue when jsonb_array_length(v_opts) = 0 and not v_other;
      v_item := v_item || jsonb_build_object(
        'options', v_opts,
        'allow_other', v_other,
        'prefer_not', coalesce(v_q -> 'prefer_not' = 'true'::jsonb, false)
      );
      -- La voce con il campo di testo può avere un nome suo e un esempio nel campo.
      if v_other then
        v_item := v_item || jsonb_build_object(
          'other_label', coalesce(nullif(public.survey_text(v_q -> 'other_label', 120), ''), 'Altro'),
          'other_placeholder', public.survey_text(v_q -> 'other_placeholder', 120)
        );
      end if;
    elsif v_type = 'scala' then
      v_points := case when v_q -> 'scale' -> 'points' = '7'::jsonb then 7 else 5 end;
      v_item := v_item || jsonb_build_object('scale', jsonb_build_object(
        'points', v_points,
        'min_label', public.survey_text(v_q -> 'scale' -> 'min_label', 60),
        'max_label', public.survey_text(v_q -> 'scale' -> 'max_label', 60)
      ));
      if jsonb_typeof(v_q -> 'scale' -> 'labels') = 'array' and jsonb_array_length(v_q -> 'scale' -> 'labels') = v_points then
        v_item := jsonb_set(v_item, '{scale,labels}', (
          select jsonb_agg(public.survey_text(e.value, 60) order by e.n)
          from jsonb_array_elements(v_q -> 'scale' -> 'labels') with ordinality e (value, n)
        ));
      end if;
    elsif v_type = 'numero' then
      v_min := public.survey_int(v_q -> 'number' -> 'min', -1000000000, 1000000000);
      v_max := public.survey_int(v_q -> 'number' -> 'max', -1000000000, 1000000000);
      if v_min > v_max then
        select v_max, v_min into v_min, v_max;
      end if;
      v_item := v_item || jsonb_build_object('number', jsonb_strip_nulls(jsonb_build_object('min', v_min, 'max', v_max)));
    end if;
    if v_type = 'email' then
      v_has_email := true;
    end if;
    v_ids := v_ids || v_id;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;
  return v_out;
end
$$;

-- Il questionario di un link: non archiviato, di un'idea non archiviata. Senza riga se non c'è.
create or replace function public.survey_by_token(p_token text)
returns setof public.items
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.items s
  join public.items idea on idea.id = s.idea_id and idea.deleted_at is null
  where p_token ~ '^[A-Za-z0-9_-]{22}$'
    and s.kind = 'survey'
    and s.data ->> 'token' = p_token
    and s.deleted_at is null
$$;

-- Impronta di chi chiama per i limiti: hash dell'indirizzo con il sale del giorno e il questionario. L'indirizzo non si salva mai.
-- Prima cf-connecting-ip, che il proxy riscrive e non si può falsificare; poi il primo indirizzo di x-forwarded-for.
-- Senza intestazioni tutte le chiamate condividono un'impronta.
create or replace function public.survey_client(p_survey uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_headers jsonb;
  v_address text;
  v_salt text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_address := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
  delete from public.survey_salts where day < v_day;
  insert into public.survey_salts (day, salt)
  values (v_day, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (day) do nothing;
  select s.salt into v_salt from public.survey_salts s where s.day = v_day;
  return encode(sha256(convert_to(v_salt || '|' || p_survey::text || '|' || coalesce(left(v_address, 100), '-'), 'UTF8')), 'hex');
end
$$;

create or replace function public.survey_error(p_reason text, p_question text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('status', 'errore', 'reason', p_reason, 'question', p_question))
$$;

-- Per la pagina pubblica: il questionario aperto con le sole informazioni per chi risponde, mai identificativi interni.
-- median_seconds: durata mediana delle compilazioni complete, solo da 20 in su (un dato aggregato, mai di una persona).
create or replace function public.public_survey(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.items;
begin
  select * into s from public.survey_by_token(p_token);
  if s.id is null then
    return jsonb_build_object('status', 'non_trovato');
  elsif s.status is distinct from 'aperto' then
    return jsonb_build_object('status', 'chiuso');
  end if;
  return jsonb_build_object(
    'status', 'aperto',
    'title', s.title,
    'intro', public.survey_text(s.data -> 'intro', 2000),
    'privacy', public.survey_text(s.data -> 'privacy', 3000),
    'thanks', public.survey_text(s.data -> 'thanks', 1000),
    'layout', case when s.data ->> 'layout' = 'sezioni' then 'sezioni' else 'una' end,
    'progress', case when s.data ->> 'progress' in ('barra', 'nessuno') then s.data ->> 'progress' else 'contatore' end,
    'show_time', coalesce(s.data -> 'show_time' <> 'false'::jsonb, true),
    'median_seconds', (
      select case when count(*) >= 20 then round(percentile_cont(0.5) within group (order by r.duration_seconds)::numeric)::integer end
      from public.survey_responses r
      where r.survey_id = s.id and r.completed and r.duration_seconds is not null
    ),
    'cover', case when s.data -> 'cover' ->> 'path' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then jsonb_build_object(
      'path', s.data -> 'cover' ->> 'path',
      'alt', coalesce(left(s.data -> 'cover' ->> 'alt', 200), '')
    ) end,
    'thanks_image', case when s.data -> 'thanks_image' ->> 'path' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then jsonb_build_object(
      'path', s.data -> 'thanks_image' ->> 'path',
      'alt', coalesce(left(s.data -> 'thanks_image' ->> 'alt', 200), '')
    ) end,
    'thanks_contact', public.survey_text(s.data -> 'thanks_contact', 1000),
    'appearance', jsonb_build_object(
      'theme', case when s.data -> 'appearance' ->> 'theme' in ('chiaro', 'scuro', 'seppia', 'contrasto') then s.data -> 'appearance' ->> 'theme' else 'automatico' end,
      'accent', case when s.data -> 'appearance' ->> 'accent' ~ '^#[0-9a-f]{6}$' then s.data -> 'appearance' ->> 'accent' else '#3b4bc8' end
    ),
    'questions', public.survey_public_questions(s.data)
  );
end
$$;

-- Salvataggio dalla pagina pubblica, una schermata alla volta. Tutto si controlla qui, contro le domande salvate:
-- il browser può mentire. Ogni chiamata porta tutte le risposte date finora e sostituisce quelle salvate per la sessione.
-- p_meta: session (uuid v4 della compilazione), final (ultimo invio), duration_seconds, device ('telefono' o 'computer'),
-- recontact, website (campo trappola per i bot, deve restare vuoto). Le obbligatorie si controllano solo con final.
create or replace function public.submit_survey(p_token text, p_answers jsonb, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.items;
  r public.survey_responses;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_session uuid;
  v_final boolean;
  v_device text;
  v_questions jsonb;
  v_by_id jsonb;
  v_q jsonb;
  v_key text;
  v_value jsonb;
  v_qid text;
  v_type text;
  v_text text;
  v_n integer;
  v_clean jsonb := '{}'::jsonb;
  v_email text;
  v_recontact boolean;
  v_duration integer;
  v_times jsonb;
  v_client text;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(v_meta) <> 'object' then
    return public.survey_error('Risposte non valide.');
  end if;
  if octet_length(p_answers::text) + octet_length(v_meta::text) >= 20480 then
    return public.survey_error('Le risposte sono troppo lunghe.');
  end if;

  select * into s from public.survey_by_token(p_token);
  if s.id is null then
    return public.survey_error('Questionario non trovato.');
  elsif s.status is distinct from 'aperto' then
    return public.survey_error('Il questionario è chiuso.');
  end if;

  -- Un bot che compila il campo nascosto riceve «ok», ma non si salva nulla.
  if btrim(coalesce(v_meta ->> 'website', '')) <> '' then
    return jsonb_build_object('status', 'ok');
  end if;

  if jsonb_typeof(v_meta -> 'session') is distinct from 'string'
     or (v_meta ->> 'session') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return public.survey_error('Sessione non valida. Ricarica la pagina.');
  end if;
  if coalesce(jsonb_typeof(v_meta -> 'final'), 'null') not in ('boolean', 'null')
     or coalesce(jsonb_typeof(v_meta -> 'recontact'), 'null') not in ('boolean', 'null')
     or (coalesce(jsonb_typeof(v_meta -> 'device'), 'null') <> 'null' and coalesce(v_meta ->> 'device', '') not in ('telefono', 'computer')) then
    return public.survey_error('Risposte non valide.');
  end if;
  v_session := (v_meta ->> 'session')::uuid;
  v_final := coalesce(v_meta -> 'final' = 'true'::jsonb, false);
  v_device := case when v_meta ->> 'device' in ('telefono', 'computer') then v_meta ->> 'device' end;

  -- Una richiesta alla volta per questionario, così limiti e sessioni restano esatti.
  perform pg_advisory_xact_lock(hashtextextended('survey:' || s.id::text, 0));
  delete from public.survey_limits where created_at < now() - interval '24 hours';
  select * into r from public.survey_responses x where x.survey_id = s.id and x.session = v_session for update;
  if r.id is not null then
    if r.completed then
      return public.survey_error('Le risposte sono già state inviate.');
    elsif not v_final and r.saves >= 60 then
      return public.survey_error('Troppi salvataggi: invia le risposte per concludere.');
    end if;
  else
    -- I limiti contano le compilazioni nuove; i salvataggi di una compilazione già iniziata no.
    if (select count(*) from (select 1 from public.survey_responses x where x.survey_id = s.id limit 5000) y) >= 5000 then
      return public.survey_error('Il questionario non accetta altre risposte.');
    end if;
    if (select count(*) from public.survey_responses x where x.survey_id = s.id and x.created_at > now() - interval '1 minute') >= 30 then
      return public.survey_error('Troppe risposte in questo momento. Riprova tra qualche minuto.');
    end if;
    v_client := public.survey_client(s.id);
    if (
      select count(*) from public.survey_limits l
      where l.survey_id = s.id and l.client = v_client and l.kind = 'session' and l.created_at > now() - interval '1 hour'
    ) >= 5 then
      return public.survey_error('Hai già compilato questo questionario più volte. Riprova più tardi.');
    end if;
  end if;

  v_questions := public.survey_public_questions(s.data);
  select coalesce(jsonb_object_agg(q ->> 'id', q), '{}'::jsonb) into v_by_id
  from jsonb_array_elements(v_questions) q
  where q ->> 'type' <> 'sezione';

  for v_key, v_value in select e.key, e.value from jsonb_each(p_answers) e loop
    -- Testo di «Altro» per le domande a scelta che lo prevedono.
    if v_key like '%:altro' then
      v_qid := left(v_key, -6);
      v_q := v_by_id -> v_qid;
      if v_q is null or not coalesce(v_q -> 'allow_other' = 'true'::jsonb, false) then
        return public.survey_error('Risposte non valide.');
      end if;
      continue when jsonb_typeof(v_value) = 'null';
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('Risposte non valide.', v_qid);
      end if;
      v_text := public.survey_text(v_value, 100000);
      continue when v_text = '';
      if char_length(v_text) > 300 then
        return public.survey_error('Una risposta è troppo lunga.', v_qid);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_text);
      continue;
    end if;

    v_q := v_by_id -> v_key;
    if v_q is null then
      return public.survey_error('Risposte non valide.');
    end if;
    continue when jsonb_typeof(v_value) = 'null';
    v_type := v_q ->> 'type';

    -- «Preferisco non rispondere» ha l'id riservato non-rispondo, valido solo dove la domanda lo prevede.
    if v_type = 'scelta' then
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('Risposte non valide.', v_key);
      end if;
      continue when v_value #>> '{}' = '';
      if not (
        exists (select 1 from jsonb_array_elements(v_q -> 'options') o where o ->> 'id' = v_value #>> '{}')
        or (v_value #>> '{}' = 'non-rispondo' and v_q -> 'prefer_not' = 'true'::jsonb)
      ) then
        return public.survey_error('Risposte non valide.', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_value);
    elsif v_type = 'scelte' then
      if jsonb_typeof(v_value) <> 'array' then
        return public.survey_error('Risposte non valide.', v_key);
      end if;
      continue when jsonb_array_length(v_value) = 0;
      if exists (
           select 1 from jsonb_array_elements(v_value) a
           where jsonb_typeof(a) <> 'string'
              or not (
                exists (select 1 from jsonb_array_elements(v_q -> 'options') o where o ->> 'id' = a #>> '{}')
                or (a #>> '{}' = 'non-rispondo' and v_q -> 'prefer_not' = 'true'::jsonb)
              )
         )
         or (select count(distinct a) from jsonb_array_elements(v_value) a) <> jsonb_array_length(v_value) then
        return public.survey_error('Risposte non valide.', v_key);
      end if;
      if v_value ? 'non-rispondo' and jsonb_array_length(v_value) > 1 then
        return public.survey_error('Scegli una sola risposta.', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_value);
    elsif v_type = 'scala' then
      v_n := public.survey_int(v_value, 1, (v_q -> 'scale' ->> 'points')::integer);
      if v_n is null then
        return public.survey_error('Risposte non valide.', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_n);
    elsif v_type = 'numero' then
      if public.survey_int(v_value, -1000000000, 1000000000) is null then
        return public.survey_error('Scrivi un numero intero.', v_key);
      end if;
      v_n := public.survey_int(
        v_value,
        coalesce((v_q -> 'number' ->> 'min')::integer, -1000000000),
        coalesce((v_q -> 'number' ->> 'max')::integer, 1000000000)
      );
      if v_n is null then
        return public.survey_error('Un numero è fuori dall''intervallo ammesso.', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_n);
    elsif v_type in ('breve', 'lunga') then
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('Risposte non valide.', v_key);
      end if;
      v_text := public.survey_text(v_value, 100000);
      continue when v_text = '';
      if char_length(v_text) > (case when v_type = 'breve' then 300 else 3000 end) then
        return public.survey_error('Una risposta è troppo lunga.', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_text);
    elsif v_type = 'email' then
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('Indirizzo email non valido.', v_key);
      end if;
      v_text := lower(public.survey_text(v_value, 100000));
      continue when v_text = '';
      if char_length(v_text) > 254 or v_text !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        return public.survey_error('Indirizzo email non valido.', v_key);
      end if;
      -- L'email va solo nella sua colonna, non tra le risposte.
      v_email := v_text;
    end if;
  end loop;

  -- Un'opzione (o «Preferisco non rispondere») e «Altro» insieme si escludono; le obbligatorie solo all'ultimo invio.
  for v_q in select q from jsonb_array_elements(v_questions) q loop
    v_qid := v_q ->> 'id';
    if v_clean ? (v_qid || ':altro')
       and ((v_q ->> 'type' = 'scelta' and v_clean ? v_qid) or (v_q ->> 'type' = 'scelte' and v_clean -> v_qid = '["non-rispondo"]'::jsonb)) then
      return public.survey_error('Scegli una sola risposta.', v_qid);
    end if;
    if v_final and v_q -> 'required' = 'true'::jsonb and not (
      case v_q ->> 'type'
        when 'email' then v_email is not null
        when 'scelta' then v_clean ? v_qid or v_clean ? (v_qid || ':altro')
        when 'scelte' then v_clean ? v_qid or v_clean ? (v_qid || ':altro')
        else v_clean ? v_qid
      end
    ) then
      return public.survey_error('Rispondi a tutte le domande obbligatorie.', v_qid);
    end if;
  end loop;

  v_recontact := coalesce(v_meta -> 'recontact' = 'true'::jsonb, false);
  if v_final then
    if v_clean = '{}'::jsonb and v_email is null then
      return public.survey_error('Rispondi ad almeno una domanda.');
    elsif v_recontact and v_email is null then
      return public.survey_error('Per farti ricontattare serve un indirizzo email.');
    end if;
  else
    -- A metà compilazione l'email può arrivare dopo: il consenso conta solo insieme a un indirizzo.
    v_recontact := v_recontact and v_email is not null;
  end if;
  v_duration := case
    when jsonb_typeof(v_meta -> 'duration_seconds') = 'number' and (v_meta ->> 'duration_seconds')::numeric >= 0
      then least(round((v_meta ->> 'duration_seconds')::numeric), 86400)::integer
  end;
  -- Tempi per domanda: solo domande del questionario e numeri tra 0 e 86400; gli altri si scartano senza fermare l'invio.
  select jsonb_object_agg(t.key, round((t.value #>> '{}')::numeric, 1)) into v_times
  from jsonb_each(case when jsonb_typeof(v_meta -> 'times') = 'object' then v_meta -> 'times' else '{}'::jsonb end) t
  where v_by_id ? t.key
    and jsonb_typeof(t.value) = 'number'
    and (t.value #>> '{}')::numeric between 0 and 86400;

  if r.id is null then
    -- Una compilazione appena iniziata senza risposte non lascia traccia.
    if v_clean = '{}'::jsonb and v_email is null then
      return jsonb_build_object('status', 'ok');
    end if;
    insert into public.survey_responses (survey_id, session, answers, email, recontact, duration_seconds, device, completed, question_seconds)
    values (s.id, v_session, v_clean, v_email, v_recontact, v_duration, v_device, v_final, v_times);
    insert into public.survey_limits (survey_id, client, kind) values (s.id, v_client, 'session');
  else
    update public.survey_responses
       set answers = v_clean,
           email = v_email,
           recontact = v_recontact,
           duration_seconds = coalesce(v_duration, r.duration_seconds),
           device = coalesce(v_device, r.device),
           question_seconds = coalesce(v_times, r.question_seconds),
           completed = v_final,
           saves = r.saves + 1,
           updated_at = now()
     where id = r.id;
  end if;
  return jsonb_build_object('status', 'ok');
end
$$;

-- Visita della pagina (view) e inizio della compilazione (start), solo per i questionari aperti. Oltre i limiti non registra nulla.
create or replace function public.survey_event(p_token text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.items;
  v_client text;
begin
  if p_kind is null or p_kind not in ('view', 'start') then
    return;
  end if;
  select * into s from public.survey_by_token(p_token);
  if s.id is null or s.status is distinct from 'aperto' then
    return;
  end if;
  delete from public.survey_limits where created_at < now() - interval '24 hours';
  v_client := public.survey_client(s.id);
  if (
    select count(*) from public.survey_limits l
    where l.survey_id = s.id and l.client = v_client and l.kind in ('view', 'start') and l.created_at > now() - interval '1 hour'
  ) >= 30 then
    return;
  end if;
  if (select count(*) from public.survey_events e where e.survey_id = s.id and e.created_at > now() - interval '1 minute') >= 300
     or (select count(*) from (select 1 from public.survey_events e where e.survey_id = s.id limit 100000) x) >= 100000 then
    return;
  end if;
  insert into public.survey_events (survey_id, kind) values (s.id, p_kind);
  insert into public.survey_limits (survey_id, client, kind) values (s.id, v_client, p_kind);
end
$$;

-- Imbuto per il team: visite, inizi, compilazioni interrotte (partial) e complete. Solo numeri; null se il questionario non è visibile.
create or replace function public.survey_funnel(p_survey uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'views', (select count(*) from public.survey_events e where e.survey_id = s.id and e.kind = 'view'),
    'starts', (select count(*) from public.survey_events e where e.survey_id = s.id and e.kind = 'start'),
    'partial', (select count(*) from public.survey_responses r where r.survey_id = s.id and not r.completed),
    'completed', (select count(*) from public.survey_responses r where r.survey_id = s.id and r.completed)
  )
  from public.items s
  join public.items idea on idea.id = s.idea_id and idea.deleted_at is null
  where s.id = p_survey and s.kind = 'survey' and s.deleted_at is null and public.can_read()
$$;

-- Cancella per sempre alcune risposte (p_ids) o tutte; con tutte si azzerano anche visite, inizi e limiti del questionario.
create or replace function public.delete_survey_responses(p_survey uuid, p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.can_write() then
    raise exception 'Solo admin e membri possono cancellare le risposte';
  end if;
  if not exists (
    select 1
    from public.items s
    join public.items idea on idea.id = s.idea_id and idea.deleted_at is null
    where s.id = p_survey and s.kind = 'survey' and s.deleted_at is null
  ) then
    return 0;
  end if;
  delete from public.survey_responses r where r.survey_id = p_survey and (p_ids is null or r.id = any (p_ids));
  get diagnostics v_count = row_count;
  if p_ids is null then
    delete from public.survey_events where survey_id = p_survey;
    delete from public.survey_limits where survey_id = p_survey;
  end if;
  return v_count;
end
$$;

-- =========================================================================
-- Permessi
-- =========================================================================

revoke all on public.members, public.items, public.revisions, public.comments, public.ai_usage, public.audit_log, public.chats, public.chat_messages, public.chat_reads, public.mentions, public.email_prefs, public.email_weekly, public.member_activity, public.survey_responses, public.survey_events, public.survey_limits, public.survey_salts from anon;
revoke all on public.members, public.items, public.revisions, public.comments, public.ai_usage, public.audit_log, public.chats, public.chat_messages, public.chat_reads, public.mentions, public.email_prefs, public.email_weekly, public.survey_responses, public.survey_events, public.survey_limits, public.survey_salts from authenticated;
revoke all on all sequences in schema public from anon;
-- Il sale e le impronte dei limiti non li legge neanche la chiave di servizio: con il sale l'impronta di un indirizzo si ricostruisce.
revoke all on public.survey_limits, public.survey_salts from service_role;
grant select on public.survey_responses to authenticated;
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

-- Questionari: le funzioni di supporto non sono chiamabili via API; quelle del link pubblico sono le sole aperte ad anon.
revoke execute on function public.survey_text(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.survey_int(jsonb, integer, integer) from public, anon, authenticated;
revoke execute on function public.survey_public_questions(jsonb) from public, anon, authenticated;
revoke execute on function public.survey_by_token(text) from public, anon, authenticated;
revoke execute on function public.survey_client(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.survey_error(text, text) from public, anon, authenticated;
revoke execute on function public.public_survey(text) from public;
revoke execute on function public.submit_survey(text, jsonb, jsonb) from public;
revoke execute on function public.survey_event(text, text) from public;
grant execute on function public.public_survey(text) to anon, authenticated;
grant execute on function public.submit_survey(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.survey_event(text, text) to anon, authenticated;

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
revoke execute on function public.survey_image_orphans(text[]) from public, anon;
revoke execute on function public.chat_overview() from public, anon;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
revoke execute on function public.mark_mentions_read(bigint[]) from public, anon;
revoke execute on function public.set_email_prefs(boolean, boolean) from public, anon;
revoke execute on function public.survey_funnel(uuid) from public, anon;
revoke execute on function public.delete_survey_responses(uuid, uuid[]) from public, anon;

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
grant execute on function public.survey_image_orphans(text[]) to authenticated;
grant execute on function public.chat_overview() to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;
grant execute on function public.mark_mentions_read(bigint[]) to authenticated;
grant execute on function public.set_email_prefs(boolean, boolean) to authenticated;
grant execute on function public.survey_funnel(uuid) to authenticated;
grant execute on function public.delete_survey_responses(uuid, uuid[]) to authenticated;

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
