import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import type { Program } from "../types/models";
import { generateWithGemini, generateWithGeminiParts } from "./gemini";

const IDENTITY_EN = "SADIA - Smart Autonomous Digital Intelligence Assistant (nickname: Sadia). She helps Bangladeshi students who want to study abroad.";
const IDENTITY_BN = "সাদিয়া (SADIA) — Smart Autonomous Digital Intelligence Assistant। ডাকনাম Sadia। তিনি বাংলাদেশি শিক্ষার্থীদের বিদেশে পড়াশোনায় সাহায্যের জন্য আছেন।";
// Banglish identity uses only formal pronouns (apni/apnar/apnake not tumi)
const IDENTITY_BANGLISH = "SADIA - Smart Autonomous Digital Intelligence Assistant (nickname: Sadia). Ami Bangladesh-i students der bideshe porashona niye apnake assist korte ekhane.";

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

// Simple greeting detection (short standalone greetings only)
const GREETINGS: string[] = [
  // English
  "hi", "hi!", "hello", "hello!", "hey", "hey!", "hey there", "good morning", "good evening", "good afternoon",
  // Bangla script
  "হাই", "হ্যালো", "হেলো", "এই", "সুপ্রভাত", "শুভ সকাল", "শুভ সন্ধ্যা", "শুভ অপরাহ্ন", "আসসালামু আলাইকুম", "আসসালামু আলাইকুম।", "আসসালামু আলাইকুম!", "আসসালামু আলায়েকুম",
  // Banglish/romanized
  "assalamu alaikum", "assalamualaikum", "assalamualaikum!", "assalamu alaikum!", "salam", "salam!", "asalamu alaikum", "good night" // (occasionally used as greeting)
];

function isGreeting(q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return false;
  // single or very short (<=4 words) message that matches a greeting variant
  if (s.split(/\s+/).length > 4) return false;
  return GREETINGS.includes(s);
}

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
  const raw = q.toLowerCase();
  const normalized = normalizeBanglaDigits(raw);
  const wantLowCost = /(?:low\s*cost|cheap|affordable|budget|lowest|low\s*fee|sosta|kom\s*(khoroch|fee|tuition)|kom\s*dame|সস্তা|কম\s*খরচ|স্বল্প\s*খরচ|কম\s*টিউশন|স্বল্প\s*টিউশন|কম\s*ফি|বাজেট)/u.test(raw);
  let level: Program["level"] | undefined;
  if (/(?:bachelor|undergrad|undergraduate|bsc|ba|স্নাতক|snatok)/u.test(raw)) level = "Bachelors";
  if (/(?:master|msc|ma|graduate|মাস্টার্স|স্নাতকোত্তর|snatokottor)/u.test(raw)) level = "Masters";
  const discipline = mapDisciplineSynonym(raw);
  const budgetUpper = extractBudgetUpper(normalized);
  const tokens = raw.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length >= 2 && !["from","for","and","the","with","study","abroad","low","cost","cheap","affordable","budget","in","to"].includes(t));
  const effectiveTokens = tokens.filter((t) => !GENERIC_WORDS.has(t));
  return { wantLowCost, level, tokens, effectiveTokens, discipline, budgetUpper } as const;
}

function normalizeBanglaDigits(s: string): string {
  const map: Record<string,string> = { '০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9' };
  return s.replace(/[০-৯]/g, d => map[d] || d);
}

