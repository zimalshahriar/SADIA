import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import type { Program } from "../types/models";
import { generateWithGemini, generateWithGeminiParts } from "./gemini";

const IDENTITY_EN = "SADIA - Smart Autonomous Digital Intelligence Assistant, Nick name: Sadia. She is here to help Bangladeshi students who want to study abroad.";
const IDENTITY_BN = "সাদিয়া (SADIA) — Smart Autonomous Digital Intelligence Assistant। ডাকনাম: Sadia। বাংলাদেশি শিক্ষার্থীদের বিদেশে পড়াশোনায় সাহায্য করার জন্যই তিনি আছেন।";
const IDENTITY_BANGLISH = "SADIA - Smart Autonomous Digital Intelligence Assistant, nickname: Sadia. Bangladesh-i students der bideshe porashonay help korar jonno ami ekhane.";

function hasBangla(text: string) {
  return /[\u0980-\u09FF]/.test(text);
}

const BANGLISH_HINTS = [
  "bideshe","porashona","porashuna","porashonay","porashonai","kom","khoroch","sosta","dame","snatok","snatokottor","bangladeshi","desh","deshe","varsity",
  // common Banglish helper words and romanized Bangla
  "deu","dao","den","bolen","kichu","kono","ektu","ktu","aro","beshi",
  "apni","apnar","apnake","tumi","tomar","tumar","ami","amake",
  "jante","janate","janbo","jabo","korbo","kore","korechen","korben","hobe","thakbe",
  "somporke","shomporke","somproke","kothay","kivabe","kibhabe","keno","karon","tai",
  "valo","bhalo","onek","kharap","dorkar","lagbe","koto","kotota","kotodur"
];

// Polite acknowledgments that shouldn't trigger domain guard
const POLITE_PHRASES: string[] = [
  // English
  "thanks", "thank you", "thx", "tnx", "thanks a lot", "appreciate", "much appreciated",
  "great", "great work", "awesome", "nice", "cool", "well done", "good job",
  // Bangla script
  "ধন্যবাদ", "ধন্যবাদ।", "ধন্যবাদ!", "ধন্যবাদ,",
  // Banglish/romanized
  "dhonnobad", "donobad", "shukriya"
];

function isPolitePhrase(q: string): boolean {
  const s = q.trim().toLowerCase();
  // strip trivial punctuation
  const core = s.replace(/[!.,\s]+$/g, "");
  return POLITE_PHRASES.some((p) => core === p || core.includes(p));
}

function detectUserLanguage(text: string): "en" | "bn" | "banglish" {
  if (hasBangla(text)) return "bn";
  const s = text.toLowerCase();
  const hits = BANGLISH_HINTS.filter((t) => s.includes(t)).length;
  return hits >= 1 ? "banglish" : "en";
}

function isIdentityQuestion(q: string) {
  const s = q.toLowerCase();
  // English/Banglish
  if (
    s.includes("who are you") ||
    s.includes("what is your name") ||
    s.includes("who is sadia") ||
    s.trim() === "who are you?" ||
    s.trim() === "who are you" ||
    s.includes("tumi ke") ||
    s.includes("apni ke") ||
    s.includes("ke tumi")
  ) return true;
  // Bangla script
  return /তুমি কে|আপনি কে|সাদিয়া কে|সাদিয়া কে|তুমি কে\?|আপনি কে\?/u.test(q);
}

