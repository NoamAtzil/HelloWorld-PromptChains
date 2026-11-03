<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HelloWorld-PromptChains

Third app of the caption project (Columbia HW8). Superadmin-only prompt-chain builder/runner. Shares the Supabase project with `HelloWorld` (public) and `HelloWorld-Admin`; it must never break them.

- Dev: `npm run dev` (port 3002). Checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.
- Env (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY` and `CHAIN_RUN_SECRET` (both server only; the secret must equal DB `private.app_settings.chain_run_secret`, it gates run-writing functions). No service-role key, ever.
- Auth: Google OAuth. Every page and server action calls `requireAdmin()` (`src/lib/admin.ts`), which asks the DB `is_superadmin()`. The proxy (`src/proxy.ts`) is only the first gate.
- DB: tables `prompt_chains`, `prompt_chain_steps`, `prompt_chain_mix` come from HelloWorld-Admin migration 003. This app's `supabase/migrations/001_prompt_chain_runs.sql` adds runs, the private `chain-media` bucket and SECURITY DEFINER functions (reorder, run lifecycle, deletion, usage limits). Writes to runs go only through those functions.
- Run flow: client calls `startRun` then `runNextStep` once per step (sequential, DB-locked); Gemini is only called in `src/lib/gemini.ts`.
- Deleting a chain keeps its runs (snapshot + `chain_id` set NULL). Chain deletion goes through `delete_prompt_chain` (typed-name confirmation).
- Theme: `data-theme` on `<html>` is the resolved theme; preference lives in `localStorage["pc-theme"]` (light | dark | system). Tokens mirror the other two apps.
- `prompt_chain_mix` weights are not used by execution (no defined semantics); steps run in `position` order.

## What not to do
- Don't use `@tailwindcss/postcss` here: it fails on Node 20 locally; use the `@tailwindcss/turbopack` rule in `next.config.ts` and keep the `magic-string` override (1.x is ESM-only and breaks the Tailwind loader on Node 20).
- Keep custom component classes (`.btn-*`, `.panel`, `.field`, ...) inside `@layer components` in `globals.css`. Unlayered CSS beats Tailwind utilities, so `lg:hidden` / `!rounded-*` silently stop working on them.
- `@theme inline` does not emit `--font-display` etc. as CSS variables: a raw `var(--font-display)` is invalid and falls back to sans. Reference the `next/font` variables directly (`var(--font-fraunces)`).
- `timeout` does not exist on macOS; don't wrap shell commands in it. Headless Chrome clamps windows to ~500px: test mobile layouts inside a 390px iframe.
- `vercel project create` from the CLI leaves Framework Preset "Other", which fails with `STATIC_BUILD_EMPTY_OUT_DIR` after a successful build. Run `vercel project update <name> --framework nextjs --yes` right after creating.
