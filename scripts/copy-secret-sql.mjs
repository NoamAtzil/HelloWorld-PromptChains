#!/usr/bin/env node
// Copies the SQL that stores CHAIN_RUN_SECRET in the database to the clipboard,
// WITHOUT printing the secret.
//
//   npm run secret:copy            copy the real SQL to the clipboard (macOS)
//   npm run secret:copy -- --check show the SQL with the secret masked, copy nothing
//
// The secret is read from .env.local and written only to pbcopy's stdin (never
// to argv, stdout, stderr or a file). It does NOT touch the database: paste the
// statement into the Supabase SQL editor yourself, after the migration.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
const check = process.argv.includes("--check");

function fail(message) {
  console.error(`secret:copy: ${message}`);
  process.exit(1);
}

let text;
try {
  text = readFileSync(envPath, "utf8");
} catch {
  fail(".env.local not found. Create it from .env.example first.");
}

const lines = text.split(/\r?\n/).filter((line) => line.startsWith("CHAIN_RUN_SECRET="));
if (lines.length === 0) fail("CHAIN_RUN_SECRET is not set in .env.local.");
if (lines.length > 1) fail("CHAIN_RUN_SECRET appears more than once in .env.local. Keep exactly one.");
const secret = lines[0].slice("CHAIN_RUN_SECRET=".length).trim();
// Hex only, so it can be embedded in a SQL string literal without escaping.
if (!/^[0-9a-f]{64}$/.test(secret)) fail("CHAIN_RUN_SECRET must be exactly 64 lowercase hexadecimal characters.");

const sql = (value) =>
  `insert into private.app_settings (key, value)\nvalues ('chain_run_secret', '${value}')\non conflict (key) do update set value = excluded.value;`;

if (check) {
  console.log(sql("*".repeat(64)));
  console.log("\n(secret masked; 64 hex characters found in .env.local; nothing copied)");
  process.exit(0);
}

if (process.platform !== "darwin") fail("clipboard copy is implemented for macOS (pbcopy) only. Use --check to see the masked SQL.");
const result = spawnSync("pbcopy", { input: sql(secret), stdio: ["pipe", "ignore", "ignore"] });
if (result.error || result.status !== 0) fail("pbcopy failed; nothing was copied.");

console.log(sql("*".repeat(64)));
console.log("\nCopied the real statement to your clipboard (secret not shown).");
console.log("Paste it in the Supabase SQL editor AFTER applying the migration, then clear your clipboard.");
