// Server-side Stellar helpers used by the trusted reward endpoints. Verifies a
// transaction on Horizon (via REST, no SDK) so points can only be awarded for a
// genuine, recent on-chain action from the user's linked wallet.

const IS_MAINNET = (process.env.VITE_STELLAR_NETWORK || process.env.STELLAR_NETWORK || '').toLowerCase() === 'mainnet';
const HORIZON_URL = IS_MAINNET ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

// Memos the client stamps on reward transactions.
export const CLAIM_MEMO = 'rvly:claim';
export const betMemo = (marketId: string, side: 'yes' | 'no') => `rvly:bet:${side}:${marketId}`.slice(0, 28);

const RECENT_MS = 15 * 60 * 1000; // a claim tx must be at most 15 minutes old

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  createdAt?: string;
}

/**
 * Verify a transaction hash on-chain: it must be successful, sourced from the
 * expected account, carry the expected text memo, and be recent (anti-replay).
 */
export async function verifyAppTx(opts: {
  txHash: string;
  expectedSource: string;
  expectedMemo: string;
  maxAgeMs?: number;
}): Promise<VerifyResult> {
  const { txHash, expectedSource, expectedMemo, maxAgeMs = RECENT_MS } = opts;
  let res: Response;
  try {
    res = await fetch(`${HORIZON_URL}/transactions/${encodeURIComponent(txHash)}`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, reason: 'Could not reach the Stellar network to verify the transaction.' };
  }

  if (res.status === 404) return { ok: false, reason: 'Transaction not found on-chain yet.' };
  if (!res.ok) return { ok: false, reason: 'Could not verify the transaction.' };

  const tx: any = await res.json();
  if (!tx.successful) return { ok: false, reason: 'The transaction did not succeed.' };
  if (tx.source_account !== expectedSource) return { ok: false, reason: 'Transaction is not from your linked wallet.' };
  if (tx.memo_type !== 'text' || tx.memo !== expectedMemo) return { ok: false, reason: 'Transaction is not a valid Rivarly reward action.' };

  const created = Date.parse(tx.created_at);
  if (Number.isFinite(maxAgeMs) && Date.now() - created > maxAgeMs) {
    return { ok: false, reason: 'Transaction is too old; please try claiming again.' };
  }
  return { ok: true, createdAt: tx.created_at };
}
