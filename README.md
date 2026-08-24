# Spindle 🎵

### [▶ See the plan &amp; roadmap](https://rimonhanna.github.io/Spindle/)

**Hear it, don't type it.** Put a record on, and Spindle listens, identifies the *exact* pressing playing, logs it, scrobbles it to Last.fm, and over time learns your taste to tell you what to spin and buy next.

> **Status:** listen → identify → log + scrobble works in code (web MVP, zero-database origins now backed by Supabase). Not yet smoke-tested against a real record.

---

## The idea

Most vinyl apps make you *log* what you played: type it in, or photograph the cover. Spindle's wedge is **automatic identification from the audio itself**. The mic hears the record, an audio-fingerprinting API names the exact pressing (the 2011 remaster, not just "the album"), and one tap does the rest.

1. **Listen & identify:** mic → fingerprint → the specific pressing.
2. **Log & scrobble:** one tap saves it to your collection and scrobbles to Last.fm.
3. **Post-listen intelligence:** an LLM works over your *real* listening history to recommend records that are actually in-print and in stock, and to surface insights about your taste.

Why fingerprinting and not "just ask an AI"? Identifying a specific recording is exact audio matching against a reference catalog, a job LLMs hallucinate at. The AI earns its place *after* the match: describing the feel of a record and recommending the next one.

## Planned stack

| Layer | Pick |
|---|---|
| Language | **TypeScript everywhere** (browser → phone → server) |
| App | Expo (React Native) + TypeScript |
| Backend / auth / realtime | Supabase (edge functions in Deno/TypeScript) |
| Hosting | Vercel + Supabase, free tiers |
| Fingerprinting | AudD (→ ACRCloud if needed) |
| Metadata & marketplace | Discogs API |
| Scrobble | Last.fm API |
| Recommendations | Claude API |

**Why these:** TypeScript is the through-line — one language across the web page, the phone app, and the backend functions, which for a solo dev beats a faster tool in a second language (hence Expo/RN over Flutter's Dart, and Deno/TS edge functions over a separate Node or Python service). Vercel hosts the web page and proxy functions; Supabase is the data plane called from both web and app. Both run on free tiers, so the only thing that costs money is AudD, the rented fingerprinter.

Self-hosters bring their own API keys; none ship with this repo.

## Run the web MVP

Phase 1 is a browser page that records a few seconds and names the pressing — a static page (`public/`) plus one proxy function (`api/identify.ts`) that hides the AudD key. No build step, no dependencies.

Local dev:

```
npx vercel dev          # serves public/ and api/ on http://localhost:3000
```

Deploy free:

```
npx vercel              # first push; add AUDD_API_TOKEN in the Vercel project env
```

Open the page, click **Listen**, play a record. Get an AudD token at https://dashboard.audd.io; without one it runs in a heavily rate-limited demo mode.

**Collection + scrobbling (Supabase):** create a free project at https://supabase.com, run `supabase/schema.sql` in its SQL editor (creates `pressings`, `plays`, and the service-only `profiles` table with row-level security), enable magic-link sign-in under Authentication, and set these in the project env:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — handed to the browser via `/api/config`
- `SUPABASE_SERVICE_KEY` — server-only; `/api/lastfm` uses it to store your Last.fm session key on your profile row

Sign in on the page with an email magic link. Then each match gets **Confirm & log**: the play lands in your `plays` history and, if you've connected Last.fm, is scrobbled. The Last.fm session key never touches the browser — it lives in your Supabase row and only the server function reads it.

Test the proxies in isolation (no API quota used):

```
node api/identify.test.mjs
node api/lastfm.test.mjs
```

## Roadmap

- [x] Data model + auth (Supabase magic link, `plays`/`pressings`)
- [x] Capture loop: mic → fingerprint → confirm → log + scrobble
- [ ] "Buy next" AI recommendations
- [ ] Feed & social (later)

Not yet verified against reality: no real record has been matched, logged, and scrobbled end-to-end. The tests cover the plumbing; a live smoke test is the next step.

## License

Spindle is **source-available under the [PolyForm Noncommercial License 1.0.0](./LICENSE.md)**.

- ✅ **Free** for any noncommercial purpose, including **self-hosting for yourself**.
- ❌ **Commercial use is not granted** by the license. Want to use Spindle commercially? **Contact me** for commercial terms.

This is *source-available*, not OSI "open source"; the noncommercial restriction is deliberate.

## Contributing

Contributions are welcome. See **[CONTRIBUTING.md](./CONTRIBUTING.md)**. Note that contributors assign copyright to the sole owner (Rimon Hanna) so the project can be dual-licensed; contributors receive the same noncommercial rights as everyone else.

---

*Not affiliated with Last.fm, Discogs, Shazam, or AudD. Built by [Rimon Hanna](https://rimonhanna.com).*
