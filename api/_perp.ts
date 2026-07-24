// Trusted Perp (price up/down) game logic. Opening a position requires a real
// on-chain XLM tx from the user's linked wallet (memo hash-bound to the trade),
// verified on Horizon — the same proof-of-action model as bets/claims. Stakes
// and payouts are still points; the tx is the on-chain receipt for the trade.
//
// Fairness/anti-cheat: the server fetches BOTH the entry price (at open) and the
// exit price (at settle) itself — the client never supplies a price, a stake
// result, or the outcome. The stake is escrowed (deducted) on open, so a user
// can never open beyond their balance, and settlement is guarded against
// double-payout inside a Firestore transaction. Each open tx is single-use
// (perpTx lock). Payout is double-or-nothing: correct direction returns 2x the
// stake (net +stake), wrong loses the stake, an exactly-flat price refunds it.

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, verifyUid } from './_adminFirebase';
import { getSpotPrice, COINS, type Coin } from './_prices';
import { bumpDailyLeaderboard } from './_points';
import { verifyAppTx, perpMemoHash } from './_serverStellar';

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const DURATIONS = new Set([60, 300, 900]); // 1 / 5 / 15 minutes
const MIN_STAKE = 1;
const MAX_STAKE = 100_000;
const MAX_OPEN = 10; // concurrent open positions per user
const isCoin = (v: unknown): v is Coin => typeof v === 'string' && (COINS as string[]).includes(v);
const isSafeId = (s: string) => /^[A-Za-z0-9_-]{1,128}$/.test(s);

export async function handlePerpOpen(input: {
  idToken?: string;
  txHash?: string;
  coin?: string;
  direction?: string;
  durationSec?: number;
  stake?: number;
}): Promise<HandlerResult> {
  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Perps are not available right now.' } };

  const uid = await verifyUid(input.idToken);
  if (!uid) return { status: 401, body: { error: 'Not signed in.' } };

  const coin = input.coin;
  const direction = input.direction === 'long' || input.direction === 'short' ? input.direction : '';
  const durationSec = Number(input.durationSec);
  const stake = Math.floor(Number(input.stake));
  const txHash = typeof input.txHash === 'string' ? input.txHash : '';

  if (!isCoin(coin)) return { status: 400, body: { error: 'Unknown coin.' } };
  if (!direction) return { status: 400, body: { error: 'Pick long or short.' } };
  if (!DURATIONS.has(durationSec)) return { status: 400, body: { error: 'Invalid duration.' } };
  if (!Number.isFinite(stake) || stake < MIN_STAKE) return { status: 400, body: { error: `Minimum stake is ${MIN_STAKE} points.` } };
  if (stake > MAX_STAKE) return { status: 400, body: { error: `Maximum stake is ${MAX_STAKE} points.` } };
  if (!txHash || !isSafeId(txHash)) return { status: 400, body: { error: 'Invalid transaction.' } };

  // Require a linked wallet and verify the on-chain trade tx (memo hash-binds it
  // to this uid + exact trade params), before touching any balance.
  const userRef = db.collection('users').doc(uid);
  const preSnap = await userRef.get();
  const preData: any = preSnap.exists ? preSnap.data() : {};
  const wallet: string | undefined = preData.walletAddress;
  if (!wallet) return { status: 400, body: { error: 'Connect and link a Stellar wallet first.' } };

  const verify = await verifyAppTx({ txHash, expectedSource: wallet, expectedMemoHash: perpMemoHash(uid, coin, direction, durationSec, stake) });
  if (!verify.ok) return { status: 400, body: { error: verify.reason || 'Transaction could not be verified.' } };

  // Fetch the entry price BEFORE touching balance — if the feed is down we abort
  // without escrowing anything.
  const entryPrice = await getSpotPrice(coin);
  if (entryPrice === null) return { status: 502, body: { error: 'Price feed unavailable. Try again.' } };

  const posRef = db.collection('perpPositions').doc();
  const lockRef = db.collection('perpTx').doc(txHash); // single-use guard per tx
  const nowMs = Date.now();
  const expiresAt = Timestamp.fromMillis(nowMs + durationSec * 1000);

  try {
    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) throw new Error('REPLAY');
      const userSnap = await tx.get(userRef);
      const userData: any = userSnap.exists ? userSnap.data() : {};
      const points = Number(userData.points || 0);
      if (points < stake) throw new Error('INSUFFICIENT');
      if (Number(userData.openPerpCount || 0) >= MAX_OPEN) throw new Error('TOO_MANY');

      tx.set(
        userRef,
        { points: FieldValue.increment(-stake), openPerpCount: FieldValue.increment(1) },
        { merge: true }
      );
      tx.set(lockRef, { uid, posId: posRef.id, at: FieldValue.serverTimestamp() });
      tx.set(posRef, {
        uid,
        coin,
        direction,
        stake,
        entryPrice,
        durationSec,
        leverage: 1,
        status: 'open',
        txHash,
        walletAddress: wallet,
        openedAt: FieldValue.serverTimestamp(),
        expiresAt,
      });
    });
  } catch (e: any) {
    if (e?.message === 'REPLAY') return { status: 409, body: { error: 'This transaction has already been used.' } };
    if (e?.message === 'INSUFFICIENT') return { status: 400, body: { error: 'Not enough points to stake.' } };
    if (e?.message === 'TOO_MANY') return { status: 409, body: { error: `You already have ${MAX_OPEN} open positions.` } };
    return { status: 500, body: { error: 'Could not open position.' } };
  }

  return {
    status: 200,
    body: { id: posRef.id, coin, direction, stake, entryPrice, durationSec, expiresAt: expiresAt.toMillis(), txHash },
  };
}

