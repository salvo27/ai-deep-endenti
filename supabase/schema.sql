-- ai-deep-endenti: schema del database.
-- Va eseguito per intero nel SQL Editor di Supabase. Si può rieseguire: non cancella dati.
-- Il sito ospita più progetti, ognuno una board completa e isolata: il contratto è in docs/PROGETTI.md.
-- Le funzioni nuove non scrivono frasi: rispondono con un codice (not_allowed, project_not_found, ...) che il sito traduce.

-- =========================================================================
-- Progetti, amministratori della piattaforma e profili
-- =========================================================================

-- Un progetto non si cancella: si archivia e i dati restano. Si scrive solo con le funzioni più sotto o dal SQL Editor.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.projects enable row level security;

-- Chi crea e archivia i progetti e gestisce le persone di tutti. Da solo non legge i contenuti di un progetto:
-- per vederli deve aggiungersi, e l'aggiunta finisce nel registro di sicurezza.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Nome, colore e lingua di una persona, uguali in tutti i progetti. language null = segue il dispositivo;
-- decide anche la lingua delle email e delle risposte di Claude.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  color text not null default '#4f5bd5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  language text check (language is null or language in ('en', 'it')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- =========================================================================
-- Aggiornamento da squadra unica (una volta sola)
-- =========================================================================

