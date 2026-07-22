import type { NewsItem } from '../types';

// Public crypto news from Google News RSS — free and keyless.
//
// The browser can't fetch Google News RSS directly (no CORS headers), so requests
// go to our own same-origin endpoint /api/news, which fetches the RSS server-side
// (Vercel Edge function in api/news.ts; a Vite middleware serves it in dev). No
// third-party proxy involved.

// Public news is always available.
export const hasPublicNews = true;

const toIso = (pubDate: string): string => {
  const t = Date.parse(pubDate);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
};

const parseRss = (xml: string, category: string): NewsItem[] => {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return [];

  return Array.from(doc.querySelectorAll('item')).map((item, i) => {
    const rawTitle = item.querySelector('title')?.textContent?.trim() || '';
    const link = item.querySelector('link')?.textContent?.trim() || '';
    const guid = item.querySelector('guid')?.textContent?.trim();
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
    const source = item.querySelector('source')?.textContent?.trim() || 'Google News';

    // Google News formats titles as "Headline - Source"; drop the source suffix.
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle;

    return {
      id: `gn-${guid || link || `${category}-${i}`}`,
      title,
      image: '', // Google News RSS carries no images; the card hides the image block
      description: '',
      link,
      source,
      category,
      publishedAt: toIso(pubDate),
      createdAt: toIso(pubDate),
      createdBy: 'google-news',
    };
  });
};

/**
 * Fetch public crypto news. Pass a currency code (e.g. "XLM", "BTC") to narrow
 * results to that asset. Returns [] on any network/parse error.
 */
export const fetchPublicNews = async (currency?: string): Promise<NewsItem[]> => {
  const code = currency && currency !== 'ALL' ? currency : undefined;
  const category = code || 'Crypto';

  try {
    const qs = code ? `?currency=${encodeURIComponent(code)}` : '';
    const res = await fetch(`/api/news${qs}`);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, category);
  } catch {
    return [];
  }
};

/**
 * Fetch Stellar-specific news. Kept separate so XLM coverage can be merged into
 * the default feed even when the general feed surfaces little Stellar activity.
 */
export const fetchStellarNews = (): Promise<NewsItem[]> => fetchPublicNews('XLM');