// Detect country mentions (English, Bangla, and common aliases)
const COUNTRY_MAP: Record<string, string[]> = {
  "United States": ["usa", "us", "america", "united states", "united states of america", "যুক্তরাষ্ট্র", "আমেরিকা", "ইউএসএ", "ইউএস"],
  "United Kingdom": ["uk", "england", "britain", "united kingdom", "scotland", "wales", "great britain", "ইউকে", "ইংল্যান্ড", "ব্রিটেন"],
  "Canada": ["canada", "কানাডা"],
  "Australia": ["australia", "অস্ট্রেলিয়া", "অস্ট্রেলিয়া"],
  "Italy": ["italy", "italia", "ইতালি"],
  "Germany": ["germany", "deutschland", "জার্মানি"],
  "France": ["france", "ফ্রান্স"],
  "Netherlands": ["netherlands", "holland", "নেদারল্যান্ডস", "হল্যান্ড"],
  "Sweden": ["sweden", "সুইডেন"],
  "Norway": ["norway", "নরওয়ে", "নরওয়ে"],
  "Finland": ["finland", "ফিনল্যান্ড"],
  "Denmark": ["denmark", "ডেনমার্ক"],
  "Spain": ["spain", "স্পেন"],
  "Portugal": ["portugal", "পর্তুগাল"],
  "Ireland": ["ireland", "আয়ারল্যান্ড", "আয়ারল্যান্ড"],
  "Poland": ["poland", "পোল্যান্ড"],
  "Czech Republic": ["czech", "czech republic", "চেক", "চেক রিপাবলিক"],
  "Austria": ["austria", "অস্ট্রিয়া"],
  "Switzerland": ["switzerland", "সুইজারল্যান্ড"],
  "Japan": ["japan", "জাপান"],
  "South Korea": ["south korea", "korea", "দক্ষিণ কোরিয়া", "কোরিয়া"],
  "China": ["china", "চীন"],
  "Taiwan": ["taiwan", "তাইওয়ান"],
  "Hong Kong": ["hong kong", "হংকং"],
  "Singapore": ["singapore", "সিঙ্গাপুর"],
  "Malaysia": ["malaysia", "মালয়েশিয়া", "মালয়েশিয়া"],
  "India": ["india", "ভারত"],
  "United Arab Emirates": ["uae", "united arab emirates", "dubai", "abu dhabi", "ইউএই", "দুবাই", "আবুধাবি"],
  "Saudi Arabia": ["saudi", "saudi arabia", "সৌদি", "সৌদি আরব"],
  "Qatar": ["qatar", "কাতার"],
  "Turkey": ["turkey", "তুরস্ক"],
  "New Zealand": ["new zealand", "nz", "নিউজিল্যান্ড"]
};

function detectCountry(q: string): { canon: string; aliases: string[] } | null {
  const s = q.toLowerCase();
  for (const [canon, aliases] of Object.entries(COUNTRY_MAP)) {
    if (aliases.some((a) => s.includes(a))) {
      return { canon, aliases };
    }
  }
  return null;
}

const ABROAD_TERMS = [
  // English/Banglish
  "study abroad", "overseas study", "abroad study", "bideshe porashona", "bideshe pora", "bideshe porashuna",
  // Bangla
  "বিদেশে", "বিদেশে পড়াশোনা", "বিদেশে পড়াশোনা", "পড়াশোনা", "পড়াশোনা"
];
const BD_TERMS = [
  "bangladesh", "bangladeshi", "bd student", "bangladesh theke",
  "বাংলাদেশ", "বাংলাদেশি", "বাংলাদেশ থেকে"
];
const PROGRAM_TERMS = [
  "program", "programs", "course", "courses", "university", "varsity",
  "প্রোগ্রাম", "কোর্স", "বিশ্ববিদ্যালয়", "বিশ্ববিদ্যালয়"
];

function isDomainQuestion(q: string) {
  const s = q.toLowerCase();
  const hasAbroad = ABROAD_TERMS.some(t => s.includes(t)) || /বিদেশ/u.test(q);
  const hasBD = BD_TERMS.some(t => s.includes(t));
  const mentionsPrograms = PROGRAM_TERMS.some(t => s.includes(t));
  const hasCountry = !!detectCountry(q);
  const { wantLowCost, level } = parseFilters(q);
  const hasFollowupRef = isDetailsRequest(q) || detectOrdinalIndex(q) !== null;
  // Accept if:
  // - explicit abroad intent, OR
  // - mentions Bangladesh, OR
  // - user hints academic selection (level/affordability/program terms), OR
  // - mentions a destination country (short follow-ups like “USA er suggestion deu”)
  // - or a details/ordinal follow-up when we have a recent shortlist
  if (hasAbroad || hasBD || mentionsPrograms || wantLowCost || !!level || hasCountry) return true;
  if (hasFollowupRef && lastSuggested.length > 0) return true;
  return false;
}

