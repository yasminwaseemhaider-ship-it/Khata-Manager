"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatMoney as fmt, formatCompact } from "@/lib/format";
import type { Taxonomy } from "@/types";

/**
 * The user's categories, accounts, tags and settings, fetched once per
 * navigation by the (app) layout on the server and shared with every client
 * component below it — so opening quick-add costs no network round trip.
 */
interface AppDataCtx extends Taxonomy {
  symbol: string;
  /** Format money in the user's own currency. */
  money: (n: number) => string;
  moneyCompact: (n: number) => string;
  categoryName: (id?: string | null) => string;
  accountName: (id?: string | null) => string;
  categoryById: (id?: string | null) => Taxonomy["categories"][number] | undefined;
}

const Ctx = createContext<AppDataCtx | null>(null);

export function useAppData(): AppDataCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAppData must be used inside <AppDataProvider>");
  }
  return ctx;
}

export function AppDataProvider({
  value,
  children,
}: {
  value: Taxonomy;
  children: ReactNode;
}) {
  const api = useMemo<AppDataCtx>(() => {
    const symbol = value.settings.currency_symbol || "Rs.";
    const catMap = new Map(value.categories.map((c) => [c.id, c]));
    const accMap = new Map(value.accounts.map((a) => [a.id, a]));

    return {
      ...value,
      symbol,
      money: (n: number) => fmt(n, symbol),
      moneyCompact: (n: number) => formatCompact(n, symbol),
      categoryById: (id) => (id ? catMap.get(id) : undefined),
      categoryName: (id) => (id ? catMap.get(id)?.name ?? "Uncategorized" : "Uncategorized"),
      accountName: (id) => (id ? accMap.get(id)?.name ?? "—" : "—"),
    };
  }, [value]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