export async function handlePerpSettle(input: { idToken?: string; id?: string }): Promise<HandlerResult> {
  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Perps are not available right now.' } };

  const uid = await verifyUid(input.idToken);
  if (!uid) return { status: 401, body: { error: 'Not signed in.' } };

  const id = typeof input.id === 'string' ? input.id : '';
  if (!id || !isSafeId(id)) return { status: 400, body: { error: 'Invalid position.' } };

  const posRef = db.collection('perpPositions').doc(id);
  const posSnap = await posRef.get();
  if (!posSnap.exists) return { status: 404, body: { error: 'Position not found.' } };
  const pos: any = posSnap.data();

  if (pos.uid !== uid) return { status: 403, body: { error: 'Not your position.' } };
  if (pos.status !== 'open') return { status: 409, body: { error: 'Position already settled.' } };

  const expiresMs = pos.expiresAt?.toMillis ? pos.expiresAt.toMillis() : 0;
  if (!expiresMs || Date.now() < expiresMs) {
    return { status: 425, body: { error: 'Position has not expired yet.' } };
  }

  // Exit price is fetched by the server at settle time.
  const exitPrice = await getSpotPrice(pos.coin as Coin);
  if (exitPrice === null) return { status: 502, body: { error: 'Price feed unavailable. Try again.' } };

  const stake = Number(pos.stake) || 0;
  const entryPrice = Number(pos.entryPrice) || 0;
  let outcome: 'win' | 'lose' | 'push';
  if (exitPrice === entryPrice) outcome = 'push';
  else if (pos.direction === 'long') outcome = exitPrice > entryPrice ? 'win' : 'lose';
  else outcome = exitPrice < entryPrice ? 'win' : 'lose';

  // Double-or-nothing: win returns 2x, push refunds 1x, lose returns 0.
  const payout = outcome === 'win' ? stake * 2 : outcome === 'push' ? stake : 0;
  const net = payout - stake;

  const userRef = db.collection('users').doc(uid);
  let userData: any = {};
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(posRef);
      const p: any = fresh.data();
      if (!fresh.exists || p.status !== 'open') throw new Error('RACE'); // guard double-settle
      const userSnap = await tx.get(userRef);
      userData = userSnap.exists ? userSnap.data() : {};

      tx.set(
        userRef,
        {
          points: FieldValue.increment(payout),
          openPerpCount: FieldValue.increment(-1),
          perpWins: FieldValue.increment(outcome === 'win' ? 1 : 0),
          perpCount: FieldValue.increment(1),
        },
        { merge: true }
      );
      tx.update(posRef, {
        status: 'settled',
        outcome,
        exitPrice,
        payout,
        pnl: net,
        settledAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (e: any) {
    if (e?.message === 'RACE') return { status: 409, body: { error: 'Position already settled.' } };
    return { status: 500, body: { error: 'Could not settle position.' } };
  }

  if (net > 0) await bumpDailyLeaderboard(db, uid, userData, net);

  return { status: 200, body: { id, outcome, entryPrice, exitPrice, payout, pnl: net } };
}
