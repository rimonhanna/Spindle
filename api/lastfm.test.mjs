// Tests the Last.fm signing + all five jobs. fetch stubbed — no API quota used.
// Run: node api/lastfm.test.mjs
import assert from 'node:assert';
process.env.LASTFM_API_KEY = 'KEY';
process.env.LASTFM_SECRET = 'SECRET';
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_ANON_KEY = 'ANON';
process.env.SUPABASE_SERVICE_KEY = 'SERVICE';
const { default: handler, sign, stampState } = await import('./lastfm.ts');

// --- sign(): documented Last.fm example (api docs: ...+secret, md5 hex) ---
const a = sign({ b: '2', a: '1' }, 'x');
const b = sign({ a: '1', b: '2' }, 'x');
assert.equal(a, b, 'param order does not change the signature');
assert.match(a, /^[0-9a-f]{32}$/, 'md5 hex');
assert.equal(sign({ a: '1' }, ''), '8a8bb7cd343aa2ad99b7d762030857a2', 'md5("a1") matches known vector');

function mockRes() {
  return { code: 200, headers: {}, body: null,
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(c, h) { this.code = c; Object.assign(this.headers, h); },
    end(s) { this.body = s ?? this.body; } };
}

const BEARER = 'Bearer goodjwt';
const real = globalThis.fetch;
let calls = []; // every stubbed fetch: {url, opts}
let profileRow;
let lfReply = { scrobbles: { '@attr': { accepted: 1 } } }; // what Last.fm returns this test

globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  if (String(url).includes('ws.audioscrobbler.com')) {
    return new Response(JSON.stringify(lfReply));
  }
  if (String(url).includes('/auth/v1/user')) {
    const jwt = opts.headers.authorization;
    if (jwt !== BEARER) return new Response('unauthorized', { status: 401 });
    return new Response(JSON.stringify({ id: 'u1', email: 'me@x.co' }));
  }
  if (String(url).includes('/rest/v1/profiles')) {
    if (opts.method === 'POST') {
      profileRow = JSON.parse(opts.body); // capture upserts
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(profileRow ? [profileRow] : []));
  }
  throw new Error('unexpected fetch ' + url);
};

// --- scrobble: bearer -> profile sk -> signed track.scrobble (sk never comes from the browser) ---
profileRow = { id: 'u1', lastfm_sk: 'SK123', lastfm_user: 'rimon' };
calls = [];
let res = mockRes();
await handler({ method: 'POST', query: {}, headers: { authorization: BEARER },
  body: { artist: 'Fleetwood Mac', track: 'Dreams', album: 'Rumours', timestamp: 1000 } }, res);
assert.equal(res.body.scrobbles['@attr'].accepted, 1);
const lfCall = calls.find(c => c.url.includes('audioscrobbler'));
const sent = new URLSearchParams(lfCall.opts.body);
assert.equal(sent.get('method'), 'track.scrobble');
assert.equal(sent.get('artist'), 'Fleetwood Mac');
assert.equal(sent.get('sk'), 'SK123', 'session key comes from the profile row');
assert.equal(sent.get('album'), 'Rumours', 'album is passed through when present');
assert.match(sent.get('api_sig'), /^[0-9a-f]{32}$/, 'request is signed');

// --- scrobble guards: bad fields / no jwt / no stored key never reach Last.fm ---
for (const [req, why] of [
  [{ method: 'POST', query: {}, headers: {}, body: { artist: 'A' } }, 'missing track'],
  [{ method: 'POST', query: {}, headers: {}, body: { artist: 'A', track: 'T' } }, 'no jwt'],
  [{ method: 'POST', query: {}, headers: { authorization: 'Bearer evil' }, body: { artist: 'A', track: 'T' } }, 'forged jwt'],
]) {
  calls = [];
  res = mockRes();
  await handler(req, res);
  assert.ok(res.code >= 400, `${why} is rejected`);
  assert.ok(!calls.some(c => c.url.includes('audioscrobbler')), `${why}: nothing sent to Last.fm`);
}
profileRow = { id: 'u1', lastfm_sk: null, lastfm_user: null };
res = mockRes();
await handler({ method: 'POST', query: {}, headers: { authorization: BEARER }, body: { artist: 'A', track: 'T' } }, res);
assert.equal(res.code, 409, 'connected user required to scrobble');

// --- start: hands back a Last.fm auth URL carrying the user id as state ---
profileRow = null;
res = mockRes();
await handler({ method: 'POST', query: {}, headers: { host: 'localhost:3000', authorization: BEARER },
  body: { action: 'start' } }, res);
assert.match(res.body.url, /last\.fm\/api\/auth/, 'points at the Last.fm auth page');
assert.match(new URL(res.body.url).searchParams.get('cb'), /state=u1\.[0-9a-f]{32}$/, 'state carries the user id + HMAC');
res = mockRes();
await handler({ method: 'POST', query: {}, headers: {}, body: { action: 'start' } }, res);
assert.equal(res.code, 401, 'start requires sign-in');

// --- token exchange: stores the session key on the profile, never echoes it into the page ---
lfReply = { session: { key: 'SK123', name: 'rimon' } };
calls = [];
res = mockRes();
await handler({ method: 'GET', query: { token: 'T', state: stampState('u1') }, headers: {} }, res);
assert.equal(profileRow.lastfm_sk, 'SK123', 'session key landed on the profile row');
assert.equal(profileRow.lastfm_user, 'rimon');
assert.equal(res.code, 200);
assert.doesNotMatch(String(res.body), /SK123/, 'the secret is not echoed back to the browser');

// --- forged or malformed state (no valid HMAC) refuses to store anything ---
for (const bad of ['u1.deadbeef', 'u1', '', null]) {
  profileRow = null;
  res = mockRes();
  await handler({ method: 'GET', query: { token: 'T', state: bad }, headers: {} }, res);
  assert.equal(profileRow, null, `state "${bad}" writes no profile`);
}

// --- status + disconnect ---
profileRow = { id: 'u1', lastfm_sk: 'SK123', lastfm_user: 'rimon' };
res = mockRes();
await handler({ method: 'GET', query: { status: '1' }, headers: { authorization: BEARER } }, res);
assert.deepEqual(res.body, { connected: true, user: 'rimon' });
res = mockRes();
await handler({ method: 'POST', query: {}, headers: { authorization: BEARER }, body: { action: 'disconnect' } }, res);
assert.equal(profileRow.lastfm_sk, null, 'disconnect wipes the stored key');

// --- bare GET explains itself instead of dead-ending in an anonymous connect ---
res = mockRes();
await handler({ method: 'GET', query: {}, headers: {} }, res);
assert.equal(res.code, 400);

globalThis.fetch = real;
console.log('ok — sign stable; scrobble uses the server-side key and is jwt-gated; start/exchange/status/disconnect behave');
