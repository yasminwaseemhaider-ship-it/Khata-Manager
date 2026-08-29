"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check, Target, Receipt, BookOpen, RefreshCcw, Info } from "lucide-react";
import { markNotificationsRead, deleteNotification } from "@/app/actions/settings";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationKind } from "@/types";

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  budget: Target,
  bill: Receipt,
  khata: BookOpen,
  recurring: RefreshCcw,
  system: Info,
};

export function NotificationBell({ notifications }: { notifications: AppNotification[] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read_at);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unread.length ? `Notifications, ${unread.length} unread` : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unread.length > 0 && (
              <button
                onClick={() => startTransition(() => void markNotificationsRead())}
                className="flex items-center gap-1 text-xs font-medium text-[var(--brand-text)] hover:underline"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted">
                Nothing yet. Budget warnings and bill reminders will appear here.
              </p>
            ) : (
              notifications.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? Info;
                const body = (
                  <div
                    className={cn(
                      "flex gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
                      !n.read_at && "bg-brand-soft/40"
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                      <p className="mt-1 text-[10px] text-faint">
                        {formatDateTime(n.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        startTransition(() => void deleteNotification(n.id));
                      }}
                      aria-label="Dismiss notification"
                      className="shrink-0 self-start rounded p-1 text-faint hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                );

                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => setOpen(false)} className="block">
                    {body}
                  </Link>
                ) : (
                  <div key={n.id}>{body}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
