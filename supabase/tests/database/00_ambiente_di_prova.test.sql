begin;
select plan(9);

-- The helpers the other files use to act as somebody.
select is(tests.uid('a'), '00000000-0000-0000-0000-00000000000a'::uuid, 'a test user is a letter at the end of a fixed uuid');
select tests.create_user('e', false);
select is((select count(*)::int from auth.mfa_factors where user_id = tests.uid('e')), 0, 'a user can be created without a second factor');
select tests.create_user('e');
select tests.create_user('e');
select is((select count(*)::int from auth.mfa_factors where user_id = tests.uid('e') and status = 'verified'), 1, 'and given one, once');

select tests.login('a');
select is(auth.uid(), tests.uid('a'), 'after login auth.uid() is that user');
select is(current_user::text, 'authenticated', 'with the role of the API');
select is(auth.jwt() ->> 'aal', 'aal2', 'and the second factor done');
select tests.login('b', 'aal1');
select is(auth.jwt() ->> 'aal', 'aal1', 'a login can stop at the password');
select tests.anon();
select ok(current_user::text = 'anon' and auth.uid() is null, 'anon has no user');
select tests.logout();
select is(current_user::text, 'postgres', 'logout goes back to the owner, as the SQL Editor');

select * from finish();
rollback;
