import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";
const sadiaLogo = "/sadia.png";
// PWA install prompt logic
function usePwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    function onBeforeInstallPrompt(e: any) {
      e.preventDefault();
      setDeferredPrompt(e);
      // Auto-show unless recently dismissed
      try {
        const raw = localStorage.getItem("sadia:pwa:dismissedAt");
        const last = raw ? Number(raw) : 0;
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        if (!last || Date.now() - last > weekMs) {
          setShowPrompt(true);
        }
      } catch {}
    }
    function onAppInstalled() {
      setInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    // Check iOS Safari or already installed
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone;
    if (isStandalone) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);
  const prompt = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setShowPrompt(false);
      setDeferredPrompt(null);
      return outcome;
    }
  };
  const dismiss = () => {
    try { localStorage.setItem("sadia:pwa:dismissedAt", String(Date.now())); } catch {}
    setShowPrompt(false);
  };
  return { showPrompt, setShowPrompt, prompt, installed, canPrompt: !!deferredPrompt, dismiss };
}
import { RxHamburgerMenu, RxPaperPlane, RxPlus, RxCross2 } from "react-icons/rx";
import { IoMicOutline } from "react-icons/io5";
import { Link } from "react-router-dom";

type Role = "assistant" | "user";
type Message = {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
};

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`w-full ${isUser ? "justify-end" : "justify-start"} flex mb-3`}>
      {!isUser && (
        <div className="mr-2 mt-1 h-7 w-7 shrink-0 rounded-full btn-primary flex items-center justify-center text-xs font-semibold">
          S
        </div>
      )}
      <div
        className={`max-w-[78%] sm:max-w-[82%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
          isUser ? "bubble-user rounded-br-sm" : "bubble-assistant rounded-bl-sm"
        }`}
      >
        {msg.content}
      </div>
      {isUser && <div className="ml-2" />}
    </div>
  );
}

