-- Ambiente minimo che imita Supabase (ruoli, auth, realtime) per i test del database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), status text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), updated_at timestamptz, refreshed_at timestamp);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

create schema realtime;
grant usage on schema realtime to authenticated;
create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select 'board' $$;

create publication supabase_realtime;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.it'),
  ('00000000-0000-0000-0000-00000000000b', 'membro@test.it'),
  ('00000000-0000-0000-0000-00000000000c', 'advisor@test.it'),
  ('00000000-0000-0000-0000-00000000000d', 'estraneo@test.it');
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-00000000000a', 'verified');
