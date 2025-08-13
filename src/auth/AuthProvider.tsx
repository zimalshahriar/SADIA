import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  signInWithGoogle: () => Promise<void>;
  signOutApp: () => Promise<void>;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<import("firebase/auth").User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
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
    signInWithGoogle,
    signOutApp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
