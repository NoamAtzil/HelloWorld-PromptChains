// Runs 001_prompt_chain_runs.sql against a real Postgres (PGlite, in memory)
// with stand-ins for the Supabase pieces (auth.uid(), roles, storage) and the
// REAL prompt-chain tables copied from the admin app's migration 003.
//
//   npm run test:db
//
// Set ADMIN_REPO if HelloWorld-Admin is not next to this repo.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(here, "../migrations/001_prompt_chain_runs.sql");
const adminRepo = process.env.ADMIN_REPO ?? path.join(here, "../../../HelloWorld-Admin");
const m003 = fs.readFileSync(path.join(adminRepo, "supabase/migrations/003_admin_ai_config.sql"), "utf8");
// Section 1 of 003 = touch_updated_at + the three prompt-chain tables + triggers, verbatim.
const chainTables = m003.slice(0, m003.indexOf("-- 2. Terms and examples"));
const migration = fs.readFileSync(migrationPath, "utf8");

const ADM = "00000000-0000-0000-0000-0000000000a1";
const ADM2 = "00000000-0000-0000-0000-0000000000a2";
const USR = "00000000-0000-0000-0000-0000000000b1";
const SECRET = "test-secret-0123456789-abcdefghij";
const KEY = "prompt_chain_steps_chain_position_key";

const db = new PGlite();
let seq = 0;

async function as(uid, sql) {
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${uid}"}', false); set role authenticated;`);
  try {
    return (await db.query(sql)).rows;
  } catch (e) {
    return { err: e.code, message: e.message };
  } finally {
    await db.exec("reset role");
  }
}
async function asAnon(sql) {
  await db.exec("set role anon");
  try {
    return (await db.query(sql)).rows;
  } catch (e) {
    return { err: e.code };
  } finally {
    await db.exec("reset role");
  }
}
const ok = (r) => Array.isArray(r);
const code = (r) => r?.err;
async function photo() {
  const name = `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}.png`;
  await db.exec(`insert into storage.objects (bucket_id, name) values ('chain-media', '${name}')`);
  return name;
}
const start = async (uid, chain, img, secret = SECRET) =>
  as(uid, `select start_chain_run(${chain}, 'ctx', '${img}', 't', 'upload', 'gemini', ${secret === null ? "null" : `'${secret}'`}) id`);
const claim = async (uid, run) => as(uid, `select claim_chain_step(${run}) c`);
const record = (uid, run, idx, token, out = "out", secret = SECRET) =>
  as(uid, `select record_chain_step(${run}, ${idx}, ${token ? `'${token}'` : "null"}, '${secret}', '${out}', 5, 'STOP') s`);
const fail = (uid, run, token, secret = SECRET) =>
  as(uid, `select fail_chain_run(${run}, 'boom', ${token ? `'${token}'` : "null"}, '${secret}')`);
const stepIds = async (chain) =>
  (await db.query(`select id from public.prompt_chain_steps where chain_id=${chain} order by position`)).rows.map((r) => r.id);
const uniqueConstraints = async () =>
  (await db.query(`select conname, condeferrable from pg_constraint
     where conrelid='public.prompt_chain_steps'::regclass and contype='u'`)).rows;
