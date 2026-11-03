-- Homework 8: HelloWorld-PromptChains (third app, same Supabase project).
--
-- DO NOT RUN until reviewed. Run ONCE in the Supabase SQL editor of the shared
-- project. Requires the admin app's 001 (public.is_superadmin()) and 003
-- (prompt_chains, prompt_chain_steps, prompt_chain_mix, touch_updated_at()).
-- Additive and safe to re-run. No row is changed or deleted. The public app
-- and the admin dashboard keep working unchanged.
--
-- What it adds
--   * prompt_chain_steps: the (chain_id, position) unique constraint becomes
--     DEFERRABLE so a reorder can swap positions inside one statement.
--   * reorder_prompt_chain_steps / add_prompt_chain_step /
--     delete_prompt_chain_step: atomic step operations (positions stay 1..n).
--   * prompt_chain_runs: one row per execution, with a frozen snapshot of the
--     chain name, voice and steps, every intermediate output, and the final
--     output. This is the run history AND the per-chain media gallery.
--   * Private storage bucket "chain-media": the input image of each run.
--   * start_chain_run / claim_chain_step / record_chain_step / fail_chain_run:
--     the only way runs are created and advanced. They enforce sequential
--     execution and the AI usage limits.
--   * delete_prompt_chain / delete_chain_run: the explicit deletion policy.
--
-- BEFORE FIRST USE you must set the run-signing secret (see "Run integrity"):
--   insert into private.app_settings (key, value)
--   values ('chain_run_secret', '<your own random string, 24+ characters>')
--   on conflict (key) do update set value = excluded.value;
-- and put the SAME value in the app's CHAIN_RUN_SECRET environment variable.
-- Until it is set, runs cannot start (the functions fail closed).
--
-- Security model
--   * RLS is on for the new table. Only superadmins (public.is_superadmin())
--     can read it. Nobody can write to it directly: no INSERT/UPDATE/DELETE is
--     granted, so every change goes through the SECURITY DEFINER functions,
--     each of which re-checks is_superadmin() first.
--   * EXECUTE is revoked from PUBLIC and anon on every function.
--   * No service-role key is used anywhere.
--
-- Run integrity (history cannot be falsified through the API)
--   Superadmins can call these functions directly with their own session, so
--   "only superadmins" is not enough to trust a recorded output. The three
--   functions that WRITE run content (start_chain_run, record_chain_step,
--   fail_chain_run) therefore also require a server secret that only the
--   Next.js server and the database know (private.app_settings.chain_run_secret,
--   same pattern as the public app's quota secret). The browser never sees it,
--   so a direct API call cannot invent a model output or a run. The secret is
--   compared inside the database; no service-role key is involved.
--   Every step is also bound to a one-time claim token (see claim_chain_step).
--   Limits: someone who can read the database secret or run SQL as the
--   database owner can still write anything; that is outside this model.
--
-- Deletion policy (the heart of "preserve run history")
--   * Deleting a chain NEVER deletes its runs or their images. The run keeps
--     its own copy of the chain name, voice and steps, and chain_id is set to
--     NULL (ON DELETE SET NULL). History then shows "deleted chain".
--     This also holds if a chain is deleted from the admin dashboard.
--   * The app deletes a chain only through delete_prompt_chain(), which
--     requires the exact chain name to be typed as confirmation.
--   * A run (and its image) is removed only by an explicit, separate
--     delete_chain_run() call.
--
-- AI usage limits (per superadmin, enforced in start_chain_run)
--   * at most 12 runs started per hour and 60 per day
--   * at most 2 runs in progress at once (abandoned runs expire after 10 min)
--   * a chain must have 1 to 10 steps to be run
--   * at most one step in flight per run (90 s step lock)
--   Together: at most 120 Gemini calls per hour.

-- ---------------------------------------------------------------------------
-- 1. Step ordering support
-- ---------------------------------------------------------------------------

-- Make UNIQUE (chain_id, position) DEFERRABLE so positions can be permuted
-- inside one transaction. Idempotent and upgrades in place:
--   * our named constraint exists and is deferrable   -> nothing to do
--   * any other state (the original non-deferrable constraint from the admin
--     migration, or our name but NOT deferrable)      -> drop every unique
--     constraint on exactly (chain_id, position) and add ours.
-- The table is locked for the swap, so no step can be written in between.
do $$
declare
  c record;
  v_ok boolean;
begin
  select exists (
    select 1 from pg_constraint
     where conrelid = 'public.prompt_chain_steps'::regclass
       and conname = 'prompt_chain_steps_chain_position_key'
       and contype = 'u'
       and condeferrable
  ) into v_ok;

  if not v_ok then
    lock table public.prompt_chain_steps in access exclusive mode;
    for c in
      select conname from pg_constraint
       where conrelid = 'public.prompt_chain_steps'::regclass
         and contype = 'u'
         and (
           select array_agg(a.attname::text order by a.attname::text)
             from pg_attribute a
            where a.attrelid = conrelid and a.attnum = any (conkey)
         ) = array['chain_id', 'position']
    loop
      execute format('alter table public.prompt_chain_steps drop constraint %I', c.conname);
    end loop;
    alter table public.prompt_chain_steps
      add constraint prompt_chain_steps_chain_position_key
      unique (chain_id, position) deferrable initially immediate;
  end if;
end $$;

create or replace function public.reorder_prompt_chain_steps(p_chain_id bigint, p_step_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.prompt_chains where id = p_chain_id for update;
  select count(*) into v_count from public.prompt_chain_steps where chain_id = p_chain_id;
  if v_count = 0 or coalesce(cardinality(p_step_ids), 0) <> v_count
     or (select count(distinct x) from unnest(p_step_ids) x) <> v_count
     or exists (
       select 1 from unnest(p_step_ids) x
        where not exists (select 1 from public.prompt_chain_steps s where s.id = x and s.chain_id = p_chain_id)
     ) then
    raise exception 'The step list does not match this chain. Reload and try again.' using errcode = '22023';
  end if;

  set constraints public.prompt_chain_steps_chain_position_key deferred;
  update public.prompt_chain_steps s
     set position = o.ord::integer
    from unnest(p_step_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.chain_id = p_chain_id;
end;
$$;

create or replace function public.add_prompt_chain_step(p_chain_id bigint, p_instruction text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
  v_id bigint;
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.prompt_chains where id = p_chain_id for update;
  if not found then
    raise exception 'That chain no longer exists.' using errcode = 'P0002';
  end if;
  select coalesce(max(position), 0) + 1 into v_next from public.prompt_chain_steps where chain_id = p_chain_id;
  if v_next > 50 then
    raise exception 'A chain can have at most 50 steps.' using errcode = '22023';
  end if;
  insert into public.prompt_chain_steps (chain_id, position, instruction)
  values (p_chain_id, v_next, p_instruction)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_prompt_chain_step(p_step_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chain bigint;
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select chain_id into v_chain from public.prompt_chain_steps where id = p_step_id;
  if v_chain is null then
    raise exception 'That step no longer exists.' using errcode = 'P0002';
  end if;
  perform 1 from public.prompt_chains where id = v_chain for update;
  delete from public.prompt_chain_steps where id = p_step_id;
  -- Close the gap so positions stay 1..n.
  set constraints public.prompt_chain_steps_chain_position_key deferred;
  update public.prompt_chain_steps s
     set position = r.rn::integer
    from (
      select id, row_number() over (order by position) as rn
        from public.prompt_chain_steps where chain_id = v_chain
    ) r
   where s.id = r.id and s.position <> r.rn;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1b. The run-signing secret (never exposed by the API)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_settings (
  key text primary key,
  value text not null
);
alter table private.app_settings enable row level security;

-- Raises unless the caller supplied the configured secret. Fails closed when
-- the secret is missing or short. Callable only from our SECURITY DEFINER
-- functions (EXECUTE is revoked from every API role).
create or replace function private.assert_run_secret(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select s.value into v_secret from private.app_settings s where s.key = 'chain_run_secret';
  if v_secret is null or char_length(v_secret) < 24 then
    raise exception 'Run signing is not set up: set private.app_settings chain_run_secret (see the migration header).'
      using errcode = '22023';
  end if;
  if p_secret is distinct from v_secret then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.assert_run_secret(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Runs (history + media gallery) and the private image bucket
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_chain_runs (
  id bigint generated always as identity primary key,
  -- NULL after the chain is deleted; the snapshot below keeps the history.
  chain_id bigint references public.prompt_chains (id) on delete set null,
  chain_name text not null check (char_length(chain_name) between 1 and 80),
  voice_id text check (voice_id is null or voice_id ~ '^[a-z][a-z-]{0,23}$'),
  -- [{"position": 1, "instruction": "..."}], frozen when the run starts.
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 10),
  input_text text check (input_text is null or char_length(input_text) <= 2000),
  -- File in the private "chain-media" bucket: "<uuid>.<ext>".
  image_path text not null unique check (image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  image_title text check (image_title is null or char_length(image_title) <= 120),
  image_source text not null check (image_source in ('upload', 'library')),
  model text not null check (char_length(model) between 1 and 100),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  steps_done integer not null default 0 check (steps_done >= 0),
  -- [{"position","instruction","output","latency_ms","finish_reason"}]
  step_outputs jsonb not null default '[]'::jsonb check (jsonb_typeof(step_outputs) = 'array'),
  final_output text check (final_output is null or char_length(final_output) <= 4000),
  error_code text check (error_code is null or char_length(error_code) <= 60),
  claimed_at timestamptz,
  -- One-time token of the execution that currently holds the step.
  claim_token uuid,
  last_activity_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists prompt_chain_runs_chain_idx on public.prompt_chain_runs (chain_id, created_at desc);
create index if not exists prompt_chain_runs_created_idx on public.prompt_chain_runs (created_at desc);
create index if not exists prompt_chain_runs_user_idx on public.prompt_chain_runs (created_by, created_at desc);

alter table public.prompt_chain_runs enable row level security;
revoke all on public.prompt_chain_runs from public, anon, authenticated;
grant select on public.prompt_chain_runs to authenticated;

drop policy if exists "Superadmins read prompt chain runs" on public.prompt_chain_runs;
create policy "Superadmins read prompt chain runs" on public.prompt_chain_runs
  for select to authenticated using ((select public.is_superadmin()));

-- Private bucket: images are shown through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chain-media', 'chain-media', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Superadmins view chain media" on storage.objects;
create policy "Superadmins view chain media" on storage.objects
  for select to authenticated using (bucket_id = 'chain-media' and public.is_superadmin());
drop policy if exists "Superadmins upload chain media" on storage.objects;
create policy "Superadmins upload chain media" on storage.objects
  for insert to authenticated with check (bucket_id = 'chain-media' and public.is_superadmin());
drop policy if exists "Superadmins delete chain media" on storage.objects;
create policy "Superadmins delete chain media" on storage.objects
  for delete to authenticated using (bucket_id = 'chain-media' and public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 3. Running a chain: start, claim a step, record it, fail
-- ---------------------------------------------------------------------------

create or replace function public.start_chain_run(
  p_chain_id bigint,
  p_input_text text,
  p_image_path text,
  p_image_title text,
  p_image_source text,
  p_model text,
  p_secret text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_chain public.prompt_chains%rowtype;
  v_steps jsonb;
  v_id bigint;
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.assert_run_secret(p_secret);

  select * into v_chain from public.prompt_chains where id = p_chain_id;
  if not found then
    raise exception 'That chain no longer exists.' using errcode = 'P0002';
  end if;
  if not v_chain.is_active then
    raise exception 'This chain is inactive. Activate it before running.' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('position', s.position, 'instruction', s.instruction) order by s.position)
    into v_steps
    from public.prompt_chain_steps s where s.chain_id = p_chain_id;
  if v_steps is null then
    raise exception 'Add at least one step before running this chain.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_steps) > 10 then
    raise exception 'Only chains with up to 10 steps can be run.' using errcode = '22023';
  end if;

  -- The photo must be a real, not-yet-used file in the private bucket.
  if not exists (select 1 from storage.objects o where o.bucket_id = 'chain-media' and o.name = p_image_path) then
    raise exception 'The photo was not uploaded.' using errcode = '22023';
  end if;
  if exists (select 1 from public.prompt_chain_runs r where r.image_path = p_image_path) then
    raise exception 'That photo already belongs to another run.' using errcode = '22023';
  end if;

  -- Usage limits. Serialize concurrent starts per user so parallel requests
  -- cannot all pass the counts. Abandoned runs (browser closed mid-run) stop
  -- counting as in progress after 10 minutes without activity.
  perform pg_advisory_xact_lock(hashtext('start_chain_run:' || v_uid::text));
  update public.prompt_chain_runs
     set status = 'failed', error_code = 'abandoned', completed_at = now(), claimed_at = null, claim_token = null
   where created_by = v_uid and status = 'running'
     and last_activity_at < now() - interval '10 minutes';

  if (select count(*) from public.prompt_chain_runs where created_by = v_uid and status = 'running') >= 2 then
    raise exception 'Two runs are already in progress. Wait for one to finish.' using errcode = '54000';
  end if;
  if (select count(*) from public.prompt_chain_runs where created_by = v_uid and created_at > now() - interval '1 hour') >= 12 then
    raise exception 'Hourly limit reached (12 runs). Try again later.' using errcode = '54000';
  end if;
  if (select count(*) from public.prompt_chain_runs where created_by = v_uid and created_at > now() - interval '1 day') >= 60 then
    raise exception 'Daily limit reached (60 runs). Try again tomorrow.' using errcode = '54000';
  end if;

  insert into public.prompt_chain_runs
    (chain_id, chain_name, voice_id, steps, input_text, image_path, image_title, image_source, model, created_by)
  values
    (v_chain.id, v_chain.name, v_chain.voice_id, v_steps, nullif(btrim(p_input_text), ''),
     p_image_path, nullif(left(p_image_title, 120), ''), p_image_source, left(p_model, 100), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- Hands the server exactly what it needs for the NEXT step, and locks it so
-- the same step cannot run twice at once.
create or replace function public.claim_chain_step(p_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.prompt_chain_runs%rowtype;
  v_total integer;
  v_token uuid;
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.prompt_chain_runs
   where id = p_run_id and created_by = (select auth.uid()) for update;
  if not found then
    raise exception 'That run no longer exists.' using errcode = 'P0002';
  end if;
  v_total := jsonb_array_length(r.steps);
  if r.status <> 'running' or r.steps_done >= v_total then
    raise exception 'This run is not in progress.' using errcode = '22023';
  end if;
  if r.claimed_at is not null and r.claimed_at > now() - interval '90 seconds' then
    raise exception 'A step of this run is already running.' using errcode = '55P03';
  end if;
  -- A claim older than 90 s counts as expired and may be taken over. Taking
  -- it over replaces the token, so the previous holder can no longer record
  -- or fail anything (see record_chain_step / fail_chain_run).
  v_token := gen_random_uuid();
  update public.prompt_chain_runs
     set claimed_at = now(), claim_token = v_token, last_activity_at = now()
   where id = r.id;

  return jsonb_build_object(
    'claim_token', v_token,
    'step_index', r.steps_done,
    'total', v_total,
    'instruction', r.steps -> r.steps_done ->> 'instruction',
    'voice_id', r.voice_id,
    'input_text', r.input_text,
    'image_path', r.image_path,
    'previous', coalesce(
      (select jsonb_agg(o ->> 'output' order by ord) from jsonb_array_elements(r.step_outputs) with ordinality as t(o, ord)),
      '[]'::jsonb)
  );
end;
$$;

create or replace function public.record_chain_step(
  p_run_id bigint,
  p_step_index integer,
  p_claim_token uuid,
  p_secret text,
  p_output text,
  p_latency_ms integer,
  p_finish_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.prompt_chain_runs%rowtype;
  v_total integer;
  v_out text := left(btrim(coalesce(p_output, '')), 4000);
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.assert_run_secret(p_secret);
  select * into r from public.prompt_chain_runs
   where id = p_run_id and created_by = (select auth.uid()) for update;
  if not found then
    raise exception 'That run no longer exists.' using errcode = 'P0002';
  end if;
  v_total := jsonb_array_length(r.steps);
  -- Only the execution that currently holds the claim may record, and only
  -- for the step it claimed. A holder whose claim expired and was taken over
  -- has a stale token and is rejected. A claim nobody took over stays valid
  -- for 10 minutes (the abandoned-run window), so a slow model call still lands.
  if r.status <> 'running'
     or r.steps_done <> p_step_index
     or p_claim_token is null
     or r.claim_token is distinct from p_claim_token
     or r.claimed_at is null
     or r.claimed_at < now() - interval '10 minutes'
     or v_out = '' then
    raise exception 'This step cannot be recorded (stale or already recorded).' using errcode = '22023';
  end if;

  update public.prompt_chain_runs
     set step_outputs = step_outputs || jsonb_build_array(jsonb_build_object(
           'position', (r.steps -> p_step_index ->> 'position')::integer,
           'instruction', r.steps -> p_step_index ->> 'instruction',
           'output', v_out,
           'latency_ms', greatest(0, coalesce(p_latency_ms, 0)),
           'finish_reason', left(coalesce(p_finish_reason, ''), 60))),
         steps_done = r.steps_done + 1,
         claimed_at = null,
         claim_token = null,
         last_activity_at = now(),
         status = case when r.steps_done + 1 >= v_total then 'succeeded' else 'running' end,
         final_output = case when r.steps_done + 1 >= v_total then v_out else null end,
         completed_at = case when r.steps_done + 1 >= v_total then now() else null end
   where id = r.id;

  return case when r.steps_done + 1 >= v_total then 'succeeded' else 'running' end;
end;
$$;

-- Fails a run. With a claim token: only the current holder can do it (a stale
-- holder is a silent no-op, so it cannot kill a run another execution took
-- over). Without a token (failures before any step was claimed): only when no
-- live claim exists.
create or replace function public.fail_chain_run(
  p_run_id bigint,
  p_error_code text,
  p_claim_token uuid,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.assert_run_secret(p_secret);
  update public.prompt_chain_runs
     set status = 'failed', error_code = left(coalesce(p_error_code, 'failed'), 60),
         completed_at = now(), claimed_at = null, claim_token = null
   where id = p_run_id and created_by = (select auth.uid()) and status = 'running'
     and (
       (p_claim_token is not null and claim_token = p_claim_token)
       or (p_claim_token is null and (claimed_at is null or claimed_at < now() - interval '90 seconds'))
     );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Explicit deletion
-- ---------------------------------------------------------------------------

-- Deletes the chain and its steps (and mix rows). Runs and images are kept.
-- Returns how many runs were preserved. The caller must type the chain's exact
-- name (case-insensitive); a mismatch deletes nothing.
create or replace function public.delete_prompt_chain(p_chain_id bigint, p_confirm_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_kept integer;
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select name into v_name from public.prompt_chains where id = p_chain_id for update;
  if v_name is null then
    raise exception 'That chain no longer exists.' using errcode = 'P0002';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_name)) then
    raise exception 'Type the chain name exactly to confirm.' using errcode = '22023';
  end if;
  select count(*) into v_kept from public.prompt_chain_runs where chain_id = p_chain_id;
  delete from public.prompt_chains where id = p_chain_id;
  return v_kept;
end;
$$;

-- Removes one run and returns its image path so the server can delete the file.
create or replace function public.delete_chain_run(p_run_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.prompt_chain_runs where id = p_run_id returning image_path into v_path;
  if v_path is null then
    raise exception 'That run no longer exists.' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges: signed-in users only (each function re-checks superadmin)
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
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
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
