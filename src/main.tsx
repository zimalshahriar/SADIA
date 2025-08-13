import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)

// PWA: register service worker (vite-plugin-pwa)
if ('serviceWorker' in navigator) {
  // This will be replaced/handled by the plugin; calling register is safe
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {});
}