const GENERIC_WORDS = new Set< string >([
  "what","which","can","could","you","we","offer","show","list","tell",
  "student","students","bangladeshi","bangladesh","option","options","program","programs","course","courses",
  "help","info","information","guide","suggest","suggestions",
  // Bangla commons
  "কি","কী","বল","বলতে","পারো","আমাকে","আমাদের","অপশন","তালিকা","দাও","দিন","সহায়তা","সাহায্য",
  "বাংলাদেশ","বাংলাদেশি","প্রোগ্রাম","কোর্স","বিশ্ববিদ্যালয়","বিশ্ববিদ্যালয়","পড়াশোনা","পড়াশোনা"
]);

function parseFilters(q: string) {
  const s = q.toLowerCase();
  const wantLowCost = /(?:low\s*cost|cheap|affordable|budget|lowest|low\s*fee|sosta|kom\s*(khoroch|fee|tuition)|kom\s*dame|সস্তা|কম\s*খরচ|স্বল্প\s*খরচ|কম\s*টিউশন|স্বল্প\s*টিউশন|কম\s*ফি|বাজেট)/u.test(s);
  let level: Program["level"] | undefined;
  if (/(?:bachelor|undergrad|undergraduate|bsc|ba|স্নাতক|snatok)/u.test(s)) level = "Bachelors";
  if (/(?:master|msc|ma|graduate|মাস্টার্স|স্নাতকোত্তর|snatokottor)/u.test(s)) level = "Masters";
  // Unicode-aware tokenization: keep all letters (incl. Bangla) and numbers
  const tokens = s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !["from","for","and","the","with","study","abroad","low","cost","cheap","affordable","budget","in","to"].includes(t));
  const effectiveTokens = tokens.filter((t) => !GENERIC_WORDS.has(t));
  return { wantLowCost, level, tokens, effectiveTokens } as const;
}

function isProgramLookup(q: string) {
  const s = q.toLowerCase();
  const { wantLowCost, level } = parseFilters(q);
  const hasCountry = !!detectCountry(q);
  const mentionsProgram = PROGRAM_TERMS.some((t) => s.includes(t));
  if (isDetailsRequest(q) || detectOrdinalIndex(q) !== null) return true;
  // Heuristics: listing or finding specific studies usually contains these intents
  const listHints = [
    "list", "options", "offer", "show", "find", "suggest", "suggestion", "recommend", "recommendation",
    // affordability cues
    "low cost", "cheap", "affordable",
    // Bangla cues
    "কম খরচ", "সস্তা", "অপশন", "পরামর্শ", "রিকমেন্ড", "সাজেশন", "সাজেস্ট"
  ]; 
  const hasListHint = listHints.some((t) => s.includes(t));
  return hasCountry || mentionsProgram || wantLowCost || !!level || hasListHint;
}

// Track last follow-up line to avoid repetition within the session
let lastCloserText: string | null = null;
let lastCloserLang: "en" | "bn" | "banglish" | null = null;
// Remember the last set of suggested programs for ordinal follow-ups like “second program”
let lastSuggested: Program[] = [];

type Closer = { text: string; tags: Array<"country" | "level" | "budget" | "subject"> };

const CLOSERS_EN: Closer[] = [
  { text: "Want me to narrow by country or level?", tags: ["country", "level"] },
  { text: "Tell me your target country and budget; I’ll refine it.", tags: ["country", "budget"] },
  { text: "Prefer Bachelor’s or Master’s? I can filter.", tags: ["level"] },
  { text: "Have a subject or destination in mind? Say it and I’ll shortlist.", tags: ["subject", "country"] },
  { text: "Need only low‑tuition picks? I can sort by fees.", tags: ["budget"] },
];

