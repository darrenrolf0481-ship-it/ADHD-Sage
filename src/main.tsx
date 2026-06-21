import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SageProvider } from './components/SageProvider';
import { SensorProvider } from './lib/sensor-context';
import './index.css';

// Auto-detect and prepend Vite base path (e.g. /proxy/3000/) to /api/ requests.
// This ensures same-origin backend requests resolve correctly behind proxies (like code-server).
(function patchGlobalFetch() {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.startsWith('/api')) {
      const base = import.meta.env.BASE_URL || '/';
      const cleanBase = base.endsWith('/') ? base : base + '/';
      const cleanPath = input.slice(1); // strip leading slash
      input = cleanBase + cleanPath;
    } else if (input instanceof URL && input.pathname.startsWith('/api')) {
      const base = import.meta.env.BASE_URL || '/';
      const cleanBase = base.endsWith('/') ? base : base + '/';
      const cleanPath = input.pathname.slice(1);
      input = new URL(cleanBase + cleanPath, input.origin);
    }
    return originalFetch.call(this, input, init);
  };

  const originalEventSource = window.EventSource;
  if (originalEventSource) {
    window.EventSource = class extends originalEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        if (typeof url === 'string' && url.startsWith('/api')) {
          const base = import.meta.env.BASE_URL || '/';
          const cleanBase = base.endsWith('/') ? base : base + '/';
          const cleanPath = url.slice(1);
          url = cleanBase + cleanPath;
        } else if (url instanceof URL && url.pathname.startsWith('/api')) {
          const base = import.meta.env.BASE_URL || '/';
          const cleanBase = base.endsWith('/') ? base : base + '/';
          const cleanPath = url.pathname.slice(1);
          url = new URL(cleanBase + cleanPath, url.origin);
        }
        super(url, eventSourceInitDict);
      }
    } as any;
  }
})();


class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#0a0a0a', color: '#ef4444', minHeight: '100vh' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 16 }}>⛔ RENDER CRASH</div>
          <div style={{ color: '#fff', marginBottom: 8 }}>{err.message}</div>
          <pre style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{err.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <SageProvider>
      <SensorProvider>
        <App />
      </SensorProvider>
    </SageProvider>
  </ErrorBoundary>,
);
