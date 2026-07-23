// Buffer/global polyfills for @stellar/stellar-sdk (XDR encoding) in the browser.
import { Buffer } from 'buffer';
(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
(globalThis as any).global = (globalThis as any).global || globalThis;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SetupNotice from './components/SetupNotice';
import { isFirebaseConfigured, missingEnvVars } from './firebase';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {!isFirebaseConfigured && <SetupNotice missing={missingEnvVars} />}
    <App />
  </React.StrictMode>
);
