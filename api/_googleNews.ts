// Server-side Google News RSS fetcher, shared by the Vercel function (api/news.ts)
// and the Vite dev middleware (vite.config.ts). Files prefixed with "_" are not
// treated as routes by Vercel.

export const QUERY_FOR: Record<string, string> = {
  XLM: 'Stellar Lumens XLM crypto',
  BTC: 'Bitcoin crypto',
  ETH: 'Ethereum crypto',
  SOL: 'Solana crypto',
  XRP: 'XRP Ripple crypto',
};

export function googleNewsRssUrl(currency?: string): string {
  const code = currency && currency !== 'ALL' ? currency : '';
  const query = code ? QUERY_FOR[code] || `${code} crypto` : 'cryptocurrency';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

// Fetch the RSS document server-side (no CORS constraints here).
export async function fetchGoogleNewsRss(
  currency?: string
): Promise<{ ok: boolean; xml: string }> {
  try {
    const res = await fetch(googleNewsRssUrl(currency), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Rivarly/1.0; +https://github.com/utkurock/rivarly)' },
    });
    if (!res.ok) return { ok: false, xml: '' };
    return { ok: true, xml: await res.text() };
  } catch {
    return { ok: false, xml: '' };
  }
}
