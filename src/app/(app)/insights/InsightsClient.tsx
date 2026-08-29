"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  Lightbulb, TrendingDown, TrendingUp, AlertTriangle, PiggyBank, Trophy,
  Calendar, Repeat, BookOpen, Target, Info,
} from "lucide-react";
import { Card, SectionTitle, StatCard, Meter } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppData } from "@/context/AppDataContext";
import {
  breakdownBy, budgetProgress, monthKeyOf, recentMonthKeys, savingsRate,
  totalsForMonth, dayKey,
} from "@/lib/analytics";
import { currentMonthKey, formatMonth, friendlyDay, shiftMonth } from "@/lib/date";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Budget, KhataEntryView, TransactionWithTags } from "@/types";

type Tone = "good" | "warn" | "bad" | "info";

interface Insight {
  id: string;
  tone: Tone;
  icon: ReactNode;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
}

const TONE_STYLE: Record<Tone, string> = {
  good: "border-l-[var(--income)] bg-income-soft",
  warn: "border-l-[var(--warning)] bg-warning-soft",
  bad: "border-l-[var(--danger)] bg-danger-soft",
  info: "border-l-[var(--info)] bg-info-soft",
};

/**
 * Plain-language observations derived from the user's own numbers.
 * Every statement below is computed — none of it is generic advice.
 */
