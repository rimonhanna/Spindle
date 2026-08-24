# Handover

Working notes for the next session. Delete or trim once it's stale.

## Where things stand

Phase 1 (**listen → identify**) and the scrobble half of Phase 2 are built and shipping as a
zero-database web MVP, deployable free on Vercel.

**mic → fingerprint (AudD) → confirm → scrobble (Last.fm)** works end-to-end in code.

| File | What it is |
|---|---|
| `public/index.html` | The whole front-end: record with `MediaRecorder`, POST audio to the proxy, render the match, connect Last.fm, scrobble. No framework, no build. |
| `api/identify.ts` | Vercel **Edge** function. Hides the AudD key; forwards audio as multipart, returns AudD's JSON. |
| `api/lastfm.ts` | Vercel **Node** function (needs `node:crypto` md5 for request signing). Three jobs by method/query: login redirect, token→session exchange, signed `track.scrobble`. |
| `api/*.test.mjs` | Isolated tests, `fetch` stubbed — no API quota used. `node api/identify.test.mjs && node api/lastfm.test.mjs`. |
| `README.md` | Run/deploy instructions + stack rationale. |
| `docs/index.html` | The public plan/roadmap page (GitHub Pages). Stack table lives here too — keep it in sync with README. |

Zero runtime dependencies. Node 26 runs the `.ts` files natively (type-stripping); no `package.json`.

## Stack decisions (settled, don't re-litigate)

- **TypeScript everywhere** — one language browser → phone → server. This is the reason for the picks below.
- **App: Expo (React Native) + TS.** Not Flutter (Dart = an island in an all-TS stack). Not built yet.
- **Backend: Supabase**, custom logic as **Deno/TS edge functions**. Not Node, not Python — nothing here needs Python's ML strength (fingerprinting is rented from AudD).
- **Hosting: Vercel + Supabase free tiers.** Vercel serves the page + proxy functions; Supabase is the data plane called from both web and app. The only thing that costs money is **AudD** (rented fingerprinter, ~$5/mo past a trial).
- The Vercel Edge/Node proxies use web-standard APIs on purpose, so they port to Supabase edge functions later with almost no change.

## How to run / verify (needs the user's credentials — a code session can't do this leg)

1. `AUDD_API_TOKEN` — get at https://dashboard.audd.io (empty = rate-limited demo mode).
2. `LASTFM_API_KEY` + `LASTFM_SECRET` — register at https://www.last.fm/api/account/create, callback URL → `/api/lastfm`.
3. `npx vercel dev`, open http://localhost:3000, play a real record, check identify + scrobble.
4. Deploy: `npx vercel`, set the three env vars in the project.

**Not yet verified against reality:** no real record has been matched or scrobbled. Tests cover the
plumbing (signing, forwarding, guards), not a live AudD match. Smoke-test before building further.

## Next step (decided, not yet started)

**Supabase collection step** — the only remaining reason to stand up a backend:

- Supabase project + auth (the user's own login).
- Data model: `plays` (+ `pressings`), one row per confirmed play.
- Save each confirmed play; move the Last.fm session key off `localStorage` into the user's row.
- This is roadmap item "Collection + profile"; after it comes "Buy-next recommendations" (Claude over history) then "Feed & social".

Open question for that step: keep the web page as the client, or start the Expo app? The roadmap says
prove the core on web first — so probably add collection to the web MVP before opening the RN app.

## Conventions

- No Claude/Anthropic attribution in commits, PRs, or comments.
- Non-trivial logic leaves one runnable check behind (see the `.test.mjs` files); no test frameworks.
- Nothing is pushed to a remote unless asked. Commits so far: `a73571e` (Phase 1), `b65b210` (scrobble).
