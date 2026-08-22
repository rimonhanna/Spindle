// Tests the Last.fm signing + scrobble + token-exchange paths. fetch stubbed.
// Run: node api/lastfm.test.mjs
import assert from 'node:assert';
process.env.LASTFM_API_KEY = 'KEY';
process.env.LASTFM_SECRET = 'SECRET';
const { default: handler, sign } = await import('./lastfm.ts');

// --- sign(): documented Last.fm example (api docs: ...+secret, md5 hex) ---
// sorted concat of name+value + secret, then md5. Deterministic + order-independent.
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

const real = globalThis.fetch;

// --- scrobble path: POST forwards a signed track.scrobble ---
let sent;
globalThis.fetch = async (url, opts) => {
  sent = new URLSearchParams(opts.body);
  assert.equal(sent.get('method'), 'track.scrobble');
  assert.equal(sent.get('artist'), 'Fleetwood Mac');
  assert.match(sent.get('api_sig'), /^[0-9a-f]{32}$/, 'request is signed');
  return new Response(JSON.stringify({ scrobbles: { '@attr': { accepted: 1 } } }));
};
let res = mockRes();
await handler({ method: 'POST', query: {}, headers: {}, body: { artist: 'Fleetwood Mac', track: 'Dreams', sk: 'SK' } }, res);
assert.equal(res.body.scrobbles['@attr'].accepted, 1);

// --- scrobble guard: missing fields never hit Last.fm ---
sent = undefined;
res = mockRes();
await handler({ method: 'POST', query: {}, headers: {}, body: { track: 'x', sk: 'SK' } }, res);
assert.equal(res.code, 400);
assert.equal(sent, undefined, 'incomplete scrobble is rejected before the API call');

// --- token exchange: returns a page that stores the session key ---
globalThis.fetch = async () => new Response(JSON.stringify({ session: { key: 'SK123', name: 'rimon' } }));
res = mockRes();
await handler({ method: 'GET', query: { token: 'T' }, headers: {} }, res);
assert.match(res.body, /spindle\.lastfm/, 'stashes the session under spindle.lastfm');
assert.match(res.body, /SK123/, 'includes the session key');

// --- no token: 302 to Last.fm auth ---
res = mockRes();
await handler({ method: 'GET', query: {}, headers: { host: 'localhost:3000' } }, res);
assert.equal(res.code, 302);
assert.match(res.headers.Location, /last\.fm\/api\/auth/);

globalThis.fetch = real;
console.log('ok — sign is stable, scrobble is signed + guarded, token exchange + login redirect work');
