// App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from 'react';
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import { RequireAdmin, RequireAuth, RedirectByRole, RequireAppAccess } from "./auth/RouteGuards";

export default function App() {
  // Global PWA install capture so user sees prompt even if they don't open Chat first
  const [pwaEvent, setPwaEvent] = useState<any>(null);
  const [showMiniPrompt, setShowMiniPrompt] = useState(false);
  const [installed, setInstalled] = useState<boolean>(() => {
    try { return localStorage.getItem('sadia:pwa:installed') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    function handler(e: any) {
      e.preventDefault();
      setPwaEvent(e);
      // Only auto show if not previously dismissed (Chat hook will also respect this)
      try {
        const dismissed = localStorage.getItem('sadia:pwa:dismissedAt');
        if (!dismissed && !installed) setShowMiniPrompt(true);
      } catch {}
    }
    window.addEventListener('beforeinstallprompt', handler);
    function onAppInstalled(){
      setInstalled(true);
      try { localStorage.setItem('sadia:pwa:installed','true'); } catch {}
      setShowMiniPrompt(false);
    }
    window.addEventListener('appinstalled', onAppInstalled);
    // Hide mini prompt when full modal triggers
    function hideMini(){ setShowMiniPrompt(false); }
    window.addEventListener('sadia-hide-mini-install', hideMini);
    // Standalone detection (user launched installed app, so don't show mini prompt)
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone;
    if (standalone && !installed) {
      setInstalled(true);
      try { localStorage.setItem('sadia:pwa:installed','true'); } catch {}
    }
    // Related apps heuristic
    (async () => {
      try {
        const anyNav: any = navigator;
        if (!installed && typeof anyNav.getInstalledRelatedApps === 'function') {
          const rel = await anyNav.getInstalledRelatedApps();
          if (Array.isArray(rel) && rel.length > 0) {
            setInstalled(true);
            try { localStorage.setItem('sadia:pwa:installed','true'); } catch {}
          }
        }
      } catch {}
    })();
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  async function triggerInstall() {
    if (!pwaEvent) return;
    pwaEvent.prompt();
    try { await pwaEvent.userChoice; } catch {}
    setShowMiniPrompt(false);
    setPwaEvent(null);
  }
  function dismissMini() {
    try { localStorage.setItem('sadia:pwa:dismissedAt', String(Date.now())); } catch {}
    setShowMiniPrompt(false);
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RedirectByRole />} />
        <Route path="/home" element={<Home />} />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <RequireAppAccess allowAdmin>
                <Chat />
              </RequireAppAccess>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <RequireAppAccess>
                <Settings />
              </RequireAppAccess>
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
      </Routes>
    {showMiniPrompt && !installed && (
        <div className="fixed bottom-4 right-4 z-40 w-[260px] rounded-2xl border border-soft bg-card shadow-xl p-3 space-y-2 text-sm">
      <div className="font-semibold text-sm">Install SADIA</div>
          <p className="text-xs text-muted">Add the app to your home screen for a better experience.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={dismissMini} className="px-2 py-1 rounded-md border border-soft bg-card hover:bg-gray-50 text-xs">Later</button>
            <button onClick={triggerInstall} className="px-2 py-1 rounded-md btn-primary text-xs">Install</button>
          </div>
        </div>
      )}
  {/* Removed persistent installed badge to avoid overlay overlap on mobile */}
    </BrowserRouter>
  );
}
