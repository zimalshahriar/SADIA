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
import { useAuth } from "../auth/AuthProvider";
import { askSadia, analyzeImage } from "../ai/assistant";
import {
  addMessage,
  createChat,
  deleteChat as deleteChatRemote,
  maybeUpdateTitle,
  subscribeToChats,
  subscribeToMessages,
  updateMessage,
} from "../chat/store";
import type { ChatMeta, ChatMessage } from "../chat/store";

// Local message type mirrors stored ChatMessage
type Message = ChatMessage;

// Normalize assistant text: strip heavy markdown, keep bullets and links readable
function formatAssistantText(raw: string) {
  let t = raw.replace(/\r\n/g, "\n");
  // Strip fenced code blocks markers (keep content)
  t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""));
  // Convert heading lines to plain
  t = t.replace(/^\s*#{1,6}\s+/gm, "");
  // Convert markdown links [text](url) -> text (url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  // Line-wise bullet/number normalization
  t = t
    .split("\n")
    .map((line) => {
      const m1 = line.match(/^\s*[*-]\s+(.+)$/);
      if (m1) return `• ${m1[1]}`;
      const m2 = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (m2) return `• ${m2[1]}`;
      return line;
    })
    .join("\n");
  // Remove bold/italic markers
  t = t.replace(/\*\*(.*?)\*\*/g, "$1");
  t = t.replace(/__(.*?)__/g, "$1");
  t = t.replace(/(?<!^)\*(.*?)\*/g, "$1");
  t = t.replace(/_(.*?)_/g, "$1");
  // Collapse excessive blank lines
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

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
        {msg.imageDataUrl && (
          <img
            src={msg.imageDataUrl}
            alt="shared"
            className="mb-2 max-h-56 w-auto rounded-lg border border-soft object-contain"
          />
        )}
        {msg.content && <>{msg.content}</>}
      </div>
      {isUser && <div className="ml-2" />}
    </div>
  );
}

