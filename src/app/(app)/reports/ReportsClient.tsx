"use client";

import { useMemo, useState } from "react";
import {
  BarChart3, Download, FileSpreadsheet, FileText, TrendingDown, TrendingUp,
  PiggyBank, Calculator, } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, Field, Input, Select, StatCard, SectionTitle, Meter } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryDonut, IncomeVsExpense, RankedBar, TrendArea } from "@/components/charts/DashboardCharts";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  breakdownBy, buildInsights, dailyExpenses, incomeVsExpense, monthlyExpenses,
  recentMonthKeys, savingsRate, startOfWeek, endOfWeek, totalsBetween,
} from "@/lib/analytics";
import {
  currentMonthKey, currentYearKey, formatDate, formatMonth, friendlyDay,
  monthBounds, todayISO, toISODate, yearBounds,
} from "@/lib/date";
import { formatPercent } from "@/lib/format";
import { downloadCsv, downloadExcel, downloadPdf, transactionsToRows } from "@/lib/export";
import { cn } from "@/lib/utils";
import type { TransactionWithTags } from "@/types";

type RangeKind = "day" | "week" | "month" | "year" | "custom" | "all";

const RANGES: { value: RangeKind; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
  { value: "all", label: "All time" },
];

export function ReportsClient({ transactions }: { transactions: TransactionWithTags[] }) {
  const { toast } = useToast();
  const {
    categories, accounts, paymentMethods, vendors, tags, settings, symbol, money,
  } = useAppData();

  const [kind, setKind] = useState<RangeKind>("month");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [categoryFilter, setCategoryFilter] = useState("");

  /** Resolve the selected range into concrete bounds plus a readable label. */
  const range = useMemo(() => {
    const now = new Date();
    switch (kind) {
      case "day": {
        const from = new Date(now);
        from.setHours(0, 0, 0, 0);
        const to = new Date(now);
        to.setHours(23, 59, 59, 999);
        return { from, to, label: friendlyDay(todayISO()) };
      }
      case "week": {
        const from = startOfWeek(now, settings.week_starts_on);
        const to = endOfWeek(now, settings.week_starts_on);
        return { from, to, label: `${formatDate(from)} – ${formatDate(to)}` };
      }
      case "year": {
        const b = yearBounds(currentYearKey());
        return { ...b, label: currentYearKey() };
      }
      case "custom": {
        const from = new Date(`${customFrom}T00:00:00`);
        const to = new Date(`${customTo}T23:59:59.999`);
        return { from, to, label: `${formatDate(from)} – ${formatDate(to)}` };
      }
      case "all": {
        const dates = transactions.map((t) => new Date(t.transaction_date).getTime());
        const from = dates.length ? new Date(Math.min(...dates)) : new Date();
        const to = new Date();
        return { from, to, label: "All time" };
      }
      default: {
        const b = monthBounds(currentMonthKey());
        return { ...b, label: formatMonth(currentMonthKey()) };
      }
    }
  }, [kind, customFrom, customTo, transactions, settings.week_starts_on]);

  /** The previous window of equal length — powers the trend comparison. */
  const previous = useMemo(() => {
    const span = range.to.getTime() - range.from.getTime();
    const prevTo = new Date(range.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - span);
    return transactions.filter((t) => {
      const ms = new Date(t.transaction_date).getTime();
      return ms >= prevFrom.getTime() && ms <= prevTo.getTime();
    });
  }, [transactions, range]);

  const inRange = useMemo(() => {
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();
    return transactions.filter((t) => {
      const ms = new Date(t.transaction_date).getTime();
      if (ms < fromMs || ms > toMs) return false;
      if (categoryFilter && t.category_id !== categoryFilter) return false;
      return true;
    });
  }, [transactions, range, categoryFilter]);

  const totals = useMemo(() => totalsBetween(inRange, range.from, range.to), [inRange, range]);

  const insights = useMemo(
    () =>
      buildInsights(inRange, {
        from: range.from,
        to: range.to,
        categories,
        vendors,
        previous,
      }),
    [inRange, range, categories, vendors, previous]
  );

  const byCategory = useMemo(
    () => breakdownBy(inRange, "category_id", categories, "expense"),
    [inRange, categories]
  );
  const byVendor = useMemo(
    () => breakdownBy(inRange, "vendor_id", vendors, "expense", "No vendor"),
    [inRange, vendors]
  );
  const byAccount = useMemo(
    () => breakdownBy(inRange, "account_id", accounts, "expense", "No account"),
    [inRange, accounts]
  );
  const byMethod = useMemo(
    () => breakdownBy(inRange, "payment_method_id", paymentMethods, "expense", "Not recorded"),
    [inRange, paymentMethods]
  );
  const incomeByCategory = useMemo(
    () => breakdownBy(inRange, "category_id", categories, "income", "Other income"),
    [inRange, categories]
  );

  const monthTrend = useMemo(
    () => incomeVsExpense(transactions, recentMonthKeys(12)),
    [transactions]
  );

  const spendSeries = useMemo(() => {
    if (kind === "year" || kind === "all") return monthlyExpenses(transactions, currentYearKey());
    return dailyExpenses(transactions, currentMonthKey());
  }, [kind, transactions]);

  const summaryLines = [
    { label: "Income", value: money(totals.income) },
    { label: "Expenses", value: money(totals.expenses) },
    { label: "Savings", value: money(totals.net) },
    { label: "Savings rate", value: formatPercent(savingsRate(totals), 1) },
    { label: "Transactions", value: String(insights.txCount) },
    { label: "Avg / day", value: money(insights.avgPerDay) },
  ];

  const exportRows = () =>
    transactionsToRows(inRange, { categories, accounts, paymentMethods, vendors, tags });

  const stamp = `${toISODate(range.from)}_${toISODate(range.to)}`;

  function exportCsv() {
    if (inRange.length === 0) return toast("Nothing to export in this range.", { type: "error" });
    downloadCsv(`khata-report-${stamp}.csv`, exportRows());
    toast(`Exported ${inRange.length} transactions.`);
  }

  function exportExcel() {
    if (inRange.length === 0) return toast("Nothing to export in this range.", { type: "error" });
    downloadExcel(`khata-report-${stamp}`, exportRows());
    toast("Excel file downloaded.");
  }

  function exportPdf() {
    downloadPdf({
      title: "Khata report",
      subtitle: `${range.label}${categoryFilter ? ` · ${categories.find((c) => c.id === categoryFilter)?.name}` : ""}`,
      summary: summaryLines,
      rows: exportRows(),
    });
    toast("Opening print view — choose “Save as PDF”.", { type: "info" });
  }

  const breakdowns: { title: string; slices: typeof byCategory }[] = [
    { title: "By category", slices: byCategory },
    { title: "By vendor", slices: byVendor },
    { title: "By account", slices: byAccount },
    { title: "By payment method", slices: byMethod },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle title="Reports" sub="Charts with the exact numbers beside them" />

      {/* ---------- Range picker ---------- */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setKind(r.value)}
              aria-pressed={kind === r.value}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                kind === r.value
                  ? "bg-[var(--brand)] text-white"
                  : "bg-surface-2 text-muted hover:text-ink"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {kind === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="rp-from">
              <Input
                id="rp-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="rp-to">
              <Input
                id="rp-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </Field>
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Limit to a category" htmlFor="rp-cat">
            <Select
              id="rp-cat"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end gap-2">
            <Button variant="outline" size="md" onClick={exportCsv} className="flex-1">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="md" onClick={exportExcel} className="flex-1">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="md" onClick={exportPdf} className="flex-1">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted">
          Showing <strong className="text-ink">{range.label}</strong> · {inRange.length}{" "}
          transaction{inRange.length === 1 ? "" : "s"}
        </p>
      </Card>

      {inRange.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Nothing in this range"
          body="Pick a different period, or clear the category filter."
        />
      ) : (
        <div className="space-y-4">
          {/* ---------- Headline ---------- */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Income"
              value={money(totals.income)}
              tone="income"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Expenses"
              value={money(totals.expenses)}
              tone="expense"
              icon={<TrendingDown className="h-4 w-4" />}
              sub={
                insights.trendPct !== null ? (
                  <span className={insights.trendPct > 0 ? "text-expense" : "text-income"}>
                    {insights.trendPct > 0 ? "▲" : "▼"}{" "}
                    {Math.abs(insights.trendPct).toFixed(0)}% vs previous period
                  </span>
                ) : undefined
              }
            />
            <StatCard
              label="Savings"
              value={money(totals.net)}
              tone={totals.net >= 0 ? "brand" : "expense"}
              icon={<PiggyBank className="h-4 w-4" />}
              sub={`${formatPercent(savingsRate(totals), 1)} of income`}
            />
            <StatCard
              label="Avg per day"
              value={money(insights.avgPerDay)}
              tone="neutral"
              icon={<Calculator className="h-4 w-4" />}
              sub={`${money(insights.avgPerTransaction)} per transaction`}
            />
          </section>

          {/* ---------- Highlights ---------- */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-muted">Highest spending category</p>
              <p className="mt-1 truncate text-sm font-bold text-ink">
                {insights.topCategory?.name ?? "—"}
              </p>
              <p className="tnum text-xs text-muted">
                {insights.topCategory ? money(insights.topCategory.total) : ""}
                {insights.topCategory ? ` · ${insights.topCategory.pct.toFixed(0)}% of spend` : ""}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Highest spending day</p>
              <p className="mt-1 truncate text-sm font-bold text-ink">
                {insights.highestDay ? friendlyDay(insights.highestDay.day) : "—"}
              </p>
              <p className="tnum text-xs text-muted">
                {insights.highestDay ? money(insights.highestDay.total) : ""}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Most-used vendor</p>
              <p className="mt-1 truncate text-sm font-bold text-ink">
                {insights.topVendor?.name ?? "—"}
              </p>
              <p className="tnum text-xs text-muted">
                {insights.topVendor
                  ? `${money(insights.topVendor.total)} · ${insights.topVendor.count} visits`
                  : ""}
              </p>
            </Card>
          </section>

          {/* ---------- Income vs expense ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Income vs expense · last 12 months</CardTitle>
            </CardHeader>
            <IncomeVsExpense data={monthTrend} symbol={symbol} height={280} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Spending trend · {kind === "year" || kind === "all" ? currentYearKey() : formatMonth(currentMonthKey())}
              </CardTitle>
            </CardHeader>
            <TrendArea data={spendSeries} symbol={symbol} />
          </Card>

          {/* ---------- Category split ---------- */}
          {byCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Where the money went</CardTitle>
                <span className="tnum text-xs font-semibold text-muted">
                  {money(totals.expenses)}
                </span>
              </CardHeader>
              <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
                <CategoryDonut
                  data={byCategory.slice(0, 9).map((s) => ({
                    name: s.name,
                    value: s.total,
                    color: s.color,
                  }))}
                  symbol={symbol}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="py-1.5 font-medium">Category</th>
                        <th className="py-1.5 text-right font-medium">Total</th>
                        <th className="py-1.5 text-right font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {byCategory.map((s) => (
                        <tr key={s.id ?? "none"}>
                          <td className="py-1.5">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: s.color || "#64748b" }}
                              />
                              <span className="truncate text-ink">{s.name}</span>
                            </span>
                          </td>
                          <td className="tnum py-1.5 text-right font-semibold text-ink">
                            {money(s.total)}
                          </td>
                          <td className="tnum py-1.5 text-right text-muted">
                            {s.pct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* ---------- Ranked breakdowns ---------- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {breakdowns.slice(1).map(({ title, slices }) =>
              slices.length === 0 ? null : (
                <Card key={title}>
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                  </CardHeader>
                  <RankedBar
                    data={slices.slice(0, 7).map((s) => ({ name: s.name, value: s.total }))}
                    symbol={symbol}
                  />
                  <ul className="mt-3 space-y-1.5">
                    {slices.slice(0, 7).map((s) => (
                      <li key={s.id ?? s.name} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
                        <span className="tnum font-semibold text-ink">{money(s.total)}</span>
                        <span className="tnum w-12 text-right text-faint">
                          {s.pct.toFixed(0)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            )}
          </div>

          {/* ---------- Income sources ---------- */}
          {incomeByCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Income sources</CardTitle>
                <span className="tnum text-xs font-semibold text-muted">
                  {money(totals.income)}
                </span>
              </CardHeader>
              <ul className="space-y-2.5">
                {incomeByCategory.map((s) => (
                  <li key={s.id ?? "none"}>
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
                      <span className="tnum font-semibold text-income">{money(s.total)}</span>
                      <span className="tnum w-12 text-right text-faint">{s.pct.toFixed(0)}%</span>
                    </div>
                    <Meter pct={s.pct} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
