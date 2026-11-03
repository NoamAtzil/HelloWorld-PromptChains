-- Verification for 001_prompt_chain_runs.sql (signatures as of the secret-gated version).
--
-- Run in the Supabase SQL editor AFTER the migration AND after the
-- chain_run_secret row was inserted. Needs at least one superadmin and one
-- non-admin profile. Prints PASS notices, or stops at the first FAIL.
--
-- Read-only by design. Every call below either is rejected before it writes
-- anything, targets a non-existent id (-1), or matches zero rows. The secret
-- is read only to prove the right one is accepted; it is never printed, and
-- failure messages never include SQL text (which could contain it).
--
-- Each check states the EXPECTED SQLSTATE, so a test cannot pass for the wrong
-- reason:
--   42501  insufficient_privilege  (not a superadmin / wrong or missing secret / no EXECUTE)
--   P0002  no_data_found           (authorised and secret accepted, but the id does not exist)
--   ok     the statement ran without error

do $$
declare
  reg uuid := (select id from public.profiles where not is_superadmin limit 1);
  adm uuid := (select id from public.profiles where is_superadmin limit 1);
  v_secret text := (select value from private.app_settings where key = 'chain_run_secret');
  wrong constant text := 'wrong-secret-wrong-secret-wrong-0000';
  f text;
  stmts text[];
  expect text[];
  labels text[];
  got text;
  i int;
  img constant text := '00000000-0000-0000-0000-000000000000.png';