-- Un database di prima dei progetti si riconosce da members con nome e colore. Alla prima esecuzione tutto finisce nel
-- progetto ai-deep-endenti con i trigger degli utenti spenti: niente revisioni, menzioni o email nuove, versioni e date
-- come prima. Nomi e colori passano nei profili, gli admin di allora diventano amministratori della piattaforma (solo se
-- non ce n'è ancora nessuno). Dopo, members non ha più display_name e questo blocco non fa più nulla.
do $$
declare
  v_project uuid;
  t text;
begin
  -- to_regclass e non ::regclass: su un database nuovo members non c'è ancora, e la conversione fallirebbe.
  if not exists (
    select 1 from pg_attribute
    where attrelid = to_regclass('public.members') and attname = 'display_name' and not attisdropped
  ) then
    return;
  end if;

  -- La chat Generale c'è già: il progetto nasce senza aprirne un'altra.
  alter table public.projects disable trigger user;
  insert into public.projects (name) values ('ai-deep-endenti') returning id into v_project;
  alter table public.projects enable trigger user;

  -- Funzioni che restituiscono colonne nuove: create or replace non può cambiarle, si ricreano più sotto.
  drop function if exists public.notify_recipients();
  drop function if exists public.notify_pending_mentions(timestamptz);

  foreach t in array array[
    'members', 'items', 'revisions', 'comments', 'chats', 'chat_messages', 'mentions', 'survey_responses', 'survey_events',
    'audit_log', 'email_weekly'
  ] loop
    continue when to_regclass('public.' || t) is null;
    execute format('alter table public.%I disable trigger user', t);
    execute format('alter table public.%I add column if not exists project_id uuid references public.projects (id)', t);
    execute format('update public.%I set project_id = $1 where project_id is null', t) using v_project;
    execute format('alter table public.%I enable trigger user', t);
    -- Il registro tiene anche gli eventi della piattaforma, fuori da ogni progetto.
    if t <> 'audit_log' then
      execute format('alter table public.%I alter column project_id set not null', t);
    end if;
  end loop;

  insert into public.profiles (user_id, display_name, color, created_at)
  select m.user_id, m.display_name, m.color, m.created_at from public.members m
  on conflict (user_id) do nothing;

  if not exists (select 1 from public.platform_admins) then
    insert into public.platform_admins (user_id)
    select m.user_id from public.members m where m.role = 'admin';
  end if;

  alter table public.members drop constraint if exists members_pkey;
  alter table public.members add constraint members_pkey primary key (project_id, user_id);
  alter table public.members drop column display_name, drop column color;

  if to_regclass('public.email_weekly') is not null then
    alter table public.email_weekly drop constraint if exists email_weekly_pkey;
    alter table public.email_weekly add constraint email_weekly_pkey primary key (user_id, project_id, week_start);
  end if;

  -- Le unicità di prima valevano per tutto il sito: si ricreano per progetto più sotto.
  drop index if exists public.items_one_score_per_member_idx;
  drop index if exists public.items_one_availability_per_member_idx;
  drop index if exists public.items_one_timesheet_per_week_idx;
  drop index if exists public.chats_one_general_idx;
end
$$;

-- =========================================================================
-- Membri dei progetti e ruoli
-- =========================================================================

-- Una persona sta in un progetto al massimo una volta, con un ruolo di quel progetto; può stare in più progetti.
create table if not exists public.members (
  project_id uuid not null references public.projects (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'advisor')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists members_user_idx on public.members (user_id);

create or replace function public.has_mfa()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_mfa() and exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

-- Il ruolo nel progetto: solo con la verifica in due passaggi e solo se il progetto non è archiviato.
create or replace function public.my_role(p_project uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.members m
  join public.projects p on p.id = m.project_id
  where m.project_id = p_project and m.user_id = auth.uid() and p.archived_at is null and public.has_mfa()
$$;

create or replace function public.can_read(p_project uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.my_role(p_project) is not null
$$;

create or replace function public.can_write(p_project uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.my_role(p_project) in ('admin', 'member'), false)
$$;

create or replace function public.is_admin(p_project uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.my_role(p_project) = 'admin', false)
$$;

-- Gestisce le persone di un progetto: il suo admin o un amministratore della piattaforma, che non per questo lo legge.
create or replace function public.can_manage(p_project uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_admin(p_project) or public.is_platform_admin()
$$;

-- Se chi chiede condivide con quella persona almeno un progetto attivo: serve a mostrarne il profilo.
create or replace function public.shares_project(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members mine
    join public.members theirs on theirs.project_id = mine.project_id
    join public.projects p on p.id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user and p.archived_at is null
  )
$$;

-- Membro con 2FA di almeno un progetto attivo: per ciò che vale per la persona e non per un progetto (preferenze, attività).
create or replace function public.has_any_project()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_mfa() and exists (
    select 1 from public.members m join public.projects p on p.id = m.project_id
    where m.user_id = auth.uid() and p.archived_at is null
  )
$$;

-- Ruoli e uscite si cambiano su members, solo da chi gestisce il progetto (le regole di accesso lo filtrano già).
-- In ogni progetto resta sempre almeno un admin, contato in quel progetto soltanto.
create or replace function public.members_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.project_id := old.project_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.can_manage(old.project_id) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    -- Una fila per progetto: due admin che si tolgono il ruolo insieme non lasciano il progetto senza admin.
    perform pg_advisory_xact_lock(hashtextextended('members:' || old.project_id::text, 0));
    if old.role = 'admin' and not exists (
      select 1 from public.members m where m.project_id = old.project_id and m.role = 'admin' and m.user_id <> old.user_id
    ) then
      raise exception 'last_project_admin' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists members_before_update on public.members;
create trigger members_before_update
  before update on public.members
  for each row execute function public.members_before_update();

-- Nemmeno togliendolo si lascia un progetto senza admin. Vale solo per le cancellazioni dirette (profondità 1):
-- un account tolto da Authentication porta via le sue righe anche se era l'ultimo admin.
create or replace function public.members_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and pg_trigger_depth() = 1 then
    perform pg_advisory_xact_lock(hashtextextended('members:' || old.project_id::text, 0));
    if not exists (
      select 1 from public.members m where m.project_id = old.project_id and m.role = 'admin' and m.user_id <> old.user_id
    ) then
      raise exception 'last_project_admin' using errcode = 'P0001';
    end if;
  end if;
  return old;
end
$$;

drop trigger if exists members_before_delete on public.members;
create trigger members_before_delete
  before delete on public.members
  for each row execute function public.members_before_delete();

-- Dal sito un'istruzione tocca le persone di un solo progetto: chi toglie qualcuno filtrando per persona e non per
-- progetto (il sito di prima, una scheda rimasta aperta) lo toglierebbe da tutti i progetti che gestisce.
-- Il SQL Editor e un account tolto da Authentication (la cascata gira come proprietario) restano liberi.
create or replace function public.members_one_project_per_statement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (select count(distinct x.project_id) from changed x) > 1 then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return null;
end
$$;

drop trigger if exists members_delete_one_project on public.members;
create trigger members_delete_one_project
  after delete on public.members
  referencing old table as changed
  for each statement execute function public.members_one_project_per_statement();

drop trigger if exists members_update_one_project on public.members;
create trigger members_update_one_project
  after update on public.members
  referencing old table as changed
  for each statement execute function public.members_one_project_per_statement();

-- Aggiunge a un progetto un utente già creato in Authentication > Users, con il suo profilo se non ne ha uno:
-- chi ha già un profilo non viene mai rinominato. Dal SQL Editor funziona sempre; dal sito solo per chi gestisce il progetto.
create or replace function public.add_member(p_project uuid, p_email text, p_display_name text, p_role text default 'member')
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
  r public.members;
begin
  if auth.uid() is not null and not public.can_manage(p_project) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project and p.archived_at is null) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if p_role is null or p_role not in ('admin', 'member', 'advisor') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  select u.id, u.email into v_user_id, v_email from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  insert into public.profiles (user_id, display_name)
  values (v_user_id, left(coalesce(nullif(btrim(p_display_name), ''), nullif(split_part(v_email, '@', 1), ''), '?'), 80))
  on conflict (user_id) do nothing;
  insert into public.members (project_id, user_id, role)
  values (p_project, v_user_id, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role
  returning * into r;
  return r;
end
$$;

-- Le persone di un progetto con nome e colore del profilo, ruolo, email, 2FA e ultimo accesso.
-- Ultimo accesso: quello che ha fatto in questo progetto (modifiche, commenti, messaggi, chat lette e menzioni lette).
-- Login, rinnovo della sessione e attività salvata dal sito valgono per la persona e possono venire da un altro progetto:
-- contano solo se questo è il suo unico progetto attivo, altrimenti direbbero a chi legge quando ha usato gli altri.
-- Le sessioni si cancellano a ogni uscita: member_activity resta, così l'ultimo accesso non torna indietro.
create or replace function public.members_overview(p_project uuid)
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
    pr.display_name,
    m.role,
    pr.color,
    u.email::text,
    greatest(
      case when not exists (
        select 1 from public.members o join public.projects op on op.id = o.project_id
        where o.user_id = m.user_id and o.project_id <> p_project and op.archived_at is null
      ) then greatest(
        u.last_sign_in_at,
        (select max(greatest(s.updated_at, s.refreshed_at at time zone 'utc')) from auth.sessions s where s.user_id = m.user_id),
        (select a.last_seen_at from public.member_activity a where a.user_id = m.user_id)
      ) end,
      (select max(r.created_at) from public.revisions r where r.author_id = m.user_id and r.project_id = p_project),
      (select max(c.created_at) from public.comments c where c.author_id = m.user_id and c.project_id = p_project),
      (select max(x.created_at) from public.chat_messages x where x.author_id = m.user_id and x.project_id = p_project),
      (select max(cr.last_read_at) from public.chat_reads cr join public.chats ch on ch.id = cr.chat_id
        where cr.user_id = m.user_id and ch.project_id = p_project),
      (select max(mn.read_at) from public.mentions mn where mn.user_id = m.user_id and mn.project_id = p_project)
    ),
    exists (
      select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified'
    ),
    m.created_at
  from public.members m
  join auth.users u on u.id = m.user_id
  left join public.profiles pr on pr.user_id = m.user_id
  where m.project_id = p_project and (public.can_read(p_project) or public.is_platform_admin())
  order by m.created_at;
end
$$;

-- Ultima attività sul sito: una data per persona, letta e scritta solo dalle funzioni qui sotto.
create table if not exists public.member_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.member_activity enable row level security;

-- Chiamata dal sito all'apertura e ogni 5 minuti di uso; più spesso non scrive nulla. Chi non è in nessun progetto non lascia tracce.
create or replace function public.touch_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_any_project() then
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

-- Ognuno vede le persone dei suoi progetti; l'amministratore della piattaforma quelle di tutti, per gestirle.
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (public.can_read(project_id) or (select public.is_platform_admin()));

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using (public.can_manage(project_id))
  with check (public.can_manage(project_id));

-- L'admin non toglie se stesso (lo fa un altro admin); l'amministratore della piattaforma può uscire da un progetto in cui è entrato.
drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (public.can_manage(project_id) and (user_id <> (select auth.uid()) or (select public.is_platform_admin())));

-- Profili: ognuno modifica solo il proprio; lo vede chi condivide un progetto con lui e l'amministratore della piattaforma.
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end
$$;

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    (select public.has_mfa())
    and (user_id = (select auth.uid()) or (select public.is_platform_admin()) or public.shares_project(user_id))
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select public.has_mfa()) and user_id = (select auth.uid()))
  with check ((select public.has_mfa()) and user_id = (select auth.uid()));

-- Un progetto lo leggono i suoi membri (finché non è archiviato) e l'amministratore della piattaforma.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_read(id) or (select public.is_platform_admin()));

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using ((select public.is_platform_admin()));

-- I progetti che può aprire chi chiama, con il suo ruolo: per il selettore del sito.
create or replace function public.my_projects()
returns table (id uuid, name text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, m.role, p.created_at
  from public.members m
  join public.projects p on p.id = m.project_id
  where m.user_id = auth.uid() and p.archived_at is null and public.has_mfa()
  order by p.name, p.created_at
$$;

-- Tutti i progetti, archiviati compresi, con quante persone e quanti admin hanno: solo per l'amministratore della piattaforma.
create or replace function public.all_projects()
returns table (
  id uuid,
  name text,
  created_by uuid,
  created_at timestamptz,
  archived_at timestamptz,
  member_count integer,
  admin_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.name, p.created_by, p.created_at, p.archived_at,
    (select count(*)::integer from public.members m where m.project_id = p.id),
    (select count(*)::integer from public.members m where m.project_id = p.id and m.role = 'admin')
  from public.projects p
  where public.is_platform_admin()
  order by p.name, p.created_at
$$;

-- =========================================================================
-- Elementi delle board e storico
-- =========================================================================

-- Ogni elemento sta in un progetto, che sceglie chi lo crea e non cambia più.
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
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
    'note', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap', 'survey', 'expensegroup', 'expense', 'availability',
    'timesheet'
  )
);

create index if not exists items_project_idx on public.items (project_id, kind);
create index if not exists items_kind_idx on public.items (kind);
create index if not exists items_idea_idx on public.items (idea_id);
-- Il link pubblico di un questionario porta a un solo questionario, in tutto il sito.
create unique index if not exists items_survey_token_idx on public.items ((data ->> 'token')) where kind = 'survey';
-- Le altre unicità valgono per progetto: una scheda per tipo, un voto e un foglio impegni per persona, un foglio ore per settimana.
drop index if exists public.items_singleton_idx;
create unique index items_singleton_idx on public.items (project_id, kind)
  where kind in ('criteria', 'generator', 'teamcanvas', 'equity');
create unique index if not exists items_one_score_per_member_idx on public.items (project_id, created_by)
  where kind = 'score';
create unique index if not exists items_one_availability_per_member_idx on public.items (project_id, created_by)
  where kind = 'availability';
create unique index if not exists items_one_timesheet_per_week_idx on public.items (project_id, created_by, (data ->> 'week'))
  where kind = 'timesheet';

create table if not exists public.revisions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id),
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

create index if not exists revisions_project_idx on public.revisions (project_id, created_at desc);
create index if not exists revisions_created_idx on public.revisions (created_at desc);
create index if not exists revisions_idea_idx on public.revisions (idea_id, created_at desc);
create index if not exists revisions_author_idx on public.revisions (author_id, created_at desc);

-- Impegni di un giorno per chiave (lun ... dom): solo ore intere da 0 a 23. I case evitano di leggere come oggetto ciò che non lo è.
create or replace function public.availability_busy_ok(p_busy jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_busy) = 'object' then not exists (
    select 1 from jsonb_each(p_busy) d
    where d.key not in ('lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom')
       or case when jsonb_typeof(d.value) = 'array' then
            jsonb_array_length(d.value) > 24
            or exists (
              select 1 from jsonb_array_elements(d.value) h
              where jsonb_typeof(h) <> 'number' or h::text !~ '^([0-9]|1[0-9]|2[0-3])$'
            )
          else true end
  ) else false end
$$;

create or replace function public.items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_idea_project uuid;
  v_group_project uuid;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.project_id := old.project_id;
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
    or (new.kind in ('canvas', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap',
                     'expensegroup', 'expense', 'availability', 'timesheet')
        and new.status is null),
    false
  ) then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if new.kind in ('idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note', 'scoresnap', 'survey',
                  'expensegroup', 'expense')
     and btrim(new.title) = '' then
    raise exception 'title_required' using errcode = '22023';
  end if;
  if new.kind in ('canvas', 'experiment', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'survey') and new.idea_id is null then
    raise exception 'idea_required' using errcode = '22023';
  end if;
  if new.kind in ('idea', 'decision', 'teamcanvas', 'equity', 'criteria', 'score', 'generator', 'scoresnap', 'expensegroup', 'expense', 'availability',
                  'timesheet')
     and new.idea_id is not null then
    raise exception 'idea_not_allowed' using errcode = '22023';
  end if;
  -- L'idea si cerca con i permessi di chi scrive: un'idea che non vede non esiste. Una che vede ma di un altro
  -- progetto non si usa: il collegamento resta dentro il progetto.
  if new.idea_id is not null and new.idea_id is distinct from (case when tg_op = 'UPDATE' then old.idea_id end) then
    select i.project_id into v_idea_project from public.items i where i.id = new.idea_id and i.kind = 'idea';
    if not found then
      raise exception 'idea_not_found' using errcode = 'P0002';
    end if;
    if new.project_id is not null and v_idea_project is distinct from new.project_id then
      raise exception 'cross_project' using errcode = 'P0001';
    end if;
  end if;

  -- Questionari: quello che finisce nella pagina pubblica (link, impostazioni, aspetto) si controlla anche qui.
  if new.kind = 'survey' then
    if new.data ? 'token'
       and (jsonb_typeof(new.data -> 'token') <> 'string' or (new.data ->> 'token') !~ '^[A-Za-z0-9_-]{22}$') then
      raise exception 'invalid_survey_token' using errcode = '22023';
    end if;
    if (new.data ? 'layout' and coalesce(new.data ->> 'layout', '') not in ('una', 'sezioni'))
       or (new.data ? 'progress' and coalesce(new.data ->> 'progress', '') not in ('contatore', 'barra', 'nessuno'))
       or (new.data ? 'show_time' and jsonb_typeof(new.data -> 'show_time') <> 'boolean')
       or (new.data ? 'questions' and case
             when jsonb_typeof(new.data -> 'questions') = 'array' then jsonb_array_length(new.data -> 'questions') > 40
             else true
           end) then
      raise exception 'invalid_survey_settings' using errcode = '22023';
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
      raise exception 'invalid_survey_appearance' using errcode = '22023';
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
      raise exception 'invalid_survey_image' using errcode = '22023';
    end if;
    if new.data ? 'thanks_image' and (case
         when jsonb_typeof(new.data -> 'thanks_image') = 'object' then
           jsonb_typeof(new.data -> 'thanks_image' -> 'path') is distinct from 'string'
           or (new.data -> 'thanks_image' ->> 'path') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
           or (new.data -> 'thanks_image' ? 'alt' and (jsonb_typeof(new.data -> 'thanks_image' -> 'alt') <> 'string' or char_length(new.data -> 'thanks_image' ->> 'alt') > 200))
           or exists (select 1 from jsonb_object_keys(new.data -> 'thanks_image') k where k not in ('path', 'alt'))
         else true
       end) then
      raise exception 'invalid_survey_image' using errcode = '22023';
    end if;
    if new.data ? 'experiment_id' then
      if jsonb_typeof(new.data -> 'experiment_id') <> 'string'
         or (new.data ->> 'experiment_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid_experiment' using errcode = '22023';
      end if;
      if (new.data -> 'experiment_id') is distinct from (case when tg_op = 'UPDATE' then old.data -> 'experiment_id' end)
         or new.idea_id is distinct from (case when tg_op = 'UPDATE' then old.idea_id end) then
        if not exists (
          select 1 from public.items e
          where e.id = (new.data ->> 'experiment_id')::uuid and e.kind = 'experiment' and e.idea_id = new.idea_id
            and e.project_id = new.project_id
        ) then
          raise exception 'experiment_not_in_idea' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  -- Spese condivise: qui si controlla la forma dei dati, i conti li fa il sito.
  if new.kind = 'expensegroup' and not coalesce(
       jsonb_typeof(new.data -> 'currency') = 'string' and (new.data ->> 'currency') ~ '^[A-Z]{3}$'
       and case when jsonb_typeof(new.data -> 'people') = 'array' then
         jsonb_array_length(new.data -> 'people') <= 50
         and not exists (
           select 1 from jsonb_array_elements(new.data -> 'people') p
           where case when jsonb_typeof(p) = 'object' then
               coalesce(p ->> 'id', '') !~ '^[a-z0-9-]{1,40}$'
               or char_length(btrim(coalesce(p ->> 'name', ''))) not between 1 and 60
               or (p ? 'member' and coalesce(p ->> 'member', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
             else true end
         )
       else false end,
       false) then
    raise exception 'invalid_expense_group' using errcode = '22023';
  end if;
  if new.kind = 'expense' then
    if not coalesce(
         (new.data ->> 'type') in ('spesa', 'rimborso', 'entrata')
         and jsonb_typeof(new.data -> 'amount') = 'number' and (new.data ->> 'amount') ~ '^[1-9][0-9]{0,11}$'
         and jsonb_typeof(new.data -> 'currency') = 'string' and (new.data ->> 'currency') ~ '^[A-Z]{3}$'
         and case when jsonb_typeof(new.data -> 'rate') = 'number' then (new.data -> 'rate')::numeric > 0 and (new.data -> 'rate')::numeric < 1000000 else false end
         and jsonb_typeof(new.data -> 'date') = 'string' and (new.data ->> 'date') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
         and jsonb_typeof(new.data -> 'paid_by') = 'string' and (new.data ->> 'paid_by') ~ '^[a-z0-9-]{1,40}$'
         and jsonb_typeof(new.data -> 'split') = 'object'
         and (new.data -> 'split' ->> 'mode') in ('parti', 'quote', 'importi')
         and jsonb_typeof(new.data -> 'split' -> 'shares') = 'object'
         and (not new.data ? 'receipt'
              or (new.data ->> 'receipt') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'),
         false
       ) then
      raise exception 'invalid_expense' using errcode = '22023';
    end if;
    -- Come per le idee: il gruppo si cerca con i permessi di chi scrive, e uno che vede ma di un altro progetto non si usa.
    if tg_op = 'INSERT' or (new.data -> 'group') is distinct from (case when tg_op = 'UPDATE' then old.data -> 'group' end) then
      select g.project_id into v_group_project
      from public.items g
      where g.id::text = new.data ->> 'group' and g.kind = 'expensegroup' and g.deleted_at is null;
      if not found then
        raise exception 'expense_group_not_found' using errcode = 'P0002';
      end if;
      if new.project_id is not null and v_group_project is distinct from new.project_id then
        raise exception 'cross_project' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Impegni: solo ore impegnate, scadenza dell'orario tipo e settimane che partono di lunedì. Nessun altro campo.
  -- Il titolo è fisso: il nome si ricava da chi l'ha creato, così nessuno sembra modificare gli impegni di un altro.
  if new.kind = 'availability' then
    new.title := 'Impegni';
    if new.deleted_at is not null then
      raise exception 'availability_not_trashable' using errcode = 'P0001';
    end if;
    if not coalesce(case when jsonb_typeof(new.data) = 'object' then
         not exists (select 1 from jsonb_object_keys(new.data) k where k not in ('busy', 'until', 'weeks'))
         and public.availability_busy_ok(new.data -> 'busy')
         and (not new.data ? 'until'
              or (jsonb_typeof(new.data -> 'until') = 'string' and (new.data ->> 'until') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'))
         and (not new.data ? 'weeks' or case when jsonb_typeof(new.data -> 'weeks') = 'array' then
               jsonb_array_length(new.data -> 'weeks') <= 26
               and not exists (
                 select 1 from jsonb_array_elements(new.data -> 'weeks') w
                 where case when jsonb_typeof(w) = 'object' then
                     coalesce(w ->> 'key', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
                     or not public.availability_busy_ok(w -> 'busy')
                     or exists (select 1 from jsonb_object_keys(w) k where k not in ('key', 'busy'))
                   else true end
               )
               and (select count(distinct w ->> 'key') from jsonb_array_elements(new.data -> 'weeks') w) = jsonb_array_length(new.data -> 'weeks')
             else false end)
       else false end, false) then
      raise exception 'invalid_availability' using errcode = '22023';
    end if;
    -- Date vere e lunedì: una data impossibile come il 31 febbraio fa fallire la conversione, e anche quella è rifiutata.
    begin
      if new.data ? 'until' then
        perform (new.data ->> 'until')::date;
      end if;
      if jsonb_typeof(new.data -> 'weeks') = 'array'
         and exists (select 1 from jsonb_array_elements(new.data -> 'weeks') w where extract(isodow from (w ->> 'key')::date) <> 1) then
        raise exception 'invalid_availability' using errcode = '22023';
      end if;
    exception when others then
      raise exception 'invalid_availability' using errcode = '22023';
    end;
  end if;

  -- Ore lavorate: una settimana per elemento, righe con giorno, orari a passi di 15 minuti, area e una nota breve.
  if new.kind = 'timesheet' then
    new.title := 'Ore lavorate';
    if new.deleted_at is not null then
      raise exception 'timesheet_not_trashable' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and (new.data -> 'week') is distinct from (old.data -> 'week') then
      raise exception 'timesheet_week_locked' using errcode = 'P0001';
    end if;
    -- Ogni controllo che converte in numero sta dentro un case: un valore sbagliato dà il codice invalid_timesheet, non un errore tecnico.
    if not coalesce(case when jsonb_typeof(new.data) = 'object' then
         not exists (select 1 from jsonb_object_keys(new.data) k where k not in ('week', 'pledge', 'entries'))
         and coalesce(jsonb_typeof(new.data -> 'week'), '') = 'string'
         and (new.data ->> 'week') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
         and (not new.data ? 'pledge' or case when coalesce(jsonb_typeof(new.data -> 'pledge'), '') = 'number' and (new.data ->> 'pledge') ~ '^[0-9]{1,4}$'
               then (new.data ->> 'pledge')::int <= 4800 and (new.data ->> 'pledge')::int % 15 = 0
               else false end)
         and case when coalesce(jsonb_typeof(new.data -> 'entries'), '') = 'array' then
               jsonb_array_length(new.data -> 'entries') <= 100
               and not exists (
                 select 1 from jsonb_array_elements(new.data -> 'entries') e
                 where case when jsonb_typeof(e) = 'object' then
                     exists (select 1 from jsonb_object_keys(e) k where k not in ('id', 'day', 'start', 'end', 'area', 'note'))
                     or coalesce(jsonb_typeof(e -> 'id'), '') <> 'string'
                     or coalesce(e ->> 'id', '') !~ '^[a-z0-9]{1,16}$'
                     or coalesce(e ->> 'day', '') not in ('lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom')
                     or coalesce(e ->> 'area', '') not in ('prodotto', 'clienti', 'numeri', 'ricerca', 'altro')
                     or coalesce(jsonb_typeof(e -> 'start'), '') <> 'number'
                     or coalesce(jsonb_typeof(e -> 'end'), '') <> 'number'
                     or (e ? 'note' and (coalesce(jsonb_typeof(e -> 'note'), '') <> 'string' or char_length(e ->> 'note') > 140))
                     or case when (e ->> 'start') ~ '^[0-9]{1,4}$' and (e ->> 'end') ~ '^[0-9]{1,4}$' then
                          (e ->> 'start')::int % 15 <> 0 or (e ->> 'end')::int % 15 <> 0
                          or (e ->> 'start')::int >= (e ->> 'end')::int or (e ->> 'end')::int > 1440
                        else true end
                   else true end
               )
               and (select count(distinct e ->> 'id') from jsonb_array_elements(new.data -> 'entries') e) = jsonb_array_length(new.data -> 'entries')
             else false end
       else false end, false) then
      raise exception 'invalid_timesheet' using errcode = '22023';
    end if;
    -- Qui la forma è già giusta: si può convertire senza sorprese.
    if exists (
         select 1 from jsonb_array_elements(new.data -> 'entries') a, jsonb_array_elements(new.data -> 'entries') b
         where a ->> 'id' < b ->> 'id' and a ->> 'day' = b ->> 'day'
           and (a ->> 'start')::int < (b ->> 'end')::int and (b ->> 'start')::int < (a ->> 'end')::int
       ) then
      raise exception 'timesheet_overlap' using errcode = '22023';
    end if;
    declare
      v_week date;
      -- Il team lavora in ora italiana: «oggi» si calcola lì, qualunque fuso chieda la sessione.
      v_today date := (now() at time zone 'Europe/Rome')::date;
    begin
      begin
        v_week := (new.data ->> 'week')::date;
      exception when others then
        raise exception 'invalid_timesheet' using errcode = '22023';
      end;
      if extract(isodow from v_week) <> 1 then
        raise exception 'invalid_timesheet' using errcode = '22023';
      end if;
      if v_week > v_today then
        raise exception 'timesheet_future_week' using errcode = 'P0001';
      end if;
      if exists (
           select 1 from jsonb_array_elements(new.data -> 'entries') e
           where v_week + (array_position(array['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'], e ->> 'day') - 1) > v_today
         ) then
        raise exception 'timesheet_future_day' using errcode = 'P0001';
      end if;
    end;
  end if;

  if tg_op = 'INSERT' then
    -- L'id lo sceglie il database: copiando l'id di una chat o di un'idea di un altro progetto si prenderebbe la cartella
    -- delle sue immagini. Il SQL Editor può ancora sceglierlo.
    if current_user in ('anon', 'authenticated') then
      new.id := gen_random_uuid();
    end if;
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

  insert into public.revisions (project_id, item_id, version, op, kind, idea_id, title, status, data, changed, author_id, message)
  values (new.project_id, new.id, new.version, v_op, new.kind, new.idea_id, new.title, new.status, new.data, v_changed, auth.uid(), left(v_message, 500));
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

-- Ognuno vede gli elementi dei progetti di cui è membro, e in ciascuno vale il ruolo che ha lì.
drop policy if exists items_select on public.items;
create policy items_select on public.items
  for select to authenticated
  using (public.can_read(project_id));

-- Gli advisor possono gestire solo i propri voti e i propri impegni.
drop policy if exists items_insert on public.items;
create policy items_insert on public.items
  for insert to authenticated
  with check (
    public.can_read(project_id)
    and (public.can_write(project_id) or kind in ('score', 'availability'))
  );

-- Le ore lavorate le scrive solo chi le ha create, e solo finché è admin o membro del progetto.
drop policy if exists items_update on public.items;
create policy items_update on public.items
  for update to authenticated
  using (
    public.can_read(project_id)
    and (
      (kind in ('score', 'availability') and created_by = (select auth.uid()))
      or (kind = 'timesheet' and created_by = (select auth.uid()) and public.can_write(project_id))
      or (kind not in ('score', 'availability', 'timesheet') and public.can_write(project_id))
    )
  )
  with check (
    public.can_read(project_id)
    and (
      (kind in ('score', 'availability') and created_by = (select auth.uid()))
      or (kind = 'timesheet' and created_by = (select auth.uid()) and public.can_write(project_id))
      or (kind not in ('score', 'availability', 'timesheet') and public.can_write(project_id))
    )
  );

drop policy if exists revisions_select on public.revisions;
create policy revisions_select on public.revisions
  for select to authenticated
  using (public.can_read(project_id));

-- =========================================================================
-- Operazioni stile git (usate dal sito)
-- =========================================================================

-- Crea un elemento nel progetto dato, con i permessi di chi chiama. Le altre operazioni ricavano il progetto dall'elemento.
create or replace function public.create_item(
  p_project uuid,
  p_kind text,
  p_title text,
  p_status text,
  p_data jsonb,
  p_idea uuid default null,
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
  insert into public.items (project_id, kind, title, status, data, idea_id)
  values (p_project, p_kind, coalesce(p_title, ''), p_status, coalesce(p_data, '{}'::jsonb), p_idea)
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
     and kind not in ('criteria', 'generator', 'score', 'teamcanvas', 'equity', 'availability', 'timesheet')
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
  project_id uuid not null references public.projects (id),
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

create index if not exists comments_project_idx on public.comments (project_id, created_at);
create index if not exists comments_item_idx on public.comments (item_id, created_at);

create or replace function public.comments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Il progetto è quello dell'elemento, qualunque cosa mandi il client. Cercato con i permessi di chi scrive:
    -- un elemento che non vede dà null, e la regola di accesso rifiuta il commento.
    new.project_id := (select i.project_id from public.items i where i.id = new.item_id);
    new.author_id := auth.uid();
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    return new;
  end if;
  new.id := old.id;
  new.project_id := old.project_id;
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
  using (public.can_read(project_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (public.can_read(project_id));

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (public.can_read(project_id) and author_id = (select auth.uid()))
  with check (public.can_read(project_id) and author_id = (select auth.uid()));

-- =========================================================================
-- Chat della squadra
-- =========================================================================

-- In ogni progetto una chat «Generale», aperta insieme al progetto, e chat per argomento, collegabili a un'idea dello
-- stesso progetto. Si archiviano, non si cancellano.
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  idea_id uuid references public.items (id),
  is_general boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists chats_project_idx on public.chats (project_id, created_at);
create unique index if not exists chats_one_general_idx on public.chats (project_id) where is_general;

create or replace function public.chats_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_idea_project uuid;
begin
  if tg_op = 'INSERT' then
    -- Dal sito non si crea un'altra chat generale: la apre il database insieme al progetto, o il SQL Editor (una per progetto).
    -- E l'id lo sceglie il database, come per gli elementi: la chat dà il nome alla cartella delle sue immagini.
    if current_user in ('anon', 'authenticated') then
      new.is_general := false;
      new.id := gen_random_uuid();
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.archived_at := null;
  else
    new.id := old.id;
    new.project_id := old.project_id;
    new.is_general := old.is_general;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if old.is_general then
      new.archived_at := null;
      new.idea_id := null;
    end if;
  end if;
  new.title := btrim(new.title);
  -- Come per gli elementi: l'idea si cerca con i permessi di chi scrive e deve stare nello stesso progetto della chat.
  if new.idea_id is not null and (tg_op = 'INSERT' or new.idea_id is distinct from old.idea_id) then
    select i.project_id into v_idea_project from public.items i where i.id = new.idea_id and i.kind = 'idea';
    if not found then
      raise exception 'chat_idea_not_found' using errcode = 'P0002';
    end if;
    if new.project_id is not null and v_idea_project is distinct from new.project_id then
      raise exception 'cross_project' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists chats_before_write on public.chats;
create trigger chats_before_write
  before insert or update on public.chats
  for each row execute function public.chats_before_write();

-- Ogni progetto nasce con la sua chat Generale, anche quando lo crea il SQL Editor.
create or replace function public.projects_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chats (project_id, title, is_general) values (new.id, 'Generale', true);
  return null;
end
$$;

drop trigger if exists projects_after_insert on public.projects;
create trigger projects_after_insert
  after insert on public.projects
  for each row execute function public.projects_after_insert();

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  chat_id uuid not null references public.chats (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

-- Risposta a un messaggio specifico, come su WhatsApp.
alter table public.chat_messages add column if not exists reply_to uuid references public.chat_messages (id) on delete set null;

create index if not exists chat_messages_project_idx on public.chat_messages (project_id, created_at desc);
create index if not exists chat_messages_chat_idx on public.chat_messages (chat_id, created_at desc);

create or replace function public.chat_messages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Il progetto è quello della chat, cercata con i permessi di chi scrive: in una chat che non vede, null e rifiuto.
    new.project_id := (select c.project_id from public.chats c where c.id = new.chat_id);
    new.author_id := auth.uid();
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    if exists (select 1 from public.chats c where c.id = new.chat_id and c.archived_at is not null) then
      raise exception 'chat_archived' using errcode = 'P0001';
    end if;
    if new.reply_to is not null
       and not exists (select 1 from public.chat_messages m where m.id = new.reply_to and m.chat_id = new.chat_id) then
      raise exception 'reply_other_chat' using errcode = 'P0001';
    end if;
    return new;
  end if;
  new.id := old.id;
  new.project_id := old.project_id;
  new.chat_id := old.chat_id;
  new.reply_to := old.reply_to;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  if old.deleted_at is not null then
    raise exception 'message_deleted' using errcode = 'P0001';
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
  using (public.can_read(project_id));

drop policy if exists chats_insert on public.chats;
create policy chats_insert on public.chats
  for insert to authenticated
  with check (public.can_read(project_id));

drop policy if exists chats_update on public.chats;
create policy chats_update on public.chats
  for update to authenticated
  using (public.can_read(project_id))
  with check (public.can_read(project_id));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (public.can_read(project_id));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (public.can_read(project_id));

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
  for update to authenticated
  using (public.can_read(project_id) and author_id = (select auth.uid()))
  with check (public.can_read(project_id) and author_id = (select auth.uid()));

drop policy if exists chat_reads_select on public.chat_reads;
create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.chats c where c.id = chat_id and public.can_read(c.project_id))
  );

-- Per ogni chat del progetto: ultimo messaggio e messaggi degli altri non ancora letti da chi chiede.
-- Senza letture registrate si parte da quando la persona è entrata nel progetto.
create or replace function public.chat_overview(p_project uuid)
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
          (select mb.created_at from public.members mb where mb.user_id = auth.uid() and mb.project_id = c.project_id)
        )
    )
  from public.chats c
  where c.project_id = p_project and public.can_read(p_project)
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
  where c.id = p_chat and public.can_read(c.project_id)
  on conflict (user_id, chat_id) do update set last_read_at = excluded.last_read_at
$$;

-- =========================================================================
-- Menzioni: @[Nome Cognome] o @[tutti] in messaggi, commenti e note
-- =========================================================================

-- Le crea solo il database, dai testi salvati, nel progetto del testo; ognuno vede solo le proprie.
create table if not exists public.mentions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id),
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

create index if not exists mentions_project_idx on public.mentions (project_id, created_at desc);
create index if not exists mentions_user_idx on public.mentions (user_id, created_at desc);

alter table public.mentions enable row level security;

drop policy if exists mentions_select on public.mentions;
create policy mentions_select on public.mentions
  for select to authenticated
  using (user_id = (select auth.uid()) and public.can_read(project_id));

-- Chi è menzionato in un testo: i membri del progetto del testo il cui nome compare come @[Nome], tutti con @[tutti],
-- mai chi scrive. Due persone con lo stesso nome in progetti diversi non si confondono.
create or replace function public.mentioned_users(p_project uuid, p_text text, p_author uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select m.user_id
  from public.members m
  left join public.profiles pr on pr.user_id = m.user_id
  where m.project_id = p_project
    and m.user_id is distinct from p_author
    and (
      coalesce(p_text, '') ~* '@\[tutti\]'
      or exists (
        select 1 from regexp_matches(coalesce(p_text, ''), '@\[([^]\n]{1,80})\]', 'g') as x(name)
        where lower(btrim(x.name[1])) = lower(pr.display_name)
      )
    )
$$;

-- Una menzione per persona e per testo: modificando si aggiungono solo le persone nuove.
create or replace function public.record_mentions(
  p_project uuid, p_source text, p_source_id uuid, p_text text, p_author uuid, p_chat uuid, p_item uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.mentions (project_id, user_id, author_id, source, source_id, chat_id, item_id, excerpt)
  select
    p_project, u, p_author, p_source, p_source_id, p_chat, p_item,
    left(btrim(regexp_replace(regexp_replace(regexp_replace(p_text, '!\[[^]\n]*\]\([^)]*\)', '[immagine]', 'g'), '@\[([^]\n]{1,80})\]', '@\1', 'g'), '\s+', ' ', 'g')), 200)
  from public.mentioned_users(p_project, p_text, p_author) as u
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
    perform public.record_mentions(new.project_id, 'chat', new.id, new.body, new.author_id, new.chat_id, null);
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
    perform public.record_mentions(new.project_id, 'comment', new.id, new.body, new.author_id, null, new.item_id);
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
    perform public.record_mentions(new.project_id, 'note', new.id, new.data ->> 'body', new.updated_by, null, new.id);
  end if;
  return null;
end
$$;

drop trigger if exists notes_mentions on public.items;
create trigger notes_mentions
  after insert or update on public.items
  for each row execute function public.notes_mentions();

-- Segna come lette le proprie menzioni di un progetto: tutte, o solo quelle di p_ids. Quelle degli altri progetti restano
-- da leggere, e la loro email parte comunque.
create or replace function public.mark_mentions_read(p_project uuid, p_ids bigint[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mentions
  set read_at = now()
  where user_id = auth.uid() and project_id = p_project and read_at is null and public.can_read(p_project)
    and (p_ids is null or id = any (p_ids))
$$;

-- =========================================================================
-- Immagini: di quale progetto sono
-- =========================================================================

-- Le immagini restano dove sono: la prima cartella del percorso è un'idea, un questionario, un gruppo di spese o una chat,
-- e da lì si ricava il progetto. Null per tutto il resto, senza errori: un nome malformato non fa fallire le regole di Storage.
-- Un id che è sia un elemento sia una chat non è di nessuno. Chi è entrato scopre solo il progetto che può leggere
-- (alle regole di Storage non serve altro); il SQL Editor li vede tutti.
create or replace function public.storage_project(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder uuid;
  v_item uuid;
  v_chat uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then
    return null;
  end if;
  v_folder := left(p_name, 36)::uuid;
  select i.project_id into v_item from public.items i where i.id = v_folder and i.kind in ('idea', 'survey', 'expensegroup');
  select c.project_id into v_chat from public.chats c where c.id = v_folder;
  if v_item is not null and v_chat is not null then
    return null;
  end if;
  if auth.uid() is not null and not public.can_read(coalesce(v_item, v_chat)) then
    return null;
  end if;
  return coalesce(v_item, v_chat);
end
$$;

-- =========================================================================
-- Immagini dei questionari
-- =========================================================================

-- Spazio pubblico per le immagini della schermata iniziale e del grazie: le vede chiunque abbia il link del questionario, senza account.
-- Solo JPEG già ridotti nel browser, caricati e cancellati da chi può modificare il progetto della cartella; nessuna regola
-- di lettura, così nessuno può elencare i file: si apre solo quello di cui si conosce il percorso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('questionari-immagini', 'questionari-immagini', true, 1048576, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists survey_images_insert on storage.objects;
create policy survey_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'questionari-immagini'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and public.can_write(public.storage_project(name))
  );

drop policy if exists survey_images_delete on storage.objects;
create policy survey_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'questionari-immagini' and public.can_write(public.storage_project(name)));

-- Immagini di un progetto che nessun suo questionario usa più (cestino compreso). Senza elenco: quelle caricate da più
-- di 24 ore (le altre possono essere in un questionario non ancora salvato). Il sito poi le cancella con le API di Storage.
create or replace function public.survey_image_orphans(p_project uuid, p_paths text[] default null)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'questionari-immagini'
    and public.can_write(p_project)
    and (case when p_paths is null then o.created_at < now() - interval '24 hours' else o.name = any (p_paths) end)
    and public.storage_project(o.name) = p_project
    and not exists (
      select 1 from public.items i
      where i.project_id = p_project and i.kind = 'survey'
        and o.name in (i.data -> 'cover' ->> 'path', i.data -> 'thanks_image' ->> 'path')
    )
$$;

-- =========================================================================
-- Immagini delle note
-- =========================================================================

-- Spazio privato per le immagini di note e chat e per gli scontrini delle spese: solo JPEG già ridotti nel browser, letti e
-- caricati da chi legge il progetto della cartella (con 2FA), cancellati da chi lo può modificare.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-immagini', 'note-immagini', false, 1048576, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists note_images_select on storage.objects;
create policy note_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'note-immagini' and public.can_read(public.storage_project(name)));

drop policy if exists note_images_insert on storage.objects;
create policy note_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-immagini'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and public.can_read(public.storage_project(name))
  );

drop policy if exists note_images_delete on storage.objects;
create policy note_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-immagini' and public.can_write(public.storage_project(name)));

-- Immagini di un progetto senza puntatore in nessuna sua nota (cestino compreso), in nessun suo messaggio e in nessuna sua
-- spesa. Senza elenco: quelle caricate da più di 24 ore (le altre possono essere in una nota non ancora salvata).
-- Il sito poi le cancella con le API di Storage.
create or replace function public.note_image_orphans(p_project uuid, p_paths text[] default null)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'note-immagini'
    and public.can_write(p_project)
    and (case when p_paths is null then o.created_at < now() - interval '24 hours' else o.name = any (p_paths) end)
    and public.storage_project(o.name) = p_project
    and not exists (
      select 1 from public.items i
      where i.project_id = p_project and i.kind = 'note'
        and strpos(coalesce(i.data ->> 'body', ''), '(immagine:' || o.name || ')') > 0
    )
    and not exists (
      select 1 from public.chat_messages m
      where m.project_id = p_project and m.deleted_at is null and strpos(m.body, '(immagine:' || o.name || ')') > 0
    )
    and not exists (
      select 1 from public.items i
      where i.project_id = p_project and i.kind = 'expense' and i.data ->> 'receipt' = o.name
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

-- L'uso di Claude è della persona, non di un progetto: ognuno vede il proprio, l'amministratore della piattaforma tutto.
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using ((select public.has_mfa()) and (user_id = (select auth.uid()) or (select public.is_platform_admin())));

-- =========================================================================
-- Registro di sicurezza: chi entra in un progetto, chi esce, chi cambia ruolo, e la vita dei progetti
-- =========================================================================

-- project_id null: evento della piattaforma (amministratori della piattaforma aggiunti o tolti), fuori da ogni progetto.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects (id),
  event text not null,
  actor_id uuid,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Il vincolo sugli eventi si ricrea a ogni installazione, così un evento nuovo basta rieseguire lo schema.
alter table public.audit_log drop constraint if exists audit_log_event_check;
alter table public.audit_log add constraint audit_log_event_check check (
  event in (
    'member_added', 'member_role_changed', 'member_removed',
    'project_created', 'project_renamed', 'project_archived', 'project_unarchived',
    'platform_admin_added', 'platform_admin_removed'
  )
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_project_idx on public.audit_log (project_id, created_at desc);

create or replace function public.members_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (project_id, event, actor_id, target_id, details)
    values (new.project_id, 'member_added', auth.uid(), new.user_id, jsonb_build_object('role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      insert into public.audit_log (project_id, event, actor_id, target_id, details)
      values (new.project_id, 'member_role_changed', auth.uid(), new.user_id, jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  else
    insert into public.audit_log (project_id, event, actor_id, target_id, details)
    values (old.project_id, 'member_removed', auth.uid(), old.user_id, jsonb_build_object('role', old.role));
  end if;
  return null;
end
$$;

drop trigger if exists members_audit on public.members;
create trigger members_audit
  after insert or update or delete on public.members
  for each row execute function public.members_audit();

alter table public.audit_log enable row level security;

-- L'admin di un progetto legge il registro di quel progetto; l'amministratore della piattaforma legge tutto.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.is_platform_admin()) or (project_id is not null and public.is_admin(project_id)));

-- =========================================================================
-- Progetti e amministratori della piattaforma: le sole vie per scriverli dal sito
-- =========================================================================

-- Dal SQL Editor (senza utente) funzionano sempre, come add_member; dal sito servono la 2FA e il ruolo giusto.
-- Il nome di un progetto: da 1 a 80 caratteri, senza gli spazi ai bordi.
create or replace function public.create_project(p_name text)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  r public.projects;
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_project_name' using errcode = '22023';
  end if;
  -- Il trigger del progetto apre la chat Generale. Chi lo crea non ne diventa membro: per leggerlo deve aggiungersi.
  insert into public.projects (name, created_by) values (v_name, auth.uid()) returning * into r;
  insert into public.audit_log (project_id, event, actor_id, details)
  values (r.id, 'project_created', auth.uid(), jsonb_build_object('name', r.name));
  return r;
end
$$;

-- Lo rinomina il suo admin o un amministratore della piattaforma; un progetto archiviato non si rinomina.
create or replace function public.rename_project(p_project uuid, p_name text)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_old text;
  r public.projects;
begin
  if auth.uid() is not null and not public.can_manage(p_project) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select p.name into v_old from public.projects p where p.id = p_project and p.archived_at is null for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_project_name' using errcode = '22023';
  end if;
  update public.projects set name = v_name where id = p_project returning * into r;
  insert into public.audit_log (project_id, event, actor_id, details)
  values (p_project, 'project_renamed', auth.uid(), jsonb_build_object('from', v_old, 'to', v_name));
  return r;
end
$$;

-- Un progetto archiviato non lo legge e non lo scrive più nessuno, i dati restano; lo riattiva solo la piattaforma.
create or replace function public.archive_project(p_project uuid)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.projects;
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into r from public.projects p where p.id = p_project for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if r.archived_at is null then
    update public.projects set archived_at = now() where id = p_project returning * into r;
    insert into public.audit_log (project_id, event, actor_id) values (p_project, 'project_archived', auth.uid());
  end if;
  return r;
end
$$;

create or replace function public.unarchive_project(p_project uuid)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.projects;
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into r from public.projects p where p.id = p_project for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if r.archived_at is not null then
    update public.projects set archived_at = null where id = p_project returning * into r;
    insert into public.audit_log (project_id, event, actor_id) values (p_project, 'project_unarchived', auth.uid());
  end if;
  return r;
end
$$;

-- Rende amministratore della piattaforma una persona già registrata in Authentication > Users.
create or replace function public.add_platform_admin(p_email text)
returns public.platform_admins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  r public.platform_admins;
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  insert into public.platform_admins (user_id, created_by) values (v_user_id, auth.uid())
  on conflict (user_id) do nothing
  returning * into r;
  if r.user_id is null then
    select * into r from public.platform_admins a where a.user_id = v_user_id;
  else
    insert into public.audit_log (project_id, event, actor_id, target_id) values (null, 'platform_admin_added', auth.uid(), v_user_id);
  end if;
  return r;
end
$$;

-- Ne resta sempre almeno uno: l'ultimo non si toglie (ed è per forza chi lo chiede).
create or replace function public.remove_platform_admin(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Tutte le righe bloccate: due amministratori che si tolgono a vicenda non lasciano la piattaforma senza nessuno.
  perform 1 from public.platform_admins for update;
  if not exists (select 1 from public.platform_admins a where a.user_id = p_user) then
    return;
  end if;
  if (select count(*) from public.platform_admins) <= 1 then
    raise exception 'last_platform_admin' using errcode = 'P0001';
  end if;
  delete from public.platform_admins where user_id = p_user;
  insert into public.audit_log (project_id, event, actor_id, target_id) values (null, 'platform_admin_removed', auth.uid(), p_user);
end
$$;

-- =========================================================================
-- Email: menzioni non lette e riepilogo del lunedì (Edge Function notify)
-- =========================================================================

-- Preferenze di ciascuno, valide in tutti i progetti: senza riga sono accese tutte e due. Si cambiano solo con set_email_prefs.
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
  using ((select public.has_any_project()) and user_id = (select auth.uid()));

-- Un riepilogo per persona, progetto e settimana: la riga si scrive prima dell'invio, così un nuovo tentativo non lo rimanda.
create table if not exists public.email_weekly (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id),
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, project_id, week_start)
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

-- Le sceglie chi è membro con 2FA di almeno un progetto.
create or replace function public.set_email_prefs(p_mentions boolean default null, p_weekly boolean default null)
returns public.email_prefs
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.email_prefs;
begin
  if not public.has_any_project() then
    raise exception 'not_allowed' using errcode = '42501';
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
-- Destinatari: membri con email e 2FA attiva, come chi può leggere il sito, una volta per ogni progetto attivo,
-- con il nome del progetto (per oggetto e link delle email) e la lingua del profilo (per il testo).
create or replace function public.notify_recipients()
returns table (
  project_id uuid,
  project_name text,
  user_id uuid,
  display_name text,
  email text,
  language text,
  mentions boolean,
  weekly boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select pj.id, pj.name, m.user_id, pr.display_name, u.email::text, pr.language, coalesce(p.mentions, true), coalesce(p.weekly, true)
  from public.members m
  join public.projects pj on pj.id = m.project_id and pj.archived_at is null
  join auth.users u on u.id = m.user_id
  left join public.profiles pr on pr.user_id = m.user_id
  left join public.email_prefs p on p.user_id = m.user_id
  where coalesce(u.email, '') <> ''
    and exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified')
  order by pj.created_at, pj.id, m.created_at
$$;

-- Le colonne di prima più progetto, nome del progetto e lingua di chi riceve. Niente email per un progetto archiviato,
-- né a chi non ne è più membro: resta tra i destinatari per gli altri suoi progetti, ma il testo di questo non lo riceve.
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
  read_at timestamptz,
  project_id uuid,
  project_name text,
  language text
)
language sql
stable
security definer
set search_path = ''
as $$
  select mn.id, mn.user_id, mn.author_id, a.display_name, mn.source, mn.source_id, mn.chat_id, c.title,
         mn.item_id, i.title, i.kind, mn.excerpt, mn.created_at, mn.read_at, mn.project_id, pj.name, rcpt.language
  from public.mentions mn
  join public.projects pj on pj.id = mn.project_id and pj.archived_at is null
  join public.members mb on mb.project_id = mn.project_id and mb.user_id = mn.user_id
  left join public.profiles a on a.user_id = mn.author_id
  left join public.profiles rcpt on rcpt.user_id = mn.user_id
  left join public.chats c on c.id = mn.chat_id
  left join public.items i on i.id = mn.item_id
  where mn.emailed_at is null and mn.read_at is null and mn.created_at > p_since
  order by mn.user_id, mn.created_at
$$;

-- Segna le menzioni prima dell'invio: restituisce solo quelle ancora da gestire e non lette, così nessuna parte due volte.
-- E solo di chi è ancora membro: chi esce tra la lettura e l'invio non riceve il testo del progetto.
create or replace function public.notify_claim_mentions(p_ids bigint[])
returns table (id bigint)
language sql
security definer
set search_path = ''
as $$
  update public.mentions m
  set emailed_at = now()
  where m.id = any (p_ids) and m.emailed_at is null and m.read_at is null
    and exists (select 1 from public.members mb where mb.project_id = m.project_id and mb.user_id = m.user_id)
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

create or replace function public.notify_claim_weekly(p_user uuid, p_project uuid, p_week date)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.email_weekly (user_id, project_id, week_start)
    values (p_user, p_project, p_week)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from ins)
$$;

create or replace function public.notify_release_weekly(p_user uuid, p_project uuid, p_week date)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.email_weekly where user_id = p_user and project_id = p_project and week_start = p_week
$$;

-- Dati del riepilogo di un progetto: le scelte (cosa mostrare a chi) le fa la funzione notify.
-- Dei contatti esterni si manda solo il ruolo, mai il nome (il titolo della scheda).
-- reached: interviste fatte, esperimenti conclusi e decisioni prese per la prima volta dopo p_since.
-- unread: per ogni membro del progetto, con la sua lingua, menzioni e messaggi non letti in quel progetto.
create or replace function public.notify_weekly_data(p_project uuid, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'project_id', p_project,
    'project_name', (select pj.name from public.projects pj where pj.id = p_project),
    'ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'owner', i.data ->> 'owner', 'next_step', i.data ->> 'next_step') order by i.created_at)
      from public.items i
      where i.project_id = p_project and i.kind = 'idea' and i.deleted_at is null and i.status not in ('scartata', 'parcheggiata')
        and coalesce(i.data ->> 'owner', '') <> ''
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'role', i.data ->> 'role', 'idea_title', idea.title, 'owner', i.data ->> 'owner', 'next_date', i.data ->> 'next_date'
      ) order by i.data ->> 'next_date')
      from public.items i
      join public.items idea on idea.id = i.idea_id and idea.deleted_at is null
      where i.project_id = p_project and i.kind = 'contact' and i.deleted_at is null and i.status <> 'chiusa'
        and coalesce(i.data ->> 'owner', '') <> '' and coalesce(i.data ->> 'next_date', '') <> ''
    ), '[]'::jsonb),
    'experiments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'title', i.title, 'idea_title', idea.title, 'owner', i.data ->> 'owner', 'status', i.status,
        'start_date', i.data ->> 'start_date', 'end_date', i.data ->> 'end_date'
      ) order by i.created_at)
      from public.items i
      join public.items idea on idea.id = i.idea_id and idea.deleted_at is null
      where i.project_id = p_project and i.kind = 'experiment' and i.deleted_at is null and i.status <> 'concluso'
        and coalesce(i.data ->> 'owner', '') <> ''
    ), '[]'::jsonb),
    'new_ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title) order by i.created_at)
      from public.items i
      where i.project_id = p_project and i.kind = 'idea' and i.deleted_at is null and i.created_at >= p_since
    ), '[]'::jsonb),
    'busy_ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'changes', x.n) order by x.n desc, x.title)
      from (
        select idea.id, idea.title, count(*)::integer as n
        from public.revisions r
        join public.items idea on idea.id = case when r.kind = 'idea' then r.item_id else r.idea_id end
        where r.project_id = p_project and r.created_at >= p_since and idea.kind = 'idea' and idea.deleted_at is null
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
      where i.project_id = p_project
        and i.deleted_at is null
        and i.status = any (s.statuses)
        and exists (select 1 from public.revisions r where r.item_id = i.id and r.created_at >= p_since and r.status = any (s.statuses))
        and not exists (select 1 from public.revisions r where r.item_id = i.id and r.created_at < p_since and r.status = any (s.statuses))
    ), '[]'::jsonb),
    'unread', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', mb.user_id,
        'language', pr.language,
        'mentions', (
          select count(*) from public.mentions mn
          where mn.user_id = mb.user_id and mn.project_id = p_project and mn.read_at is null
        ),
        'chat', (
          select count(*)
          from public.chat_messages m
          where m.project_id = p_project
            and m.deleted_at is null
            and m.author_id is distinct from mb.user_id
            and m.created_at > coalesce(
              (select r.last_read_at from public.chat_reads r where r.chat_id = m.chat_id and r.user_id = mb.user_id),
              mb.created_at
            )
        )
      ))
      from public.members mb
      left join public.profiles pr on pr.user_id = mb.user_id
      where mb.project_id = p_project
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
    raise exception 'unknown_job' using errcode = '22023';
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
-- Questionari: link pubblico per chi risponde, risposte e statistiche per il progetto
-- =========================================================================

