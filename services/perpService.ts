import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Coin } from './pricesService';
import { submitPerpTx, ClaimTxError } from './stellarTx';

export class PerpError extends Error {}

export type PerpDirection = 'long' | 'short';
export type PerpStatus = 'open' | 'settled';
export type PerpOutcome = 'win' | 'lose' | 'push';

export interface PerpPosition {
  id: string;
  uid: string;
  coin: Coin;
  direction: PerpDirection;
  stake: number;
  entryPrice: number;
  durationSec: number;
  status: PerpStatus;
  expiresAt: number; // ms epoch
  openedAt: number; // ms epoch
  txHash?: string; // on-chain open receipt
  // present once settled
  outcome?: PerpOutcome;
  exitPrice?: number;
  payout?: number;
  pnl?: number;
}

export interface OpenResult {
  id: string;
  coin: Coin;
  direction: PerpDirection;
  stake: number;
  entryPrice: number;
  durationSec: number;
  expiresAt: number;
  txHash: string;
}

export interface SettleResult {
  id: string;
  outcome: PerpOutcome;
  entryPrice: number;
  exitPrice: number;
  payout: number;
  pnl: number;
}

/**
 * Open a perp position: sign+submit the on-chain open tx (memo bound to the uid
 * and exact trade params), then ask the trusted server to verify it, escrow the
 * stake and record the position. The server fetches the entry price itself.
 */
export const openPerp = async (params: {
  uid: string;
  address: string;
  coin: Coin;
  direction: PerpDirection;
  durationSec: number;
  stake: number;
  sign: (xdr: string) => Promise<string>;
}): Promise<OpenResult> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new PerpError('Please wait for your session to finish loading.');

  let txHash: string;
  try {
    txHash = await submitPerpTx(params.address, params.uid, params.coin, params.direction, params.durationSec, params.stake, params.sign);
  } catch (e) {
    throw new PerpError(e instanceof ClaimTxError ? e.message : 'Could not submit your trade.');
  }

  let res: Response;
  try {
    res = await fetch('/api/perp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'open',
        idToken,
        txHash,
        coin: params.coin,
        direction: params.direction,
        durationSec: params.durationSec,
        stake: params.stake,
      }),
    });
  } catch {
    throw new PerpError('Could not reach the perp server. Please try again.');
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new PerpError(out.error || 'Could not open position.');
  return out as OpenResult;
};

/** Settle an expired position. The server fetches the exit price and pays out. */
export const settlePerp = async (id: string): Promise<SettleResult> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new PerpError('Please wait for your session to finish loading.');

  let res: Response;
  try {
    res = await fetch('/api/perp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'settle', idToken, id }),
    });
  } catch {
    throw new PerpError('Could not reach the perp server. Please try again.');
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new PerpError(out.error || 'Could not settle position.');
  return out as SettleResult;
};

const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return 0;
};

/** Live-subscribe to the current user's perp positions (newest first). */
export const subscribeToMyPositions = (
  uid: string,
  cb: (positions: PerpPosition[]) => void
): (() => void) => {
  const q = query(collection(db, 'perpPositions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: PerpPosition[] = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          uid: data.uid,
          coin: data.coin,
          direction: data.direction,
          stake: Number(data.stake) || 0,
          entryPrice: Number(data.entryPrice) || 0,
          durationSec: Number(data.durationSec) || 0,
          status: data.status,
          expiresAt: toMs(data.expiresAt),
          openedAt: toMs(data.openedAt),
          txHash: data.txHash,
          outcome: data.outcome,
          exitPrice: data.exitPrice !== undefined ? Number(data.exitPrice) : undefined,
          payout: data.payout !== undefined ? Number(data.payout) : undefined,
          pnl: data.pnl !== undefined ? Number(data.pnl) : undefined,
        };
      });
      list.sort((a, b) => b.openedAt - a.openedAt);
      cb(list);
    },
    () => cb([])
  );
};
