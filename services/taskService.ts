import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';

// Task rewards are granted ONLY by the trusted server endpoint (/api/task),
// which reads point values from the shared catalog and (for on-chain tasks)
// verifies the tx. The client just reads completion state and triggers claims.

/** Live-subscribe to the set of task ids this user has already completed. */
export const subscribeToCompletedTasks = (uid: string, cb: (ids: Set<string>) => void): (() => void) =>
  onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      const map = (snap.exists() ? (snap.data() as any).completedTasks : null) || {};
      cb(new Set(Object.keys(map)));
    },
    () => cb(new Set())
  );

export class TaskError extends Error {}

/**
 * Ask the server to award a task. For on-chain tasks pass the verified tx hash.
 * Identity is proven with a Firebase ID token, not a client-supplied uid.
 */
export const completeTask = async (taskId: string, txHash?: string): Promise<{ awarded: number }> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new TaskError('Please wait for your session to finish loading.');

  let res: Response;
  try {
    res = await fetch('/api/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken, taskId, txHash }),
    });
  } catch {
    throw new TaskError('Could not reach the tasks server. Please try again.');
  }

  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new TaskError(out.error || 'Task could not be completed.');
  return { awarded: out.awarded };
};
