import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user, suspended } = useAuth();
  if (loading) return <div className="min-h-screen bg-app flex items-center justify-center text-sm text-muted">Loading…</div>;
  if (!user) return <Navigate to="/home" replace />;
  if (suspended) return <div className="min-h-screen bg-app flex items-center justify-center">Sorry you are suspended.</div>;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading, user, role, suspended } = useAuth();
  if (loading) return <div className="min-h-screen bg-app flex items-center justify-center text-sm text-muted">Loading…</div>;
  if (!user) return <Navigate to="/home" replace />;
  if (suspended) return <div className="min-h-screen bg-app flex items-center justify-center">Sorry you are suspended.</div>;
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
  if (suspended) return <div className="min-h-screen bg-app flex items-center justify-center">Sorry you are suspended.</div>;
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
