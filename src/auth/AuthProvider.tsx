import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { auth, db } from "../firebase/config";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onSnapshot } from "firebase/firestore";

export type AppRole = "user" | "admin" | "super";

export type AppUserProfile = {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  role: "user" | "admin"; // super is inferred from email
  suspended: boolean;
  createdAt?: any;
  lastLoginAt?: any;
  deletedAt?: any | null;
};

const SUPER_EMAIL = "alshahriarzim@gmail.com";

type AuthContextShape = {
  loading: boolean;
  user: import("firebase/auth").User | null;
  profile: AppUserProfile | null;
  role: AppRole;
  suspended: boolean;
  maintenance: boolean;
  accountRemoved: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutApp: () => Promise<void>;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<import("firebase/auth").User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState<boolean>(false); // programs/app_config single source
  const [accountRemoved, setAccountRemoved] = useState<boolean>(false);
  // Tracks whether this session has ever seen an existing profile document to distinguish
  // between an account that was removed vs. a brand-new sign up racing before profile creation.
  const hadProfileRef = useRef(false);
  // Online status (app requires connectivity)
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
  setAccountRemoved(false);
  hadProfileRef.current = false;
        return;
      }
      // Use cached role/suspended for instant UI when possible
      const roleKey = `sadia:auth:role:${u.uid}`;
      const suspendedKey = `sadia:auth:sus:${u.uid}`;
      const cachedRole = (typeof window !== 'undefined' ? (localStorage.getItem(roleKey) as AppUserProfile["role"] | null) : null) || null;
      const cachedSuspStr = typeof window !== 'undefined' ? localStorage.getItem(suspendedKey) : null;
      const hasCache = !!cachedRole || cachedSuspStr !== null;

      const base: AppUserProfile = {
        uid: u.uid,
        email: u.email,
        name: u.displayName,
        photoURL: u.photoURL,
        role: cachedRole || "user",
        suspended: cachedSuspStr === "true" ? true : false,
      };

      if (hasCache) {
        setProfile(base);
        setLoading(false);
      }

      // Fetch/Upsert profile in background (or blocking if no cache)
      try {
        const ref = doc(collection(db, "users"), u.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            ...base,
            role: "user",
            suspended: false,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          });
          setProfile((prev) => ({ ...(prev || base), role: "user", suspended: false }));
          if (typeof window !== 'undefined') {
            localStorage.setItem(roleKey, "user");
            localStorage.setItem(suspendedKey, "false");
          }
        } else {
          const data = snap.data() as AppUserProfile;
          setProfile({ ...data });
          if (typeof window !== 'undefined') {
            localStorage.setItem(roleKey, data.role);
            localStorage.setItem(suspendedKey, data.suspended ? "true" : "false");
          }
          // Update last login details but never downgrade role
          try {
            await updateDoc(ref, {
              name: base.name,
              photoURL: base.photoURL,
              lastLoginAt: serverTimestamp(),
            });
          } catch {}
        }
      } finally {
        if (!hasCache) setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Live subscription to own profile doc to detect admin removal in real time.
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        // Profile present: mark we have seen it and ensure removal flag cleared
        hadProfileRef.current = true;
        if (accountRemoved) setAccountRemoved(false);
      } else {
        // Only show removal if we previously observed a profile (not just initial create race)
        if (hadProfileRef.current) setAccountRemoved(true);
      }
    }, (err) => {
      if ((err as any)?.code === 'permission-denied' && hadProfileRef.current) {
        setAccountRemoved(true);
      }
    });
    return () => unsub();
  }, [user?.uid, accountRemoved]);

  // Maintenance subscription (single source): programs/app_config (public read via rules for this doc)
  useEffect(() => {
    const ref = doc(db, "programs", "app_config");
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) { setMaintenance(false); return; }
          const data = snap.data() as any | undefined;
          setMaintenance(!!data?.maintenance);
        },
        (err) => {
          if ((err as any)?.code === 'permission-denied') {
            // Fallback: hide maintenance (assume false) rather than crash
            setMaintenance(false);
            return;
          }
          setMaintenance(false);
        }
      );
    } catch {
      setMaintenance(false);
    }
    return () => { if (unsub) unsub(); };
  }, []);

  const role: AppRole = useMemo(() => {
    if (user?.email === SUPER_EMAIL) return "super";
    if (profile?.role === "admin") return "admin";
    return "user";
  }, [user?.email, profile?.role]);

  const suspended = !!profile?.suspended;

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      // Prefer popup; fallback to redirect for environments that block popups
      await signInWithPopup(auth, provider);
    } catch (e) {
      try {
        await signInWithRedirect(auth, provider);
      } catch (err) {
        // swallow; UI can show a generic error if desired
        // console.error(err);
      }
    }
  }

  function signOutApp() {
    return signOut(auth);
  }

  const value: AuthContextShape = {
    loading,
    user,
    profile,
    role,
  suspended,
  maintenance,
  accountRemoved,
    signInWithGoogle,
    signOutApp,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* Offline required overlay */}
      {!isOnline && !accountRemoved && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-soft bg-card p-5 space-y-4 text-center">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">No Internet Connection</h2>
              <p className="text-sm text-muted">An active internet connection is required to use SADIA.</p>
            </div>
            <div className="text-xs text-muted bg-surface border border-soft rounded-lg p-3 text-left">
              <p>You're currently offline. Some content may appear stale. Reconnect to continue.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { if (navigator.onLine) { setIsOnline(true); } else { /* trigger a lightweight ping could be added */ } }}
                className="rounded-lg btn-primary px-4 py-2 text-sm disabled:opacity-60"
                disabled={navigator.onLine}
              >{navigator.onLine ? 'Reconnected' : 'Retry'}</button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg border border-soft bg-card px-4 py-2 text-sm hover:bg-gray-50"
              >Reload Page</button>
            </div>
          </div>
        </div>
      )}
      {accountRemoved && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-soft bg-card p-5 space-y-4 text-center">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Account Removed</h2>
              <p className="text-sm text-muted">This account was removed by an administrator. Your active session will end now.</p>
            </div>
            <div className="text-xs text-muted bg-surface border border-soft rounded-lg p-3 text-left">
              <p className="mb-1"><span className="font-medium">What happened?</span> Your profile document was deleted.</p>
              <p className="mb-1"><span className="font-medium">Data:</span> Associated chats may have been removed.</p>
              <p><span className="font-medium">Next:</span> You can sign in again only if allowed to recreate an account.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => { try { await signOut(auth); window.location.replace('/home'); } catch {} }}
                className="rounded-lg btn-primary px-4 py-2 text-sm"
              >Return Home</button>
              <button
                onClick={async () => { try { await signOut(auth); } catch {} }}
                className="rounded-lg border border-soft bg-card px-4 py-2 text-sm hover:bg-gray-50"
              >Sign out</button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
