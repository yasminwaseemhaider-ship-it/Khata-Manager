"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Previous / next stepper shared by the daily, monthly, yearly and calendar
 * views. "Today" only appears when the user has navigated away from it.
 */
export function PeriodNav({
  label,
  onPrev,
  onNext,
  onToday,
  isCurrent,
  nextDisabled,
  className,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  isCurrent?: boolean;
  nextDisabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-2 py-2",
        className
      )}
    >
      <button
        onClick={onPrev}
        aria-label="Previous period"
        className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-col items-center">
        <span className="truncate text-sm font-semibold text-ink">{label}</span>
        {onToday && !isCurrent && (
          <button
            onClick={onToday}
            className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[var(--brand-text)] hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Back to today
          </button>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={nextDisabled}
        aria-label="Next period"
        className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
