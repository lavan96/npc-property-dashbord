import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { installAccessErrorLogger } from './lib/security/accessLogger'
import './index.css'

installAccessErrorLogger();

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />)
