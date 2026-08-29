import { cn } from "@/lib/utils";
import type {
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)] md:p-5",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-medium text-muted", className)}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-xl border border-line bg-surface text-sm text-ink placeholder:text-faint " +
  "transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-11 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "px-3 py-2.5", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldBase, "h-11 cursor-pointer appearance-none pl-3 pr-9", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Label + control + inline error, the standard field wrapper. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
          {!required && <span className="ml-1.5 text-faint">optional</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "brand" | "expense" | "income" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-muted",
    brand: "bg-brand-soft text-[var(--brand-text)]",
    expense: "bg-expense-soft text-expense",
    income: "bg-income-soft text-income",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

/** A labelled headline number — the dashboard's core building block. */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "brand" | "expense" | "income" | "info" | "warning";
  className?: string;
}) {
  const accents: Record<string, string> = {
    neutral: "text-ink",
    brand: "text-[var(--brand-text)]",
    expense: "text-expense",
    income: "text-income",
    info: "text-info",
    warning: "text-warning",
  };
  const chips: Record<string, string> = {
    neutral: "bg-surface-2 text-muted",
    brand: "bg-brand-soft text-[var(--brand-text)]",
    expense: "bg-expense-soft text-expense",
    income: "bg-income-soft text-income",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && (
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", chips[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className={cn("tnum mt-2 text-xl font-bold leading-tight md:text-2xl", accents[tone])}>
        {value}
      </p>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

/** Horizontal progress meter used by budgets. */
export function Meter({
  pct,
  state = "ok",
  className,
}: {
  pct: number;
  state?: "ok" | "warning" | "exceeded";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const colors = {
    ok: "bg-[var(--brand)]",
    warning: "bg-[var(--warning)]",
    exceeded: "bg-[var(--danger)]",
  };
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", colors[state])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden="true" />;
}

/** Section heading with an optional action on the right. */
export function SectionTitle({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold text-ink md:text-lg">{title}</h2>
        {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
