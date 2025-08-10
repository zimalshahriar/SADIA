import { useEffect, useMemo, useState } from "react";
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

export default function Admin() {
  const [authed, setAuthed] = useState(() => localStorage.getItem("sadia_admin_authed") === "true");
  const [pw, setPw] = useState("");
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
    if (!courseName || !university) {
      setStatus("Course name and University are required.");
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
      return;
    }
    await addDoc(collection(db, "programs"), {
      courseName: courseName.trim(),
      level,
      university: university.trim(),
      city: city.trim(),
      country: country.trim(),
      tuitionBDT: Number(tuitionBDT || 0),
      about: about.trim(),
      createdAt: serverTimestamp(),
    });
    setStatus("Saved.");
    setCourseName("");
    setUniversity("");
    setCity("");
    setCountry("");
    setTuitionBDT("");
    setAbout("");
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

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-4 card-shadow">
          <h1 className="mb-3 text-lg font-semibold brand-font">SADIA Admin</h1>
          {status && <div className="mb-2 text-sm text-red-600">{status}</div>}
          <input
            type="password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 mb-3"
            placeholder="Enter admin password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button className="w-full rounded-lg bg-black text-white py-2 hover:opacity-90">Enter</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-[220px_1fr] bg-white bg-fixed bg-no-repeat">
      {/* Sidebar */}
      <aside className="border-r border-gray-200 p-4">
        <div className="mb-4 text-base font-semibold brand-font">SADIA Admin</div>
        <nav className="space-y-2 text-sm">
          <button onClick={() => setTab("add")} className={`block w-full text-left rounded-lg px-3 py-2 ${tab === "add" ? "bg-gray-900 text-white" : "hover:bg-gray-100"}`}>Add</button>
          <button onClick={() => setTab("view")} className={`block w-full text-left rounded-lg px-3 py-2 ${tab === "view" ? "bg-gray-900 text-white" : "hover:bg-gray-100"}`}>View</button>
          <button onClick={logout} className="block rounded-lg px-3 py-2 hover:bg-gray-100 text-red-600">Logout</button>
        </nav>
      </aside>

      {/* Content */}
      <main className="p-4">
        {tab === "add" && (
          <form onSubmit={addProgram} className="max-w-2xl space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-gray-600">Course name</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={courseName} onChange={(e) => setCourseName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-600">Level</label>
                <select className="w-full rounded-lg border border-gray-300 px-3 py-2" value={level} onChange={(e) => setLevel(e.target.value as any)}>
                  <option value="Bachelors">Bachelor's</option>
                  <option value="Masters">Master's</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">University</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={university} onChange={(e) => setUniversity(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-600">City</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Country</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Tuition fees (BDT)</label>
                <input type="number" min={0} className="w-full rounded-lg border border-gray-300 px-3 py-2" value={tuitionBDT} onChange={(e) => setTuitionBDT(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">About</label>
              <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
            </div>
            <button className="rounded-lg bg-black text-white px-4 py-2">Save</button>
            {status && <div className="text-sm mt-2">{status}</div>}
          </form>
        )}

        {tab === "view" && (
          <div>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input placeholder="Search..." className="rounded-lg border border-gray-300 px-3 py-2" value={filter.q || ""} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
              <select className="rounded-lg border border-gray-300 px-3 py-2" value={filter.level || ""} onChange={(e) => setFilter((f) => ({ ...f, level: e.target.value || undefined }))}>
                <option value="">All levels</option>
                <option value="Bachelors">Bachelor's</option>
                <option value="Masters">Master's</option>
              </select>
              <div className="relative">
                <input
                  placeholder="Country"
                  className="rounded-lg border border-gray-300 px-3 py-2 w-full"
                  value={filter.country || ""}
                  onChange={(e) => setFilter((f) => ({ ...f, country: e.target.value }))}
                  autoComplete="off"
                />
                {countrySuggestions.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow mt-1 max-h-40 overflow-auto">
                    {countrySuggestions.map((c) => (
                      <li
                        key={c}
                        className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                        onClick={() => setFilter((f) => ({ ...f, country: c }))}
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
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
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <input className="w-full border rounded px-2 py-1" value={p.courseName} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, courseName: e.target.value } : it))} />
                      ) : p.courseName}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <select className="border rounded px-2 py-1" value={p.level} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, level: e.target.value as any } : it))}>
                          <option value="Bachelors">Bachelor's</option>
                          <option value="Masters">Master's</option>
                        </select>
                      ) : p.level}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <input className="w-full border rounded px-2 py-1" value={p.university} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, university: e.target.value } : it))} />
                      ) : p.university}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <div className="flex gap-2">
                          <input className="w-full border rounded px-2 py-1" placeholder="City" value={p.city} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, city: e.target.value } : it))} />
                          <input className="w-full border rounded px-2 py-1" placeholder="Country" value={p.country} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, country: e.target.value } : it))} />
                        </div>
                      ) : `${p.city ? p.city + ", " : ""}${p.country}`}</td>
                      <td className="px-3 py-2">{editingId === p.id ? (
                        <input type="number" className="w-full border rounded px-2 py-1" value={p.tuitionBDT} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, tuitionBDT: Number(e.target.value) } : it))} />
                      ) : p.tuitionBDT?.toLocaleString()}</td>
                      <td className="px-3 py-2 max-w-[260px]">{editingId === p.id ? (
                        <textarea className="w-full border rounded px-2 py-1" rows={2} value={p.about} onChange={(e) => setItems((arr) => arr.map((it) => it.id === p.id ? { ...it, about: e.target.value } : it))} />
                      ) : <span className="line-clamp-2">{p.about}</span>}</td>
                      <td className="px-3 py-2 text-right">
                        {editingId === p.id ? (
                          <div className="flex justify-end gap-2">
                            <button className="rounded border px-2 py-1" onClick={() => saveEdit(p)}>Save</button>
                            <button className="rounded border px-2 py-1" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button className="rounded border px-2 py-1" onClick={() => setEditingId(p.id!)}>Edit</button>
                            <button className="rounded border px-2 py-1 text-red-600" onClick={() => remove(p.id!)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
