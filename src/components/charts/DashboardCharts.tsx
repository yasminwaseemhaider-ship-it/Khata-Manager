"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  CartesianGrid,
  ComposedChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { formatCompact, formatMoney } from "@/lib/format";
import type { SeriesPoint } from "@/lib/analytics";

/**
 * One categorical palette used by every chart in the app, chosen to stay
 * legible on both the light and dark surfaces.
 */
export const CHART_COLORS = [
  "#059669", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6",
  "#ec4899", "#6366f1", "#84cc16", "#f97316", "#0ea5e9", "#a855f7",
];

/** Read themed CSS variables so charts follow light/dark like the rest of the UI. */
function useChartTheme() {
  const [theme, setTheme] = useState({
    grid: "#e2e8f0",
    axis: "#94a3b8",
    surface: "#ffffff",
    border: "#e2e8f0",
    text: "#0f172a",
  });

  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement);
      setTheme({
        grid: s.getPropertyValue("--border").trim() || "#e2e8f0",
        axis: s.getPropertyValue("--text-faint").trim() || "#94a3b8",
        surface: s.getPropertyValue("--surface").trim() || "#ffffff",
        border: s.getPropertyValue("--border").trim() || "#e2e8f0",
        text: s.getPropertyValue("--text").trim() || "#0f172a",
      });
    };
    read();

    // Re-read when the theme attribute flips or the OS preference changes.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);

  return theme;
}

/**
 * Shared tooltip renderer. Typed with Recharts' own `TooltipContentProps` so it
 * slots into every chart's `content` prop without casting.
 */
function makeTooltip(symbol: string, theme: ReturnType<typeof useChartTheme>) {
  return function ChartTooltip({
    active,
    payload,
    label,
  }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg border px-3 py-2 text-xs shadow-lg"
        style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
      >
        {label !== undefined && <p className="mb-1 font-semibold">{label}</p>}
        {payload.map((p, i) => (
          <p key={i} className="tnum font-medium" style={{ color: p.color || p.fill }}>
            {p.name}: {formatMoney(Number(p.value ?? 0), symbol)}
          </p>
        ))}
      </div>
    );
  };
}

const AXIS_STYLE = { fontSize: 11 };

/** Daily spend for a month. */
export function DailyExpenseBar({
  data,
  symbol,
  height = 220,
}: {
  data: SeriesPoint[];
  symbol: string;
  height?: number;
}) {
  const theme = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_STYLE, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis
          tick={{ ...AXIS_STYLE, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompact(Number(v))}
          width={52}
        />
        <Tooltip content={makeTooltip(symbol, theme)} cursor={{ fill: theme.grid, opacity: 0.4 }} />
        <Bar dataKey="value" name="Spent" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Category split. Slices are coloured by the user's own category colours. */
export function CategoryDonut({
  data,
  symbol,
  height = 240,
}: {
  data: { name: string; value: number; color?: string | null }[];
  symbol: string;
  height?: number;
}) {
  const theme = useChartTheme();
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="82%"
          paddingAngle={2}
          stroke={theme.surface}
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={makeTooltip(symbol, theme)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Income vs expense with a savings line on top. */
export function IncomeVsExpense({
  data,
  symbol,
  height = 260,
}: {
  data: { month: string; expense: number; income: number; savings?: number }[];
  symbol: string;
  height?: number;
}) {
  const theme = useChartTheme();
  const chartData = data.map((d) => {
    const [y, m] = d.month.split("-").map(Number);
    return {
      ...d,
      label: new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" }),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
        <XAxis dataKey="label" tick={{ ...AXIS_STYLE, fill: theme.axis }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ ...AXIS_STYLE, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompact(Number(v))}
          width={52}
        />
        <Tooltip content={makeTooltip(symbol, theme)} />
        <Legend wrapperStyle={{ fontSize: 12, color: theme.text }} />
        <Bar dataKey="income" name="Income" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
        {chartData.some((d) => d.savings !== undefined) && (
          <Line
            type="monotone"
            dataKey="savings"
            name="Savings"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Cumulative or smoothed trend. */
export function TrendArea({
  data,
  symbol,
  height = 220,
  color = CHART_COLORS[1],
  name = "Spent",
}: {
  data: SeriesPoint[];
  symbol: string;
  height?: number;
  color?: string;
  name?: string;
}) {
  const theme = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
        <XAxis dataKey="label" tick={{ ...AXIS_STYLE, fill: theme.axis }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ ...AXIS_STYLE, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompact(Number(v))}
          width={52}
        />
        <Tooltip content={makeTooltip(symbol, theme)} />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={color}
          strokeWidth={2}
          fill="url(#trendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranking bar — vendors, accounts, payment methods. */
export function RankedBar({
  data,
  symbol,
  height = 240,
}: {
  data: { name: string; value: number }[];
  symbol: string;
  height?: number;
}) {
  const theme = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.grid} />
        <XAxis
          type="number"
          tick={{ ...AXIS_STYLE, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompact(Number(v))}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ ...AXIS_STYLE, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
          width={92}
        />
        <Tooltip content={makeTooltip(symbol, theme)} cursor={{ fill: theme.grid, opacity: 0.4 }} />
        <Bar dataKey="value" name="Total" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
