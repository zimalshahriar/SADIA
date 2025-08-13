import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IoChevronBack } from "react-icons/io5";
import ConfirmModal from "../components/ConfirmModal";

export default function Settings() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDelete1Open, setConfirmDelete1Open] = useState(false);
  const [confirmDelete2Open, setConfirmDelete2Open] = useState(false);

  const clearChatHistory = useCallback(() => {
    try {
      localStorage.setItem("sadia:chat:messages", JSON.stringify([]));
      localStorage.setItem("sadia:chat:started", "false");
      setStatus("Chat history cleared.");
      navigate("/chat");
    } catch (e) {
      setStatus("Failed to clear chat history.");
    } finally {
      setConfirmClearOpen(false);
    }
  }, [navigate]);

  const deleteAccount = useCallback(() => {
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
    } finally {
      setConfirmDelete2Open(false);
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-app">
      <header className="sticky top-0 z-30 bg-surface border-b border-soft px-4 py-3">
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

      <main className="max-w-xl mx-auto px-4 pt-5 pb-4 fade-up">
        {status && (
          <div className="mb-4 rounded-lg border border-soft bg-card px-3 py-2 text-sm card-shadow">
            {status}
          </div>
        )}

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">Data</h2>
          <div className="rounded-2xl border border-soft divide-y card-shadow bg-card">
            <div className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Clear chat history</div>
                  <div className="text-xs text-muted">Remove all your conversations from this device.</div>
                </div>
                <button onClick={() => setConfirmClearOpen(true)} className="rounded-lg border border-soft bg-card px-3 py-1.5 text-sm hover:bg-gray-50 hover-grow">
                  Clear
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Danger zone</h2>
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-3 card-shadow">
            <div className="mb-2 text-sm text-primary">Permanently delete your account data on this device.</div>
            <button onClick={() => setConfirmDelete1Open(true)} className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-sm hover:opacity-90 hover-grow">
              Delete account
            </button>
          </div>
        </section>
      </main>

      {/* Modals */}
      <ConfirmModal
        open={confirmClearOpen}
        title="Clear chat history?"
        description={
          <>
            This will remove all your conversations from this device. This action cannot be undone.
          </>
        }
        confirmText="Clear history"
        cancelText="Cancel"
        variant="danger"
        onConfirm={clearChatHistory}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmModal
        open={confirmDelete1Open}
        title="Delete account on this device?"
        description={
          <>This will erase all SADIA data stored locally on this device. You will not be able to recover it.</>
        }
        confirmText="Continue"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          setConfirmDelete1Open(false);
          setConfirmDelete2Open(true);
        }}
        onCancel={() => setConfirmDelete1Open(false)}
      />

      <ConfirmModal
        open={confirmDelete2Open}
        title="Are you absolutely sure?"
        description={
          <>This is permanent. All keys starting with 'sadia:' in local storage will be removed.</>
        }
        confirmText="Delete permanently"
        cancelText="Back"
        variant="danger"
        onConfirm={deleteAccount}
        onCancel={() => setConfirmDelete2Open(false)}
      />
    </div>
  );
}