export default function Chat() {
  const { showPrompt, setShowPrompt, prompt, installed, canPrompt, dismiss } = usePwaInstallPrompt();
  const [started, setStarted] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("sadia:chat:started");
      return v === "true";
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = localStorage.getItem("sadia:chat:messages");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Message[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);

  const hasOnlyAssistant = useMemo(
    () => messages.every((m) => m.role === "assistant"),
    [messages]
  );

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; // up to ~5 lines
  }, [input]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Persist chat state
  useEffect(() => {
    try {
      localStorage.setItem("sadia:chat:messages", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem("sadia:chat:started", started ? "true" : "false");
    } catch {}
  }, [started]);

  // Show/hide scroll-to-bottom FAB based on scroll position
  useEffect(() => {
    function onScroll() {
      const scrolledFromBottom = Math.abs(
        (document.scrollingElement?.scrollHeight || 0) -
          (document.scrollingElement?.scrollTop || 0) -
          (document.scrollingElement?.clientHeight || 0)
      );
      setShowScrollFab(scrolledFromBottom > 120);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Fake assistant response
    const thinkingId = crypto.randomUUID();
    const thinking: Message = {
      id: thinkingId,
      role: "assistant",
      content: "…",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, thinking]);
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? {
                ...m,
                content:
                  "Here’s a placeholder reply from SADIA. Connect your backend to generate real answers.",
              }
            : m
        )
      );
    }, 600);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // no-op

  const suggestions = [
    "Brainstorm app ideas",
    "Summarize a PDF",
    "Write a friendly email",
    "Explain a concept simply",
  ];

  function resetChat() {
    setStarted(true);
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "New chat started. I’m SADIA — what would you like to do?",
        timestamp: Date.now(),
      },
    ]);
    setInput("");
  }

  function startChat() {
    setStarted(true);
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Hi, I’m SADIA. How can I help today? You can ask me to brainstorm, draft, summarize, or answer questions.",
        timestamp: Date.now(),
      },
    ]);
    if (canPrompt && !installed) {
      setTimeout(() => setShowPrompt(true), 400);
    }
  }

  return (
  <div className="min-h-screen bg-app flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-surface border-b border-soft">
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <button
            aria-label="Menu"
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100"
            onClick={() => setDrawerOpen(true)}
          >
            <RxHamburgerMenu size={20} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <img src={sadiaLogo} alt="SADIA logo" className="h-7 w-7 shrink-0 rounded-full bg-card border border-soft object-contain" />
            <span className="text-base brand-font truncate">SADIA</span>
            {!installed && (
              <button
                className={`ml-auto hide-xs inline-flex items-center gap-2 shrink-0 rounded-full border px-2.5 py-1 text-xs ${canPrompt ? 'border-soft hover:bg-gray-100' : 'border-dashed border-soft text-gray-600'}`}
                onClick={() => setShowPrompt(true)}
              >
                Install app
              </button>
            )}
          </div>
          <button
            onClick={() => {
              const hasUserMessage = messages.some((m) => m.role === "user");
              if (started && hasUserMessage) setConfirmNewOpen(true);
              else resetChat();
            }}
            aria-label="New chat"
            className="shrink-0 text-sm px-2 py-1 rounded-md bg-card hover:bg-gray-100 border border-soft"
          >
            New
          </button>
        </div>
      </header>
      {/* PWA Install Prompt Popup */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-xs w-full text-center card-shadow fade-up border border-soft">
            <img src={sadiaLogo} alt="SADIA logo" className="mx-auto mb-3 h-12 w-12 rounded-full bg-card border border-soft object-contain" />
            <div className="font-semibold text-lg mb-1">Install SADIA</div>
            <div className="text-muted text-sm mb-4">Get the full app experience on your device. Install SADIA to your home screen.</div>
            <div className="flex gap-2 justify-center">
              <button
                className="rounded-lg btn-primary px-4 py-2"
                onClick={prompt}
              >Install</button>
              <button
                className="rounded-lg bg-card border border-soft px-4 py-2 hover:bg-gray-100"
                onClick={dismiss}
              >Maybe later</button>
            </div>
            {!canPrompt && (
              <div className="mt-3 text-xs text-muted">
                Tip: On iOS Safari, use Share → Add to Home Screen. On desktop Chrome, use the install icon in the address bar.
              </div>
            )}
          </div>
        </div>
      )}

  {/* Sidebar Drawer */}
      <div
        className={`fixed inset-0 z-30 ${drawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        {/* Overlay */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setDrawerOpen(false)}
        />
        {/* Panel */}
        <aside
          role="dialog"
          aria-modal="true"
          className={`absolute left-0 top-0 bottom-0 w-[78%] max-w-[320px] bg-card border-r border-soft shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-soft">
            <div className="font-semibold brand-font">SADIA</div>
            <button
              aria-label="Close"
              className="p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setDrawerOpen(false)}
            >
              <RxCross2 size={18} />
            </button>
          </div>

          <div className="p-3">
            <button
              onClick={() => {
                const hasUserMessage = messages.some((m) => m.role === "user");
                if (started && hasUserMessage) setConfirmNewOpen(true);
                else resetChat();
                setDrawerOpen(false);
              }}
              className="w-full mb-3 flex items-center justify-center gap-2 rounded-xl border border-soft px-3 py-2 text-sm hover:bg-gray-50"
            >
              + New Chat
            </button>

            <nav className="text-sm">
              <Link
                to="/settings"
                onClick={() => setDrawerOpen(false)}
                className="block rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                Settings
              </Link>
              <Link
                to="/home"
                onClick={() => setDrawerOpen(false)}
                className="block rounded-lg px-3 py-2 hover:bg-gray-50 text-red-600"
              >
                Logout
              </Link>
            </nav>

            {/* Placeholder for conversation list */}
            <div className="mt-4 border-t border-soft pt-3">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Recent</div>
              <div className="text-muted text-sm">No conversations yet</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Messages / Onboarding */}
  <main className="relative flex-1 px-3 pb-28 pt-4 fade-up">{/* pad bottom for composer */}
        {/* Background aurora blobs */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora-blob aurora-1" />
          <div className="aurora-blob aurora-2" />
        </div>
  <div className="mx-auto w-full max-w-xl px-0">
          {!started ? (
            <div className="mt-24 text-center fade-up">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full btn-primary flex items-center justify-center font-semibold">S</div>
              <h1 className="text-2xl font-semibold mb-2">Hey, this is SADIA</h1>
              <p className="text-muted mb-6">Your AI assistant for brainstorming, writing, and answers. Ready when you are.</p>
              <button
                onClick={startChat}
                className="hover-grow inline-flex items-center justify-center rounded-xl btn-primary px-4 py-2 text-sm font-medium card-shadow"
              >
                Start Chat
              </button>
            </div>
          ) : (
            <>
              {hasOnlyAssistant && (
                <div className="mb-4 grid grid-cols-2 gap-2 fade-up">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left rounded-2xl border border-soft px-3 py-2 text-sm hover:bg-gray-50 bg-card"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
              {/* Typing indicator when last assistant message is ellipsis */}
              {messages.length > 0 && messages[messages.length - 1]?.content === "…" && (
                <div className="w-full justify-start flex mb-3">
                  <div className="mr-2 mt-1 h-7 w-7 shrink-0 rounded-full btn-primary flex items-center justify-center text-xs font-semibold">S</div>
                  <div className="max-w-[78%] sm:max-w-[82%] rounded-2xl px-3.5 py-2 bubble-assistant rounded-bl-sm">
                    <div className="typing-dots text-gray-700">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={listEndRef} />
            </>
          )}
        </div>
      </main>

      {/* Composer */}
      {started && (
        <div
          className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/80 backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto w-full max-w-xl px-3 pt-2 pb-3">
            <div className="relative">
              {/* subtle top gradient like ChatGPT */}
              <div className="pointer-events-none absolute -top-4 left-0 right-0 h-4 bg-gradient-to-t from-transparent to-white" />
            </div>
            <div className="flex items-end gap-2 fade-up">
              <button
                aria-label="Add"
                className="shrink-0 p-2 rounded-xl hover:bg-gray-100 hover-grow"
                onClick={() => send("Create a to-do list for this week")}
              >
                <RxPlus size={20} />
              </button>
              <div className="flex-1 rounded-2xl border border-gray-200 bg-white px-3 py-2 card-shadow">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Message SADIA"
                  className="w-full resize-none outline-none text-[15px] leading-6 placeholder:text-gray-400 max-h-40"
                />
              </div>
        {input.trim().length === 0 ? (
                <button
                  aria-label="Voice input"
          className="shrink-0 p-2 rounded-xl btn-primary hover:opacity-90 hover-grow card-shadow"
                  onClick={() => alert("Microphone not implemented")}
                >
                  <IoMicOutline size={18} />
                </button>
              ) : (
                <button
                  aria-label="Send"
          className="shrink-0 p-2 rounded-xl btn-primary hover:opacity-90 hover-grow card-shadow"
                  onClick={() => send()}
                >
                  <RxPaperPlane size={18} />
                </button>
              )}
            </div>
            <div className="mt-2 text-[11px] text-gray-500 text-center">
              SADIA can make mistakes. Check important info.
            </div>
          </div>
        </div>
      )}

      {/* Scroll-to-bottom floating action button */}
      {showScrollFab && (
        <button
          aria-label="Scroll to bottom"
          onClick={() => listEndRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="fixed bottom-24 right-4 z-30 rounded-full bg-black text-white p-3 shadow-lg hover:opacity-90"
        >
          ↓
        </button>
      )}

      {/* Confirm New Chat Modal */}
      <ConfirmModal
        open={confirmNewOpen}
        title="Start a new chat?"
        description={
          <>This will clear the current conversation from the screen. Your past chats are stored locally and won’t sync.</>
        }
        confirmText="Start new chat"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          setConfirmNewOpen(false);
          resetChat();
        }}
        onCancel={() => setConfirmNewOpen(false)}
      />
    </div>
  );
}