begin
  if reg is null or adm is null then
    raise exception 'Need at least one superadmin and one non-admin profile to run this test';
  end if;

  ------------------------------------------------------------ A. installation
  foreach f in array array[
    'public.reorder_prompt_chain_steps(bigint, bigint[])',
    'public.add_prompt_chain_step(bigint, text)',
    'public.delete_prompt_chain_step(bigint)',
    'public.start_chain_run(bigint, text, text, text, text, text, text)',
    'public.claim_chain_step(bigint)',
    'public.record_chain_step(bigint, integer, uuid, text, text, integer, text)',
    'public.fail_chain_run(bigint, text, uuid, text)',
    'public.delete_prompt_chain(bigint, text)',
    'public.delete_chain_run(bigint)'
  ] loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL A1: missing function %', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'FAIL A2: anon may execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'FAIL A3: signed-in users cannot execute %', f;
    end if;
  end loop;
  raise notice 'PASS A: all 9 functions exist with the current signatures; anon cannot execute, signed-in users can';

  foreach f in array array[
    'public.start_chain_run(bigint, text, text, text, text, text)',
    'public.record_chain_step(bigint, integer, text, integer, text)',
    'public.fail_chain_run(bigint, text)'
  ] loop
    if to_regprocedure(f) is not null then
      raise exception 'FAIL A4: an outdated, secret-less overload still exists: %', f;
    end if;
  end loop;
  raise notice 'PASS A4: no outdated secret-less overloads are left behind';

  if v_secret is null or char_length(v_secret) < 24 then
    raise exception 'FAIL A5: private.app_settings chain_run_secret is missing or shorter than 24 characters';
  end if;
  raise notice 'PASS A5: chain_run_secret is set (% characters; value not shown)', char_length(v_secret);

  if (select public from storage.buckets where id = 'chain-media') is distinct from false then
    raise exception 'FAIL A6: chain-media bucket is missing or public';
  end if;
  raise notice 'PASS A6: chain-media bucket exists and is private';

  -- Statements shared by the "not allowed" groups. %1$L is the secret to try.
  labels := array[
    'start_chain_run', 'claim_chain_step', 'record_chain_step', 'fail_chain_run',
    'reorder_prompt_chain_steps', 'add_prompt_chain_step', 'delete_prompt_chain_step',
    'delete_prompt_chain', 'delete_chain_run',
    'direct insert into runs', 'direct update of runs', 'direct delete from runs'
  ];

  ----------------------------------------------- B. regular (non-admin) user
  perform set_config('request.jwt.claims', json_build_object('sub', reg, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- Even WITH the correct secret a non-admin must be refused: this proves the
  -- superadmin check is what stops them, not the secret.
  stmts := array[
    format('select public.start_chain_run(-1::bigint, null::text, %L, null::text, ''upload'', ''m'', %L)', img, v_secret),
    'select public.claim_chain_step(-1::bigint)',
    format('select public.record_chain_step(-1::bigint, 0, null::uuid, %L, ''x'', 1, ''STOP'')', v_secret),
    format('select public.fail_chain_run(-1::bigint, ''e'', null::uuid, %L)', v_secret),
    'select public.reorder_prompt_chain_steps(-1::bigint, array[]::bigint[])',
    'select public.add_prompt_chain_step(-1::bigint, ''x'')',
    'select public.delete_prompt_chain_step(-1::bigint)',
    'select public.delete_prompt_chain(-1::bigint, ''x'')',
    'select public.delete_chain_run(-1::bigint)',
    format('insert into public.prompt_chain_runs (chain_name, steps, image_path, image_source, model) select ''x'', ''[{"position":1,"instruction":"a"}]''::jsonb, %L, ''upload'', ''m'' where false', img),
    'update public.prompt_chain_runs set final_output = ''forged'' where false',
    'delete from public.prompt_chain_runs where false'
  ];
  for i in 1 .. array_length(stmts, 1) loop
    begin
      execute stmts[i];
      got := 'ok';
    exception when others then
      got := sqlstate;
    end;
    if got <> '42501' then
      raise exception 'FAIL B%: % as a regular user (expected 42501, got %)', i, labels[i], got;
    end if;
  end loop;
  if (select count(*) from public.prompt_chain_runs) <> 0 then
    raise exception 'FAIL B13: a regular user can read prompt_chain_runs';
  end if;
  raise notice 'PASS B: a regular user is refused by every function (even holding the secret) and cannot read or write runs';

  ------------------------------------------------------ C. superadmin session
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- Wrong or missing secret: refused BEFORE the id is even looked up (42501,
  -- not P0002), so a superadmin cannot write run content through the API.
  stmts := array[
    format('select public.start_chain_run(-1::bigint, null::text, %L, null::text, ''upload'', ''m'', %L)', img, wrong),
    format('select public.start_chain_run(-1::bigint, null::text, %L, null::text, ''upload'', ''m'', null::text)', img),
    format('select public.record_chain_step(-1::bigint, 0, null::uuid, %L, ''forged'', 1, ''STOP'')', wrong),
    'select public.record_chain_step(-1::bigint, 0, null::uuid, null::text, ''forged'', 1, ''STOP'')',
    format('select public.fail_chain_run(-1::bigint, ''e'', null::uuid, %L)', wrong),
    'select public.fail_chain_run(-1::bigint, ''e'', null::uuid, null::text)',
    -- no direct writes, even for a superadmin
    format('insert into public.prompt_chain_runs (chain_name, steps, image_path, image_source, model) select ''x'', ''[{"position":1,"instruction":"a"}]''::jsonb, %L, ''upload'', ''m'' where false', img),
    'update public.prompt_chain_runs set final_output = ''forged'' where false',
    'delete from public.prompt_chain_runs where false',
    'select * from private.app_settings'
  ];
  labels := array[
    'start_chain_run with a wrong secret', 'start_chain_run with no secret',
    'record_chain_step with a wrong secret', 'record_chain_step with no secret',
    'fail_chain_run with a wrong secret', 'fail_chain_run with no secret',
    'direct insert into runs', 'direct update of runs', 'direct delete from runs',
    'reading private.app_settings'
  ];
  for i in 1 .. array_length(stmts, 1) loop
    begin
      execute stmts[i];
      got := 'ok';
    exception when others then
      got := sqlstate;
    end;
    if got <> '42501' then
      raise exception 'FAIL C%: % as a superadmin (expected 42501, got %)', i, labels[i], got;
    end if;
  end loop;
  raise notice 'PASS C1: a superadmin session cannot start, record or fail a run without the server secret, cannot write runs directly, cannot read the secret';

  -- With the right secret the same calls get through the gate and only then
  -- stop because the id does not exist (P0002) or match zero rows (ok).
  stmts := array[
    format('select public.start_chain_run(-1::bigint, null::text, %L, null::text, ''upload'', ''m'', %L)', img, v_secret),
    'select public.claim_chain_step(-1::bigint)',
    format('select public.record_chain_step(-1::bigint, 0, null::uuid, %L, ''x'', 1, ''STOP'')', v_secret),
    format('select public.fail_chain_run(-1::bigint, ''e'', null::uuid, %L)', v_secret),
    'select public.delete_chain_run(-1::bigint)',
    'select public.delete_prompt_chain(-1::bigint, ''x'')',
    'select count(*) from public.prompt_chain_runs'
  ];
  expect := array['P0002', 'P0002', 'P0002', 'ok', 'P0002', 'P0002', 'ok'];
  labels := array['start_chain_run', 'claim_chain_step', 'record_chain_step', 'fail_chain_run', 'delete_chain_run', 'delete_prompt_chain', 'reading runs'];
  for i in 1 .. array_length(stmts, 1) loop
    begin
      execute stmts[i];
      got := 'ok';
    exception when others then
      got := sqlstate;
    end;
    if got <> expect[i] then
      raise exception 'FAIL C2.%: % with the right secret (expected %, got %)', i, labels[i], expect[i], got;
    end if;
  end loop;
  raise notice 'PASS C2: the right secret is accepted (calls then stop at the non-existent id, as intended)';

  ------------------------------------------------------------- D. anonymous
  perform set_config('role', 'none', true);
  perform set_config('role', 'anon', true);
  stmts := array[
    'select public.claim_chain_step(-1::bigint)',
    format('select public.start_chain_run(-1::bigint, null::text, %L, null::text, ''upload'', ''m'', %L)', img, v_secret),
    format('select public.record_chain_step(-1::bigint, 0, null::uuid, %L, ''x'', 1, ''STOP'')', v_secret),
    'select public.delete_chain_run(-1::bigint)',
    'select count(*) from public.prompt_chain_runs'
  ];
  labels := array['claim_chain_step', 'start_chain_run', 'record_chain_step', 'delete_chain_run', 'reading runs'];
  for i in 1 .. array_length(stmts, 1) loop
    begin
      execute stmts[i];
      got := 'ok';
    exception when others then
      got := sqlstate;
    end;
    if got <> '42501' then
      raise exception 'FAIL D%: % as anon (expected 42501, got %)', i, labels[i], got;
    end if;
  end loop;
  raise notice 'PASS D: anonymous callers cannot execute any run function or read runs';

  perform set_config('role', 'none', true);
end $$;
