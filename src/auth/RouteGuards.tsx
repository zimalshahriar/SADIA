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
