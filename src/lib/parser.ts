// ============================================================================
// Smart quick-entry parser.
//
// Turns free text like "Bought groceries 3500 cash at Imtiaz yesterday" into a
// structured draft transaction. It is deliberately CONSERVATIVE: it returns a
// draft plus the confidence signals behind it, and the caller must show a
// confirmation step. Nothing is ever saved from a guess.
// ============================================================================

export interface ParsedTransaction {
  /** Cleaned description with the amount/keywords stripped out. */
  note: string;
  raw: string;
  amount: number | null;
  type: "expense" | "income";
  categoryId?: string;
  categoryName?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  accountId?: string;
  accountName?: string;
  vendorId?: string;
  vendorName?: string;
  /** ISO datetime when a date word was recognised. */
  date?: string;
  /** Which fields were actually detected — drives the confirmation UI. */
  matched: string[];
}

export interface ParserOptions {
  categories: { id: string; name: string; type: "expense" | "income" }[];
  paymentMethods: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
}

// Amount: optional currency prefix/suffix, thousands separators, decimals.
// Also understands "3.5k" / "2 lakh" shorthand.
const AMOUNT_RE =
  /(?:^|\s)(?:rs\.?|pkr|₨)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(k|thousand|lakh|lac|crore|m|million)?\s*(?:rs\.?|pkr|rupees?|\/-)?(?=\s|$)/i;

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lac: 100_000,
  m: 1_000_000,
  million: 1_000_000,
  crore: 10_000_000,
};

const INCOME_WORDS = [
  "salary", "income", "received", "got paid", "earned", "profit",
  "bonus", "refund", "cashback", "credited", "payment received",
];

/** Payment-method keywords → the canonical name we try to match against. */
const METHOD_KEYWORDS: Record<string, string[]> = {
  Cash: ["cash", "naqd"],
  "Credit Card": ["credit card", "creditcard"],
  "Debit Card": ["debit card", "debitcard", "atm card"],
  Card: ["card", "visa", "mastercard"],
  "Bank Transfer": ["bank transfer", "bank", "ibft", "eft", "online transfer", "raast"],
  JazzCash: ["jazzcash", "jazz cash", "jazz"],
  Easypaisa: ["easypaisa", "easy paisa"],
  Sadapay: ["sadapay", "sada pay"],
  NayaPay: ["nayapay", "naya pay"],
};

/**
 * Category keywords → the words we look for in the text.
 * Matching is a two-step: find the keyword, then resolve it against the user's
 * ACTUAL category list (so a user who renamed "Food" to "Khana" still matches).
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Grocery: ["grocer", "groceries", "kiryana", "karyana", "atta", "flour", "sabzi", "vegetable", "fruit", "supermarket", "mart"],
  Food: ["food", "restaurant", "lunch", "dinner", "breakfast", "biryani", "burger", "pizza", "chai", "tea", "coffee", "snack", "khana", "cafe"],
  Transport: ["transport", "uber", "careem", "indrive", "rickshaw", "bus", "taxi", "fare", "metro", "bykea"],
  Fuel: ["fuel", "petrol", "diesel", "cng", "gas station", "filling"],
  Bills: ["bill", "electricity", "wapda", "k-electric", "sui gas", "gas bill", "water bill", "internet", "wifi", "ptcl", "mobile load", "easyload", "recharge"],
  Health: ["medical", "medicine", "doctor", "hospital", "clinic", "pharmacy", "dawa", "lab test", "checkup"],
  Education: ["school", "fee", "fees", "tuition", "college", "university", "books", "stationery", "course"],
  Shopping: ["shopping", "clothes", "shoes", "shirt", "dress", "kapray", "mall"],
  Entertainment: ["movie", "cinema", "netflix", "spotify", "game", "outing", "picnic"],
  Home: ["rent", "kiraya", "household", "repair", "maintenance", "furniture", "cleaning"],
  Personal: ["salon", "haircut", "barber", "gym", "cosmetics", "grooming"],
};

const DATE_WORDS: Record<string, number> = {
  today: 0,
  aaj: 0,
  yesterday: -1,
  kal: -1,
  "day before yesterday": -2,
  "last night": -1,
};

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function normalize(s: string): string {
  return stripDiacritics(s.toLowerCase()).replace(/\s+/g, " ").trim();
}

/** Word-boundary containment, so "car" does not match "card". */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(haystack);
}

/** Resolve a canonical concept name against the user's own list. */
function resolveByName<T extends { id: string; name: string }>(
  list: T[],
  canonical: string,
  keywords: string[]
): T | undefined {
  const target = normalize(canonical);
  // 1. Exact name match.
  const exact = list.find((x) => normalize(x.name) === target);
  if (exact) return exact;
  // 2. The user's name contains the concept, or vice versa.
  const partial = list.find(
    (x) => normalize(x.name).includes(target) || target.includes(normalize(x.name))
  );
  if (partial) return partial;
  // 3. The user's name contains one of the concept's keywords.
  return list.find((x) => keywords.some((k) => normalize(x.name).includes(normalize(k))));
}

export function detectAmount(text: string): { amount: number | null; matchedText: string } {
  const m = text.match(AMOUNT_RE);
  if (!m || !m[1]) return { amount: null, matchedText: "" };
  let value = Number(m[1].replace(/,/g, ""));
  const suffix = m[2]?.toLowerCase();
  if (suffix && MULTIPLIERS[suffix]) value *= MULTIPLIERS[suffix];
  if (!Number.isFinite(value) || value <= 0) return { amount: null, matchedText: "" };
  return { amount: value, matchedText: m[0] };
}

