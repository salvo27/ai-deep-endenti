-- Helpers for the pgTAP files in supabase/tests/database, loaded by tests/db/run.mjs after the schema.
-- Test users are single letters: tests.uid('a') = 00000000-0000-0000-0000-00000000000a.

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.uid(p_user text)
returns uuid
language sql
immutable
as $$ select ('00000000-0000-0000-0000-00000000000' || p_user)::uuid $$;

-- A user that exists in Authentication, with or without a verified authenticator app.
create function tests.create_user(p_user text, p_mfa boolean default true)
returns uuid
language plpgsql
as $$
begin
  insert into auth.users (id, email) values (tests.uid(p_user), p_user || '@test.example') on conflict (id) do nothing;
  if p_mfa and not exists (select 1 from auth.mfa_factors f where f.user_id = tests.uid(p_user) and f.status = 'verified') then
    insert into auth.mfa_factors (user_id, status) values (tests.uid(p_user), 'verified');
  end if;
  return tests.uid(p_user);
end
$$;

-- Acts as that user for the following statements: the token of the API (aal2 = second factor done) and the authenticated role.
create function tests.login(p_user text, p_aal text default 'aal2')
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', json_build_object('sub', tests.uid(p_user), 'aal', p_aal, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end
$$;

-- Acts as someone without an account, as the public survey page does.
create function tests.anon()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'anon', false);
end
$$;

-- Back to the owner of the database, as the SQL Editor of Supabase.
create function tests.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', '', false);
end
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
