import { Horizon, TransactionBuilder, Operation, Memo, BASE_FEE } from '@stellar/stellar-sdk';
import { HORIZON_URL, STELLAR_NETWORK } from '../contexts/StellarWalletContext';

const server = new Horizon.Server(HORIZON_URL);
const IS_TESTNET = STELLAR_NETWORK.includes('Test SDF Network');

// Memo the server checks to confirm a tx is a Rivarly daily claim (not some
// unrelated payment the user happened to make).
export const CLAIM_MEMO = 'rvly:claim';

// Fund a brand-new testnet account via friendbot so it can pay tx fees.
async function fundWithFriendbot(address: string): Promise<void> {
  await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
}

async function loadAccountFunded(address: string) {
  try {
    return await server.loadAccount(address);
  } catch (e: any) {
    const notFound = e?.response?.status === 404 || e?.name === 'NotFoundError';
    if (notFound && IS_TESTNET) {
      await fundWithFriendbot(address);
      // Friendbot can take a moment; retry a few times.
      for (let i = 0; i < 5; i++) {
        try {
          return await server.loadAccount(address);
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    throw e;
  }
}

export class ClaimTxError extends Error {}

/**
 * Build, sign and submit the daily-claim transaction. It's a side-effect-free
 * bumpSequence op — the user only pays the tiny network fee, which is the point:
 * a real on-chain action gating the daily reward. Returns the tx hash.
 *
 * @param address  connected wallet public key
 * @param sign     signs an XDR with the wallet, returns signed XDR
 */
export async function submitDailyClaimTx(
  address: string,
  sign: (xdr: string) => Promise<string>
): Promise<string> {
  let account;
  try {
    account = await loadAccountFunded(address);
  } catch {
    throw new ClaimTxError(
      IS_TESTNET
        ? 'Could not load your testnet account. Please try again in a moment.'
        : 'Your account needs a small XLM balance to cover the network fee.'
    );
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK,
  })
    // No-op operation: bumping to a value below the current sequence changes
    // nothing on-chain, so the only cost is the base network fee.
    .addOperation(Operation.bumpSequence({ bumpTo: '0' }))
    .addMemo(Memo.text(CLAIM_MEMO))
    .setTimeout(120)
    .build();

  let signedXdr: string;
  try {
    signedXdr = await sign(tx.toXDR());
  } catch {
    throw new ClaimTxError('Transaction was not signed.');
  }

  try {
    const signed = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK);
    const res = await server.submitTransaction(signed as any);
    return res.hash;
  } catch {
    throw new ClaimTxError('The network rejected the transaction. Please try again.');
  }
}