export function detectPaymentMethod(
  text: string,
  methods: { id: string; name: string }[]
): { id?: string; name?: string; matchedText?: string } {
  const lower = normalize(text);
  // Longest keyword first so "credit card" wins over "card".
  const entries = Object.entries(METHOD_KEYWORDS).flatMap(([canonical, words]) =>
    words.map((w) => ({ canonical, word: w }))
  );
  entries.sort((a, b) => b.word.length - a.word.length);

  for (const { canonical, word } of entries) {
    if (containsWord(lower, word)) {
      const hit = resolveByName(methods, canonical, [word]);
      return { id: hit?.id, name: hit?.name ?? canonical, matchedText: word };
    }
  }
  return {};
}

export function detectCategory(
  text: string,
  categories: { id: string; name: string; type: "expense" | "income" }[],
  type: "expense" | "income"
): { id?: string; name?: string; matchedText?: string } {
  const lower = normalize(text);
  const pool = categories.filter((c) => c.type === type);

  // 1. The text literally names one of the user's categories.
  const direct = pool
    .filter((c) => containsWord(lower, normalize(c.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (direct) return { id: direct.id, name: direct.name, matchedText: direct.name };

  // 2. Keyword → canonical concept → the user's closest category.
  const hits = Object.entries(CATEGORY_KEYWORDS)
    .flatMap(([canonical, words]) => words.map((w) => ({ canonical, word: w })))
    .filter(({ word }) => containsWord(lower, word))
    .sort((a, b) => b.word.length - a.word.length);

  for (const { canonical, word } of hits) {
    const resolved = resolveByName(pool, canonical, CATEGORY_KEYWORDS[canonical]);
    if (resolved) return { id: resolved.id, name: resolved.name, matchedText: word };
  }
  return {};
}

export function detectDate(text: string): { iso?: string; matchedText?: string } {
  const lower = normalize(text);

  for (const [word, offset] of Object.entries(DATE_WORDS).sort(
    (a, b) => b[0].length - a[0].length
  )) {
    if (containsWord(lower, word)) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return { iso: d.toISOString(), matchedText: word };
    }
  }

  // "on 5/8" or "on 5-8-2025"
  const explicit = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (explicit) {
    const day = Number(explicit[1]);
    const month = Number(explicit[2]);
    const yearRaw = explicit[3] ? Number(explicit[3]) : new Date().getFullYear();
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, day, 12, 0, 0);
      if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), matchedText: explicit[0] };
    }
  }
  return {};
}

export function detectVendor(
  text: string,
  vendors: { id: string; name: string }[]
): { id?: string; name?: string; matchedText?: string } {
  // A known vendor named anywhere in the text wins.
  const lower = normalize(text);
  const known = vendors
    .filter((v) => containsWord(lower, normalize(v.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (known) return { id: known.id, name: known.name, matchedText: known.name };

  // Otherwise take the phrase after "at" / "from" / "@".
  const m = text.match(/(?:\bat\b|\bfrom\b|@)\s+([A-Za-z0-9'&.\- ]{2,40})/i);
  if (m?.[1]) {
    const name = m[1]
      .split(/\s+(?:on|for|using|with|by|cash|card|yesterday|today)\b/i)[0]
      .replace(/[.,!?]+$/, "")
      .trim();
    if (name.length >= 2) return { name, matchedText: m[0] };
  }
  return {};
}

function detectType(text: string): "expense" | "income" {
  const lower = normalize(text);
  return INCOME_WORDS.some((w) => containsWord(lower, w)) ? "income" : "expense";
}

/**
 * Parse free text into a draft transaction.
 * Returns the draft plus `matched` — the list of fields that were actually
 * recognised — so the confirmation UI can highlight exactly what was inferred.
 */
export function parseQuickText(text: string, opts: ParserOptions): ParsedTransaction {
  const raw = text.trim();
  const matched: string[] = [];
  const consumed: string[] = [];

  const type = detectType(raw);

  const { amount, matchedText: amountText } = detectAmount(raw);
  if (amount !== null) {
    matched.push("amount");
    consumed.push(amountText);
  }

  const method = detectPaymentMethod(raw, opts.paymentMethods);
  if (method.name) {
    matched.push("payment method");
    if (method.matchedText) consumed.push(method.matchedText);
  }

  const category = detectCategory(raw, opts.categories, type);
  if (category.name) matched.push("category");

  const vendor = detectVendor(raw, opts.vendors);
  if (vendor.name) {
    matched.push("vendor");
    if (vendor.matchedText) consumed.push(vendor.matchedText);
  }

  const account = opts.accounts.find((a) => containsWord(normalize(raw), normalize(a.name)));
  if (account) matched.push("account");

  const date = detectDate(raw);
  if (date.iso) {
    matched.push("date");
    if (date.matchedText) consumed.push(date.matchedText);
  }

  // Build a readable note by removing the bits we turned into fields.
  let note = raw;
  for (const chunk of consumed) {
    if (!chunk) continue;
    note = note.replace(new RegExp(chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  }
  note = note
    .replace(/\b(bought|paid|spent|purchased|for|with|using|via|ka|ki|ke)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();

  // If stripping left nothing meaningful, fall back to the category name.
  if (note.length < 2) note = category.name ?? raw;

  return {
    note: note.charAt(0).toUpperCase() + note.slice(1),
    raw,
    amount,
    type,
    categoryId: category.id,
    categoryName: category.name,
    paymentMethodId: method.id,
    paymentMethodName: method.name,
    accountId: account?.id,
    accountName: account?.name,
    vendorId: vendor.id,
    vendorName: vendor.name,
    date: date.iso,
    matched,
  };
}