export default function Chat() {
  const { signOutApp, role, maintenance, user } = useAuth();
  const { showPrompt, setShowPrompt, prompt, installed, canPrompt, dismiss } = usePwaInstallPrompt();
  const [started, setStarted] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("sadia:chat:started");
      return v === "true";
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const [micModal, setMicModal] = useState<{ open: boolean; title: string; message?: string }>(() => ({ open: false, title: "" }));
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // measure fixed bars to avoid content going under them
  const composerRef = useRef<HTMLDivElement | null>(null);
  const maintenanceRef = useRef<HTMLDivElement | null>(null);
  const [bottomPad, setBottomPad] = useState(28); // default similar to prior pb-28
  useEffect(() => {
    function recomputePad() {
      const composerH = composerRef.current?.offsetHeight || 0;
      const maintH = maintenanceRef.current?.offsetHeight || 0;
      // add small breathing room
      const extra = 16;
      setBottomPad(composerH + maintH + extra);
    }
    recomputePad();
    const ro = new ResizeObserver(recomputePad);
    if (composerRef.current) ro.observe(composerRef.current);
    if (maintenanceRef.current) ro.observe(maintenanceRef.current);
    window.addEventListener('resize', recomputePad);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputePad);
    };
  }, [started, maintenance, role]);

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

  // Subscribe to chats for user
  useEffect(() => {
    if (!user) return;
    return subscribeToChats(user.uid, (list) => {
      setChats(list);
      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
        setStarted(true);
      }
    });
  }, [user]);

  // Subscribe to messages for active chat
  useEffect(() => {
    if (!user || !activeChatId) { setMessages([]); return; }
    setLoadingMessages(true);
    const unsub = subscribeToMessages(user.uid, activeChatId, (msgs) => {
      setMessages(msgs);
      setLoadingMessages(false);
    });
    return () => unsub();
  }, [user, activeChatId]);

  // Show/hide scroll-to-bottom FAB based on scroll position
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    function onScroll() {
      if (!contentRef.current) return;
      const n = contentRef.current;
      const scrolledFromBottom = Math.abs(n.scrollHeight - n.scrollTop - n.clientHeight);
      setShowScrollFab(scrolledFromBottom > 120);
    }
    el.addEventListener("scroll", onScroll, { passive: true } as any);
    onScroll();
    return () => el.removeEventListener("scroll", onScroll as any);
  }, []);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    if (!user) return;
    // Create chat lazily if none active
    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createChat(user.uid, "Hi, I’m SADIA. I help Bangladeshi students with study abroad. Ask me about programs, costs, countries, or levels (Bachelor’s/Master’s).");
      setActiveChatId(chatId);
      setStarted(true);
    }
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
  addMessage(user.uid, chatId, userMsg).catch(()=>{});
  setMessages((prev) => [...prev, userMsg]); // optimistic after write
    setInput("");

    // Show thinking bubble
  const thinkingId = crypto.randomUUID();
  const thinking: Message = { id: thinkingId, role: "assistant", content: "…", timestamp: Date.now() };
  addMessage(user.uid, chatId, thinking).catch(()=>{});
  setMessages((prev) => [...prev, thinking]);
  // formatAssistantText is defined at module scope
    try {
      const answer = await askSadia(content);
      const formatted = formatAssistantText(answer);
      setMessages((prev) => prev.map((m) => (m.id === thinkingId ? { ...m, content: formatted } : m)));
      updateMessage(user.uid, chatId, thinkingId, formatted).catch(()=>{});
      // Set title if this was first user message
      const priorUserCount = messages.filter(m=>m.role==='user').length;
      if (priorUserCount === 0) {
        maybeUpdateTitle(user.uid, chatId, userMsg.content);
      }
    } catch (e) {
  const errTxt = "Sorry, I couldn't process that right now. Please try again.";
  setMessages((prev) => prev.map((m) => (m.id === thinkingId ? { ...m, content: errTxt } : m)));
  updateMessage(user.uid, chatId, thinkingId, errTxt).catch(()=>{});
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // no-op

  const suggestions = [
    "Low cost Bachelor's programs for Bangladeshi students",
    "Affordable Master's in Computer Science for Bangladeshi students",
    "Study abroad options in Canada for Bangladeshi students",
    "List budget-friendly programs in Europe for Bangladeshi students",
  ];

  async function resetChat() {
    if (!user) return;
    const chatId = await createChat(user.uid, "New chat started. I’m SADIA — what would you like to do?");
    setActiveChatId(chatId);
    setMessages([]); // will populate via subscription
    setStarted(true);
    setInput("");
  }

  async function startChat() {
    if (!user) return;
    const chatId = await createChat(user.uid, "Hi, I’m SADIA. I help Bangladeshi students with study abroad. Ask me about programs, costs, countries, or levels (Bachelor’s/Master’s).");
    setActiveChatId(chatId);
    setStarted(true);
    if (canPrompt && !installed) setTimeout(() => setShowPrompt(true), 400);
  }

  async function deleteChat(chatId: string) {
    if (!user) return;
    await deleteChatRemote(user.uid, chatId);
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
      setStarted(false);
    }
  }

  return (
    <div className="h-[100dvh] bg-app flex flex-col overflow-hidden">
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
              const hasUserMessage = messages.some((m) => m.role === 'user');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-5 max-w-[20rem] w-full text-center card-shadow fade-up border border-soft max-h-[80vh] overflow-auto">
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
              {(role === 'admin' || role === 'super') && (
                <Link
                  to="/admin"
                  onClick={() => setDrawerOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  Admin panel
                </Link>
              )}
              <button
                onClick={async () => { await signOutApp(); setDrawerOpen(false); }}
                className="block w-full text-left rounded-lg px-3 py-2 hover:bg-gray-50 text-red-600"
              >
                Logout
              </button>
            </nav>

            {/* Chats list */}
            <div className="mt-4 border-t border-soft pt-3 max-h-[40vh] overflow-auto">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 flex items-center justify-between">
                <span>Chats</span>
              </div>
              {chats.length === 0 && <div className="text-muted text-sm">No conversations yet</div>}
              <div className="space-y-1">
                {chats.map(c => (
                  <div key={c.id} className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${c.id===activeChatId? 'border-soft bg-white shadow-sm': 'border-transparent hover:bg-gray-50'}`}>
                    <button
                      className="flex-1 text-left truncate"
                      onClick={() => { setActiveChatId(c.id); setStarted(true); setDrawerOpen(false); }}
                      title={c.title}
                    >{c.title || 'New chat'}</button>
                    <button
                      aria-label="Delete chat"
                      className="text-gray-400 hover:text-red-600"
                      onClick={() => deleteChat(c.id)}
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

    {/* Messages / Onboarding */}
  <main ref={contentRef} className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 pt-4 fade-up" style={{ paddingBottom: bottomPad }}>{/* pad bottom for composer */}
        {/* Background aurora blobs */}
  <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
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
              {loadingMessages && <div className="text-center text-xs text-muted mb-4">Loading…</div>}
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

  {/* Composer (hidden for admins during maintenance; supers always allowed; users already blocked by route guard) */}
  {started && !(maintenance && role === 'admin') && (
        <div
          ref={composerRef}
          className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/80 backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto w-full max-w-xl px-3 pt-2 pb-3">
            <div className="relative">
              {/* subtle top gradient like ChatGPT */}
              <div className="pointer-events-none absolute -top-4 left-0 right-0 h-4 bg-gradient-to-t from-transparent to-white" />
            </div>
            <div className="flex items-end gap-2 fade-up">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f) setImageFile(f);
                }}
              />
              <button
                aria-label="Add photo"
                className="shrink-0 p-2 rounded-xl hover:bg-gray-100 hover-grow"
                onClick={() => fileInputRef.current?.click()}
                title="Add photo"
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
                  className={`shrink-0 p-2 rounded-xl ${listening ? 'bg-green-600 text-white' : 'btn-primary'} hover:opacity-90 hover-grow card-shadow`}
                  onClick={() => {
                    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (!SR) {
                      setMicModal({ open: true, title: 'Voice not available', message: 'Your browser does not support voice input here. Try mobile Chrome or Safari.' });
                      return;
                    }
                    if (!recognitionRef.current) {
                      const r = new SR();
                      r.lang = 'en-US';
                      r.interimResults = true;
                      r.continuous = true;
                      r.onresult = (ev: any) => {
                        let txt = '';
                        for (let i = ev.resultIndex; i < ev.results.length; i++) {
                          txt += ev.results[i][0].transcript;
                        }
                        setInput((prev) => (prev ? prev + ' ' : '') + txt.trim());
                      };
                      r.onerror = () => {
                        setListening(false);
                        setMicModal({ open: true, title: 'Microphone error', message: 'Permission denied or microphone not available.' });
                      };
                      r.onend = () => setListening(false);
                      recognitionRef.current = r;
                    }
                    if (!listening) {
                      try { recognitionRef.current.start(); setListening(true); } catch {}
                    } else {
                      try { recognitionRef.current.stop(); } catch {} setListening(false);
                    }
                  }}
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
          {imageFile && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={URL.createObjectURL(imageFile)}
                alt="Selected"
                className="h-14 w-14 object-cover rounded-lg border border-soft"
              />
              <button
                className="px-3 py-1 text-sm rounded-lg border border-soft hover:bg-gray-50"
                onClick={async () => {
                  if (!imageFile) return;
                  // Convert to data URL for persistent rendering in the chat
                  const dataUrl = await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(String(fr.result));
                    fr.onerror = () => reject(new Error('read failed'));
                    fr.readAsDataURL(imageFile);
                  });
                  const thinkingId = crypto.randomUUID();
                  const caption = input.trim();
                  setMessages((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), role: 'user', content: caption, imageDataUrl: dataUrl, timestamp: Date.now() },
                    { id: thinkingId, role: 'assistant', content: '…', timestamp: Date.now() },
                  ]);
                  setInput("");
                  try {
                    const ans = await analyzeImage(imageFile, caption || undefined);
                    const formatted = formatAssistantText(ans);
                    setMessages((prev) => prev.map((m) => m.id === thinkingId ? { ...m, content: formatted } : m));
                  } catch (e) {
                    setMessages((prev) => prev.map((m) => m.id === thinkingId ? { ...m, content: "Sorry, I couldn't analyze that image right now." } : m));
                  } finally {
                    setImageFile(null);
                  }
                }}
              >Analyze photo</button>
              <button
                className="px-2 py-1 text-sm rounded-lg border border-soft hover:bg-gray-50"
                onClick={() => setImageFile(null)}
              >Remove</button>
            </div>
          )}
            <div className="mt-2 text-[11px] text-gray-500 text-center">
              SADIA can make mistakes. Check important info.
            </div>
          </div>
        </div>
      )}
  {maintenance && role === 'admin' && (
        <div ref={maintenanceRef} className="fixed bottom-0 left-0 right-0 z-20 border-t border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-center text-sm">
          Maintenance mode is on.
          <Link to="/admin" className="ml-2 underline font-medium">Go to Admin</Link>
        </div>
      )}

      {/* Scroll-to-bottom floating action button */}
    {showScrollFab && (
        <button
          aria-label="Scroll to bottom"
      onClick={() => listEndRef.current?.scrollIntoView({ behavior: "smooth", block: 'end' })}
      className="fixed right-4 z-30 rounded-full bg-black text-white p-3 shadow-lg hover:opacity-90"
      style={{ bottom: Math.max(bottomPad, 24) }}
        >
          ↓
        </button>
      )}

      {/* Confirm New Chat Modal */}
      <ConfirmModal
        open={micModal.open}
        title={micModal.title}
        description={micModal.message}
        showConfirm={false}
        showCancel={true}
        cancelText="Close"
        onConfirm={() => setMicModal({ open: false, title: '' })}
        onCancel={() => setMicModal({ open: false, title: '' })}
      />
      <ConfirmModal
        open={confirmNewOpen}
        title="Start a new chat?"
        description={
          <>Start a fresh conversation. Previous chats stay in your account unless you clear them in Settings.</>
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
