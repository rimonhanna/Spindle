// Spindle — Last.fm auth + scrobble. Node runtime (needs md5 for request signing;
// the shared secret never leaves the server). One endpoint, three jobs:
//   GET  /api/lastfm             -> 302 to Last.fm's auth page
//   GET  /api/lastfm?token=...   -> exchange token for a session key, hand it to the browser
//   POST /api/lastfm  {artist,track,timestamp,sk} -> scrobble one play
// Env: LASTFM_API_KEY, LASTFM_SECRET (register an app at https://www.last.fm/api/account/create).
import { createHash } from 'node:crypto';

const KEY = process.env.LASTFM_API_KEY ?? '';
const SECRET = process.env.LASTFM_SECRET ?? '';
const API = 'https://ws.audioscrobbler.com/2.0/';

// Last.fm signature: sort params by name, concat name+value, append secret, md5 hex.
export function sign(params: Record<string, string>, secret = SECRET): string {
  const base = Object.keys(params).sort().map(k => k + params[k]).join('') + secret;
  return createHash('md5').update(base, 'utf8').digest('hex');
}

async function call(params: Record<string, string>, method: 'GET' | 'POST') {
  const signed = { ...params, api_sig: sign(params) };
  if (method === 'GET') {
    return (await fetch(`${API}?format=json&${new URLSearchParams(signed)}`)).json();
  }
  const body = new URLSearchParams({ ...signed, format: 'json' });
  return (await fetch(API, { method: 'POST', body })).json();
}

export default async function handler(req: any, res: any) {
  const token = req.query?.token;

  // Step 3: scrobble.
  if (req.method === 'POST') {
    const { artist, track, timestamp, sk } = req.body || {};
    if (!artist || !track || !sk) return res.status(400).json({ error: 'artist, track, sk required' });
    const data = await call({
      method: 'track.scrobble', api_key: KEY, sk,
      artist, track, timestamp: String(timestamp || Math.floor(Date.now() / 1000)),
    }, 'POST');
    return res.status(200).json(data);
  }

  // Step 2: Last.fm bounced back with a token -> trade it for a session key.
  if (token) {
    const data: any = await call({ method: 'auth.getSession', api_key: KEY, token }, 'GET');
    const sess = data?.session
      ? { sk: data.session.key, user: data.session.name }
      : { error: data?.message || 'auth failed' };
    // Callback is a top-level navigation, so return a page that stashes the key and bounces home.
    const json = JSON.stringify(sess).replace(/</g, '\\u003c');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset=utf-8><script>
      try { localStorage.setItem('spindle.lastfm', '${json}'); } catch (e) {}
      location.replace('/');
    </script>Connecting…`);
  }

  // Step 1: kick off auth. cb points back here; Last.fm appends ?token=...
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const cb = `${proto}://${req.headers.host}/api/lastfm`;
  res.writeHead(302, { Location: `https://www.last.fm/api/auth/?api_key=${KEY}&cb=${encodeURIComponent(cb)}` });
  res.end();
}