-- L'unica eccezione al «negato di default»: chi non ha un account usa solo public_survey, submit_survey e survey_event.
-- Le tabelle qui sotto non si leggono né si scrivono direttamente; il progetto del questionario legge le risposte e i conteggi.

-- Una riga per compilazione (session, generata dalla pagina): si salva schermata per schermata e diventa completa
-- con l'ultimo invio, dopo il quale non cambia più. Le incomplete restano: chi abbandona lascia comunque le sue risposte.
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
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

create index if not exists survey_responses_project_idx on public.survey_responses (project_id, created_at);
create index if not exists survey_responses_survey_idx on public.survey_responses (survey_id, created_at);

-- Secondi passati su ogni domanda, per vedere nei risultati le risposte date troppo in fretta.
alter table public.survey_responses add column if not exists question_seconds jsonb
  check (question_seconds is null or (jsonb_typeof(question_seconds) = 'object' and octet_length(question_seconds::text) < 8192));

-- Visite della pagina e inizi della compilazione, per l'imbuto: nessun dato su chi risponde.
create table if not exists public.survey_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id),
  survey_id uuid not null references public.items (id) on delete cascade,
  kind text not null check (kind in ('view', 'start')),
  created_at timestamptz not null default now()
);

create index if not exists survey_events_project_idx on public.survey_events (project_id, created_at);
create index if not exists survey_events_survey_idx on public.survey_events (survey_id, kind, created_at);