const CLOSERS_BN: Closer[] = [
  { text: "দেশ বা লেভেল বলে দিলে আরও ছেঁকে দিই?", tags: ["country", "level"] },
  { text: "কোন দেশ আর বাজেট ভাবছেন? জানালে ঠিক করে দিচ্ছি।", tags: ["country", "budget"] },
  { text: "বাচেলরস না মাস্টার্স—কোনটা? বললেই ফিল্টার করি।", tags: ["level"] },
  { text: "কোন সাবজেক্ট বা দেশ টার্গেট? বলুন, ছোট তালিকা দেব।", tags: ["subject", "country"] },
  { text: "শুধু কম টিউশন চান? সেভাবেই সাজিয়ে দেব।", tags: ["budget"] },
];

const CLOSERS_BGL: Closer[] = [
  { text: "Country ba level bolle ami aro chheke dei?", tags: ["country", "level"] },
  { text: "Kon desh ar budget mathay? bolle refine kore dibo.", tags: ["country", "budget"] },
  { text: "Bachelors naki Masters? bollei filter kore dibo.", tags: ["level"] },
  { text: "Kon subject ba destination target? bolun shortlist kore dei.", tags: ["subject", "country"] },
  { text: "Sudhu low tuition chan? oi dike sort kore debo.", tags: ["budget"] },
];

function pickCloser(lang: "en" | "bn" | "banglish", wantLowCost: boolean, levelKnown: boolean) {
  const pool = lang === "bn" ? CLOSERS_BN : lang === "banglish" ? CLOSERS_BGL : CLOSERS_EN;
  let candidates = pool.slice();
  // Bias toward intent
  if (wantLowCost) candidates = candidates.filter(c => c.tags.includes("budget")) || candidates;
  if (!levelKnown) {
    const levelCands = candidates.filter(c => c.tags.includes("level"));
    if (levelCands.length) candidates = levelCands;
  }
  // Avoid repeating the exact same closer back-to-back
  if (lastCloserText && lastCloserLang === lang && candidates.length > 1) {
    candidates = candidates.filter(c => c.text !== lastCloserText) || candidates;
  }
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  lastCloserText = chosen.text;
  lastCloserLang = lang;
  return chosen.text;
}

// Detect if the user is asking for more details about a specific program
function isDetailsRequest(q: string): boolean {
  const s = q.toLowerCase();
  const hints = [
  "more about", "know more", "details", "detail", "tell me about", "show about", "explain",
    // Banglish/Bangla cues
  "details den", "details dao", "details deu", "bistarito", "bistarito janate",
  // romanized Bangla frequent forms
  "somporke", "shomporke", "somproke", "aro", "aro details", "jante chai", "jante pari", "janate paren",
  // Bangla script
  "আরও", "বিস্তারিত", "ডিটেইলস", "সম্পর্কে", "জানতে চাই"
  ];
  return hints.some(h => s.includes(h));
}

// Detect ordinal like first/second/third in English, Bangla, and Banglish
function detectOrdinalIndex(q: string): number | null {
  const s = q.toLowerCase();
  const checks: Array<{ idx: number; patterns: string[] }> = [
    { idx: 0, patterns: [
      'first', '1st', 'first one', 'first program', 'first ta',
      'prothom', 'prothom ta', 'প্রথম', 'প্রথমটা', 'প্রথম টি', '১ম'
    ]},
    { idx: 1, patterns: [
      'second', '2nd', 'second one', 'second program', 'second ta',
      'ditiyo', 'ditio', 'ditiyo ta', 'দ্বিতীয়', 'দ্বিতীয়', 'দ্বিতীয়টা', '২য়', '২য়'
    ]},
    { idx: 2, patterns: [
      'third', '3rd', 'third one', 'third program', 'third ta',
      'tritiyo', 'tritio', 'তৃতীয়', 'তৃতীয়', '৩য়', '৩য়'
    ]},
  ];
  for (const c of checks) {
    if (c.patterns.some(p => s.includes(p))) return c.idx;
  }
  return null;
}

