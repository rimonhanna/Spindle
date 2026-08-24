// Spindle — Last.fm auth + scrobble. Node runtime (needs md5 for request signing;
// the shared secret never leaves the server). The Last.fm session key lives in the
// user's Supabase `profiles` row — browsers never see it, only this function does,
// via the service key. Jobs by method/body/query:
//   POST {action:'start'}    + Bearer jwt -> {url} Last.fm auth page (state = your user id)
//   GET  ?token&state        -> trade token for a session key, store it on profiles
//   GET  ?status=1           + Bearer jwt -> {connected, user}
//   POST {action:'disconnect'} + Bearer jwt -> wipe the stored session
//   POST {artist,track,...}  + Bearer jwt -> signed track.scrobble using the stored key
// Env: LASTFM_API_KEY, LASTFM_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const KEY = process.env.LASTFM_API_KEY ?? '';
const SECRET = process.env.LASTFM_SECRET ?? '';
const API = 'https://ws.audioscrobbler.com/2.0/';
const SU = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

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

// Verify a browser JWT against Supabase; returns the user or null.
async function whoami(authorization?: string) {
  if (!authorization?.startsWith('Bearer ') || !SU || !ANON) return null;
  const r = await fetch(`${SU}/auth/v1/user`, {
    headers: { apikey: ANON, authorization },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u?.id ? u : null;
}

function serviceHeaders() {
  return { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' };
}

async function getProfile(userId: string) {
  if (!SU || !SERVICE) return {};
  const r = await fetch(
    `${SU}/rest/v1/profiles?id=eq.${userId}&select=lastfm_sk,lastfm_user`,
    { headers: serviceHeaders() },
  );
  const rows = await r.json().catch(() => []);
  return rows?.[0] ?? {};
}

// State passed through Last.fm's callback: userId + HMAC so a forged state
// can't bind someone else's session key to another user's profile row.
export function stampState(userId: string): string {
  const mac = createHmac('sha256', SERVICE || 'unset').update(userId).digest('hex').slice(0, 32);
  return `${userId}.${mac}`;
}
function readState(state: unknown): string | null {
  if (typeof state !== 'string') return null;
  const i = state.lastIndexOf('.');
  if (i < 0) return null;
  const userId = state.slice(0, i);
  const expect = stampState(userId).slice(userId.length + 1);
  const a = Buffer.from(state.slice(i + 1));
  const b = Buffer.from(expect);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

async function setProfile(userId: string, sk: string | null, user: string | null): Promise<boolean> {
  if (!SU || !SERVICE) return false;
  const r = await fetch(`${SU}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...serviceHeaders(), prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: userId, lastfm_sk: sk, lastfm_user: user }),
  });
  return r.ok;
}

function esc(s: any) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])); }

function page(html: string) {
  return `<!doctype html><meta charset=utf-8>${html}`;
}

export default async function handler(req: any, res: any) {
  // --- Step 3: scrobble (and other POST jobs) ---
  if (req.method === 'POST') {
    const body = req.body || {};
    const user = await whoami(req.headers?.authorization);

    if (body.action === 'start') {
      if (!user) return res.status(401).json({ error: 'sign in first' });
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const cb = `${proto}://${req.headers.host}/api/lastfm?state=${stampState(user.id)}`;
      return res.status(200).json({
        url: `https://www.last.fm/api/auth/?api_key=${KEY}&cb=${encodeURIComponent(cb)}`,
      });
    }

    if (body.action === 'disconnect') {
      if (!user) return res.status(401).json({ error: 'sign in first' });
      await setProfile(user.id, null, null);
      return res.status(200).json({ ok: true });
    }

    if (!body.artist || !body.track) {
      return res.status(400).json({ error: 'artist, track required' });
    }
    if (!user) return res.status(401).json({ error: 'sign in first' });
    const profile = await getProfile(user.id);
    if (!profile.lastfm_sk) return res.status(409).json({ error: 'connect Last.fm first' });
    const data = await call({
      method: 'track.scrobble', api_key: KEY, sk: profile.lastfm_sk,
      artist: body.artist, track: body.track,
      ...(body.album ? { album: body.album } : {}),
      timestamp: String(body.timestamp || Math.floor(Date.now() / 1000)),
    }, 'POST');
    return res.status(200).json(data);
  }

  // --- Step 2: Last.fm bounced back with a token + our state (the Spindle user id) ---
  const { token, state, status } = req.query ?? {};

  if (token) {
    const userId = readState(state);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (!userId) {
      return res.end(page('Connect from the Spindle app while signed in. <a href="/">Back</a>'));
    }
    const data: any = await call({ method: 'auth.getSession', api_key: KEY, token }, 'GET');
    if (!data?.session) {
      return res.end(page(`Last.fm connect failed: ${esc(data?.message)}. <a href="/">Back</a>`));
    }
    if (!await setProfile(userId, data.session.key, data.session.name)) {
      return res.end(page('Could not save the connection. <a href="/">Back</a>'));
    }
    return res.end(page(`Connected as ${esc(data.session.name)}. <script>location.replace('/')</script><a href="/">Continue</a>`));
  }

  // --- Status probe: is the signed-in user connected? ---
  if (status) {
    const user = await whoami(req.headers?.authorization);
    if (!user) return res.status(401).json({ error: 'sign in first' });
    const profile = await getProfile(user.id);
    return res.status(200).json({ connected: !!profile.lastfm_sk, user: profile.lastfm_user ?? null });
  }

  // Connecting starts in the app (needs a signed-in user); nothing to do on a bare GET.
  return res.status(400).json({ error: 'connect from the app: POST {action:"start"}' });
}