-- Risposte e visite stanno nel progetto del questionario: lo copia il database, qualunque cosa arrivi, e non cambia più.
create or replace function public.survey_rows_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.survey_id is distinct from old.survey_id then
    new.project_id := (select i.project_id from public.items i where i.id = new.survey_id);
  else
    new.project_id := old.project_id;
  end if;
  return new;
end
$$;

drop trigger if exists survey_responses_before_write on public.survey_responses;
create trigger survey_responses_before_write
  before insert or update on public.survey_responses
  for each row execute function public.survey_rows_before_write();

drop trigger if exists survey_events_before_write on public.survey_events;
create trigger survey_events_before_write
  before insert or update on public.survey_events
  for each row execute function public.survey_rows_before_write();

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

-- Quante risposte ha ogni questionario, aggiornato nella fila delle compilazioni nuove; si rifà da solo se manca.
create table if not exists public.survey_counts (
  survey_id uuid primary key references public.items (id) on delete cascade,
  responses integer not null check (responses >= 0)
);

-- Quante visite e quanti inizi ha ogni questionario, per un tetto che non costi un conteggio di tutti gli eventi a ogni visita.
create table if not exists public.survey_event_counts (
  survey_id uuid primary key references public.items (id) on delete cascade,
  events integer not null check (events >= 0)
);

