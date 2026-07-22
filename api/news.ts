import { fetchGoogleNewsRss } from './_googleNews';

// Same-origin proxy for Google News RSS, so the browser never talks to a
// third-party CORS proxy. Runs on Vercel's Edge runtime (global fetch, no deps).
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const currency = new URL(req.url).searchParams.get('currency') || undefined;
  const { ok, xml } = await fetchGoogleNewsRss(currency);

  if (!ok) {
    return new Response('Failed to fetch news', { status: 502 });
  }

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Cache at the edge for 5 min, serve stale for 10 min while revalidating.
      'cache-control': 's-maxage=300, stale-while-revalidate=600',
    },
  });
}
