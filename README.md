# HelloWorld-PromptChains

Superadmin-only prompt-chain builder for the caption project: create chains and steps, reorder them (drag-and-drop or arrows), run a chain on a photo with Gemini step by step, and browse run history and generated media per chain. Light, dark, and system themes.

## Setup

1. `cp .env.example .env.local` and fill in the Supabase URL/anon key (same project as the other two apps), `GEMINI_API_KEY`, and a `CHAIN_RUN_SECRET` you generate (`openssl rand -hex 32`).
   `npm run secret:copy` puts the matching SQL statement on your clipboard without showing the secret (`-- --check` shows it masked).
   Store the same value in the database (the migration header shows the one-line `insert into private.app_settings`). It stops anyone from writing fake run history through the database API.
2. Apply `supabase/migrations/001_prompt_chain_runs.sql` once in the Supabase SQL editor (after the Admin app's migrations 001 and 003), then run `supabase/tests/prompt_chains_checks.sql` to verify permissions.
3. Add the app's URLs (`http://localhost:3002/auth/callback` and the Vercel domain's `/auth/callback`) to Supabase Auth > URL Configuration > Redirect URLs.
4. `npm install && npm run dev` (http://localhost:3002).

Access requires `profiles.is_superadmin = TRUE`. This is enforced in the proxy, in every page and server action, and in the database (RLS + SECURITY DEFINER functions that re-check it).

## Checks

`npm run typecheck && npm run lint && npm test && npm run build`