// Choose the best-matching program given a query and a candidate list
function chooseBestProgram(candidates: Program[], q: string): Program | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const s = q.toLowerCase();
  // Prefer exact/substring matches on course or university first
  const direct = candidates.find(p =>
    (p.courseName && s.includes(p.courseName.toLowerCase())) ||
    (p.university && s.includes(p.university.toLowerCase()))
  );
  if (direct) return direct;
  // Score by token overlap
  const { tokens } = parseFilters(q);
  let best: { p: Program; score: number } | null = null;
  for (const p of candidates) {
    const blob = `${p.courseName} ${p.university} ${p.city} ${p.country} ${p.about}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (blob.includes(t)) score += 2;
    }
    // Small bias for shorter course names (more specific) and same-country queries already filtered
    score += Math.max(0, 20 - (p.courseName?.length || 0) / 5);
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p || candidates[0];
}

async function translateAboutIfNeeded(about: string | undefined, lang: "en" | "bn" | "banglish"): Promise<string> {
  const text = (about || "").trim();
  if (!text) return "No detailed description is available from the university.";
  if (lang === "en") return text;
  const target = lang === "bn" ? "Bangla" : "Banglish (Bangla written in Latin letters)";
  const prompt = `Translate the following program description into ${target}. Keep facts unchanged and avoid adding any new claims. Keep it natural and concise (3–5 short lines).\n\nText:\n${text}\n\nOutput only the translated text.`;
  try {
    const res = await generateWithGemini(prompt);
    const cleaned = res?.trim();
    return cleaned || text;
  } catch {
    return text;
  }
}

let cache: { at: number; items: Program[] } | null = null;
async function loadPrograms(): Promise<Program[]> {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache.items; // 1 min cache
  const snap = await getDocs(collection(db, "programs"));
  const items: Program[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
  cache = { at: now, items };
  return items;
}

function pickRelevant(programs: Program[], q: string) {
  const { wantLowCost, level, effectiveTokens } = parseFilters(q);
  let arr = programs.slice();
  if (level) arr = arr.filter((p) => p.level === level);
  // If a country is detected, prefer programs from that country
  const country = detectCountry(q);
  if (country) {
    const filteredByCountry = arr.filter((p) => {
      const c = (p.country || "").toLowerCase();
      return c && country.aliases.some((a) => c.includes(a));
    });
    if (filteredByCountry.length > 0) arr = filteredByCountry;
  }
  if (effectiveTokens.length) {
    const filtered = arr.filter((p) => {
      const blob = `${p.courseName} ${p.university} ${p.city} ${p.country} ${p.about}`.toLowerCase();
      return effectiveTokens.every((t) => blob.includes(t));
    });
    arr = filtered.length > 0 ? filtered : arr; // if too strict, keep original set
  }
  arr.sort((a, b) => {
    if (wantLowCost) return (a.tuitionBDT || 0) - (b.tuitionBDT || 0);
    const t = (a.tuitionBDT || 0) - (b.tuitionBDT || 0);
    if (t !== 0) return t;
    return a.courseName.localeCompare(b.courseName);
  });
  return arr.slice(0, 8);
}

export async function askSadia(question: string): Promise<string> {
  const q = question.trim();
  if (!q) return "Please type a question.";

  const lang = detectUserLanguage(q);
  // Friendly acknowledgment for polite messages like "Thanks"
  if (isPolitePhrase(q)) {
    if (lang === 'bn') return "আপনাকে ধন্যবাদ! আরও কিছু জানতে চাইলে বলুন।";
    if (lang === 'banglish') return "Dhonnobad! Jodi aro kichu janar thake, prosno korun.";
    return "Thank you! Let me know if you have any more questions.";
  }
  if (isIdentityQuestion(q)) return lang === 'bn' ? IDENTITY_BN : lang === 'banglish' ? IDENTITY_BANGLISH : IDENTITY_EN;

  if (!isDomainQuestion(q)) {
    if (lang === 'bn') return "আমি শুধু বাংলাদেশি শিক্ষার্থীদের বিদেশে পড়াশোনা বিষয়েই সাহায্য করি। অনুগ্রহ করে সেই বিষয়ে প্রশ্ন করুন।";
    if (lang === 'banglish') return "Ami shudhu Bangladesh-i students der bideshe porashona niye help kori. Oi topic e prosno korun, please.";
    return "I can help with Study Abroad from Bangladesh topics only. Please ask a question in that area.";
  }
  const programQuery = isProgramLookup(q);
  const programs = await loadPrograms();
  const relevant = programQuery ? pickRelevant(programs, q) : [];

  // If the user is asking for details about a specific program, show the About
  if (programQuery && isDetailsRequest(q)) {
  // Prefer the last shown suggestions to respect ordinal references like “second program”
  const source = (lastSuggested && lastSuggested.length) ? lastSuggested : (relevant.length ? relevant : programs);
  const ord = detectOrdinalIndex(q);
  const target = (ord !== null && ord >= 0 && ord < source.length) ? source[ord] : chooseBestProgram(source, q);
    if (!target) {
      if (lang === 'bn') return "কোন প্রোগ্রামটি বোঝাতে চাচ্ছেন? নামটা একটু স্পষ্ট করে বলবেন?";
      if (lang === 'banglish') return "Kon program ta bolchen? Nam ta ektu clear kore bolben?";
      return "Which program do you mean? Please mention the name so I can show details.";
    }
    const aboutText = await translateAboutIfNeeded(target.about, lang);
  const tuitionLabel = lang === 'bn' ? 'টিউশন' : 'Tuition';
  const header = `${target.courseName} (${target.level}) — ${target.university}, ${target.city ? target.city + ", " : ""}${target.country} — ${tuitionLabel}: BDT ${Number(target.tuitionBDT || 0).toLocaleString()}`;
    // Flavor notes (generic, safe)
    const flavor = (() => {
      if (lang === 'bn') {
        return [
          "• আপনার লেভেল আর বাজেট মাথায় রেখে মিলিয়ে দেখুন।",
          "• ইউনিভার্সিটির অফিসিয়াল সাইটে রিকোয়ারমেন্ট ও ডেডলাইন দেখে নিন।",
          "• প্রয়োজনে IELTS/TOEFL প্রস্তুতি আগে থেকে নিন।",
        ];
      }
      if (lang === 'banglish') {
        return [
          "• Apnar level ar budget er sathe mile kina check korun.",
          "• University-r official site e requirement ar deadline dekhun.",
          "• Proyojone IELTS/TOEFL age thekei ready rakhun.",
        ];
      }
      return [
        "• See if it fits your level and budget.",
        "• Check entry requirements and deadlines on the official site.",
        "• Prepare IELTS/TOEFL early if needed.",
      ];
    })();
    const closer = pickCloser(lang, false, !!target.level);
    const aboutLabel = lang === 'bn' ? 'সংক্ষেপে:' : lang === 'banglish' ? 'Choto kore:' : 'About:';
    return [header, aboutLabel, aboutText, ...flavor, closer].join("\n");
  }

  // When listing programs, remember them for follow-up detail questions
  if (programQuery && !isDetailsRequest(q)) {
    lastSuggested = relevant.slice();
  }

  // Build a tight prompt that forces grounding in provided data
  const contextJson = JSON.stringify(
    relevant.map((p) => ({
      courseName: p.courseName,
      level: p.level,
      university: p.university,
      city: p.city,
      country: p.country,
      tuitionBDT: p.tuitionBDT,
      about: p.about,
    })),
  );

  const systemPrograms = `You are SADIA - Smart Autonomous Digital Intelligence Assistant (nickname: Sadia). You help Bangladeshi students who want to study abroad.
For specific program recommendations, answer ONLY using the provided program entries. Do not invent universities, program names, or tuition figures beyond the provided data.
You may add brief general tips (e.g., scholarship search, application timing) but keep them clearly separate from the listed programs.

Tone & style:
- Warm, human, and encouraging—as if chatting with a student.
- Vary your openings and avoid repetitive phrasing.
- Keep sentences short and clear. Use concise bullet points for lists.
- Include tuition (BDT, with commas) when relevant. Prefer low tuition when asked for affordability.
- End with a brief helpful follow‑up like “Want me to narrow by country or level?”

Language:
 - The user may write in Bangla or Banglish. Understand both.
 - Reply in the user’s language. If language is Banglish (Bangla written in Latin letters), write Bangla words using Latin letters (e.g., "kom khoroch er course").

Output: plain text suitable for a chat bubble (no markdown headers).`;

  const systemGeneral = `You are SADIA - Smart Autonomous Digital Intelligence Assistant (nickname: Sadia). You help Bangladeshi students who want to study abroad.
For general guidance (process, timelines, exams, budgeting, country advice), you may answer from your own knowledge tailored to Bangladeshi students.
Do NOT invent specific universities, program names, or exact tuition figures unless they are provided. Prefer practical, actionable steps.

Tone & style:
- Warm, human, and encouraging. Short sentences. Bulleted lists for steps.
- End with a varied, concise follow‑up question only if helpful.

Language: Match the user's language (Bangla/English/Banglish).`;

  const replyLang = lang === 'bn' ? 'Bangla' : lang === 'banglish' ? 'Banglish (Bangla written in Latin letters)' : 'English';
  const prevAvoid = lastCloserText ? `Avoid repeating this follow‑up line: "${lastCloserText}".` : '';
  const hintIntent = (() => {
    const { wantLowCost, level } = parseFilters(q);
    const hints: string[] = [];
    if (wantLowCost) hints.push('If you add a follow‑up, you may ask about budget.');
    if (!level) hints.push('If level is unclear, you may ask Bachelor’s vs Master’s.');
    hints.push('You may also ask for a country or subject, but vary it across turns or omit if redundant.');
    return hints.join(' ');
  })();
  const baseSystem = programQuery ? systemPrograms : systemGeneral;
  const prompt = programQuery
    ? `${baseSystem}\n\nReply strictly in: ${replyLang}. ${prevAvoid} ${hintIntent}\n\nUser question: ${q}\n\nPrograms (JSON array):\n${contextJson}`
    : `${baseSystem}\n\nReply strictly in: ${replyLang}. ${prevAvoid}\n\nUser question: ${q}`;

  try {
    const text = await generateWithGemini(prompt);
    const cleaned = text?.trim();
    if (cleaned) {
      // If we just listed programs, we already saved lastSuggested above
      return cleaned;
    }
  } catch (e) {
    // fall through to deterministic response
  }

  // Fallback deterministic rendering (friendly tone with varied closer)
  const bn = lang === 'bn';
  const bgl = lang === 'banglish';
  if (programQuery) {
  // Save last suggestions for ordinal follow-ups in fallback path, too
  lastSuggested = relevant.slice();
    const openersEN = [
      "Here are a few budget‑friendly picks:",
      "Some affordable options you can consider:",
      "I looked through our programs. These stand out for cost:",
    ];
    const openersBN = [
      "কিছু বাজেট‑ফ্রেন্ডলি অপশন দেখুন:",
      "সাশ্রয়ী কিছু প্রোগ্রাম দিচ্ছি:",
      "কম খরচের দিক থেকে যেগুলো ভালো লাগছে:",
    ];
    const openersBGL = [
      "Kichu budget‑friendly option dekhen:",
      "Sashroyi kichu program dichchi:",
      "Kom khoroch er dike jeigulo bhalo mone hocche:",
    ];
    const closerEN = pickCloser('en', parseFilters(q).wantLowCost, !!parseFilters(q).level);
    const closerBN = pickCloser('bn', parseFilters(q).wantLowCost, !!parseFilters(q).level);
    const closerBGL = pickCloser('banglish', parseFilters(q).wantLowCost, !!parseFilters(q).level);
    const openerPool = bn ? openersBN : bgl ? openersBGL : openersEN;
    const opener = openerPool[Math.floor(Math.random() * openerPool.length)];
    const lines = relevant.map((p) => `• ${p.courseName} (${p.level}) — ${p.university}, ${p.city ? p.city + ", " : ""}${p.country} — Tuition: BDT ${Number(p.tuitionBDT || 0).toLocaleString()}`);
    return [opener, ...lines, bn ? closerBN : bgl ? closerBGL : closerEN].join("\n");
  }
  // General guidance fallback
  const tipsEN = [
    "Shortlist 2–3 countries that fit your budget and language comfort.",
    "Check universities’ official pages for entry requirements and deadlines.",
    "Prepare IELTS/TOEFL early; aim to finish 2–3 months before applying.",
    "Budget beyond tuition: living, insurance, visa, and travel.",
    "Search scholarships on official portals and country‑specific sites.",
  ];
  const tipsBN = [
    "বাজেট আর ভাষা কমফোর্ট মিলিয়ে ২–৩টা দেশ শর্টলিস্ট করুন.",
    "ইউনিভার্সিটির অফিসিয়াল সাইটে রিকোয়ারমেন্ট ও ডেডলাইন চেক করুন.",
    "IELTS/TOEFL আগেই প্রস্তুত করুন; অ্যাপ্লাই করার ২–৩ মাস আগে শেষ করুন.",
    "টিউশনের বাইরে থাকার খরচ, ইন্স্যুরেন্স, ভিসা, ট্রাভেল ধরুন.",
    "স্কলারশিপের জন্য অফিসিয়াল পোর্টাল ও দেশভিত্তিক সাইট দেখুন.",
  ];
  const tipsBGL = [
    "Budget ar language comfort mile 2–3 ta desh shortlist korun.",
    "University-r official page e requirement ar deadline check korun.",
    "IELTS/TOEFL agei ready korun; apply-er 2–3 mash agei sesh korun.",
    "Tuition-er baire living, insurance, visa, travel calculate korun.",
    "Scholarship er jonno official portal ar country-wise site e khujun.",
  ];
  const tips = (bn ? tipsBN : bgl ? tipsBGL : tipsEN).map((t) => `• ${t}`);
  const closer = bn ? pickCloser('bn', false, false) : bgl ? pickCloser('banglish', false, false) : pickCloser('en', false, false);
  const opener = bn ? "কিছু কাজে লাগবে এমন টিপস:" : bgl ? "Kichu kajer tips:" : "Here are a few practical tips:";
  return [opener, ...tips, closer].join("\n");
}

