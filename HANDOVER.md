# Handover

Working notes for the next session. Delete or trim once it's stale.

## Where things stand

The web MVP now covers **listen → identify → confirm → save + scrobble**, backed by Supabase:

- `public/index.html` — front-end: record, identify, magic-link sign-in (supabase-js from esm.sh), direct saves to Postgres, scrobble via the proxy.
- `api/config.ts` — new edge function handing the browser `SUPABASE_URL`/`SUPABASE_ANON_KEY`.
- `api/lastfm.ts` — reworked: the Last.fm session key lives in the user's `profiles` row, written/read only by this function with the service key. Jobs: start connect (JWT-gated), token exchange (state = user id), status probe, disconnect, JWT-gated scrobble that reads the key server-side.
- `supabase/schema.sql` — `pressings` (deduped by AudD acrid or artist|title|album), `plays` (owner-only RLS), `profiles` (zero client grants).
- Tests: `node api/identify.test.mjs && node api/lastfm.test.mjs` — all green, fetch stubbed.

## Not yet verified against reality

Still no real record matched/logged/scrobbled end-to-end. Smoke test needs the user:

1. Create a free Supabase project; run `supabase/schema.sql` in the SQL editor; enable Email (magic link) auth.
2. Env vars: `AUDD_API_TOKEN`, `LASTFM_API_KEY`, `LASTFM_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.
3. `npx vercel dev` → sign in with the magic link (built-in mailer is rate-limited ~2/hour), play a record, Confirm & log.
4. Then deploy (`npx vercel`) and repeat once against production.

## Next steps (in order)

1. **Smoke test** the above for real.
2. **Profile page** — read back your plays ("Collection + profile" roadmap item); public profile comes with Feed & social later.
3. **Buy-next recommendations** — Claude over history.
4. Custom SMTP for magic links when the built-in ~2/hour limit starts biting.

## Conventions

- No Claude/Anthropic attribution in commits, PRs, or comments.
- Non-trivial logic leaves one runnable check behind (see the `.test.mjs` files); no test frameworks.
- Nothing is pushed to a remote unless asked.
