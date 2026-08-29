import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Friendly empty state. Always says what the space is for and offers the one
 * action that fills it — never just "No data".
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  actionHref,
  onAction,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  const actionClasses =
    "mt-4 inline-flex h-10 items-center rounded-xl bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-faint">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{body}</p>}

      {actionLabel && actionHref && (
        <Link href={actionHref} className={actionClasses}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button onClick={onAction} className={actionClasses}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
