// Test the proxy in isolation: fetch is stubbed, no AudD quota used.
// Run: node api/identify.test.mjs
import assert from 'node:assert';
import handler from './identify.ts';

const real = globalThis.fetch;
let seen;
globalThis.fetch = async (url, opts) => {
  seen = { url, body: opts.body };
  assert.equal(url, 'https://api.audd.io/');
  assert.ok(opts.body instanceof FormData, 'posts multipart FormData');
  assert.equal(opts.body.get('api_token'), 'test-token');
  assert.ok(opts.body.get('file'), 'includes the audio file');
  return new Response(JSON.stringify({ status: 'success', result: { title: 'Dreams', artist: 'Fleetwood Mac' } }));
};
process.env.AUDD_API_TOKEN = 'test-token';

// forwards audio and passes the match back
const ok = await handler(new Request('http://x/api/identify', { method: 'POST', body: new Uint8Array(2048) }));
assert.equal(ok.status, 200);
assert.equal((await ok.json()).result.title, 'Dreams');

// non-POST is rejected without calling AudD
seen = undefined;
const bad = await handler(new Request('http://x/api/identify', { method: 'GET' }));
assert.equal(bad.status, 405);
assert.equal(seen, undefined, 'GET never reaches AudD');

globalThis.fetch = real;
console.log('ok — proxy forwards multipart audio, returns the match, rejects non-POST');
