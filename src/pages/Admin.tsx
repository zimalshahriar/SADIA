import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import ConfirmModal from "../components/ConfirmModal";
import { useAuth } from "../auth/AuthProvider";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

type Program = {
  id?: string;
  courseName: string;
  level: "Bachelors" | "Masters";
  university: string;
  city: string;
  country: string;
  tuitionBDT: number;
  about: string;
  createdAt?: any;
};


// Small helper to smoothly mount/unmount sections
function FadeSection({ show, children }: { show: boolean; children: React.ReactNode }) {
  const [render, setRender] = useState(show);
  const [visible, setVisible] = useState(show);
  const DURATION = 240; // ms

  useEffect(() => {
    if (show) {
      setRender(true);
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
      const t = setTimeout(() => setRender(false), DURATION);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!render) return null;
  return (
    <div className={`transition-all duration-200 ease-out ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-1 scale-[0.99]"}`}>
      {children}
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { signOutApp } = useAuth();
  const TAB_KEY = "sadia:admin:tab";
  const [tab, setTab] = useState<"add" | "view" | "users">(() => {
    if (typeof window !== 'undefined') {
      const t = localStorage.getItem(TAB_KEY);
      if (t === 'add' || t === 'view' || t === 'users') return t;
    }
    return "add";
  });
  const [status, setStatus] = useState<string | null>(null);

  // form state
  const [courseName, setCourseName] = useState("");
  const [level, setLevel] = useState<"Bachelors" | "Masters">("Bachelors");
  const [university, setUniversity] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [tuitionBDT, setTuitionBDT] = useState<string>("");
  const [about, setAbout] = useState("");

  // data state
  const [items, setItems] = useState<Program[]>([]);
  const [filter, setFilter] = useState<{ level?: string; country?: string; q?: string }>({});
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<Program | null>(null);
  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const qref = query(collection(db, "programs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qref, (snap) => {
      const rows: Program[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
    });
    return () => unsub();
  }, []);

  async function logout() {
    await signOutApp();
    navigate("/home");
  }

  function openEditModal(p: Program) {
    // create a shallow copy to edit safely
    setEditDraft({ ...p });
    setEditOpen(true);
  }

  async function saveEditDraft() {
    if (!editDraft || !editDraft.id) {
      setEditOpen(false);
      return;
    }
    const p = editDraft;
  await updateDoc(doc(db, "programs", p.id!), {
      courseName: p.courseName.trim(),
      level: p.level,
      university: p.university.trim(),
      city: p.city.trim(),
      country: p.country.trim(),
      tuitionBDT: Number(p.tuitionBDT || 0),
      about: p.about.trim(),
    });
    setEditOpen(false);
    setBanner("Saved");
    setTimeout(() => setBanner(null), 2000);
  }

  async function addProgram(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    if (!courseName || !university) {
      setStatus("Course name and University are required.");
      setSaving(false);
      return;
    }
    // uniqueness: course+university pair
    const uniqueQ = query(
      collection(db, "programs"),
      where("courseName", "==", courseName.trim()),
      where("university", "==", university.trim())
    );
    const exists = (await getDocs(uniqueQ)).size > 0;
    if (exists) {
      setStatus("This course at this university already exists.");
      setSaving(false);
      return;
    }
    try {
      const ref = await addDoc(collection(db, "programs"), {
      courseName: courseName.trim(),
      level,
      university: university.trim(),
      city: city.trim(),
      country: country.trim(),
      tuitionBDT: Number(tuitionBDT || 0),
      about: about.trim(),
      createdAt: serverTimestamp(),
    });
      // Smooth transition to View with highlight
      setLastAddedId(ref.id);
      setTab("view");
      setBanner("Saved");
      setTimeout(() => setBanner(null), 2500);
    setCourseName("");
    setUniversity("");
    setCity("");
    setCountry("");
    setTuitionBDT("");
    setAbout("");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await deleteDoc(doc(db, "programs", id));
  }

  

  // Collect unique country names for suggestions
  const allCountries = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.country) set.add(it.country);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered items
  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter.level && it.level !== filter.level) return false;
      if (filter.country && filter.country.length > 0 && !it.country.toLowerCase().includes(filter.country.toLowerCase())) return false;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const blob = `${it.courseName} ${it.university} ${it.city} ${it.country}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter]);

  // Update country suggestions as user types
  useEffect(() => {
    if (!filter.country || filter.country.length === 0) {
      setCountrySuggestions([]);
      return;
    }
    const input = filter.country.toLowerCase();
    setCountrySuggestions(
      allCountries.filter((c) => c.toLowerCase().includes(input)).slice(0, 6)
    );
  }, [filter.country, allCountries]);

  // Scroll to top when switching to View so the new item is visible (ordered desc)
  useEffect(() => {
    if (tab === "view") {
      window.scrollTo({ top: 0, behavior: "smooth" });
  // gently focus search to guide next action
  setTimeout(() => searchRef.current?.focus(), 220);
    }
  }, [tab]);

  // Persist active tab across reloads
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch {}
  }, [tab]);

  // Auto-clear highlight after a few seconds
  useEffect(() => {
    if (!lastAddedId) return;
    const t = setTimeout(() => setLastAddedId(null), 3000);
    return () => clearTimeout(t);
  }, [lastAddedId]);


  return (
    <div className="min-h-screen bg-app">
      {/* Mobile/top header */}
      <header className="sticky top-0 z-30 w-full border-b border-soft bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-base font-semibold brand-font truncate">SADIA Admin</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/chat')}
                className="rounded-md px-3 py-1.5 text-sm border border-soft bg-card hover:bg-gray-50"
                aria-label="Go to Chat"
              >Chat</button>
              <button onClick={logout} className="rounded-md px-3 py-1.5 text-sm bg-red-50 text-red-600 md:hidden">Logout</button>
            </div>
          </div>
          {/* Mobile segmented control below header for better fit */}
          <div className="mt-2 md:hidden">
            <div className="inline-flex rounded-xl bg-card border border-soft overflow-hidden">
              <button
                onClick={() => setTab('add')}
                className={`px-3 py-1.5 text-sm ${tab === 'add' ? 'btn-primary text-white' : 'hover:bg-gray-50'}`}
              >Add</button>
              <button
                onClick={() => setTab('view')}
                className={`px-3 py-1.5 text-sm ${tab === 'view' ? 'btn-primary text-white' : 'hover:bg-gray-50'}`}
              >View</button>
              <button
                onClick={() => setTab('users')}
                className={`px-3 py-1.5 text-sm ${tab === 'users' ? 'btn-primary text-white' : 'hover:bg-gray-50'}`}
              >Users</button>
            </div>
          </div>
        </div>
        {/* Banner */}
        {banner && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
              {banner}
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto grid md:grid-cols-[240px_1fr] max-w-6xl">
        {/* Sidebar (desktop) */}
    <aside className="hidden md:block border-r border-soft p-4 bg-card">
          <nav className="space-y-2 text-sm">
      <button onClick={() => setTab("add")} className={`block w-full text-left rounded-lg px-3 py-2 transition ${tab === "add" ? "btn-primary text-white" : "hover:bg-gray-50 border border-soft bg-card"}`}>Add</button>
      <button onClick={() => setTab("view")} className={`block w-full text-left rounded-lg px-3 py-2 transition ${tab === "view" ? "btn-primary text-white" : "hover:bg-gray-50 border border-soft bg-card"}`}>View</button>
      <button onClick={() => setTab("users")} className={`block w-full text-left rounded-lg px-3 py-2 transition ${tab === "users" ? "btn-primary text-white" : "hover:bg-gray-50 border border-soft bg-card"}`}>Users</button>
            <button onClick={logout} className="block rounded-lg px-3 py-2 hover:bg-gray-50 border border-soft bg-card text-red-600">Logout</button>
          </nav>
        </aside>

        {/* Content */}
        <main className="p-4">
        <FadeSection show={tab === "add"}>
          <form onSubmit={addProgram} className="max-w-2xl space-y-3 mx-auto">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted">Course name</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={courseName} onChange={(e) => setCourseName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-muted">Level</label>
                <select className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={level} onChange={(e) => setLevel(e.target.value as any)}>
                  <option value="Bachelors">Bachelor's</option>
                  <option value="Masters">Master's</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted">University</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={university} onChange={(e) => setUniversity(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-muted">City</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted">Country</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted">Tuition fees (BDT)</label>
                <input type="number" min={0} className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={tuitionBDT} onChange={(e) => setTuitionBDT(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted">About</label>
              <textarea className="w-full rounded-lg border border-soft bg-card px-3 py-2" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
            </div>
            <button disabled={saving} className={`rounded-lg px-4 py-2 flex items-center gap-2 ${saving ? 'btn-primary opacity-75 cursor-not-allowed' : 'btn-primary'}`}>
              {saving && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {saving ? 'Saving...' : 'Save'}
            </button>
            {status && <div className="text-sm mt-2">{status}</div>}
          </form>
        </FadeSection>

        <FadeSection show={tab === "view"}>
          <div className="mx-auto max-w-5xl">
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input ref={searchRef} placeholder="Search..." className="rounded-lg border border-soft bg-card px-3 py-2" value={filter.q || ""} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
              <select className="rounded-lg border border-soft bg-card px-3 py-2" value={filter.level || ""} onChange={(e) => setFilter((f) => ({ ...f, level: e.target.value || undefined }))}>
                <option value="">All levels</option>
                <option value="Bachelors">Bachelor's</option>
                <option value="Masters">Master's</option>
              </select>
              <div className="relative">
                <input
                  placeholder="Country"
                  className="rounded-lg border border-soft bg-card px-3 py-2 w-full"
                  value={filter.country || ""}
                  onChange={(e) => setFilter((f) => ({ ...f, country: e.target.value }))}
                  autoComplete="off"
                />
                {countrySuggestions.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 bg-card border border-soft rounded-lg shadow mt-1 max-h-40 overflow-auto">
                    {countrySuggestions.map((c) => (
                      <li
                        key={c}
                        className="px-3 py-2 cursor-pointer hover:bg-gray-50"
                        onClick={() => setFilter((f) => ({ ...f, country: c }))}
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-soft bg-card">
              <table className="min-w-full text-sm">
                <thead className="bg-surface text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Course</th>
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-left">University</th>
                    <th className="px-3 py-2 text-left">Location</th>
                    <th className="px-3 py-2 text-left">Tuition (BDT)</th>
                    <th className="px-3 py-2 text-left">About</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-t border-soft ${lastAddedId === p.id ? "bg-emerald-50/70" : ""}`}
                    >
                      <td className="px-3 py-2">{p.courseName}</td>
                      <td className="px-3 py-2">{p.level}</td>
                      <td className="px-3 py-2">{p.university}</td>
                      <td className="px-3 py-2">{`${p.city ? p.city + ", " : ""}${p.country}`}</td>
                      <td className="px-3 py-2">{p.tuitionBDT?.toLocaleString()}</td>
                      <td className="px-3 py-2 max-w-[260px]"><span className="line-clamp-2">{p.about}</span></td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => openEditModal(p)}>Edit</button>
                          <button className="rounded border border-soft bg-card px-2 py-1 text-red-600" onClick={() => setConfirmDeleteId(p.id!)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-xl border bg-card p-3 card-shadow ${lastAddedId === p.id ? "border-emerald-300 ring-2 ring-emerald-200" : "border-soft"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{p.courseName}</div>
                    <div className="flex gap-2">
                      <button className="rounded border border-soft bg-card px-2 py-1 text-xs" onClick={() => openEditModal(p)}>Edit</button>
                      <button className="rounded border border-soft bg-card px-2 py-1 text-xs text-red-600" onClick={() => setConfirmDeleteId(p.id!)}>Delete</button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                    <div className="flex items-center justify-between"><span className="text-muted">Level</span><span>{p.level}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted">University</span><span className="text-right">{p.university}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted">Location</span><span className="text-right">{`${p.city ? p.city + ', ' : ''}${p.country}`}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted">Tuition (BDT)</span><span className="text-right">{p.tuitionBDT?.toLocaleString()}</span></div>
                    <div>
                      <div className="text-muted">About</div>
                      <p className="mt-1">{p.about}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FadeSection>
        
        {/* Users management (admins/super only; route guard already enforced for access to page) */}
        <FadeSection show={tab === "users"}>
          <UsersSection />
        </FadeSection>
        </main>
      </div>

      {/* Edit Modal */}
      {editOpen && editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-soft bg-card p-4 sm:p-5 card-shadow max-h-[85vh] overflow-auto">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">Edit program</div>
              <button
                className="rounded-md px-2 py-1 border border-soft bg-card hover:bg-gray-50"
                onClick={() => setEditOpen(false)}
              >Close</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted">Course name</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={editDraft.courseName} onChange={(e) => setEditDraft({ ...editDraft, courseName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted">Level</label>
                <select className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={editDraft.level} onChange={(e) => setEditDraft({ ...editDraft, level: e.target.value as any })}>
                  <option value="Bachelors">Bachelor's</option>
                  <option value="Masters">Master's</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted">University</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={editDraft.university} onChange={(e) => setEditDraft({ ...editDraft, university: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted">City</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={editDraft.city} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted">Country</label>
                <input className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={editDraft.country} onChange={(e) => setEditDraft({ ...editDraft, country: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted">Tuition fees (BDT)</label>
                <input type="number" min={0} className="w-full rounded-lg border border-soft bg-card px-3 py-2" value={String(editDraft.tuitionBDT ?? '')} onChange={(e) => setEditDraft({ ...editDraft, tuitionBDT: Number(e.target.value || 0) })} />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted">About</label>
              <textarea className="w-full rounded-lg border border-soft bg-card px-3 py-2" rows={4} value={editDraft.about} onChange={(e) => setEditDraft({ ...editDraft, about: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border border-soft bg-card px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="rounded-lg btn-primary px-3 py-1.5 text-sm" onClick={saveEditDraft}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!confirmDeleteId}
        title="Delete program?"
        description={
          (() => {
            const item = items.find(it => it.id === confirmDeleteId);
            return (
              <>
                This will permanently delete{" "}
                <strong>
                  {item?.courseName ? `“${item.courseName}”` : "this program"}
                </strong>
                {item?.university ? (
                  <>
                    {" "}at <strong>{item.university}</strong>
                  </>
                ) : null}
                . This action cannot be undone.
              </>
            );
          })()
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={async () => {
          if (confirmDeleteId) {
            await remove(confirmDeleteId);
            setBanner("Deleted");
            setTimeout(() => setBanner(null), 2000);
          }
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

// Minimal UsersSection placeholder; will be implemented fully in next step
type UserRow = {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  role: 'user' | 'admin';
  suspended: boolean;
  createdAt?: any;
  lastLoginAt?: any;
  deletedAt?: any | null;
};

function UsersSection() {
  const { role: currentRole } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  type ActionType = 'promote' | 'demote' | 'suspend' | 'unsuspend' | 'remove';
  const [confirm, setConfirm] = useState<{ type: ActionType; user: UserRow } | null>(null);

  useEffect(() => {
    const qref = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qref, (snap) => {
      const arr: UserRow[] = [];
      snap.forEach((d) => {
        const data = d.data() as UserRow;
        if ((data as any).deletedAt) return; // hide soft-deleted
        arr.push({ ...data, uid: d.id });
      });
      setUsers(arr);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      (u.email || '').toLowerCase().includes(term) ||
      (u.name || '').toLowerCase().includes(term)
    );
  }, [users, q]);

  const SUPER_EMAIL = 'alshahriarzim@gmail.com';

  const canChangeRole = (u: UserRow) => currentRole === 'super' && u.email !== SUPER_EMAIL;
  const canSuspend = (u: UserRow) =>
    u.email !== SUPER_EMAIL && ((currentRole === 'super') || (currentRole === 'admin' && u.role === 'user'));
  const canRemove = (u: UserRow) => u.email !== SUPER_EMAIL && canSuspend(u); // same constraints

  async function setRole(u: UserRow, role: 'user' | 'admin') {
    await updateDoc(doc(db, 'users', u.uid), { role });
    setBanner(`Updated role: ${u.email || u.uid} → ${role}`);
    setTimeout(() => setBanner(null), 2000);
  }

  async function toggleSuspend(u: UserRow) {
    await updateDoc(doc(db, 'users', u.uid), { suspended: !u.suspended });
    setBanner(`${!u.suspended ? 'Suspended' : 'Unsuspended'} ${u.email || u.uid}`);
    setTimeout(() => setBanner(null), 2000);
  }

  async function removeUser(u: UserRow) {
    await updateDoc(doc(db, 'users', u.uid), { deletedAt: serverTimestamp(), suspended: true });
    setBanner(`Removed ${u.email || u.uid}`);
    setTimeout(() => setBanner(null), 2000);
  }

  return (
    <div className="max-w-5xl mx-auto">
      {banner && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
          {banner}
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <input
          placeholder="Search by name or email"
          className="rounded-lg border border-soft bg-card px-3 py-2 w-full"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-soft bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.uid} className="border-t border-soft">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {u.photoURL ? <img src={u.photoURL} className="h-6 w-6 rounded-full border border-soft" /> : <div className="h-6 w-6 rounded-full bg-gray-200 border border-soft" />}
                    <span className="truncate max-w-[200px]">{u.name || '—'}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="truncate inline-block max-w-[240px] align-middle">{u.email || '—'}</span>
                </td>
                <td className="px-3 py-2">{u.email === SUPER_EMAIL ? 'super' : u.role}</td>
                <td className="px-3 py-2">{u.suspended ? 'suspended' : 'active'}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    {canChangeRole(u) && (
                      u.role === 'user' ? (
                        <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => setConfirm({ type: 'promote', user: u })}>Make admin</button>
                      ) : (
                        <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => setConfirm({ type: 'demote', user: u })}>Remove admin</button>
                      )
                    )}
                    {canSuspend(u) && (
                      <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => setConfirm({ type: u.suspended ? 'unsuspend' : 'suspend', user: u })}>{u.suspended ? 'Unsuspend' : 'Suspend'}</button>
                    )}
                    {canRemove(u) && (
                      <button className="rounded border border-soft bg-card px-2 py-1 text-red-600" onClick={() => setConfirm({ type: 'remove', user: u })}>Remove</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((u) => (
          <div key={u.uid} className="rounded-xl border border-soft bg-card p-3 card-shadow">
            <div className="flex items-center gap-2">
              {u.photoURL ? <img src={u.photoURL} className="h-7 w-7 rounded-full border border-soft" /> : <div className="h-7 w-7 rounded-full bg-gray-200 border border-soft" />}
              <div className="min-w-0">
                <div className="font-medium truncate">{u.name || '—'}</div>
                <div className="text-xs text-muted truncate max-w-[260px]">{u.email || '—'}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted">Role: {u.email === SUPER_EMAIL ? 'super' : u.role} • {u.suspended ? 'suspended' : 'active'}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {canChangeRole(u) && (
                u.role === 'user' ? (
                  <button className="rounded border border-soft bg-card px-2 py-1 text-xs" onClick={() => setConfirm({ type: 'promote', user: u })}>Make admin</button>
                ) : (
                  <button className="rounded border border-soft bg-card px-2 py-1 text-xs" onClick={() => setConfirm({ type: 'demote', user: u })}>Remove admin</button>
                )
              )}
              {canSuspend(u) && (
                <button className="rounded border border-soft bg-card px-2 py-1 text-xs" onClick={() => setConfirm({ type: u.suspended ? 'unsuspend' : 'suspend', user: u })}>{u.suspended ? 'Unsuspend' : 'Suspend'}</button>
              )}
              {canRemove(u) && (
                <button className="rounded border border-soft bg-card px-2 py-1 text-xs text-red-600" onClick={() => setConfirm({ type: 'remove', user: u })}>Remove</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm actions modal */}
      <ConfirmModal
        open={!!confirm}
        title={
          confirm?.type === 'promote' ? 'Make admin?' :
          confirm?.type === 'demote' ? 'Remove admin role?' :
          confirm?.type === 'suspend' ? 'Suspend user?' :
          confirm?.type === 'unsuspend' ? 'Unsuspend user?' :
          'Remove user?'
        }
        description={(() => {
          if (!confirm) return null;
          const email = confirm.user.email || confirm.user.uid;
          if (confirm.type === 'promote') {
            return <>Grant admin privileges to <strong>{email}</strong>? Admins can manage programs and users.</>;
          }
          if (confirm.type === 'demote') {
            return <>Remove admin privileges from <strong>{email}</strong>? They will become a normal user.</>;
          }
          if (confirm.type === 'suspend') {
            return <>Suspend <strong>{email}</strong>? Suspended users cannot sign in until unsuspended.</>;
          }
          if (confirm.type === 'unsuspend') {
            return <>Unsuspend <strong>{email}</strong>? They will regain access.</>;
          }
          // remove
          return <>This will soft-delete <strong>{email}</strong>. Their record will be hidden and marked as removed.</>;
        })()}
        confirmText={
          confirm?.type === 'promote' ? 'Make admin' :
          confirm?.type === 'demote' ? 'Remove admin' :
          confirm?.type === 'suspend' ? 'Suspend' :
          confirm?.type === 'unsuspend' ? 'Unsuspend' :
          'Remove'
        }
        cancelText="Cancel"
        variant={confirm?.type === 'remove' || confirm?.type === 'suspend' ? 'danger' : 'default'}
        onConfirm={async () => {
          if (!confirm) return;
          const u = confirm.user;
          try {
            if (confirm.type === 'promote') await setRole(u, 'admin');
            else if (confirm.type === 'demote') await setRole(u, 'user');
            else if (confirm.type === 'remove') await removeUser(u);
            else await toggleSuspend(u);
          } finally {
            setConfirm(null);
          }
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
