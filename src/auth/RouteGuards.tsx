import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { auth } from "../firebase/config";
import { signOut } from "firebase/auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user, suspended } = useAuth();
  if (loading) return <div className="min-h-screen bg-app flex items-center justify-center text-sm text-muted">Loading…</div>;
  if (!user) return <Navigate to="/home" replace />;
  if (suspended) return <SuspendedScreen />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading, user, role, suspended } = useAuth();
  if (loading) return <div className="min-h-screen bg-app flex items-center justify-center text-sm text-muted">Loading…</div>;
  if (!user) return <Navigate to="/home" replace />;
  if (suspended) return <SuspendedScreen />;
  if (role === "admin" || role === "super") return <>{children}</>;
  return <Navigate to="/chat" replace />;
}

export function RedirectByRole() {
  const { loading, user, role } = useAuth();
  if (loading) return <div className="min-h-screen bg-app flex items-center justify-center text-sm text-muted">Loading…</div>;
  if (!user) return <Navigate to="/home" replace />;
  if (role === "admin" || role === "super") return <Navigate to="/admin" replace />;
  return <Navigate to="/chat" replace />;
}

// Blocks general app access during maintenance; super can access all; admins can only access Admin route (apply at route level)
export function RequireAppAccess({ children, allowAdmin = false }: { children: React.ReactNode; allowAdmin?: boolean }) {
  const { loading, user, role, suspended, maintenance } = useAuth();
  if (loading) return <div className="min-h-screen bg-app flex items-center justify-center text-sm text-muted">Loading…</div>;
  if (!user) return <Navigate to="/home" replace />;
  if (suspended) return <SuspendedScreen />;
  if (!maintenance) return <>{children}</>;
  if (role === 'super') return <>{children}</>;
  if (allowAdmin && role === 'admin') return <>{children}</>;
  // If in maintenance and not super, block
  return <div className="min-h-screen bg-app flex items-center justify-center text-center p-6">
    <div>
      <div className="text-lg font-semibold mb-1">SADIA is under maintenance</div>
      <div className="text-muted">Please check back later.</div>
    </div>
  </div>;
}

function SuspendedScreen() {
  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        <header>
          <h1 className="text-xl font-semibold">Account Suspended</h1>
          <p className="mt-1 text-sm text-muted">Access to this account is temporarily disabled. Any current sessions are limited to this notice.</p>
        </header>
        <ul className="text-left text-xs bg-card/60 border border-soft rounded-lg p-3 space-y-1">
          <li><span className="font-medium">Why?</span> Possible policy violation, spam, or manual review.</li>
          <li><span className="font-medium">Data:</span> Your chats are retained during suspension unless removed by an administrator.</li>
          <li><span className="font-medium">Next step:</span> Request a review if you believe this was an error.</li>
        </ul>
        <p className="text-xs text-muted">Contact support at <a href="mailto:help@sadia.com" className="text-primary underline">help@sadia.com</a> with the email you used to sign in.</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={async () => { try { await signOut(auth); } catch {}; }}
            className="rounded-lg border border-soft bg-card px-3 py-2 text-sm hover:bg-gray-50"
          >Use another account</button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg btn-primary px-3 py-2 text-sm"
          >I was unsuspended – refresh</button>
        </div>
      </div>
    </div>
  );
}
