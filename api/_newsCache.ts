// Trusted news-cache refresh. Writes newsCache/{view} from the server's own
// aggregated feed (getNews), never from client-supplied content — so the cache
// can be locked server-only in the rules and can't be poisoned with phishing
// items. The client just asks to refresh a view by name.

import { getNews } from './_news';
import { getAdminDb } from './_adminFirebase';
import { FieldValue } from 'firebase-admin/firestore';

const VIEWS = new Set(['ALL', 'XLM', 'BTC', 'ETH', 'SOL']);

export async function refreshNewsCache(input: { view?: string }): Promise<{ status: number; body: Record<string, unknown> }> {
  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Not available.' } };

  const view = typeof input?.view === 'string' && VIEWS.has(input.view) ? input.view : 'ALL';
  const items = await getNews(view === 'ALL' ? undefined : view);
  if (!items.length) return { status: 200, body: { ok: true, count: 0 } };

  await db.collection('newsCache').doc(view).set(
    { items, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { status: 200, body: { ok: true, count: items.length } };
}