const setSecret = (v) =>
  db.exec(`insert into private.app_settings (key,value) values ('chain_run_secret','${v}')
           on conflict (key) do update set value=excluded.value`);

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
    create table public.profiles (id uuid primary key, is_superadmin boolean not null default false);
    create function public.is_superadmin() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce((select p.is_superadmin from public.profiles p where p.id=(select auth.uid())), false) $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id serial primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth to anon, authenticated;
    insert into public.profiles values ('${ADM}', true), ('${ADM2}', true), ('${USR}', false);
  `);
  await db.exec(chainTables);
  await db.exec(`
    alter table public.prompt_chains enable row level security;
    alter table public.prompt_chain_steps enable row level security;
    alter table public.prompt_chain_mix enable row level security;
    grant select, insert, update, delete on public.prompt_chains, public.prompt_chain_steps to authenticated;
    grant select on public.prompt_chain_mix to authenticated;
    create policy a on public.prompt_chains for all to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
    create policy b on public.prompt_chain_steps for all to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
    create policy c on public.prompt_chain_mix for select to authenticated using ((select public.is_superadmin()));
    insert into public.prompt_chains (name, voice_id) values ('Noir', 'noir'), ('Other', null);
    insert into public.prompt_chain_steps (chain_id, position, instruction)
      values (1,1,'one'),(1,2,'two'),(1,3,'three'),(2,1,'solo');
  `);
});

describe("1. constraint upgrade (existing data, idempotent)", () => {
  test("before: the original constraint is NOT deferrable and a swap fails", async () => {
    const before = await uniqueConstraints();
    assert.equal(before.length, 1);
    assert.equal(before[0].condeferrable, false);
    await assert.rejects(
      db.exec(`update public.prompt_chain_steps set position = case position when 1 then 2 else 1 end where chain_id=1 and position in (1,2)`),
      (e) => e.code === "23505",
    );
  });

  test("migration upgrades it in place, keeps every row, leaves exactly one constraint", async () => {
    const rowsBefore = (await db.query(`select id, chain_id, position, instruction from public.prompt_chain_steps order by id`)).rows;
    await db.exec(migration);
    const cons = await uniqueConstraints();
    assert.deepEqual(cons.map((c) => c.conname), [KEY]);
    assert.equal(cons[0].condeferrable, true);
    const rowsAfter = (await db.query(`select id, chain_id, position, instruction from public.prompt_chain_steps order by id`)).rows;
    assert.deepEqual(rowsAfter, rowsBefore);
  });

  test("applying it again and again changes nothing", async () => {
    await db.exec(migration);
    await db.exec(migration);
    const cons = await uniqueConstraints();
    assert.equal(cons.length, 1);
    assert.equal(cons[0].condeferrable, true);
  });

  test("our constraint name present but NOT deferrable is upgraded too", async () => {
    await db.exec(`alter table public.prompt_chain_steps drop constraint ${KEY};
                   alter table public.prompt_chain_steps add constraint ${KEY} unique (chain_id, position);`);
    assert.equal((await uniqueConstraints())[0].condeferrable, false);
    await db.exec(migration);
    const cons = await uniqueConstraints();
    assert.deepEqual(cons.map((c) => [c.conname, c.condeferrable]), [[KEY, true]]);
  });

  test("a swap inside one transaction now works at the SQL level", async () => {
    const [a, b] = await stepIds(2).then(() => stepIds(1));
    await db.exec(`begin; set constraints public.${KEY} deferred;
      update public.prompt_chain_steps set position = case id when ${a} then 2 else 1 end where id in (${a},${b});
      commit;`);
    assert.deepEqual(await stepIds(1).then((x) => x.slice(0, 2)), [b, a]);
    await db.exec(`begin; set constraints public.${KEY} deferred;
      update public.prompt_chain_steps set position = case id when ${a} then 1 else 2 end where id in (${a},${b});
      commit;`);
  });
});

describe("step operations (swaps, isolation, permissions)", () => {
  test("reorder swaps two steps, then reverses all three", async () => {
    const [a, b, c] = await stepIds(1);
    assert.ok(ok(await as(ADM, `select reorder_prompt_chain_steps(1, array[${b},${a},${c}]::bigint[])`)));
    assert.deepEqual(await stepIds(1), [b, a, c]);
    assert.ok(ok(await as(ADM, `select reorder_prompt_chain_steps(1, array[${c},${a},${b}]::bigint[])`)));
    assert.deepEqual(await stepIds(1), [c, a, b]);
    const pos = (await db.query(`select position from public.prompt_chain_steps where chain_id=1 order by position`)).rows.map((r) => r.position);
    assert.deepEqual(pos, [1, 2, 3]);
  });

  test("reorder rejects partial, duplicate, foreign and empty lists (nothing changes)", async () => {
    const ids = await stepIds(1);
    const [other] = await stepIds(2);
    for (const arr of [[ids[0]], [ids[0], ids[0], ids[1]], [ids[0], ids[1], other], []]) {
      const r = await as(ADM, `select reorder_prompt_chain_steps(1, array[${arr.join(",")}]::bigint[])`);
      assert.equal(code(r), "22023");
    }
    assert.deepEqual(await stepIds(1), ids);
  });

  test("add appends and creates a mix row; delete compacts positions", async () => {
    const id = (await as(ADM, `select add_prompt_chain_step(1, 'four') id`))[0].id;
    assert.equal((await db.query(`select count(*)::int c from public.prompt_chain_mix where step_id=${id}`)).rows[0].c, 1);
    const ids = await stepIds(1);
    await as(ADM, `select delete_prompt_chain_step(${ids[1]})`);
    const pos = (await db.query(`select position from public.prompt_chain_steps where chain_id=1 order by position`)).rows.map((r) => r.position);
    assert.deepEqual(pos, [1, 2, 3]);
  });

  test("non-admin and anonymous callers are refused", async () => {
    const ids = await stepIds(1);
    assert.equal(code(await as(USR, `select reorder_prompt_chain_steps(1, array[${ids.join(",")}]::bigint[])`)), "42501");
    assert.equal(code(await as(USR, `select add_prompt_chain_step(1, 'x')`)), "42501");
    assert.equal(code(await as(USR, `select delete_prompt_chain_step(${ids[0]})`)), "42501");
    assert.equal(code(await asAnon(`select add_prompt_chain_step(1, 'x')`)), "42501");
  });
});

describe("3. run integrity: the signing secret", () => {
  test("fails closed while the secret is not configured", async () => {
    assert.equal(code(await start(ADM, 1, await photo())), "22023");
  });

  test("fails closed when the configured secret is too short", async () => {
    await setSecret("short");
    assert.equal(code(await start(ADM, 1, await photo())), "22023");
  });

  test("a wrong or missing secret is forbidden; the right one works", async () => {
    await setSecret(SECRET);
    const img = await photo();
    assert.equal(code(await start(ADM, 1, img, "x".repeat(30))), "42501");
    assert.equal(code(await start(ADM, 1, img, null)), "42501");
    assert.ok(ok(await start(ADM, 1, img)));
    // finish/cleanup so later groups start from a clean slate
    await db.exec(`delete from public.prompt_chain_runs`);
  });

  test("direct writes to the runs table are impossible, even for a superadmin", async () => {
    const img = await photo();
    const ins = await as(ADM, `insert into prompt_chain_runs (chain_name, steps, image_path, image_source, model)
       values ('x','[{"position":1,"instruction":"a"}]','${img}','upload','m')`);
    assert.equal(code(ins), "42501");
    assert.equal(code(await as(ADM, `update prompt_chain_runs set final_output='forged'`)), "42501");
    assert.equal(code(await as(ADM, `delete from prompt_chain_runs`)), "42501");
  });

  test("a superadmin with a valid session but no secret cannot forge a step or a failure", async () => {
    const run = (await start(ADM, 2, await photo()))[0].id;
    const c = (await claim(ADM, run))[0].c;
    assert.equal(code(await record(ADM, run, 0, c.claim_token, "forged output", "y".repeat(30))), "42501");
    assert.equal(code(await fail(ADM, run, c.claim_token, "y".repeat(30))), "42501");
    const row = (await db.query(`select status, steps_done, final_output from public.prompt_chain_runs where id=${run}`)).rows[0];
    assert.deepEqual(row, { status: "running", steps_done: 0, final_output: null });
    assert.ok(ok(await record(ADM, run, 0, c.claim_token, "real")));
  });

  test("only the server's secret + the claim token can write; others cannot read the secret", async () => {
    assert.equal(code(await as(ADM, `select * from private.app_settings`)), "42501");
    assert.equal(code(await as(ADM, `select private.assert_run_secret('${SECRET}')`)), "42501");
  });
});

describe("2. sequential execution, claims, stale claims, retries", () => {
  let run;
  before(async () => {
    await db.exec(`delete from public.prompt_chain_runs`);
    run = (await start(ADM, 1, await photo()))[0].id;
  });

  test("steps run strictly in order and carry previous outputs", async () => {
    const c0 = (await claim(ADM, run))[0].c;
    assert.equal(c0.step_index, 0);
    assert.equal(c0.total, 3);
    assert.deepEqual(c0.previous, []);
    assert.equal(code(await claim(ADM, run)), "55P03", "double claim inside the lock");
    assert.equal(code(await record(ADM, run, 1, c0.claim_token)), "22023", "wrong step index");
    assert.equal(code(await record(ADM, run, 0, "11111111-1111-1111-1111-111111111111")), "22023", "wrong token");
    assert.equal(code(await record(ADM, run, 0, null)), "22023", "no token");
    assert.equal((await record(ADM, run, 0, c0.claim_token, "first"))[0].s, "running");
    assert.equal(code(await record(ADM, run, 0, c0.claim_token, "replay")), "22023", "a recorded step cannot be recorded again");
  });

  test("an expired claim that another execution re-took cannot record or fail anything", async () => {
    const stale = (await claim(ADM, run))[0].c; // step 1, token A
    assert.equal(stale.step_index, 1);
    assert.deepEqual(stale.previous, ["first"]);
    await db.exec(`update public.prompt_chain_runs set claimed_at = now() - interval '100 seconds' where id=${run}`);
    const fresh = (await claim(ADM, run))[0].c; // takeover, token B
    assert.notEqual(fresh.claim_token, stale.claim_token);
    assert.equal(fresh.step_index, 1);
    // the stale holder is rejected, and its failure report is a silent no-op
    assert.equal(code(await record(ADM, run, 1, stale.claim_token, "stale result")), "22023");
    assert.ok(ok(await fail(ADM, run, stale.claim_token)));
    assert.equal((await db.query(`select status from public.prompt_chain_runs where id=${run}`)).rows[0].status, "running");
    // the current holder succeeds
    assert.equal((await record(ADM, run, 1, fresh.claim_token, "second"))[0].s, "running");
    const outs = (await db.query(`select step_outputs from public.prompt_chain_runs where id=${run}`)).rows[0].step_outputs;
    assert.deepEqual(outs.map((o) => o.output), ["first", "second"]);
  });

  test("an expired claim nobody took over may still record (slow model call), up to 10 minutes", async () => {
    const c = (await claim(ADM, run))[0].c; // step 2
    await db.exec(`update public.prompt_chain_runs set claimed_at = now() - interval '5 minutes' where id=${run}`);
    // a claim older than 10 minutes is dead
    await db.exec(`update public.prompt_chain_runs set claimed_at = now() - interval '11 minutes' where id=${run}`);
    assert.equal(code(await record(ADM, run, 2, c.claim_token, "too late")), "22023");
    await db.exec(`update public.prompt_chain_runs set claimed_at = now() - interval '5 minutes' where id=${run}`);
    assert.equal((await record(ADM, run, 2, c.claim_token, "third"))[0].s, "succeeded");
    const r = (await db.query(`select status, final_output, steps_done, claim_token from public.prompt_chain_runs where id=${run}`)).rows[0];
    assert.deepEqual(r, { status: "succeeded", final_output: "third", steps_done: 3, claim_token: null });
    assert.equal(code(await claim(ADM, run)), "22023", "finished runs cannot be claimed");
  });

  test("the holder (and only the holder) can fail a run; a tokenless fail needs no live claim", async () => {
    const r2 = (await start(ADM, 2, await photo()))[0].id;
    const c = (await claim(ADM, r2))[0].c;
    assert.ok(ok(await fail(ADM, r2, null)), "tokenless fail while a live claim exists");
    assert.equal((await db.query(`select status from public.prompt_chain_runs where id=${r2}`)).rows[0].status, "running");
    assert.ok(ok(await fail(ADM, r2, c.claim_token)));
    assert.equal((await db.query(`select status, error_code from public.prompt_chain_runs where id=${r2}`)).rows[0].status, "failed");
    assert.equal(code(await record(ADM, r2, 0, c.claim_token)), "22023", "a failed run accepts nothing");
  });

  test("another superadmin cannot see or touch someone else's run", async () => {
    const r = (await start(ADM, 2, await photo()))[0].id;
    assert.equal(code(await claim(ADM2, r)), "P0002");
    assert.equal(code(await record(ADM2, r, 0, "11111111-1111-1111-1111-111111111111")), "P0002");
    assert.ok(ok(await fail(ADM2, r, null)), "no-op");
    assert.equal((await db.query(`select status from public.prompt_chain_runs where id=${r}`)).rows[0].status, "running");
    await fail(ADM, r, null);
  });
});

describe("limits, photos, permissions, deletion", () => {
  before(async () => {
    await db.exec(`delete from public.prompt_chain_runs`);
  });

  test("a missing or reused photo is rejected", async () => {
    assert.equal(code(await start(ADM, 1, "ffffffff-ffff-ffff-ffff-ffffffffffff.png")), "22023");
    const img = await photo();
    const id = (await start(ADM, 1, img))[0].id;
    assert.equal(code(await start(ADM, 1, img)), "22023");
    await fail(ADM, id, null);
  });

  test("two in progress at once; abandoned runs expire; 12 per hour", async () => {
    await db.exec(`delete from public.prompt_chain_runs`);
    const a = await start(ADM, 1, await photo());
    const b = await start(ADM, 1, await photo());
    assert.ok(ok(a) && ok(b));
    assert.equal(code(await start(ADM, 1, await photo())), "54000");
    await db.exec(`update public.prompt_chain_runs set last_activity_at = now() - interval '11 minutes'`);
    assert.ok(ok(await start(ADM, 1, await photo())), "abandoned runs stop counting");
    await db.exec(`delete from public.prompt_chain_runs`);
    for (let i = 0; i < 12; i++) {
      const r = await start(ADM, 1, await photo());
      assert.ok(ok(r), `run ${i + 1}`);
      await fail(ADM, r[0].id, null);
    }
    assert.equal(code(await start(ADM, 1, await photo())), "54000", "hourly limit");
  });

  test("non-admin and anonymous callers cannot use any run function", async () => {
    assert.equal(code(await start(USR, 1, await photo())), "42501");
    assert.equal(code(await as(USR, `select claim_chain_step(1)`)), "42501");
    assert.equal(code(await as(USR, `select delete_chain_run(1)`)), "42501");
    assert.equal(code(await as(USR, `select delete_prompt_chain(1,'Noir')`)), "42501");
    assert.deepEqual(await as(USR, `select * from prompt_chain_runs`), []);
    assert.equal(code(await asAnon(`select delete_chain_run(1)`)), "42501");
    assert.equal(code(await asAnon(`select claim_chain_step(1)`)), "42501");
  });

  test("deleting a chain needs its name and keeps every run (snapshot, chain_id NULL)", async () => {
    await db.exec(`delete from public.prompt_chain_runs`);
    const img = await photo();
    const id = (await start(ADM, 1, img))[0].id;
    assert.equal(code(await as(ADM, `select delete_prompt_chain(1, 'nope')`)), "22023");
    assert.equal((await db.query(`select count(*)::int c from public.prompt_chains where id=1`)).rows[0].c, 1);
    assert.equal((await as(ADM, `select delete_prompt_chain(1, ' noir ') k`))[0].k, 1);
    const run = (await db.query(`select chain_id, chain_name, steps from public.prompt_chain_runs where id=${id}`)).rows[0];
    assert.equal(run.chain_id, null);
    assert.equal(run.chain_name, "Noir");
    assert.equal(run.steps.length, 3);
    assert.equal((await db.query(`select count(*)::int c from public.prompt_chain_steps where chain_id=1`)).rows[0].c, 0);
    assert.equal((await as(ADM, `select delete_chain_run(${id}) p`))[0].p, img);
  });

  test("the chain-media bucket is private", async () => {
    assert.equal((await db.query(`select public from storage.buckets where id='chain-media'`)).rows[0].public, false);
  });
});

describe("verification SQL (supabase/tests/prompt_chains_checks.sql)", () => {
  const checks = fs.readFileSync(path.join(here, "prompt_chains_checks.sql"), "utf8");
  const failsWith = async (re) => {
    await assert.rejects(db.exec(checks), (e) => re.test(e.message));
    await db.exec("reset role");
  };

  before(async () => {
    await setSecret(SECRET);
  });

  test("passes on a correct installation", async () => {
    await db.exec(checks);
  });

  test("passes again (it is read-only and repeatable)", async () => {
    await db.exec(checks);
    const runs = (await db.query(`select count(*)::int c from public.prompt_chain_runs`)).rows[0].c;
    const settings = (await db.query(`select count(*)::int c from private.app_settings`)).rows[0].c;
    assert.equal(settings, 1);
    assert.ok(runs >= 0);
  });

  test("FAILS if a function still has the old secret-less signature", async () => {
    await db.exec(`create function public.start_chain_run(bigint, text, text, text, text, text) returns bigint language sql as 'select 1::bigint'`);
    await failsWith(/FAIL A4/);
    await db.exec(`drop function public.start_chain_run(bigint, text, text, text, text, text)`);
  });

  test("FAILS if the secret is not configured", async () => {
    await db.exec(`delete from private.app_settings where key='chain_run_secret'`);
    await failsWith(/FAIL A5/);
    await setSecret(SECRET);
  });

  test("FAILS if anon is granted EXECUTE on a run function", async () => {
    await db.exec(`grant execute on function public.claim_chain_step(bigint) to anon`);
    await failsWith(/FAIL A2/);
    await db.exec(`revoke execute on function public.claim_chain_step(bigint) from anon`);
  });

  test("FAILS if the secret check is removed (a superadmin could forge runs)", async () => {
    await db.exec(`create or replace function private.assert_run_secret(p_secret text) returns void language sql as 'select'`);
    await failsWith(/FAIL C1/);
    await db.exec(migration); // restores the real function
    await db.exec(checks);
  });

  test("FAILS if the superadmin check is removed from a function", async () => {
    await db.exec(`create or replace function public.is_superadmin() returns boolean language sql as 'select true'`);
    await failsWith(/FAIL B/);
    await db.exec(`create or replace function public.is_superadmin() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce((select p.is_superadmin from public.profiles p where p.id=(select auth.uid())), false) $$`);
    await db.exec(checks);
  });

  test("FAILS if authenticated users are granted direct write access to runs", async () => {
    await db.exec(`grant insert, update, delete on public.prompt_chain_runs to authenticated`);
    await failsWith(/FAIL (B|C)/);
    await db.exec(`revoke insert, update, delete on public.prompt_chain_runs from authenticated`);
    await db.exec(checks);
  });

  test("FAILS if the chain-media bucket becomes public", async () => {
    await db.exec(`update storage.buckets set public = true where id='chain-media'`);
    await failsWith(/FAIL A6/);
    await db.exec(`update storage.buckets set public = false where id='chain-media'`);
  });
});
