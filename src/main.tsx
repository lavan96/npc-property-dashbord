import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ── Service Worker Cleanup ──
// Remove any previously registered service workers and purge stale caches.
// Lovable's hosting + Vite content-hashing handle caching natively;
// a custom SW only causes stale-content issues on the published site.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log('[SW Cleanup] Unregistered service worker:', registration.scope)
        }
      })
    }
  })
}

// Purge all caches left behind by the old service worker
if ('caches' in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name).then(() => {
        console.log('[Cache Cleanup] Deleted cache:', name)
      })
    }
  })
}

createRoot(document.getElementById("root")!).render(<App />)
