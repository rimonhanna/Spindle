// Test the proxy in isolation: fetch is stubbed, no AudD quota used.
// Run: node api/identify.test.mjs
import assert from 'node:assert';
import handler from './identify.ts';

const real = globalThis.fetch;
let seen;
globalThis.fetch = async (url, opts) => {
  url = String(url);
  if (url.includes('lis.tn')) {
    // song_link page scrape: Deezer/Tidal live in the page HTML (no YouTube links this time).
    return new Response(`<!doctype html>blabla
      https://www.deezer.com/track/109701582 blabla
      https://www.tidal.com/track/52266223 blabla`);
  }
  if (url.includes('music.youtube.com/youtubei')) {
    // YT Music search fallback: top result's videoId.
    assert.equal(JSON.parse(opts.body).query, 'Fleetwood Mac Dreams');
    return new Response('{"contents":[{"playlistItemData":{"videoId":"L3wKzyIN1yk"}}]}');
  }
  seen = { url, body: opts.body };
  assert.equal(url, 'https://api.audd.io/');
  assert.ok(opts.body instanceof FormData, 'posts multipart FormData');
  assert.equal(opts.body.get('api_token'), 'test-token');
  assert.ok(opts.body.get('file'), 'includes the audio file');
  return new Response(JSON.stringify({
    status: 'success',
    result: { title: 'Dreams', artist: 'Fleetwood Mac', song_link: 'https://lis.tn/Dreams' },
  }));
};
process.env.AUDD_API_TOKEN = 'test-token';

// forwards audio and passes the match back with resolved platform links
const ok = await handler(new Request('http://x/api/identify', { method: 'POST', body: new Uint8Array(2048) }));
assert.equal(ok.status, 200);
const body = await ok.json();
assert.equal(body.result.title, 'Dreams');
assert.equal(body.result.platforms.youtubeMusic, 'https://music.youtube.com/watch?v=L3wKzyIN1yk');
assert.equal(body.result.platforms.youtube, 'https://www.youtube.com/watch?v=L3wKzyIN1yk');
assert.equal(body.result.platforms.deezer, 'https://www.deezer.com/track/109701582');
assert.equal(body.result.platforms.tidal, 'https://www.tidal.com/track/52266223');

// non-POST is rejected without calling AudD
seen = undefined;
const bad = await handler(new Request('http://x/api/identify', { method: 'GET' }));
assert.equal(bad.status, 405);
assert.equal(seen, undefined, 'GET never reaches AudD');

globalThis.fetch = real;
console.log('ok — proxy forwards multipart audio, returns the match, rejects non-POST');
