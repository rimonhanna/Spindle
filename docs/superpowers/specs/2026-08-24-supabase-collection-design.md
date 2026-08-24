# Supabase collection step — design

Date: 2026-08-24 · Status: implemented (commit f128fb0) · Live smoke test pending

## Goal

Extend the web MVP from listen → identify → scrobble to **listen → identify → confirm → save + scrobble**, on Supabase, with no build step and no runtime dependencies beyond supabase-js loaded from a CDN.

Decisions settled in discussion:

- Client: stay on the web MVP first; the Expo app waits until the core is proven.
- Supplier: Supabase stays, including its built-in magic-link auth (a custom-built alternative was considered and dropped).
- Email: built-in magic-link mailer first (~2/hour free-tier limit); custom SMTP deferred.
- Data model: three tables over denormalized/JSONB alternatives.

## Architecture

```
browser (public/index.html, module script)
  ├─ supabase-js via esm.sh ── auth (magic link) + direct Postgres writes (RLS-gated)
  ├─ /api/config   (edge)    ── hands over SUPABASE_URL / SUPABASE_ANON_KEY
  ├─ /api/identify (edge)    ── AudD proxy (unchanged)
  └─ /api/lastfm   (node)    ── all Last.fm jobs; only holder of the session key
                                  reads/writes profiles via SUPABASE_SERVICE_KEY
```

Env additions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.

## Auth flow

`signInWithOtp({ email })` → Supabase emails a magic link → returning token in the URL is picked up by `onAuthStateChange`. Session persistence is Supabase's own refresh-token storage in localStorage — distinct from the old Last.fm-key-in-localStorage problem.

## Data model (supabase/schema.sql)

| Table | Purpose | RLS |
|---|---|---|
| `pressings` | one row per distinct recording; `dedupe_key` unique = AudD `acrid`, else lower(artist\|title\|album); display fields | read: everyone · insert/update: authenticated |
| `plays` | one row per confirmed play: user, pressing, played_at, full AudD payload as `raw jsonb` | select/insert own rows only |
| `profiles` | per-user Last.fm session key + username | **zero policies** — no client access at all; service key bypasses RLS |

The play-save sequence: upsert pressing on `dedupe_key` conflict (later matches enrich fields), `.select().single()` for its id, insert the play with `raw`.

## Last.fm key move

The session key never reaches a browser:

- **start**: POST `{action:'start'}` with Bearer JWT → server returns a Last.fm auth URL whose callback carries `state = userId.HMAC(userId)` (HMAC-SHA256 over the service key, truncated to 32 hex) so a forged callback can't bind a session key to someone else's profile row.
- **exchange** (GET `?token&state`): verifies the state HMAC, trades the token via `auth.getSession`, upserts `profiles` via service key, checks the write succeeded, redirects home. The secret is never echoed into the page.
- **scrobble** (POST with Bearer JWT): verifies the JWT against `/auth/v1/user`, reads `sk` from the profile, signs and sends `track.scrobble` (album passed through when present).
- **status** / **disconnect**: JWT-gated probe and wipe.

## Error handling

Save failures surface inline ("Save failed: …") and re-enable the button. Scrobble failure after a successful save reports `✓ Logged · scrobble failed` without resetting — a second click would duplicate the play row. Server guards: 400 missing fields, 401 missing/forged JWT, 409 connected-but-no-key.

## Testing

Same convention as before: stubbed-fetch `.test.mjs` files run directly by Node, no frameworks. lastfm tests cover signing vectors, every job, forged/stale/malformed state rejection, and that the exchange response never contains the key. The front-end script is syntax-checked (`node --check`) since browser flows aren't unit-testable here.

## Deliberate deferrals

- Custom SMTP — until the ~2/hour magic-link limit bites.
- Pressing UPDATE policy is all-columns/all-authenticated (`ponytail:` note in schema.sql) — narrow before pressings become shared social data.
- Public profile pages — ride with Feed & social.
- Old localStorage `spindle.lastfm` migration — skipped; reconnect once instead.
