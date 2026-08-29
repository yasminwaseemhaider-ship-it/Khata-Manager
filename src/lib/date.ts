// ============================================================================
// Date helpers.
//
// Timestamps are stored as timestamptz (UTC) and rendered in the viewer's local
// timezone. Every "key" function (day/month/year) works in LOCAL time, so an
// expense entered at 11pm belongs to that evening, not to the next UTC day.
// ============================================================================

export function formatDateTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function hourMinute(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** yyyy-mm-dd in LOCAL time (never toISOString, which shifts to UTC). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Value for an <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  return monthKey(new Date());
}

export function currentYearKey(): string {
  return String(new Date().getFullYear());
}

export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function formatMonthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

// ---------------------------------------------------------------------------
// Period navigation (previous / next day, month, year)
// ---------------------------------------------------------------------------
export function shiftDay(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return monthKey(date);
}

export function shiftYear(key: string, delta: number): string {
  return String(Number(key) + delta);
}

/** Inclusive local-time bounds for a yyyy-mm-dd day. */
export function dayBounds(isoDay: string): { from: Date; to: Date } {
  const [y, m, d] = isoDay.split("-").map(Number);
  return {
    from: new Date(y, m - 1, d, 0, 0, 0, 0),
    to: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

export function monthBounds(key: string): { from: Date; to: Date } {
  const [y, m] = key.split("-").map(Number);
  return {
    from: new Date(y, m - 1, 1, 0, 0, 0, 0),
    to: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

export function yearBounds(key: string): { from: Date; to: Date } {
  const y = Number(key);
  return {
    from: new Date(y, 0, 1, 0, 0, 0, 0),
    to: new Date(y, 11, 31, 23, 59, 59, 999),
  };
}

/** "Today", "Yesterday", or a formatted date — for day headers. */
export function friendlyDay(isoDay: string): string {
  const today = todayISO();
  if (isoDay === today) return "Today";
  if (isoDay === shiftDay(today, -1)) return "Yesterday";
  if (isoDay === shiftDay(today, 1)) return "Tomorrow";
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Relative phrasing for due dates: "in 3 days", "2 days overdue". */
export function relativeDue(isoDate: string): { label: string; overdue: boolean } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { label: "Due today", overdue: false };
  if (days === 1) return { label: "Due tomorrow", overdue: false };
  if (days === -1) return { label: "1 day overdue", overdue: true };
  if (days < 0) return { label: `${Math.abs(days)} days overdue`, overdue: true };
  return { label: `Due in ${days} days`, overdue: false };
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday headers rotated for the user's chosen first day of week. */
export function weekdayHeaders(weekStartsOn = 1): string[] {
  const base = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...base.slice(weekStartsOn), ...base.slice(0, weekStartsOn)];
}
