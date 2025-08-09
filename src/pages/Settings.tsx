import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IoChevronBack } from "react-icons/io5";

export default function Settings() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | null>(null);

  const clearChatHistory = useCallback(() => {
    const ok = window.confirm("Clear all chat history? This cannot be undone.");
    if (!ok) return;
    try {
      localStorage.setItem("sadia:chat:messages", JSON.stringify([]));
      localStorage.setItem("sadia:chat:started", "false");
      setStatus("Chat history cleared.");
      navigate("/chat");
    } catch (e) {
      setStatus("Failed to clear chat history.");
    }
  }, [navigate]);

  const deleteAccount = useCallback(() => {
    const ok1 = window.confirm("Delete your account and all SADIA data on this device? This cannot be undone.");
    if (!ok1) return;
    const ok2 = window.confirm("Are you absolutely sure? This will remove all local data.");
    if (!ok2) return;
    try {
      // Remove all keys prefixed by 'sadia:'
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sadia:")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      setStatus("Account deleted on this device.");
      navigate("/home");
    } catch (e) {
      setStatus("Failed to delete account.");
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white/70 backdrop-blur border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            aria-label="Back to chat"
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100"
            onClick={() => navigate("/chat")}
          >
            <IoChevronBack size={20} />
          </button>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-4 fade-up">
        {status && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 card-shadow">
            {status}
          </div>
        )}

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Data</h2>
          <div className="rounded-2xl border border-gray-200 divide-y card-shadow">
            <div className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Clear chat history</div>
                  <div className="text-xs text-gray-500">Remove all your conversations from this device.</div>
                </div>
                <button onClick={clearChatHistory} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 hover-grow">
                  Clear
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Danger zone</h2>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 card-shadow">
            <div className="mb-2 text-sm">Permanently delete your account data on this device.</div>
            <button onClick={deleteAccount} className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-sm hover:opacity-90 hover-grow">
              Delete account
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
