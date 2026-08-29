"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui/form";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { updateSettings } from "@/app/actions/settings";
import { CURRENCIES, formatMoney } from "@/lib/format";

const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
  { value: 6, label: "Saturday" },
];

export function ProfileTab() {
  const router = useRouter();
  const { toast } = useToast();
  const { settings, accounts } = useAppData();

  const [name, setName] = useState(settings.display_name ?? "");
  const [currency, setCurrency] = useState(settings.currency_code);
  const [weekStart, setWeekStart] = useState(settings.week_starts_on);
  const [defaultAccount, setDefaultAccount] = useState(settings.default_account_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = formatMoney(12345.5, CURRENCIES[currency]?.symbol ?? "Rs.");

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await updateSettings({
      display_name: name || null,
      currency_code: currency,
      week_starts_on: Number(weekStart),
      default_account_id: defaultAccount || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Settings saved.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>

        <div className="space-y-3">
          <Field label="Display name" htmlFor="st-name" hint="Used to greet you on the dashboard.">
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </Field>

          <Field
            label="Currency"
            htmlFor="st-cur"
            hint={`Amounts will look like ${preview}`}
          >
            <Select
              id="st-cur"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.symbol})
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Week starts on"
            htmlFor="st-week"
            hint="Affects weekly totals, budgets and the calendar."
          >
            <Select
              id="st-week"
              value={String(weekStart)}
              onChange={(e) => setWeekStart(Number(e.target.value))}
            >
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Default account"
            htmlFor="st-acc"
            hint="Used automatically when you add an expense without choosing one."
          >
            <Select
              id="st-acc"
              value={defaultAccount}
              onChange={(e) => setDefaultAccount(e.target.value)}
            >
              <option value="">First available account</option>
              {accounts
                .filter((a) => !a.is_archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
            </Select>
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}

          <Button onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <Link
            href="/accounts"
            className="text-xs font-medium text-[var(--brand-text)] hover:underline"
          >
            Manage accounts
          </Link>
        </CardHeader>
        <ul className="divide-y divide-[var(--border)]">
          {accounts.length === 0 && (
            <li className="py-3 text-xs text-muted">No accounts yet.</li>
          )}
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <Wallet className="h-4 w-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>
              <span className="text-xs capitalize text-muted">{a.type}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
