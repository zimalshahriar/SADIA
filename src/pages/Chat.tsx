import { useEffect, useMemo, useRef, useState } from "react";
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
        <div className="mr-2 mt-1 h-7 w-7 shrink-0 rounded-full bg-black text-white flex items-center justify-center text-xs font-semibold">
          S
        </div>
      )}
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
          isUser ? "bg-black text-white rounded-br-sm" : "bg-gray-100 text-gray-900 rounded-bl-sm"
        }`}
      >
        {msg.content}
      </div>
      {isUser && <div className="ml-2" />}
    </div>
  );
}

export default function Chat() {
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
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
  <header className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            aria-label="Menu"
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100"
            onClick={() => setDrawerOpen(true)}
          >
            <RxHamburgerMenu size={20} />
          </button>
          <div className="text-base font-semibold tracking-wide">SADIA</div>
          <button onClick={resetChat} aria-label="New chat" className="text-sm px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
            New
          </button>
        </div>
      </header>

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
          className={`absolute left-0 top-0 bottom-0 w-[78%] max-w-[320px] bg-white border-r border-gray-200 shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="font-semibold tracking-wide">SADIA</div>
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
                resetChat();
                setDrawerOpen(false);
              }}
              className="w-full mb-3 flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
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
            <div className="mt-4 border-t border-gray-200 pt-3">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Recent</div>
              <div className="text-gray-400 text-sm">No conversations yet</div>
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
        <div className="mx-auto w-full max-w-xl">
          {!started ? (
            <div className="mt-24 text-center fade-up">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-black text-white flex items-center justify-center font-semibold">S</div>
              <h1 className="text-2xl font-semibold mb-2">Hey, this is SADIA</h1>
              <p className="text-gray-600 mb-6">Your AI assistant for brainstorming, writing, and answers. Ready when you are.</p>
              <button
                onClick={startChat}
                className="hover-grow inline-flex items-center justify-center rounded-xl bg-black text-white px-4 py-2 text-sm font-medium hover:opacity-90 card-shadow"
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
                      className="text-left rounded-2xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
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
                  <div className="mr-2 mt-1 h-7 w-7 shrink-0 rounded-full bg-black text-white flex items-center justify-center text-xs font-semibold">S</div>
                  <div className="max-w-[82%] rounded-2xl px-3.5 py-2 bg-gray-100 text-gray-900 rounded-bl-sm">
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
                  className="shrink-0 p-2 rounded-xl bg-black text-white hover:opacity-90 hover-grow card-shadow"
                  onClick={() => alert("Microphone not implemented")}
                >
                  <IoMicOutline size={18} />
                </button>
              ) : (
                <button
                  aria-label="Send"
                  className="shrink-0 p-2 rounded-xl bg-black text-white hover:opacity-90 hover-grow card-shadow"
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
    </div>
  );
}
