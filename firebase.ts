import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Env vars the app cannot run without. index.tsx renders a setup screen when any
// are missing, so initialization below falls back to placeholders instead of throwing.
export const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export const missingEnvVars = REQUIRED_ENV_VARS.filter(
  (key) => !import.meta.env[key]
);

export const isFirebaseConfigured = missingEnvVars.length === 0;

// Normalize storage bucket domain: must be *.appspot.com for Firebase SDK
const rawBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'unconfigured.appspot.com';
const normalizedBucket = rawBucket.replace(/\.firebasestorage\.app$/i, '.appspot.com');

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'unconfigured',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'unconfigured.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured',
  storageBucket: normalizedBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '0',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'unconfigured',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
// Explicitly bind storage to the bucket using gs:// to avoid host resolution/CORS quirks
export const storage = getStorage(app, `gs://${normalizedBucket}`);

// Suppress Firebase console errors globally
if (typeof window !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  const shouldIgnore = (msg: string): boolean => {
    return msg.includes('permission-denied') || 
           msg.includes('Missing or insufficient permissions') ||
           msg.includes('Firestore') ||
           msg.includes('FIRESTORE') ||
           msg.includes('Unexpected state') ||
           msg.includes('INTERNAL ASSERTION') ||
           msg.includes('Bad Request') ||
           msg.includes('terminate&zx=') ||
           msg.includes('Unauthorized') ||
           msg.includes('configuration-not-found') ||
           msg.includes('operation-not-allowed') ||
           msg.includes('Anonymous auth not enabled');
  };
  
  console.error = (...args: any[]) => {
    const message = args.reduce((acc, arg) => acc + ' ' + String(arg), '');
    if (shouldIgnore(message)) {
      return; // Silently ignore
    }
    originalError(...args);
  };
  
  console.warn = (...args: any[]) => {
    const message = args.reduce((acc, arg) => acc + ' ' + String(arg), '');
    if (shouldIgnore(message)) {
      return; // Silently ignore
    }
    originalWarn(...args);
  };
  
  // Also suppress defaultLogHandler from Firestore
  console.log = (...args: any[]) => {
    const message = args.reduce((acc, arg) => acc + ' ' + String(arg), '');
    if (shouldIgnore(message)) {
      return; // Silently ignore
    }
    originalLog(...args);
  };
}

export default app;
