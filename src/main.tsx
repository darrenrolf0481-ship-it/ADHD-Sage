import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SageProvider } from './components/SageProvider';
import './index.css';

// Route absolute /api/* calls through the app's base path. Behind the
// code-server proxy the page lives at /proxy/<port>/, so a bare fetch('/api/x')
// resolves to the proxy ROOT (code-server) not MAMA's backend, and returns
// non-JSON ("Unsupported Media Type") — the chat JSON-parse error. Prefixing
// with BASE_URL makes /api/x -> /proxy/<port>/api/x. No-op when BASE_URL='/'.
(() => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  if (!base) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = base + input;
    }
    return nativeFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SageProvider>
      <App />
    </SageProvider>
  </React.StrictMode>
);