function extractBudgetUpper(s: string): number | undefined {
  const patterns: RegExp[] = [
    /(under|below|less\s*than|up\s*to|upto|max(?:imum)?)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(lakh|lac|million|m)?/u,
    /([0-9]+(?:\.[0-9]+)?)\s*(lakh|lac|million|m)\s*(er)?\s*(niche|nicher|নীচে|নিচে)/u,
    /([0-9]+(?:\.[0-9]+)?)\s*(lakh|lac|million|m)/u
  ];
  for (const r of patterns) {
    const m = s.match(r);
    if (!m) continue;
    let num: string | undefined; let unit: string | undefined;
    if (m[2] && /[0-9]/.test(m[2]) && r === patterns[0]) { num = m[2]; unit = m[3]; }
    else if (m[1] && /[0-9]/.test(m[1]) && r !== patterns[0]) { num = m[1]; unit = m[2]; }
    if (!num) continue;
    let val = parseFloat(num);
    if (isNaN(val)) continue;
    if (unit) {
      if (/lakh|lac/i.test(unit)) val *= 100_000;
      else if (/million|m/i.test(unit)) val *= 1_000_000;
    } else if (val > 0 && val < 50) {
      val *= 100_000; // treat small unitless values as lakhs
    }
    if (val < 10_000) continue;
    return Math.round(val);
  }
  return undefined;
}

// Discipline canonical list
const DISCIPLINE_LIST = [
  "Agriculture & Forestry",
  "Applied Sciences & Professions",
  "Arts, Design & Architecture",
  "Business & Management",
  "Computer Science & IT",
  "Education & Training",
  "Engineering & Technology",
  "Environmental Studies & Earth Sciences",
  "Hospitality, Leisure & Sports",
  "Humanities",
  "Journalism & Media",
  "Law",
  "Medicine & Health",
  "Natural Sciences & Mathematics",
  "Social Sciences"
] as const;

type Discipline = typeof DISCIPLINE_LIST[number];

// Synonym mapping (English, Bangla script, Banglish/romanized). Extendable.
interface SynMap { [key: string]: Discipline }
const DISCIPLINE_SYNONYMS: SynMap = (() => {
  const map: SynMap = {};
  function add(keys: string[], canon: Discipline) { keys.forEach(k => map[k] = canon); }
  add([
    'coding','programming','computer','software','it','cs','কম্পিউটার','সফটওয়্যার','সফটওয়ার','আইটি','প্রোগ্রামিং','code','developer','ডেভেলপমেন্ট','ডেভেলপার'
  ], 'Computer Science & IT');
  add(['business','management','commerce','bba','mba','biz','ব্যবসা','ম্যানেজমেন্ট','কমার্স','বিজনেস'], 'Business & Management');
  add(['doctor','medicine','medical','nurse','nursing','mbbs','ফার্মেসি','চিকিৎসা','মেডিকেল','ডাক্তার','নার্স','নার্সিং'], 'Medicine & Health');
  add(['law','legal','আইন','ল' ,'llb','llm'], 'Law');
  add(['agri','agriculture','forestry','কৃষি','ফরেস্ট্রি'], 'Agriculture & Forestry');
  add(['engineering','engineer','engineers','engg','ইঞ্জিনিয়ার','ইঞ্জিনিয়ারিং','প্রকৌশল'], 'Engineering & Technology');
  add(['civil','mechanical','electrical','eee','ece','cse'], 'Engineering & Technology');
  add(['environment','earth','geology','পরিবেশ','পৃথিবী','ভূতত্ত্ব'], 'Environmental Studies & Earth Sciences');
  add(['journalism','media','masscomm','mass communication','মিডিয়া','সাংবাদিকতা'], 'Journalism & Media');
  add(['art','design','architecture','graphic','ux','arts','স্থাপত্য','ডিজাইন','আর্ট'], 'Arts, Design & Architecture');
  add(['social','sociology','international relations','anthropology','society','সমাজ','সামাজিক'], 'Social Sciences');
  add(['history','philosophy','language','literature','humanities','ইতিহাস','দর্শন','ভাষা','সাহিত্য'], 'Humanities');
  add(['math','mathematics','statistics','physics','chemistry','biology','science','natural science','গণিত','পদার্থ','রসায়ন','জীববিজ্ঞান','বিজ্ঞান'], 'Natural Sciences & Mathematics');
  add(['education','training','teacher','শিক্ষা','প্রশিক্ষণ','টিচার'], 'Education & Training');
  add(['hospitality','tourism','hotel','sports','leisure','travel','হসপিটালিটি','ট্যুরিজম','খেলা'], 'Hospitality, Leisure & Sports');
  return map;
})();

