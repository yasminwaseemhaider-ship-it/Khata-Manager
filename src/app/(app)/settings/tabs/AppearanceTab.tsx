"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, Monitor, Bell, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/form";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { setTheme, updateSettings } from "@/app/actions/settings";
import { cn } from "@/lib/utils";
import type { Theme } from "@/types";

const THEMES: { value: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Always light", icon: Sun },
  { value: "dark", label: "Dark", hint: "Always dark", icon: Moon },
  { value: "system", label: "System", hint: "Follow your device", icon: Monitor },
];

export function AppearanceTab() {
  const router = useRouter();
  const { toast } = useToast();
  const { settings } = useAppData();

  const [theme, setThemeState] = useState<Theme>(settings.theme);
  const [notifyBills, setNotifyBills] = useState(settings.notify_bills);
  const [notifyBudgets, setNotifyBudgets] = useState(settings.notify_budgets);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  function applyTheme(next: Theme) {
    setThemeState(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    startTransition(() => {
      setTheme(next);
    });
  }

  async function saveAlerts() {
    setSaving(true);
    const res = await updateSettings({
      notify_bills: notifyBills,
      notify_budgets: notifyBudgets,
    });
    setSaving(false);
    if (res.ok) {
      toast("Preferences saved.");
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>

        <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-3 gap-2">
          {THEMES.map(({ value, label, hint, icon: Icon }) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              onClick={() => applyTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors",
                theme === value
                  ? "border-[var(--brand)] bg-brand-soft"
                  : "border-line hover:bg-surface-2"
              )}
            >
              <Icon
                className={cn(
                  "h-6 w-6",
                  theme === value ? "text-[var(--brand-text)]" : "text-muted"
                )}
              />
              <span className="text-sm font-medium text-ink">{label}</span>
              <span className="text-[11px] text-muted">{hint}</span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted">
          Your choice is applied instantly and remembered on this device and your account.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 px-3 py-3">
            <input
              type="checkbox"
              checked={notifyBills}
              onChange={(e) => setNotifyBills(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">Bill reminders</span>
              <span className="block text-xs text-muted">
                Tell me when a recurring bill is due or overdue.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 px-3 py-3">
            <input
              type="checkbox"
              checked={notifyBudgets}
              onChange={(e) => setNotifyBudgets(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">Budget warnings</span>
              <span className="block text-xs text-muted">
                Warn me as a budget nears its limit, and when it goes over.
              </span>
            </span>
          </label>
        </div>

        <Button className="mt-3" onClick={saveAlerts} loading={saving}>
          <Save className="h-4 w-4" /> Save preferences
        </Button>

        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Alerts appear in the bell menu at the top of the app.
        </p>
      </Card>
    </div>
  );
}