export async function analyzeImage(file: File, userPrompt: string | undefined): Promise<string> {
  const lang = detectUserLanguage(userPrompt || "");
  // Scope guard: still only study-abroad related images
  const domain = isDomainQuestion(userPrompt || "image");
  if (!domain) {
    if (lang === 'bn') return "আমি শুধু বাংলাদেশি শিক্ষার্থীদের বিদেশে পড়াশোনা বিষয়েই সাহায্য করি। অনুগ্রহ করে সেই বিষয়ে ছবি/তথ্য দিন।";
    if (lang === 'banglish') return "Ami shudhu Bangladesh-i students der bideshe porashona niye help kori. Oi topic related chhobi dile better.";
    return "I can help with Study Abroad from Bangladesh topics only. Please share an image relevant to that.";
  }
  const replyLang = lang === 'bn' ? 'Bangla' : lang === 'banglish' ? 'Banglish (Bangla written in Latin letters)' : 'English';
  const arrayBuf = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
  const parts = [
    { text: `You are SADIA. Analyze the image and give concise guidance relevant to Bangladeshi students studying abroad. If the user provided a text prompt, consider it. Reply strictly in ${replyLang}. Use short bullets where helpful. Avoid hallucinating exact fees or offers not visible in the image.` },
    { inlineData: { mimeType: file.type || 'image/jpeg', data: base64 } },
  ];
  if (userPrompt) parts.unshift({ text: `User prompt: ${userPrompt}` });
  try {
    const text = await generateWithGeminiParts(parts);
    return text?.trim() || (lang === 'bn' ? 'ছবিটি থেকে পরিষ্কারভাবে তথ্য পাওয়া যায়নি।' : lang === 'banglish' ? 'Chhobiti theke clear info pelam na.' : 'Couldn’t extract clear info from the image.');
  } catch (e) {
    if (lang === 'bn') return 'ছবি বিশ্লেষণ করা গেল না। একটু পর আবার চেষ্টা করুন।';
    if (lang === 'banglish') return 'Chhobi analysis kora gelo na. Ektu pore abar try korun.';
    return 'I couldn’t analyze the image just now. Please try again.';
  }
}
