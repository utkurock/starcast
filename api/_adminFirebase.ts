// Firebase Admin singleton for the trusted reward endpoints. Writes bypass
// Firestore security rules, so points can only be awarded here (never from the
// client). Requires FIREBASE_SERVICE_ACCOUNT — the service-account JSON, as a
// single-line string — in the server environment.

import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let cached: Firestore | null = null;

export function getAdminDb(): Firestore | null {
  if (cached) return cached;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  let creds: any;
  try {
    creds = JSON.parse(raw);
    // Support keys stored with escaped newlines.
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
  } catch {
    return null;
  }

  const app: App = getApps().length ? getApps()[0] : initializeApp({ credential: cert(creds) });
  cached = getFirestore(app);
  return cached;
}
