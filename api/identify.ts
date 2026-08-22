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
  return new Response(await r.text(), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