-- Un sale casuale al giorno, letto solo dalle funzioni qui sotto: cambiando ogni giorno, le impronte non si collegano tra giorni.
create table if not exists public.survey_salts (
  day date primary key,
  salt text not null
);

alter table public.survey_responses enable row level security;
alter table public.survey_events enable row level security;
alter table public.survey_limits enable row level security;
alter table public.survey_salts enable row level security;
alter table public.survey_counts enable row level security;
alter table public.survey_event_counts enable row level security;

-- Il progetto legge le risposte dei suoi questionari non archiviati di idee non archiviate; nessuno le scrive direttamente.
drop policy if exists survey_responses_select on public.survey_responses;
create policy survey_responses_select on public.survey_responses
  for select to authenticated
  using (
    public.can_read(project_id)
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

-- Il questionario di un link: non archiviato, di un'idea non archiviata, di un progetto non archiviato. Senza riga se non c'è.
create or replace function public.survey_by_token(p_token text)
returns setof public.items
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.items s
  join public.items idea on idea.id = s.idea_id and idea.deleted_at is null
  join public.projects p on p.id = s.project_id and p.archived_at is null
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
  v_inet inet;
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
  -- Un indirizzo IPv6 conta per la sua /64: una sola connessione di casa ne ha miliardi e aggirerebbe il limite per rete.
  begin
    v_inet := v_address::inet;
    if family(v_inet) = 6 and not v_inet <<= '::ffff:0:0/96'::inet then
      v_address := host(network(set_masklen(v_inet, 64)));
    else
      -- Lo stesso IPv4 scritto in due modi (1.2.3.4 e ::ffff:1.2.3.4) dà la stessa impronta.
      v_address := regexp_replace(host(v_inet), '^::ffff:', '');
    end if;
  exception when others then
    null;
  end;
  delete from public.survey_salts where day < v_day;
  insert into public.survey_salts (day, salt)
  values (v_day, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (day) do nothing;
  select s.salt into v_salt from public.survey_salts s where s.day = v_day;
  return encode(sha256(convert_to(v_salt || '|' || p_survey::text || '|' || coalesce(left(v_address, 100), '-'), 'UTF8')), 'hex');
end
$$;

-- Il motivo è un codice in snake_case, mai una frase: la pagina pubblica lo mette in parole nella lingua di chi risponde
-- (server in assets/js/public/texts.js). Gli errori delle altre funzioni sono codici con il loro SQLSTATE (docs/PROGETTI.md).
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
    -- Mediana sulle ultime 1000 compilazioni complete: per la stima del tempo basta, e la pagina si apre in fretta anche con decine di migliaia di risposte.
    'median_seconds', (
      select case when count(*) >= 20 then round(percentile_cont(0.5) within group (order by d.duration_seconds)::numeric)::integer end
      from (
        select r.duration_seconds from public.survey_responses r
        where r.survey_id = s.id and r.completed and r.duration_seconds is not null
        order by r.created_at desc
        limit 1000
      ) d
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
  v_total integer;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(v_meta) <> 'object' then
    return public.survey_error('invalid_answers');
  end if;
  if octet_length(p_answers::text) + octet_length(v_meta::text) >= 20480 then
    return public.survey_error('answers_too_long');
  end if;

  select * into s from public.survey_by_token(p_token);
  if s.id is null then
    return public.survey_error('survey_not_found');
  elsif s.status is distinct from 'aperto' then
    return public.survey_error('survey_closed');
  end if;

  -- Un bot che compila il campo nascosto riceve «ok», ma non si salva nulla.
  if btrim(coalesce(v_meta ->> 'website', '')) <> '' then
    return jsonb_build_object('status', 'ok');
  end if;

  if jsonb_typeof(v_meta -> 'session') is distinct from 'string'
     or (v_meta ->> 'session') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return public.survey_error('invalid_session');
  end if;
  if coalesce(jsonb_typeof(v_meta -> 'final'), 'null') not in ('boolean', 'null')
     or coalesce(jsonb_typeof(v_meta -> 'recontact'), 'null') not in ('boolean', 'null')
     or (coalesce(jsonb_typeof(v_meta -> 'device'), 'null') <> 'null' and coalesce(v_meta ->> 'device', '') not in ('telefono', 'computer')) then
    return public.survey_error('invalid_answers');
  end if;
  v_session := (v_meta ->> 'session')::uuid;
  v_final := coalesce(v_meta -> 'final' = 'true'::jsonb, false);
  v_device := case when v_meta ->> 'device' in ('telefono', 'computer') then v_meta ->> 'device' end;

  -- I salvataggi di una compilazione già iniziata aspettano solo la propria riga, così migliaia di persone salvano insieme.
  select * into r from public.survey_responses x where x.survey_id = s.id and x.session = v_session for update;
  if r.id is not null then
    if r.completed then
      return public.survey_error('already_submitted');
    elsif not v_final and r.saves >= 60 then
      return public.survey_error('too_many_saves');
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
        return public.survey_error('invalid_answers');
      end if;
      continue when jsonb_typeof(v_value) = 'null';
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('invalid_answers', v_qid);
      end if;
      v_text := public.survey_text(v_value, 100000);
      continue when v_text = '';
      if char_length(v_text) > 300 then
        return public.survey_error('answer_too_long', v_qid);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_text);
      continue;
    end if;

    v_q := v_by_id -> v_key;
    if v_q is null then
      return public.survey_error('invalid_answers');
    end if;
    continue when jsonb_typeof(v_value) = 'null';
    v_type := v_q ->> 'type';

    -- «Preferisco non rispondere» ha l'id riservato non-rispondo, valido solo dove la domanda lo prevede.
    if v_type = 'scelta' then
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('invalid_answers', v_key);
      end if;
      continue when v_value #>> '{}' = '';
      if not (
        exists (select 1 from jsonb_array_elements(v_q -> 'options') o where o ->> 'id' = v_value #>> '{}')
        or (v_value #>> '{}' = 'non-rispondo' and v_q -> 'prefer_not' = 'true'::jsonb)
      ) then
        return public.survey_error('invalid_answers', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_value);
    elsif v_type = 'scelte' then
      if jsonb_typeof(v_value) <> 'array' then
        return public.survey_error('invalid_answers', v_key);
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
        return public.survey_error('invalid_answers', v_key);
      end if;
      if v_value ? 'non-rispondo' and jsonb_array_length(v_value) > 1 then
        return public.survey_error('one_answer_only', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_value);
    elsif v_type = 'scala' then
      v_n := public.survey_int(v_value, 1, (v_q -> 'scale' ->> 'points')::integer);
      if v_n is null then
        return public.survey_error('invalid_answers', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_n);
    elsif v_type = 'numero' then
      if public.survey_int(v_value, -1000000000, 1000000000) is null then
        return public.survey_error('integer_required', v_key);
      end if;
      v_n := public.survey_int(
        v_value,
        coalesce((v_q -> 'number' ->> 'min')::integer, -1000000000),
        coalesce((v_q -> 'number' ->> 'max')::integer, 1000000000)
      );
      if v_n is null then
        return public.survey_error('number_out_of_range', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_n);
    elsif v_type in ('breve', 'lunga') then
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('invalid_answers', v_key);
      end if;
      v_text := public.survey_text(v_value, 100000);
      continue when v_text = '';
      if char_length(v_text) > (case when v_type = 'breve' then 300 else 3000 end) then
        return public.survey_error('answer_too_long', v_key);
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_text);
    elsif v_type = 'email' then
      if jsonb_typeof(v_value) <> 'string' then
        return public.survey_error('invalid_email', v_key);
      end if;
      v_text := lower(public.survey_text(v_value, 100000));
      continue when v_text = '';
      if char_length(v_text) > 254 or v_text !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        return public.survey_error('invalid_email', v_key);
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
      return public.survey_error('one_answer_only', v_qid);
    end if;
    if v_final and v_q -> 'required' = 'true'::jsonb and not (
      case v_q ->> 'type'
        when 'email' then v_email is not null
        when 'scelta' then v_clean ? v_qid or v_clean ? (v_qid || ':altro')
        when 'scelte' then v_clean ? v_qid or v_clean ? (v_qid || ':altro')
        else v_clean ? v_qid
      end
    ) then
      return public.survey_error('required_missing', v_qid);
    end if;
  end loop;

  v_recontact := coalesce(v_meta -> 'recontact' = 'true'::jsonb, false);
  if v_final then
    if v_clean = '{}'::jsonb and v_email is null then
      return public.survey_error('no_answers');
    elsif v_recontact and v_email is null then
      return public.survey_error('recontact_needs_email');
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
    -- Una compilazione appena iniziata senza risposte non lascia traccia e non passa dalla fila.
    if v_clean = '{}'::jsonb and v_email is null then
      return jsonb_build_object('status', 'ok');
    end if;
    -- Pulizia a piccoli lotti, saltando le righe che sta già togliendo un'altra richiesta: niente attese il giorno dopo un picco.
    delete from public.survey_limits where id in (
      select l.id from public.survey_limits l where l.created_at < now() - interval '24 hours'
      order by l.created_at limit 200 for update skip locked
    );
    -- Una compilazione nuova passa da una fila per questionario, così limiti e sessioni restano esatti.
    -- Arriva qui già controllata: in fila si fanno solo i conti, dal più leggero.
    perform pg_advisory_xact_lock(hashtextextended('survey:' || s.id::text, 0));
    -- Nel frattempo la stessa compilazione può essere arrivata da un'altra richiesta (doppio clic, rete lenta).
    select * into r from public.survey_responses x where x.survey_id = s.id and x.session = v_session for update;
    if r.id is not null then
      if r.completed then
        return public.survey_error('already_submitted');
      elsif not v_final and r.saves >= 60 then
        return public.survey_error('too_many_saves');
      end if;
    end if;
  end if;

  if r.id is null then
    -- Limiti larghi per invii a decine di migliaia di persone: 50 compilazioni all'ora dalla stessa rete (operatori mobili,
    -- uffici e Wi-Fi pubblici fanno uscire molte persone dallo stesso indirizzo), 600 al minuto e 60000 in tutto.
    v_client := public.survey_client(s.id);
    if (
      select count(*) from public.survey_limits l
      where l.survey_id = s.id and l.client = v_client and l.kind = 'session' and l.created_at > now() - interval '1 hour'
    ) >= 50 then
      return public.survey_error('too_many_submissions');
    end if;
    if (select count(*) from (
          select 1 from public.survey_responses x where x.survey_id = s.id and x.created_at > now() - interval '1 minute' limit 600
        ) y) >= 600 then
      return public.survey_error('survey_busy');
    end if;
    -- Il totale sta in un contatore, rifatto con un conteggio solo quando manca: contarle tutte a ogni compilazione costerebbe troppo.
    select c.responses into v_total from public.survey_counts c where c.survey_id = s.id;
    if v_total is null then
      select count(*) into v_total from public.survey_responses x where x.survey_id = s.id;
      insert into public.survey_counts (survey_id, responses) values (s.id, v_total)
      on conflict (survey_id) do update set responses = excluded.responses;
    end if;
    if v_total >= 60000 then
      return public.survey_error('survey_full');
    end if;
    insert into public.survey_responses (survey_id, session, answers, email, recontact, duration_seconds, device, completed, question_seconds)
    values (s.id, v_session, v_clean, v_email, v_recontact, v_duration, v_device, v_final, v_times);
    insert into public.survey_limits (survey_id, client, kind) values (s.id, v_client, 'session');
    update public.survey_counts set responses = responses + 1 where survey_id = s.id;
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
  v_events integer;
begin
  if p_kind is null or p_kind not in ('view', 'start') then
    return;
  end if;
  select * into s from public.survey_by_token(p_token);
  if s.id is null or s.status is distinct from 'aperto' then
    return;
  end if;
  delete from public.survey_limits where id in (
    select l.id from public.survey_limits l where l.created_at < now() - interval '24 hours'
    order by l.created_at limit 200 for update skip locked
  );
  v_client := public.survey_client(s.id);
  -- Visite e inizi servono solo alle statistiche: limiti larghi come quelli delle risposte, oltre non si conta e basta.
  if (
    select count(*) from public.survey_limits l
    where l.survey_id = s.id and l.client = v_client and l.kind in ('view', 'start') and l.created_at > now() - interval '1 hour'
  ) >= 300 then
    return;
  end if;
  -- Con kind nella condizione il conto usa l'indice (survey_id, kind, created_at).
  if (select count(*) from (
        select 1 from public.survey_events e
        where e.survey_id = s.id and e.kind in ('view', 'start') and e.created_at > now() - interval '1 minute' limit 6000
      ) x) >= 6000 then
    return;
  end if;
  -- Tetto di 200000 eventi per questionario, letto da un contatore senza aspettare: si conta tutto solo la prima volta.
  select c.events into v_events from public.survey_event_counts c where c.survey_id = s.id;
  if v_events is null then
    insert into public.survey_event_counts (survey_id, events)
    select s.id, count(*) from public.survey_events e where e.survey_id = s.id
    on conflict (survey_id) do nothing;
  elsif v_events >= 200000 then
    return;
  end if;
  -- Il contatore si aggiorna di 20 su una visita ogni 20 circa: in una raffica le visite non fanno la fila sulla stessa riga
  -- e il tetto resta giusto a meno dell'1%.
  if random() < 0.05 then
    update public.survey_event_counts set events = events + 20 where survey_id = s.id;
  end if;
  insert into public.survey_events (survey_id, kind) values (s.id, p_kind);
  insert into public.survey_limits (survey_id, client, kind) values (s.id, v_client, p_kind);
end
$$;

-- Imbuto per il progetto: visite, inizi, compilazioni interrotte (partial) e complete. Solo numeri; null se il questionario
-- non è visibile a chi chiede.
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
  where s.id = p_survey and s.kind = 'survey' and s.deleted_at is null and public.can_read(s.project_id)
$$;

-- Cancella per sempre alcune risposte (p_ids) o tutte; con tutte si azzerano anche visite, inizi e limiti del questionario.
-- Solo admin e membri del progetto del questionario; un questionario che non c'è o è nel cestino non ha nulla da cancellare.
create or replace function public.delete_survey_responses(p_survey uuid, p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_project uuid;
begin
  select s.project_id into v_project from public.items s where s.id = p_survey and s.kind = 'survey';
  if v_project is null then
    return 0;
  end if;
  if not public.can_write(v_project) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.items s
    join public.items idea on idea.id = s.idea_id and idea.deleted_at is null
    where s.id = p_survey and s.kind = 'survey' and s.deleted_at is null
  ) then
    return 0;
  end if;
  -- La stessa fila delle compilazioni nuove: il contatore non si rifà mentre si cancella.
  perform pg_advisory_xact_lock(hashtextextended('survey:' || p_survey::text, 0));
  delete from public.survey_responses r where r.survey_id = p_survey and (p_ids is null or r.id = any (p_ids));
  get diagnostics v_count = row_count;
  -- Il contatore delle risposte si rifà con un conteggio alla prossima compilazione nuova.
  delete from public.survey_counts where survey_id = p_survey;
  if p_ids is null then
    -- Prima il contatore a zero, poi gli eventi: una visita in arrivo aspetta questa riga invece di contare eventi che stanno sparendo.
    insert into public.survey_event_counts (survey_id, events) values (p_survey, 0)
    on conflict (survey_id) do update set events = 0;
    delete from public.survey_events where survey_id = p_survey;
    -- Le righe che sta già togliendo una pulizia si saltano: altrimenti le due attese si bloccherebbero a vicenda.
    delete from public.survey_limits where id in (
      select l.id from public.survey_limits l where l.survey_id = p_survey for update skip locked
    );
  end if;
  return v_count;
end
$$;

-- =========================================================================
-- Permessi
-- =========================================================================

revoke all on public.projects, public.platform_admins, public.profiles, public.members, public.items, public.revisions, public.comments, public.ai_usage, public.audit_log, public.chats, public.chat_messages, public.chat_reads, public.mentions, public.email_prefs, public.email_weekly, public.member_activity, public.survey_responses, public.survey_events, public.survey_limits, public.survey_salts, public.survey_counts, public.survey_event_counts from anon;
revoke all on public.projects, public.platform_admins, public.profiles, public.members, public.items, public.revisions, public.comments, public.ai_usage, public.audit_log, public.chats, public.chat_messages, public.chat_reads, public.mentions, public.email_prefs, public.email_weekly, public.survey_responses, public.survey_events, public.survey_limits, public.survey_salts, public.survey_counts, public.survey_event_counts from authenticated;
revoke all on all sequences in schema public from anon;
-- Il sale e le impronte dei limiti non li legge neanche la chiave di servizio: con il sale l'impronta di un indirizzo si ricostruisce.
revoke all on public.survey_limits, public.survey_salts, public.survey_counts, public.survey_event_counts from service_role;
-- Progetti e amministratori della piattaforma si scrivono solo con le funzioni; nessuno entra in un progetto scrivendo members.
grant select on public.projects to authenticated;
grant select on public.platform_admins to authenticated;
grant select, update on public.profiles to authenticated;
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
revoke execute on function public.members_before_delete() from public, anon, authenticated;
revoke execute on function public.members_one_project_per_statement() from public, anon, authenticated;
revoke execute on function public.members_audit() from public, anon, authenticated;
revoke execute on function public.profiles_before_update() from public, anon, authenticated;
revoke execute on function public.projects_after_insert() from public, anon, authenticated;
revoke execute on function public.chats_before_write() from public, anon, authenticated;
revoke execute on function public.chat_messages_before_write() from public, anon, authenticated;
revoke execute on function public.chat_messages_mentions() from public, anon, authenticated;
revoke execute on function public.comments_mentions() from public, anon, authenticated;
revoke execute on function public.notes_mentions() from public, anon, authenticated;
revoke execute on function public.survey_rows_before_write() from public, anon, authenticated;
revoke execute on function public.record_mentions(uuid, text, uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mentioned_users(uuid, text, uuid) from public, anon, authenticated;

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
revoke execute on function public.notify_claim_weekly(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.notify_release_weekly(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.notify_weekly_data(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.notify_call(text) from public, anon, authenticated, service_role;
grant execute on function public.notify_recipients() to service_role;
grant execute on function public.notify_pending_mentions(timestamptz) to service_role;
grant execute on function public.notify_claim_mentions(bigint[]) to service_role;
grant execute on function public.notify_release_mentions(bigint[]) to service_role;
grant execute on function public.notify_claim_weekly(uuid, uuid, date) to service_role;
grant execute on function public.notify_release_weekly(uuid, uuid, date) to service_role;
grant execute on function public.notify_weekly_data(uuid, timestamptz) to service_role;

revoke execute on function public.has_mfa() from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.my_role(uuid) from public, anon;
revoke execute on function public.can_read(uuid) from public, anon;
revoke execute on function public.can_write(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.can_manage(uuid) from public, anon;
revoke execute on function public.shares_project(uuid) from public, anon;
revoke execute on function public.has_any_project() from public, anon;
revoke execute on function public.storage_project(text) from public, anon;
revoke execute on function public.my_projects() from public, anon;
revoke execute on function public.all_projects() from public, anon;
revoke execute on function public.create_project(text) from public, anon;
revoke execute on function public.rename_project(uuid, text) from public, anon;
revoke execute on function public.archive_project(uuid) from public, anon;
revoke execute on function public.unarchive_project(uuid) from public, anon;
revoke execute on function public.add_platform_admin(text) from public, anon;
revoke execute on function public.remove_platform_admin(uuid) from public, anon;
revoke execute on function public.add_member(uuid, text, text, text) from public, anon;
revoke execute on function public.members_overview(uuid) from public, anon;
revoke execute on function public.touch_activity() from public, anon;
revoke execute on function public.create_item(uuid, text, text, text, jsonb, uuid, text) from public, anon;
revoke execute on function public.item_write_result(uuid, integer) from public, anon;
revoke execute on function public.save_item(uuid, integer, text, text, jsonb, uuid, text) from public, anon;
revoke execute on function public.delete_item(uuid, integer, text) from public, anon;
revoke execute on function public.restore_item(uuid, text) from public, anon;
revoke execute on function public.revert_item(uuid, integer, integer, text) from public, anon;
revoke execute on function public.note_image_orphans(uuid, text[]) from public, anon;
revoke execute on function public.survey_image_orphans(uuid, text[]) from public, anon;
revoke execute on function public.chat_overview(uuid) from public, anon;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
revoke execute on function public.mark_mentions_read(uuid, bigint[]) from public, anon;
revoke execute on function public.set_email_prefs(boolean, boolean) from public, anon;
revoke execute on function public.survey_funnel(uuid) from public, anon;
revoke execute on function public.availability_busy_ok(jsonb) from public, anon;
revoke execute on function public.delete_survey_responses(uuid, uuid[]) from public, anon;

-- Le regole di accesso chiamano queste funzioni con i permessi di chi legge: servono ad authenticated.
grant execute on function public.has_mfa() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.my_role(uuid) to authenticated;
grant execute on function public.can_read(uuid) to authenticated;
grant execute on function public.can_write(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_manage(uuid) to authenticated;
grant execute on function public.shares_project(uuid) to authenticated;
grant execute on function public.has_any_project() to authenticated;
grant execute on function public.storage_project(text) to authenticated;
-- Serve a items_before_write, che gira con i permessi di chi scrive.
grant execute on function public.availability_busy_ok(jsonb) to authenticated;
grant execute on function public.my_projects() to authenticated;
grant execute on function public.all_projects() to authenticated;
grant execute on function public.create_project(text) to authenticated;
grant execute on function public.rename_project(uuid, text) to authenticated;
grant execute on function public.archive_project(uuid) to authenticated;
grant execute on function public.unarchive_project(uuid) to authenticated;
grant execute on function public.add_platform_admin(text) to authenticated;
grant execute on function public.remove_platform_admin(uuid) to authenticated;
grant execute on function public.add_member(uuid, text, text, text) to authenticated;
grant execute on function public.members_overview(uuid) to authenticated;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.create_item(uuid, text, text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.item_write_result(uuid, integer) to authenticated;
grant execute on function public.save_item(uuid, integer, text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.delete_item(uuid, integer, text) to authenticated;
grant execute on function public.restore_item(uuid, text) to authenticated;
grant execute on function public.revert_item(uuid, integer, integer, text) to authenticated;
grant execute on function public.note_image_orphans(uuid, text[]) to authenticated;
grant execute on function public.survey_image_orphans(uuid, text[]) to authenticated;
grant execute on function public.chat_overview(uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;
grant execute on function public.mark_mentions_read(uuid, bigint[]) to authenticated;
grant execute on function public.set_email_prefs(boolean, boolean) to authenticated;
grant execute on function public.survey_funnel(uuid) to authenticated;
grant execute on function public.delete_survey_responses(uuid, uuid[]) to authenticated;

-- =========================================================================
-- Realtime: aggiornamenti dal vivo e presenza
-- =========================================================================

-- Gli aggiornamenti dal vivo passano dalle regole di accesso: ognuno riceve solo quelli dei suoi progetti.
-- Le cancellazioni no: Realtime le manda a chiunque segua la tabella, con la chiave della riga. Per questo members
-- (chiave progetto e persona: chi è uscito da quale progetto) e profiles non si pubblicano, e chi li aveva li toglie.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['items', 'revisions', 'comments', 'projects', 'chats', 'chat_messages', 'mentions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
    foreach t in array array['members', 'profiles'] loop
      if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
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
    raise exception 'rls_disabled' using errcode = 'P0001', detail = 'public.' || t;
  end loop;
end
$$;

-- Presenza online: un canale privato board:<id del progetto> per progetto, aperto a chi legge quel progetto.
-- Il vecchio canale "board" e ogni altro nome sono chiusi; il case evita che un id malformato fallisca la conversione.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists board_presence_select on realtime.messages';
    execute $p$
      create policy board_presence_select on realtime.messages
        for select to authenticated
        using ((select public.can_read(case
          when realtime.topic() ~ '^board:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substr(realtime.topic(), 7)::uuid
        end)))
    $p$;
    execute 'drop policy if exists board_presence_insert on realtime.messages';
    execute $p$
      create policy board_presence_insert on realtime.messages
        for insert to authenticated
        with check ((select public.can_read(case
          when realtime.topic() ~ '^board:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substr(realtime.topic(), 7)::uuid
        end)))
    $p$;
  end if;
end
$$;

-- =========================================================================
-- Funzioni a squadra unica: tolte
-- =========================================================================

-- Non sapevano nulla dei progetti e create or replace non le toglie. Si tolgono qui, dopo le regole di accesso che le usavano.
drop function if exists public.my_role();
drop function if exists public.can_read();
drop function if exists public.can_write();
drop function if exists public.is_admin();
drop function if exists public.add_member(text, text, text);
drop function if exists public.members_overview();
drop function if exists public.chat_overview();
drop function if exists public.create_item(text, text, text, jsonb, uuid, text);
drop function if exists public.note_image_orphans(text[]);
drop function if exists public.survey_image_orphans(text[]);
drop function if exists public.record_mentions(text, uuid, text, uuid, uuid, uuid);
drop function if exists public.mentioned_users(text, uuid);
drop function if exists public.notify_claim_weekly(uuid, date);
drop function if exists public.notify_release_weekly(uuid, date);
drop function if exists public.notify_weekly_data(timestamptz);
drop function if exists public.mark_mentions_read(bigint[]);

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