export function InsightsClient({
  transactions,
  budgets,
  khata,
}: {
  transactions: TransactionWithTags[];
  budgets: Budget[];
  khata: KhataEntryView[];
}) {
  const { categories, settings, money } = useAppData();

  const month = currentMonthKey();
  const prevMonth = shiftMonth(month, -1);

  const thisMonth = useMemo(() => totalsForMonth(transactions, month), [transactions, month]);
  const lastMonth = useMemo(
    () => totalsForMonth(transactions, prevMonth),
    [transactions, prevMonth]
  );

  const monthTxns = useMemo(
    () => transactions.filter((t) => monthKeyOf(t.transaction_date) === month),
    [transactions, month]
  );

  const byCategory = useMemo(
    () => breakdownBy(monthTxns, "category_id", categories, "expense"),
    [monthTxns, categories]
  );

  const prevByCategory = useMemo(
    () =>
      breakdownBy(
        transactions.filter((t) => monthKeyOf(t.transaction_date) === prevMonth),
        "category_id",
        categories,
        "expense"
      ),
    [transactions, prevMonth, categories]
  );

  const budgetRows = useMemo(
    () =>
      budgets
        .filter((b) => b.is_active)
        .map((b) => budgetProgress(b, transactions, categories, new Date(), settings.week_starts_on)),
    [budgets, transactions, categories, settings.week_starts_on]
  );

  /** Rolling 6-month average expense, for "is this month unusual?" */
  const sixMonthAvg = useMemo(() => {
    const keys = recentMonthKeys(7).slice(0, 6); // exclude the current month
    const sums = keys.map((k) => totalsForMonth(transactions, k).expenses);
    const active = sums.filter((s) => s > 0);
    return active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  }, [transactions]);

  const busiestDay = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const t of monthTxns) {
      if (t.type !== "expense") continue;
      const k = dayKey(t.transaction_date);
      perDay.set(k, (perDay.get(k) ?? 0) + Number(t.amount));
    }
    let best: { day: string; total: number } | null = null;
    for (const [day, total] of perDay) {
      if (!best || total > best.total) best = { day, total };
    }
    return best;
  }, [monthTxns]);

  /** Which weekday do they spend most on? */
  const weekdayPattern = useMemo(() => {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const d = new Date(t.transaction_date).getDay();
      sums[d] += Number(t.amount);
      counts[d] += 1;
    }
    let bestIdx = -1;
    for (let i = 0; i < 7; i++) if (bestIdx === -1 || sums[i] > sums[bestIdx]) bestIdx = i;
    if (bestIdx === -1 || sums[bestIdx] === 0) return null;
    const total = sums.reduce((a, b) => a + b, 0);
    return {
      name: names[bestIdx],
      total: sums[bestIdx],
      pct: total > 0 ? (sums[bestIdx] / total) * 100 : 0,
    };
  }, [transactions]);

  const smallSpends = useMemo(() => {
    const threshold = 500;
    const small = monthTxns.filter((t) => t.type === "expense" && Number(t.amount) <= threshold);
    return {
      count: small.length,
      total: small.reduce((s, t) => s + Number(t.amount), 0),
      threshold,
    };
  }, [monthTxns]);

  const insights = useMemo(() => {
    const list: Insight[] = [];

    // --- Spending vs last month ---
    if (lastMonth.expenses > 0) {
      const diff = thisMonth.expenses - lastMonth.expenses;
      const pct = (diff / lastMonth.expenses) * 100;
      if (Math.abs(pct) >= 5) {
        list.push({
          id: "mom",
          tone: diff > 0 ? "warn" : "good",
          icon: diff > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />,
          title:
            diff > 0
              ? `You are spending ${Math.abs(pct).toFixed(0)}% more than last month`
              : `You are spending ${Math.abs(pct).toFixed(0)}% less than last month`,
          body: `${formatMonth(month)}: ${money(thisMonth.expenses)} versus ${money(
            lastMonth.expenses
          )} in ${formatMonth(prevMonth)} — a difference of ${money(Math.abs(diff))}.`,
          href: "/monthly",
          linkLabel: "See the month",
        });
      }
    }

    // --- Savings ---
    if (thisMonth.income > 0) {
      const rate = savingsRate(thisMonth);
      list.push({
        id: "savings",
        tone: rate >= 20 ? "good" : rate >= 0 ? "warn" : "bad",
        icon: <PiggyBank className="h-4 w-4" />,
        title:
          rate >= 20
            ? `You have kept ${formatPercent(rate, 0)} of your income`
            : rate >= 0
              ? `You are keeping ${formatPercent(rate, 0)} of your income`
              : "You are spending more than you earn",
        body:
          rate >= 0
            ? `Income ${money(thisMonth.income)} − expenses ${money(
                thisMonth.expenses
              )} = ${money(thisMonth.net)} saved this month.`
            : `Expenses of ${money(thisMonth.expenses)} exceed income of ${money(
                thisMonth.income
              )} by ${money(Math.abs(thisMonth.net))}. This gap is covered from your existing balance.`,
      });
    }

    // --- Unusual month ---
    if (sixMonthAvg > 0 && thisMonth.expenses > sixMonthAvg * 1.25) {
      list.push({
        id: "unusual",
        tone: "warn",
        icon: <AlertTriangle className="h-4 w-4" />,
        title: "This month is heavier than usual",
        body: `You normally spend around ${money(sixMonthAvg)} a month. So far this month you are at ${money(
          thisMonth.expenses
        )}.`,
      });
    }

    // --- Top category ---
    if (byCategory.length > 0) {
      const top = byCategory[0];
      const prev = prevByCategory.find((c) => c.id === top.id);
      const delta = prev ? top.total - prev.total : null;
      list.push({
        id: "topcat",
        tone: top.pct > 50 ? "warn" : "info",
        icon: <Trophy className="h-4 w-4" />,
        title: `${top.name} is your biggest cost this month`,
        body: `${money(top.total)} across ${top.count} transaction${
          top.count === 1 ? "" : "s"
        } — ${top.pct.toFixed(0)}% of everything you spent.${
          delta !== null
            ? delta > 0
              ? ` That is ${money(delta)} more than last month.`
              : ` That is ${money(Math.abs(delta))} less than last month.`
            : ""
        }`,
        href: "/reports",
        linkLabel: "Break it down",
      });
    }

    // --- Budgets ---
    const exceeded = budgetRows.filter((b) => b.state === "exceeded");
    const warning = budgetRows.filter((b) => b.state === "warning");
    if (exceeded.length > 0) {
      list.push({
        id: "budget-over",
        tone: "bad",
        icon: <Target className="h-4 w-4" />,
        title: `${exceeded.length} budget${exceeded.length === 1 ? " is" : "s are"} over the limit`,
        body: exceeded
          .map((b) => `${b.name}: ${money(b.spent)} of ${money(b.amount)}`)
          .join(" · "),
        href: "/budgets",
        linkLabel: "Review budgets",
      });
    } else if (warning.length > 0) {
      list.push({
        id: "budget-warn",
        tone: "warn",
        icon: <Target className="h-4 w-4" />,
        title: `${warning.length} budget${warning.length === 1 ? " is" : "s are"} close to the limit`,
        body: warning.map((b) => `${b.name}: ${b.pct.toFixed(0)}% used`).join(" · "),
        href: "/budgets",
        linkLabel: "Review budgets",
      });
    } else if (budgetRows.length > 0) {
      list.push({
        id: "budget-ok",
        tone: "good",
        icon: <Target className="h-4 w-4" />,
        title: "Every budget is on track",
        body: `All ${budgetRows.length} active budget${
          budgetRows.length === 1 ? "" : "s"
        } are within their limits so far.`,
      });
    } else {
      list.push({
        id: "budget-none",
        tone: "info",
        icon: <Target className="h-4 w-4" />,
        title: "You have no budgets yet",
        body: byCategory.length
          ? `Based on this month, a limit of about ${money(
              Math.ceil(byCategory[0].total / 500) * 500
            )} for ${byCategory[0].name} would match your habits.`
          : "Set a monthly limit for a category and Khata will track it for you.",
        href: "/budgets",
        linkLabel: "Set a budget",
      });
    }

    // --- Small spends add up ---
    if (smallSpends.count >= 5 && smallSpends.total > 0) {
      list.push({
        id: "small",
        tone: "info",
        icon: <Info className="h-4 w-4" />,
        title: "Small purchases are adding up",
        body: `${smallSpends.count} transactions of ${money(
          smallSpends.threshold
        )} or less came to ${money(smallSpends.total)} this month — ${
          thisMonth.expenses > 0
            ? ((smallSpends.total / thisMonth.expenses) * 100).toFixed(0)
            : 0
        }% of your spending.`,
      });
    }

    // --- Busiest day ---
    if (busiestDay) {
      list.push({
        id: "busiest",
        tone: "info",
        icon: <Calendar className="h-4 w-4" />,
        title: `${friendlyDay(busiestDay.day)} was your heaviest day`,
        body: `You spent ${money(busiestDay.total)} that day.`,
        href: "/calendar",
        linkLabel: "Open calendar",
      });
    }

    // --- Weekday pattern ---
    if (weekdayPattern && weekdayPattern.pct > 20) {
      list.push({
        id: "weekday",
        tone: "info",
        icon: <Repeat className="h-4 w-4" />,
        title: `${weekdayPattern.name}s are your biggest spending day`,
        body: `${weekdayPattern.pct.toFixed(0)}% of all your spending happens on a ${weekdayPattern.name} — ${money(
          weekdayPattern.total
        )} in total.`,
      });
    }

    // --- Khata ---
    const overdue = khata.filter((k) => k.is_overdue);
    const owedToMe = khata
      .filter((k) => k.direction === "owed" && k.remaining > 0)
      .reduce((s, k) => s + k.remaining, 0);
    if (overdue.length > 0) {
      list.push({
        id: "khata-overdue",
        tone: "bad",
        icon: <BookOpen className="h-4 w-4" />,
        title: `${overdue.length} khata entr${overdue.length === 1 ? "y is" : "ies are"} overdue`,
        body: overdue
          .map((k) => `${k.person_name}: ${money(k.remaining)}`)
          .slice(0, 4)
          .join(" · "),
        href: "/khata",
        linkLabel: "Open khata",
      });
    } else if (owedToMe > 0) {
      list.push({
        id: "khata-owed",
        tone: "info",
        icon: <BookOpen className="h-4 w-4" />,
        title: `${money(owedToMe)} is still owed to you`,
        body: "None of it is overdue yet.",
        href: "/khata",
        linkLabel: "Open khata",
      });
    }

    return list;
  }, [
    thisMonth, lastMonth, month, prevMonth, byCategory, prevByCategory, budgetRows,
    sixMonthAvg, busiestDay, weekdayPattern, smallSpends, khata, money,
  ]);

  if (transactions.length < 3) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
        <SectionTitle title="Insights" sub="What your numbers are telling you" />
        <EmptyState
          icon={<Lightbulb className="h-5 w-5" />}
          title="Not enough data yet"
          body="Record a few more transactions and Khata will start pointing out patterns — where your money goes, which month is unusual, and what is drifting over budget."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle
        title="Insights"
        sub={`Based on your real transactions · ${formatMonth(month)}`}
      />

      <section className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Spent this month" value={money(thisMonth.expenses)} tone="expense" />
        <StatCard label="Earned" value={money(thisMonth.income)} tone="income" />
        <StatCard
          label="Saved"
          value={money(thisMonth.net)}
          tone={thisMonth.net >= 0 ? "brand" : "expense"}
        />
      </section>

      <div className="space-y-3">
        {insights.map((i) => (
          <div
            key={i.id}
            className={cn(
              "rounded-2xl border border-line border-l-4 p-4",
              TONE_STYLE[i.tone]
            )}
          >
            <div className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-ink">{i.icon}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-ink">{i.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">{i.body}</p>
                {i.href && (
                  <Link
                    href={i.href}
                    className="mt-2 inline-block text-xs font-medium text-[var(--brand-text)] hover:underline"
                  >
                    {i.linkLabel ?? "Open"} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {byCategory.length > 0 && (
        <Card className="mt-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">
            Category shares this month
          </h3>
          <ul className="space-y-2.5">
            {byCategory.slice(0, 6).map((s) => (
              <li key={s.id ?? "none"}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
                  <span className="tnum font-semibold text-ink">{money(s.total)}</span>
                  <span className="tnum w-10 text-right text-faint">{s.pct.toFixed(0)}%</span>
                </div>
                <Meter pct={s.pct} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
