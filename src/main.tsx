import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { DiagnosticsErrorBoundary } from './components/DiagnosticsErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { metaSDKInit } from './lib/metaSDK';
import { initOwnerMetaPixel } from './lib/ownerMetaPixel';
import { logSmsReadiness } from './lib/debug/sms-check';
import { initDiagnostics } from './lib/diagnostics';
import './index.css';

// Initialize diagnostics system (captures all errors for internal tracking)
initDiagnostics();

// One-time recovery for Vite chunk load errors (stale HTML / missing asset)
// This prevents users from getting stuck if a deploy happens mid-session
window.addEventListener('error', (event: ErrorEvent) => {
  const errorMsg = event.message || event.error?.message || '';

  // Handle chunk load failures - reload once
  const isChunkLoadError =
    errorMsg.includes('Failed to fetch dynamically imported module') ||
    errorMsg.includes('Importing a module script failed') ||
    errorMsg.includes('Failed to load module') ||
    errorMsg.includes('error loading dynamically imported module');

  if (isChunkLoadError && !sessionStorage.getItem('chunk_reload_once')) {
    console.warn('[Global] Chunk load error detected, reloading once...', errorMsg);
    sessionStorage.setItem('chunk_reload_once', '1');
    window.location.reload();
    event.preventDefault();
    return;
  }

  // Handle WebSocket errors (non-fatal)
  const isWebSocketError =
    errorMsg.toLowerCase().includes('websocket') ||
    errorMsg.toLowerCase().includes('operation is insecure');

  if (isWebSocketError) {
    console.warn('[Global] WebSocket error caught (non-fatal):', errorMsg);
    (window as any).__wsDisabled = true;
    event.preventDefault();
  }
});

// Global error handlers to prevent WebSocket errors from crashing the app
window.addEventListener('unhandledrejection', (event) => {
  const errorMsg = event.reason?.message || event.reason?.toString() || 'Unknown error';
  const isWebSocketError =
    errorMsg.toLowerCase().includes('websocket') ||
    errorMsg.toLowerCase().includes('operation is insecure');

  if (isWebSocketError) {
    console.warn('[Global] WebSocket error caught (non-fatal):', errorMsg);
    (window as any).__wsDisabled = true;
    event.preventDefault();
  } else {
    console.error('[Global] Unhandled rejection:', event.reason);
  }
});

console.log(
  "Supabase env check:",
  import.meta.env.VITE_SUPABASE_URL ? "URL OK" : "URL MISSING",
  import.meta.env.VITE_SUPABASE_ANON_KEY ? "KEY OK" : "KEY MISSING"
);

// Initialize owner Meta Pixel (global tracking for Ghoste.one business metrics)
// SKIP on user-owned link pages - they use the link owner's pixel, NOT Ghoste's pixel
const isUserLinkPage =
  window.location.pathname.startsWith('/l/') ||      // Smart Links
  window.location.pathname.startsWith('/s/') ||      // Short Links
  window.location.pathname.startsWith('/track/') ||  // Unreleased Music
  window.location.pathname.startsWith('/presave/') || // Pre-save Links
  window.location.pathname.startsWith('/capture/') || // Email Capture
  window.location.pathname.startsWith('/email/');     // Email Capture (alt)

if (!isUserLinkPage) {
  console.log('[Ghoste Owner Pixel] Initializing Ghoste business tracking pixel');
  initOwnerMetaPixel();
} else {
  console.log('[Ghoste Owner Pixel] SKIPPED - this is a user link page, will use link owner\'s pixel');
}

// Check SMS readiness
logSmsReadiness();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', metaSDKInit);
} else {
  metaSDKInit();
}

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppErrorBoundary>
        <DiagnosticsErrorBoundary>
          <AuthProvider>
            <App />
          </AuthProvider>
        </DiagnosticsErrorBoundary>
      </AppErrorBoundary>
    </StrictMode>
  );
} else {
  console.error('Root element #root not found');
  document.body.innerHTML = '<div style="padding: 32px; color: #e5e7eb; background: #020817; font-family: system-ui;"><h1>Critical Error</h1><p>Root element not found. Please contact support.</p></div>';
}
