// Spindle — AudD proxy. Hides the API key; the browser posts raw audio here.
// Vercel Edge function (web-standard APIs, same shape as a Supabase edge function later).
// Set AUDD_API_TOKEN in the Vercel project env. Empty = AudD's rate-limited demo mode.
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const form = new FormData();
  form.set('api_token', process.env.AUDD_API_TOKEN ?? '');
  form.set('return', 'apple_music,spotify');
  form.set('file', new Blob([await req.arrayBuffer()]), 'sample.webm');

  const r = await fetch('https://api.audd.io/', { method: 'POST', body: form });
  const data = await r.json();
  // AudD only returns the aggregated song_link (Odesli's public API is now paywalled),
  // so resolve per-service links by parsing the lis.tn page it points at. Best-effort:
  // if this fails, the match still renders with what AudD gave us.
  const sl = data?.result?.song_link;
  if (sl) {
    try {
      // AudD hands us the all-services page; scrape the per-service URLs out of it.
      const html = await (await fetch(sl)).text();
      const pick = (re: RegExp) => (html.match(re) ?? [])[0];
      const found: Record<string, string> = Object.fromEntries(Object.entries({
        deezer: pick(/https:\/\/(?:www\.)?deezer\.com\/(?:track|album)\/[0-9]+/),
        tidal: pick(/https?:\/\/(?:www\.)?tidal\.com\/track\/[0-9]+/),
      }).filter(([, u]) => u));
      if (!found.youtubeMusic) {
        // ponytail: unofficial YT Music search endpoint (no key); first videoId = top result.
        // If Odesli's page missed YT Music, ask YT Music itself with the matched names.
        const y = await fetch('https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30&prettyPrint=false', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0', origin: 'https://music.youtube.com' },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00' } },
            query: `${data.result.artist} ${data.result.title}`,
          }),
        });
        if (y.ok) {
          const id = (await y.text()).match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1];
          if (id) {
            found.youtubeMusic = `https://music.youtube.com/watch?v=${id}`;
            found.youtube ||= `https://www.youtube.com/watch?v=${id}`;
          }
        }
      }
      if (Object.keys(found).length) data.result.platforms = found;
    } catch {}
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
