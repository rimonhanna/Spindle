// Spindle — hands the browser its Supabase connection settings.
// Both values are public-by-design (RLS is the gate); keeping them in env vars
// just keeps them out of the repo so self-hosters plug in their own project.
export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  return new Response(
    JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}
