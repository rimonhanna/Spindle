# Spindle 🎵

**Hear it, don't type it.** Put a record on, and Spindle listens, identifies the *exact* pressing playing, logs it, scrobbles it to Last.fm, and — over time — learns your taste to tell you what to spin and buy next.

> ⚠️ **Status: early / placeholder.** This repo is the starting point. Nothing is built yet — the plan and scaffolding land first, code follows.

---

## The idea

Most vinyl apps make you *log* what you played — type it in, or photograph the cover. Spindle's wedge is **automatic identification from the audio itself**: the mic hears the record, an audio-fingerprinting API names the exact pressing (the 2011 remaster, not just "the album"), and one tap does the rest.

1. **Listen & identify** — mic → fingerprint → the specific pressing.
2. **Log & scrobble** — one tap saves it to your collection and scrobbles to Last.fm.
3. **Post-listen intelligence** — an LLM works over your *real* listening history to recommend records that are actually in-print and in stock, and to surface insights about your taste.

Why fingerprinting and not "just ask an AI"? Identifying a specific recording is exact audio matching against a reference catalog — a job LLMs hallucinate at. The AI earns its place *after* the match: describing the feel of a record and recommending the next one.

## Planned stack

| Layer | Pick |
|---|---|
| App | Expo (React Native) + TypeScript |
| Backend / auth / realtime | Supabase |
| Fingerprinting | AudD (→ ACRCloud if needed) |
| Metadata & marketplace | Discogs API |
| Scrobble | Last.fm API |
| Recommendations | Claude API |

Self-hosters bring their own API keys — none ship with this repo.

## Roadmap

- [ ] Data model + auth
- [ ] Capture loop: mic → fingerprint → confirm → log + scrobble
- [ ] "Buy next" AI recommendations
- [ ] Feed & social (later)

## License

Spindle is **source-available under the [PolyForm Noncommercial License 1.0.0](./LICENSE.md)**.

- ✅ **Free** for any noncommercial purpose, including **self-hosting for yourself**.
- ❌ **Commercial use is not granted** by the license. Want to use Spindle commercially? **Contact Rimon Hanna** for commercial terms.

This is *source-available*, not OSI "open source" — the noncommercial restriction is deliberate.

## Contributing

Contributions are welcome — see **[CONTRIBUTING.md](./CONTRIBUTING.md)**. Note that contributors assign copyright to the sole owner (Rimon Hanna) so the project can be dual-licensed; contributors receive the same noncommercial rights as everyone else.

---

*Not affiliated with Last.fm, Discogs, Shazam, or AudD. Built by [Rimon Hanna](https://rimonhanna.com).*
