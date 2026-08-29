"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  CalendarDays,
  CalendarRange,
  Wallet,
  Target,
  RefreshCcw,
  ShoppingCart,
  BookOpen,
  BarChart3,
  Lightbulb,
  Bell,
  Settings,
  Plus,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  TrendingUp,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickAddModal } from "@/components/transaction/QuickAddModal";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { logout } from "@/app/actions/auth";
import { setTheme } from "@/app/actions/settings";
import type { AppNotification, Theme } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  group: "Track" | "Plan" | "Analyse";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, group: "Track" },
  { href: "/transactions", label: "Transactions", icon: <ArrowLeftRight className="h-5 w-5" />, group: "Track" },
  { href: "/daily", label: "Daily", icon: <CalendarDays className="h-5 w-5" />, group: "Track" },
  { href: "/monthly", label: "Monthly", icon: <CalendarRange className="h-5 w-5" />, group: "Track" },
  { href: "/yearly", label: "Yearly", icon: <TrendingUp className="h-5 w-5" />, group: "Track" },
  { href: "/calendar", label: "Calendar", icon: <CalendarClock className="h-5 w-5" />, group: "Track" },
  { href: "/accounts", label: "Accounts", icon: <Wallet className="h-5 w-5" />, group: "Plan" },
  { href: "/khata", label: "Khata (lend/borrow)", icon: <BookOpen className="h-5 w-5" />, group: "Plan" },
  { href: "/budgets", label: "Budgets", icon: <Target className="h-5 w-5" />, group: "Plan" },
  { href: "/recurring", label: "Bills & recurring", icon: <RefreshCcw className="h-5 w-5" />, group: "Plan" },
  { href: "/shopping", label: "Shopping list", icon: <ShoppingCart className="h-5 w-5" />, group: "Plan" },
  { href: "/reminders", label: "Reminders", icon: <Bell className="h-5 w-5" />, group: "Plan" },
  { href: "/reports", label: "Reports", icon: <BarChart3 className="h-5 w-5" />, group: "Analyse" },
  { href: "/insights", label: "Insights", icon: <Lightbulb className="h-5 w-5" />, group: "Analyse" },
  { href: "/settings", label: "Settings", icon: <Settings className="h-5 w-5" />, group: "Analyse" },
];

const GROUPS: NavItem["group"][] = ["Track", "Plan", "Analyse"];

const THEMES: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
  { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
];

export function AppShell({
  children,
  displayName,
  email,
  theme,
  notifications,
}: {
  children: ReactNode;
  displayName: string;
  email: string;
  theme: Theme;
  notifications: AppNotification[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [quickOpen, setQuickOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [current, setCurrent] = useState<Theme>(theme);
  const [, startTransition] = useTransition();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  // Keyboard shortcut: "n" opens quick-add from anywhere (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function applyTheme(next: Theme) {
    setCurrent(next);
    // Update the DOM immediately, then persist. The cookie makes the choice
    // survive a reload; the attribute makes it instant.
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    startTransition(() => {
      setTheme(next);
    });
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const navLink = (item: NavItem, onNavigate?: () => void) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive(item.href) ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        isActive(item.href)
          ? "bg-brand-soft text-[var(--brand-text)]"
          : "text-muted hover:bg-surface-2 hover:text-ink"
      )}
    >
      {item.icon}
      <span className="truncate">{item.label}</span>
    </Link>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
            <Wallet className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-ink">Khata</span>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-3 pb-2 scrollbar-hide">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {group}
              </p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter((i) => i.group === group).map((i) => navLink(i))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-line p-3">
          <ThemeSwitch current={current} onChange={applyTheme} />
          <div className="flex items-center gap-2 rounded-xl px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-[var(--brand-text)]">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">{displayName}</p>
              <p className="truncate text-[11px] text-faint">{email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-danger-soft hover:text-danger"
          >
            <LogOut className="h-5 w-5" /> Sign out
          </button>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 md:justify-end">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-white">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="font-bold text-ink">Khata</span>
          </div>

          <div className="flex items-center gap-1">
            <NotificationBell notifications={notifications} />
            <button
              onClick={() => setMobileMenu(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </header>

        {/* Mobile drawer */}
        {mobileMenu && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/40 animate-fade-in"
              onClick={() => setMobileMenu(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute right-0 top-0 flex h-full w-72 flex-col border-l border-line bg-surface shadow-xl animate-slide-up"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <span className="font-bold text-ink">Menu</span>
                <button
                  onClick={() => setMobileMenu(false)}
                  aria-label="Close menu"
                  className="rounded-lg p-1 text-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {NAV_ITEMS.filter((i) => i.group === group).map((i) =>
                        navLink(i, () => setMobileMenu(false))
                      )}
                    </div>
                  </div>
                ))}
              </nav>
              <div className="space-y-2 border-t border-line p-3 pb-safe">
                <ThemeSwitch current={current} onChange={applyTheme} />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-danger hover:bg-danger-soft"
                >
                  <LogOut className="h-5 w-5" /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        <main id="main" className="flex-1 overflow-y-auto pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* ---------- Mobile bottom nav ---------- */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden pb-safe"
      >
        <div className="grid grid-cols-5 items-center">
          <BottomLink href="/dashboard" label="Home" active={isActive("/dashboard")}>
            <LayoutDashboard className="h-5 w-5" />
          </BottomLink>
          <BottomLink href="/transactions" label="History" active={isActive("/transactions")}>
            <ArrowLeftRight className="h-5 w-5" />
          </BottomLink>

          <div className="flex justify-center">
            <button
              onClick={() => setQuickOpen(true)}
              aria-label="Add expense"
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-lg shadow-[var(--brand)]/40 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <Plus className="h-7 w-7" />
            </button>
          </div>

          <BottomLink href="/reports" label="Reports" active={isActive("/reports")}>
            <BarChart3 className="h-5 w-5" />
          </BottomLink>
          <BottomLink href="/settings" label="Settings" active={isActive("/settings")}>
            <Settings className="h-5 w-5" />
          </BottomLink>
        </div>
      </nav>

      {/* ---------- Desktop quick-add ---------- */}
      <button
        onClick={() => setQuickOpen(true)}
        title="Add expense (press N)"
        className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white shadow-xl transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:flex"
      >
        <Plus className="h-5 w-5" /> Add expense
      </button>

      <QuickAddModal open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

function BottomLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
        active ? "text-[var(--brand)]" : "text-muted"
      )}
    >
      {children}
      {label}
    </Link>
  );
}

function ThemeSwitch({
  current,
  onChange,
}: {
  current: Theme;
  onChange: (t: Theme) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex gap-1 rounded-xl bg-surface-2 p-1"
    >
      {THEMES.map((t) => (
        <button
          key={t.value}
          role="radio"
          aria-checked={current === t.value}
          onClick={() => onChange(t.value)}
          title={t.label}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
            current === t.value
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          )}
        >
          {t.icon}
          <span className="hidden lg:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
