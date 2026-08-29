// ============================================================================
// Currency / number formatting.
//
// Every function is PURE and takes the symbol explicitly. An earlier version
// kept the active symbol in a module-level variable; on the server that module
// is shared across concurrent requests, so one user's currency could render in
// another user's page. The symbol now travels with the data instead.
// ============================================================================

export interface CurrencyMeta {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  PKR: { code: "PKR", symbol: "Rs.", name: "Pakistani Rupee" },
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee" },
  USD: { code: "USD", symbol: "$", name: "US Dollar" },
  EUR: { code: "EUR", symbol: "€", name: "Euro" },
  GBP: { code: "GBP", symbol: "£", name: "British Pound" },
  AED: { code: "AED", symbol: "AED", name: "UAE Dirham" },
  SAR: { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  BDT: { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  TRY: { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  MYR: { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
};

export const DEFAULT_SYMBOL = "Rs.";

/** Format an amount with its currency symbol, e.g. "Rs. 3,500". */
export function formatMoney(amount: number, symbol = DEFAULT_SYMBOL): string {
  const n = Number(amount) || 0;
  const formatted = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "-" : ""}${symbol} ${formatted}`;
}

/** Always shows a sign — used where direction matters (savings, net). */
export function formatMoneySigned(amount: number, symbol = DEFAULT_SYMBOL): string {
  const n = Number(amount) || 0;
  const body = formatMoney(Math.abs(n), symbol);
  return `${n < 0 ? "−" : "+"}${body}`;
}

/** Bare number with thousands separators. */
export function formatNumber(n: number, maxDigits = 2): string {
  return (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  });
}

/**
 * Compact form for chart axes and tight cards: 12.5k, 1.2M.
 * Full precision is always available elsewhere on the same screen — the spec
 * asks for clear charts *plus* exact numbers, never compact alone.
 */
export function formatCompact(n: number, symbol?: string): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const prefix = symbol ? `${symbol} ` : "";
  if (abs >= 10_000_000) return `${sign}${prefix}${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${sign}${prefix}${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${prefix}${formatNumber(abs)}`;
}

export function formatPercent(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 && digits === 0 ? "" : ""}${n.toFixed(digits)}%`;
}

/** Parse user-typed money ("3,500", "Rs 3500", "3.5k") into a number. */
export function parseMoney(input: string): number | null {
  if (!input) return null;
  const cleaned = input
    .toLowerCase()
    .replace(/[^0-9.,kmlac]/g, "")
    .replace(/,/g, "");
  const m = cleaned.match(/^(\d+(?:\.\d+)?)(k|m|lac|lakh)?$/);
  if (!m) return null;
  let v = Number(m[1]);
  if (m[2] === "k") v *= 1_000;
  else if (m[2] === "m") v *= 1_000_000;
  else if (m[2] === "lac" || m[2] === "lakh") v *= 100_000;
  return Number.isFinite(v) ? v : null;
}

export function symbolFor(code: string | null | undefined): string {
  if (!code) return DEFAULT_SYMBOL;
  return CURRENCIES[code.toUpperCase()]?.symbol ?? DEFAULT_SYMBOL;
}