function mapDisciplineSynonym(text: string): Discipline | undefined {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const t of tokens) {
    const k = t.toLowerCase();
    if (DISCIPLINE_SYNONYMS[k]) return DISCIPLINE_SYNONYMS[k];
  }
  // phrase check
  for (const key in DISCIPLINE_SYNONYMS) {
    if (text.includes(key)) return DISCIPLINE_SYNONYMS[key];
  }
  return undefined;
}

function isProgramLookup(q: string) {
  const s = q.toLowerCase();
  const { wantLowCost, level, discipline, budgetUpper } = parseFilters(q);
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
  return hasCountry || mentionsProgram || wantLowCost || !!level || !!discipline || !!budgetUpper || hasListHint;
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
// Simple in-memory conversation history (last 20 messages). For persistence, move to Firestore per session/user.
const convo: { role: 'user' | 'assistant'; content: string; at: number }[] = [];
interface LastContext { level?: Program['level']; discipline?: string; country?: string; budgetUpper?: number }
let lastCtx: LastContext = {};
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
  const { wantLowCost, level, effectiveTokens, discipline, budgetUpper } = parseFilters(q);
  let arr = programs.slice();
  if (level) arr = arr.filter((p) => p.level === level);
  if (discipline) arr = arr.filter(p => p.discipline === discipline);
  if (budgetUpper) arr = arr.filter(p => (p.tuitionBDT || 0) > 0 && (p.tuitionBDT || 0) <= budgetUpper);
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
  const blob = `${p.courseName} ${p.university} ${p.city} ${p.country} ${p.about} ${p.discipline}`.toLowerCase();
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

function detectVagueFollowup(msg: string): { kind: 'other_fields' | 'more_programs' | 'clarify' } | null {
  const s = msg.trim().toLowerCase();
  if (!s) return null;
  if (/any other (field|subject|discipline)s?\??$/i.test(s) || /(other|onno|aro) (field|subject|discipline)/.test(s)) return { kind: 'other_fields' };
  if (/other fields?\??$/.test(s)) return { kind: 'other_fields' };
  if (/(more|আরও|আরো)(\s+options?|\?)*$/u.test(s) || /more programs?/.test(s) || /আর কি আছে/u.test(s)) return { kind: 'more_programs' };
  if (/that one|eta|oita|aitar|seta/i.test(s)) return { kind: 'clarify' };
  return null;
}

function buildRephrasedQuery(_userMsg: string, vague: { kind: string }): string {
  const recentAssistant = [...convo].reverse().find(m => m.role === 'assistant');
  const ctx: string[] = [];
  if (lastCtx.level) ctx.push(`level=${lastCtx.level}`);
  if (lastCtx.discipline) ctx.push(`discipline=${lastCtx.discipline}`);
  if (lastCtx.country) ctx.push(`country=${lastCtx.country}`);
  if (lastCtx.budgetUpper) ctx.push(`budgetUpper≈${lastCtx.budgetUpper}`);
  const ctxLine = ctx.length ? ctx.join(', ') : 'no explicit filters retained';
  switch (vague.kind) {
    case 'other_fields':
      return `User previously saw programs (${recentAssistant?.content?.slice(0,160) || 'N/A'}). Now asks for additional disciplines. Context: ${ctxLine}.`;
    case 'more_programs':
      return `User wants more program options continuing prior topic. Context: ${ctxLine}. Expand without repeating earlier picks.`;
    case 'clarify':
      return `User referred ambiguously to a prior program (pronoun). Context: ${ctxLine}. Provide likely match and invite specific follow-up.`;
    default:
      return `Continuation request. Context: ${ctxLine}.`;
  }
}

export async function askSadia(question: string): Promise<string> {
  const q = question.trim();
  if (!q) return "Please type a question.";

  // --- Conversation memory: log user turn ---
  convo.push({ role: 'user', content: q, at: Date.now() });
  if (convo.length > 20) convo.splice(0, convo.length - 20);

  const vagueFollow = detectVagueFollowup(q);
  const rephrasedFromVague = vagueFollow ? buildRephrasedQuery(q, vagueFollow) : null;

  const lang = detectUserLanguage(q);
  // Friendly acknowledgment for polite messages like "Thanks"
  if (isPolitePhrase(q)) {
    if (lang === 'bn') return "আপনাকে ধন্যবাদ! আরও কিছু জানতে চাইলে বলুন।";
    if (lang === 'banglish') return "Dhonnobad! Jodi aro kichu janar thake, prosno korun.";
    return "Thank you! Let me know if you have any more questions.";
  }
  if (isIdentityQuestion(q)) return lang === 'bn' ? IDENTITY_BN : lang === 'banglish' ? IDENTITY_BANGLISH : IDENTITY_EN;

  // Greeting handling (before domain guard so a plain "hi" doesn't show restriction)
  if (isGreeting(q)) {
    if (lang === 'bn') {
        return "হ্যালো! আমি সাদিয়া 👋 বাংলাদেশের শিক্ষার্থীদের বিদেশে পড়াশোনা বিষয়ে সহযোগিতা করি। আজ আপনাকে কীভাবে সহায়তা করতে পারি?";
    }
    if (lang === 'banglish') {
        return "Hello! Ami Sadia 👋 Bangladesh-er students der bideshe porashona niye support kori. Ajke apnake kivabe assist korte pari?";
    }
      return "Hello! I’m Sadia 👋 I help Bangladeshi students with study abroad. How can I support you today?";
  }

  const domainOk = isDomainQuestion(q) || (vagueFollow !== null && lastSuggested.length > 0);
  if (!domainOk) {
      if (lang === 'bn') return "আমি মূলত বাংলাদেশের শিক্ষার্থীদের বিদেশে পড়াশোনা বিষয়ে সহায়তা করি। অনুগ্রহ করে সেই বিষয়ে আপনার প্রশ্নটি বলুন যাতে আমি আপনাকে ভালোভাবে গাইড করতে পারি।";
      if (lang === 'banglish') return "Ami fokus kori Bangladesh-er students der bideshe porashona niye sahajjo korte. Dayakore oi area te apnar prosno bolun jate ami apnake bhalo vabe guide korte pari.";
      return "I focus on helping Bangladeshi students with study abroad. Could you please share your question in that area so I can guide you better?";
  }
  let programQuery = isProgramLookup(q) || (vagueFollow !== null && lastSuggested.length > 0);
  const parsed = parseFilters(q);
  const programs = await loadPrograms();
  let relevant: Program[] = [];
  if (programQuery) {
    if (vagueFollow && lastSuggested.length) {
      // Build from previous context (lastCtx) rather than current vague text
      const base = programs.slice();
      let filtered = base;
      if (lastCtx.level) filtered = filtered.filter(p => p.level === lastCtx.level);
      if (lastCtx.discipline && vagueFollow.kind !== 'other_fields') filtered = filtered.filter(p => p.discipline === lastCtx.discipline);
      if (lastCtx.budgetUpper) filtered = filtered.filter(p => (p.tuitionBDT || 0) > 0 && (p.tuitionBDT || 0) <= lastCtx.budgetUpper!);
      if (lastCtx.country) filtered = filtered.filter(p => (p.country || '').toLowerCase() === lastCtx.country!.toLowerCase());

      const prevIds = new Set(lastSuggested.map(p => p.id));
      if (vagueFollow.kind === 'more_programs') {
        filtered = filtered.filter(p => !prevIds.has(p.id));
        if (!filtered.length) filtered = base.filter(p => !prevIds.has(p.id));
      } else if (vagueFollow.kind === 'other_fields') {
        const prevDisc = new Set(lastSuggested.map(p => p.discipline));
        filtered = filtered.filter(p => !prevDisc.has(p.discipline));
        if (!filtered.length) filtered = base.filter(p => !prevIds.has(p.id));
      }
      // Simple ranking: prefer low tuition if previous wanted low cost
      if (parsed.wantLowCost || lastCtx.budgetUpper) {
        filtered.sort((a,b) => (a.tuitionBDT||1e12)-(b.tuitionBDT||1e12));
      }
      // Ensure diversity for other_fields: pick first of each new discipline
      if (vagueFollow.kind === 'other_fields') {
        const seen = new Set<string>();
        const diverse: Program[] = [];
        for (const p of filtered) {
          if (!seen.has(p.discipline)) {
            diverse.push(p);
            seen.add(p.discipline);
          }
          if (diverse.length >= 8) break;
        }
        relevant = diverse;
      } else {
        relevant = filtered.slice(0,8);
      }
    } else {
      relevant = pickRelevant(programs, q);
    }
  }

  // If user asked for "more" programs, try to avoid duplicates of last suggestions
  if (programQuery && vagueFollow?.kind === 'more_programs' && lastSuggested.length) {
    const prevIds = new Set(lastSuggested.map(p => p.id));
    const filtered = relevant.filter(p => !prevIds.has(p.id));
    if (filtered.length) relevant = filtered;
    else {
      // fallback: sample other programs not previously suggested
      relevant = programs.filter(p => !prevIds.has(p.id)).slice(0, 10);
    }
  }

  // If the user is asking for details about a specific program, show the About
  if (programQuery && isDetailsRequest(q)) {
  // Prefer the last shown suggestions to respect ordinal references like “second program”
  const source = (lastSuggested && lastSuggested.length) ? lastSuggested : (relevant.length ? relevant : programs);
  const ord = detectOrdinalIndex(q);
  const target = (ord !== null && ord >= 0 && ord < source.length) ? source[ord] : chooseBestProgram(source, q);
    if (!target) {
  if (lang === 'bn') return "আপনি কোন প্রোগ্রামটি বোঝাতে চাচ্ছেন? নামটি একটু স্পষ্ট করে বলবেন?";
  if (lang === 'banglish') return "Apni kon program ta bolchen? Nam ta ektu clear kore bolben?";
  return "Which program do you mean? Please mention the name so I can show the details.";
    }
    const aboutText = await translateAboutIfNeeded(target.about, lang);
  const tuitionLabel = lang === 'bn' ? 'টিউশন' : 'Tuition';
  const header = `${target.courseName} (${target.level}) — ${target.university}, ${target.city ? target.city + ", " : ""}${target.country} — ${tuitionLabel}: BDT ${Number(target.tuitionBDT || 0).toLocaleString()}`;
    // Flavor notes (generic, safe)
    const flavor = (() => {
      if (lang === 'bn') {
        return [
          "• আপনার লেভেল ও বাজেটের সাথে মানানসই কিনা মিলিয়ে দেখুন।",
          "• অফিসিয়াল সাইটে ভর্তি শর্ত ও ডেডলাইন যাচাই করুন।",
          "• প্রয়োজনে IELTS/TOEFL প্রস্তুতি আগে থেকেই নিন।",
        ];
      }
      if (lang === 'banglish') {
        return [
          "• Apnar level o budget er sathe manansoi kina milie dekhun.",
          "• Official site e vorti shortho o deadline jachai korun.",
          "• Proyojone IELTS/TOEFL preparation age thekei nin.",
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
    // Capture context from either parsed current filters or inferred from last suggested set
    lastCtx.level = parsed.level || lastCtx.level || (lastSuggested[0]?.level as any);
    if (parsed.discipline) lastCtx.discipline = parsed.discipline;
    else if (!lastCtx.discipline && lastSuggested.length) lastCtx.discipline = lastSuggested[0].discipline;
    if (parsed.budgetUpper) lastCtx.budgetUpper = parsed.budgetUpper;
    // Infer country from user query or dominant country among suggestions
    const detC = detectCountry(q);
    if (detC) lastCtx.country = detC.canon;
    else if (!lastCtx.country && lastSuggested.length) {
      const counts: Record<string, number> = {};
      for (const p of lastSuggested) counts[p.country] = (counts[p.country]||0)+1;
      lastCtx.country = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
    }
  }

  // Build a tight prompt that forces grounding in provided data
  const contextJson = JSON.stringify(
    relevant.map((p) => ({
      courseName: p.courseName,
      level: p.level,
      discipline: p.discipline,
      university: p.university,
      city: p.city,
      country: p.country,
      tuitionBDT: p.tuitionBDT,
      about: p.about,
    })),
  );

  const historyBlock = convo.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

  const systemPrograms = `You are SADIA - Smart Autonomous Digital Intelligence Assistant (nickname: Sadia). You help Bangladeshi students who want to study abroad.
STRICT GROUNDING:
- Use ONLY the provided program entries for specific recommendations.
- NEVER invent or guess universities, program names, tuition, scholarship names, rankings, acceptance rates, emails, or URLs.
- If data is missing, say it is not available instead of fabricating.

Tone & style:
- Warm, encouraging, student‑friendly.
- Vary openings; avoid repetitive phrasing.
- Short clear sentences. Use concise bullet points.
- Include tuition (BDT with commas) when present; prioritize lower tuition when affordability implied.
- End with ONE brief contextual follow‑up (or omit if redundant).

Conversation continuity:
- Use recent conversation to resolve pronouns or vague follow‑ups ("any other fields?", "more?", "that one").
- If a rephrased intent is provided, silently use it (do not mention rephrasing).
- When expanding, avoid repeating identical programs already shown unless explicitly asked to repeat.

Language policy:
- Detect user language (English, Bangla, Banglish).
- For Bangla: use only formal second‑person pronouns (আপনি / আপনার / আপনাকে).
- For Banglish: use only formal transliterations (apni / apnar / apnake). Never use tumi/tomar.
- Mirror user language and script style; do not translate user’s proper nouns.

Output: plain text (no markdown headings, no code fences, no excessive disclaimers).

Recent conversation (latest last):\n${historyBlock || 'None'}${rephrasedFromVague ? `\n\nRephrased intent (internal use only): ${rephrasedFromVague}` : ''}`;

  const systemGeneral = `You are SADIA - Smart Autonomous Digital Intelligence Assistant (nickname: Sadia). You help Bangladeshi students who want to study abroad.
Scope:
- General guidance only (process, timelines, exams, budgeting, documents, country selection).
- Do NOT invent specific universities, exact tuition numbers, scholarship names, or rankings unless explicitly provided.

Tone & style:
- Warm, concise, actionable. Use short sentences + bullet points where useful.
- Provide concrete next steps tailored for Bangladeshi students.
- One brief follow‑up only if it adds value; otherwise end cleanly.

Conversation continuity:
- Use dialogue history to interpret vague references ("that one", "more?", "any other field?").
- If a rephrased intent is given internally, rely on it silently.

Language policy:
- Match user language (English / Bangla / Banglish).
- Bangla must use formal second‑person (আপনি / আপনার / আপনাকে) only.
- Banglish must use formal transliterations (apni / apnar / apnake) only; never tumi/tomar.

Output: plain text (no markdown headings). Avoid redundant self‑descriptions after the first turn.

Recent conversation (latest last):\n${historyBlock || 'None'}${rephrasedFromVague ? `\n\nRephrased intent (internal use only): ${rephrasedFromVague}` : ''}`;

  const replyLang = lang === 'bn' ? 'Bangla' : lang === 'banglish' ? 'Banglish (Bangla written in Latin letters)' : 'English';
  const prevAvoid = lastCloserText ? `Avoid repeating this follow‑up line: "${lastCloserText}".` : '';
  const hintIntent = (() => {
  const { wantLowCost, level, discipline, budgetUpper } = parsed;
    const hints: string[] = [];
    if (wantLowCost) hints.push('If you add a follow‑up, you may ask about budget.');
    if (!level) hints.push('If level is unclear, you may ask Bachelor’s vs Master’s.');
  if (!discipline) hints.push('You may ask which discipline they prefer.');
  if (!budgetUpper) hints.push('You may ask for an approximate tuition ceiling.');
    hints.push('You may also ask for a country or subject, but vary it across turns or omit if redundant.');
    return hints.join(' ');
  })();
  const baseSystem = programQuery ? systemPrograms : systemGeneral;
  const prompt = programQuery
    ? `${baseSystem}\n\nReply strictly in: ${replyLang}. ${prevAvoid} ${hintIntent}\n\nUser question: ${q}${rephrasedFromVague ? '\n(Vague follow‑up internally clarified.)' : ''}\n\nPrograms (JSON array):\n${contextJson}`
    : `${baseSystem}\n\nReply strictly in: ${replyLang}. ${prevAvoid}\n\nUser question: ${q}${rephrasedFromVague ? '\n(Vague follow‑up internally clarified.)' : ''}`;

  try {
    const text = await generateWithGemini(prompt);
    const cleaned = text?.trim();
    if (cleaned) {
      // If we just listed programs, we already saved lastSuggested above
      convo.push({ role: 'assistant', content: cleaned, at: Date.now() });
      if (convo.length > 20) convo.splice(0, convo.length - 20);
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
    // Enhanced multi-line structured bullets with Focus line
  async function focusSnippet(p: Program, lang: "en" | "bn" | "banglish"): Promise<string> {
      const raw = (p.about || '').trim();
      if (!raw) return lang === 'bn' ? 'উপলব্ধ নয়' : lang === 'banglish' ? 'Available na' : 'Not available';
      // take first sentence or first 160 chars
      let first = raw.split(/(?<=[.!?।])\s+/u)[0] || raw;
      if (first.length > 160) first = first.slice(0, 157) + '…';
      // Translate if needed
      if (lang !== 'en') {
        try {
          first = await translateAboutIfNeeded(first, lang);
        } catch {}
      }
      return first.replace(/\s+/g, ' ').trim();
    }
    const tuitionLabel = bn ? 'টিউশন' : 'Tuition';
    const focusLabel = bn ? 'ফোকাস' : 'Focus';
    const lines = await Promise.all(relevant.map(async (p) => {
      const focus = await focusSnippet(p, lang);
      const tuitionText = p.tuitionBDT ? `BDT ${Number(p.tuitionBDT).toLocaleString()}` : (bn ? 'উল্লেখ নেই' : 'Not provided');
      return [
        `• ${p.courseName} — ${p.university}, ${p.country}` + (p.city ? ` (${p.city})` : ''),
        `  ${tuitionLabel}: ${tuitionText}`,
        `  ${focusLabel}: ${focus}`,
      ].join('\n');
    }));
  const fallbackAnswer = [opener, ...lines, bn ? closerBN : bgl ? closerBGL : closerEN].join("\n");
  convo.push({ role: 'assistant', content: fallbackAnswer, at: Date.now() });
  if (convo.length > 20) convo.splice(0, convo.length - 20);
  return fallbackAnswer;
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
  const generalFallback = [opener, ...tips, closer].join("\n");
  convo.push({ role: 'assistant', content: generalFallback, at: Date.now() });
  if (convo.length > 20) convo.splice(0, convo.length - 20);
  return generalFallback;
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
