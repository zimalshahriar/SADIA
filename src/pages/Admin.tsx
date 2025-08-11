import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IoChevronBack } from "react-icons/io5";
import { db } from "../firebase/config";
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

const ADMIN_PASSWORD = "sadia-admin-123"; // change in code when needed

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
  const [authed, setAuthed] = useState(() => localStorage.getItem("sadia_admin_authed") === "true");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [tab, setTab] = useState<"add" | "view">("add");
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authed) return;
    const qref = query(collection(db, "programs"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qref, (snap) => {
      const rows: Program[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
    });
    return () => unsub();
  }, [authed]);

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      localStorage.setItem("sadia_admin_authed", "true"); // persist auth
      setStatus(null);
    } else {
      setStatus("Wrong password");
    }
  }

  // Add a logout function
  function logout() {
    setAuthed(false);
    localStorage.removeItem("sadia_admin_authed");
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

  async function saveEdit(p: Program) {
    if (!p.id) return;
    await updateDoc(doc(db, "programs", p.id), {
      courseName: p.courseName,
      level: p.level,
      university: p.university,
      city: p.city,
      country: p.country,
      tuitionBDT: p.tuitionBDT,
      about: p.about,
    });
    setEditingId(null);
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

  // Auto-clear highlight after a few seconds
  useEffect(() => {
    if (!lastAddedId) return;
    const t = setTimeout(() => setLastAddedId(null), 3000);
    return () => clearTimeout(t);
  }, [lastAddedId]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center px-4">
        {/* Back to Home */}
        <button
          aria-label="Back to Home"
          className="fixed top-4 left-4 p-2 rounded-lg hover:bg-gray-100"
          onClick={() => navigate("/home")}
        >
          <IoChevronBack size={20} />
        </button>
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-soft bg-card backdrop-blur p-5 card-shadow">
          <div className="mb-3">
            <h1 className="text-lg font-semibold brand-font">SADIA Admin</h1>
            <p className="text-xs text-muted mt-1">Enter the admin password to continue.</p>
          </div>
          {status && <div className="mb-2 text-sm text-red-600">{status}</div>}
          <label className="text-xs text-muted">Password</label>
          <div className="relative mt-1 mb-3">
            <input
              type={showPw ? "text" : "password"}
              className="w-full rounded-lg border border-soft bg-card px-3 py-2 pr-16"
              placeholder="Enter admin password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-muted hover:bg-gray-100"
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <button className="w-full rounded-lg btn-primary py-2">Enter</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app">
      {/* Mobile/top header */}
      <header className="sticky top-0 z-30 w-full border-b border-soft bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="text-base font-semibold brand-font">SADIA Admin</div>
          {/* Mobile actions with animated segmented control */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="relative inline-flex w-[220px] rounded-xl bg-card border border-soft p-1">
              <span className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg btn-primary transition-transform duration-200 ${tab === 'view' ? 'translate-x-full' : 'translate-x-0'}`} />
              <button
                onClick={() => setTab('add')}
                className={`relative z-10 flex-1 px-3 py-1.5 text-sm transition-colors ${tab === 'add' ? 'text-white' : 'text-primary'}`}
              >Add</button>
              <button
                onClick={() => setTab('view')}
                className={`relative z-10 flex-1 px-3 py-1.5 text-sm transition-colors ${tab === 'view' ? 'text-white' : 'text-primary'}`}
              >View</button>
            </div>
            <button onClick={logout} className="ml-1 rounded-md px-3 py-1.5 text-sm bg-red-50 text-red-600">Logout</button>
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
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <input className="w-full border border-soft bg-card rounded px-2 py-1" value={p.courseName} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, courseName: e.target.value } : it))} />
                      ) : p.courseName}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <select className="border border-soft bg-card rounded px-2 py-1" value={p.level} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, level: e.target.value as any } : it))}>
                          <option value="Bachelors">Bachelor's</option>
                          <option value="Masters">Master's</option>
                        </select>
                      ) : p.level}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <input className="w-full border border-soft bg-card rounded px-2 py-1" value={p.university} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, university: e.target.value } : it))} />
                      ) : p.university}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <div className="flex gap-2">
                          <input className="w-full border border-soft bg-card rounded px-2 py-1" placeholder="City" value={p.city} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, city: e.target.value } : it))} />
                          <input className="w-full border border-soft bg-card rounded px-2 py-1" placeholder="Country" value={p.country} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, country: e.target.value } : it))} />
                        </div>
                      ) : `${p.city ? p.city + ", " : ""}${p.country}`}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <input type="number" className="w-full border border-soft bg-card rounded px-2 py-1" value={p.tuitionBDT} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, tuitionBDT: Number(e.target.value) } : it))} />
                      ) : p.tuitionBDT?.toLocaleString()}</td>
                      <td className="px-3 py-2 max-w-[260px]">{editingId === p.id ? (
                        <textarea className="w-full border border-soft bg-card rounded px-2 py-1" rows={2} value={p.about} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, about: e.target.value } : it))} />
                      ) : <span className="line-clamp-2">{p.about}</span>}</td>
                      <td className="px-3 py-2 text-right">
                        {editingId === p.id ? (
                          <div className="flex justify-end gap-2">
                            <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => saveEdit(p)}>Save</button>
                            <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => setEditingId(p.id!)}>Edit</button>
                            <button className="rounded border border-soft bg-card px-2 py-1 text-red-600" onClick={() => remove(p.id!)}>Delete</button>
                          </div>
                        )}
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
                    {editingId !== p.id ? (
                      <div className="flex gap-2">
                        <button className="rounded border border-soft bg-card px-2 py-1 text-xs" onClick={() => setEditingId(p.id!)}>Edit</button>
                        <button className="rounded border border-soft bg-card px-2 py-1 text-xs text-red-600" onClick={() => remove(p.id!)}>Delete</button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Level</span>
                      {editingId === p.id ? (
                        <select className="border border-soft bg-card rounded px-2 py-1" value={p.level} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, level: e.target.value as any } : it))}>
                          <option value="Bachelors">Bachelor's</option>
                          <option value="Masters">Master's</option>
                        </select>
                      ) : <span>{p.level}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">University</span>
                      {editingId === p.id ? (
                        <input className="border border-soft bg-card rounded px-2 py-1 w-40 text-right" value={p.university} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, university: e.target.value } : it))} />
                      ) : <span className="text-right">{p.university}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Location</span>
                      {editingId === p.id ? (
                        <div className="flex gap-2">
                          <input className="border border-soft bg-card rounded px-2 py-1 w-24" placeholder="City" value={p.city} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, city: e.target.value } : it))} />
                          <input className="border border-soft bg-card rounded px-2 py-1 w-28" placeholder="Country" value={p.country} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, country: e.target.value } : it))} />
                        </div>
                      ) : <span className="text-right">{`${p.city ? p.city + ', ' : ''}${p.country}`}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Tuition (BDT)</span>
                      {editingId === p.id ? (
                        <input type="number" className="border border-soft bg-card rounded px-2 py-1 w-28 text-right" value={p.tuitionBDT} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, tuitionBDT: Number(e.target.value) } : it))} />
                      ) : <span className="text-right">{p.tuitionBDT?.toLocaleString()}</span>}
                    </div>
                    <div>
                      <div className="text-muted">About</div>
                      {editingId === p.id ? (
                        <textarea className="mt-1 w-full border border-soft bg-card rounded px-2 py-1" rows={3} value={p.about} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, about: e.target.value } : it))} />
                      ) : <p className="mt-1">{p.about}</p>}
                    </div>
                  </div>
                  {editingId === p.id ? (
                    <div className="mt-3 flex justify-end gap-2">
                      <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => saveEdit(p)}>Save</button>
                      <button className="rounded border border-soft bg-card px-2 py-1" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </FadeSection>
        </main>
      </div>
    </div>
  );
}
