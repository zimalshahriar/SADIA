import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";

// Chat document shape stored at users/{uid}/chats/{chatId}
export type ChatMeta = {
  id: string;
  title: string;
  createdAt?: any;
  updatedAt?: any;
  lastMessagePreview?: string;
  lastMessageAt?: any;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: number; // client epoch ms for ordering fallback
  createdAt?: any;   // serverTimestamp
  imageDataUrl?: string;
};

function chatsCol(uid: string) {
  return collection(db, "users", uid, "chats");
}
function messagesCol(uid: string, chatId: string) {
  return collection(db, "users", uid, "chats", chatId, "messages");
}

// Create an empty chat with initial system/assistant greeting message.
export async function createChat(uid: string, initialAssistantMessage: string): Promise<string> {
  const chatRef = doc(chatsCol(uid));
  const chatId = chatRef.id;
  await setDoc(chatRef, {
    title: "New chat",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessagePreview: initialAssistantMessage.slice(0, 140),
    lastMessageAt: serverTimestamp(),
  });
  // Seed first assistant message
  const msgRef = doc(messagesCol(uid, chatId));
  await setDoc(msgRef, {
    role: "assistant",
    content: initialAssistantMessage,
    timestamp: Date.now(),
    createdAt: serverTimestamp(),
  });
  return chatId;
}

// Subscribe to chats list (ordered by updatedAt desc)
export function subscribeToChats(uid: string, cb: (chats: ChatMeta[]) => void) {
  const q = query(chatsCol(uid), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => {
    const out: ChatMeta[] = [];
    snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
    cb(out);
  });
}

// Subscribe to messages of a chat ordered by createdAt then timestamp
export function subscribeToMessages(uid: string, chatId: string, cb: (msgs: ChatMessage[]) => void) {
  const q = query(messagesCol(uid, chatId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const out: ChatMessage[] = [];
    snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
    // Fallback stable ordering by client timestamp if createdAt missing
    out.sort((a, b) => (a.createdAt && b.createdAt ? 0 : a.timestamp - b.timestamp));
    cb(out);
  });
}

// Add a user or assistant message; returns the id so caller can update later (e.g., placeholder -> final)
export async function addMessage(uid: string, chatId: string, partial: Omit<ChatMessage, "id"> & { id?: string }) {
  const ref = partial.id ? doc(messagesCol(uid, chatId), partial.id) : doc(messagesCol(uid, chatId));
  const id = ref.id;
  await setDoc(ref, {
    role: partial.role,
    content: partial.content,
    timestamp: partial.timestamp ?? Date.now(),
    imageDataUrl: partial.imageDataUrl || null,
    createdAt: serverTimestamp(),
  });
  // Update chat meta
  const chatRef = doc(chatsCol(uid), chatId);
  const preview = partial.content.replace(/\n/g, " ").slice(0, 140);
  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
    lastMessagePreview: preview,
    lastMessageAt: serverTimestamp(),
  }).catch(() => {});
  return id;
}

export async function updateMessage(uid: string, chatId: string, messageId: string, content: string) {
  const ref = doc(messagesCol(uid, chatId), messageId);
  await updateDoc(ref as any, { content });
  const chatRef = doc(chatsCol(uid), chatId);
  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
    lastMessagePreview: content.replace(/\n/g, " ").slice(0, 140),
    lastMessageAt: serverTimestamp(),
  }).catch(() => {});
}

export async function maybeUpdateTitle(uid: string, chatId: string, proposed: string) {
  if (!proposed) return;
  const clean = proposed.split("\n")[0].trim().slice(0, 60) || "New chat";
  const chatRef = doc(chatsCol(uid), chatId);
  // Blind update; rules should allow owner only.
  await updateDoc(chatRef, { title: clean, updatedAt: serverTimestamp() }).catch(() => {});
}

export async function deleteChat(uid: string, chatId: string) {
  // Delete messages in a batch (in chunks if needed)
  const msgsSnap = await getDocs(messagesCol(uid, chatId));
  const batch = writeBatch(db);
  msgsSnap.forEach((d) => batch.delete(d.ref));
  await batch.commit().catch(() => {});
  await deleteDoc(doc(chatsCol(uid), chatId));
}

// Delete all chats for a user (iterates; safe for modest counts). For large counts implement pagination.
export async function deleteAllChats(uid: string) {
  const chatsSnap = await getDocs(chatsCol(uid));
  for (const chat of chatsSnap.docs) {
    try { await deleteChat(uid, chat.id); } catch {}
  }
}

// Delete user doc AFTER chats (caller can also invoke auth delete)
export async function deleteUserData(uid: string) {
  try { await deleteAllChats(uid); } catch {}
  try { await deleteDoc(doc(collection(db, 'users'), uid)); } catch {}
}

// Hard delete helper for admins (assumes rules permit)
export async function adminHardDeleteUser(uid: string) {
  await deleteUserData(uid);
}
