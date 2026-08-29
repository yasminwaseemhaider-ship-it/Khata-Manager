"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Check, ShieldCheck, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/context/ToastContext";
import { createClient } from "@/lib/supabase/client";
import { completeOnboarding } from "@/app/actions/onboarding";
import { CURRENCIES, formatMoney } from "@/lib/format";

/**
 * Onboarding does real work: it creates the user's default categories,
 * payment methods and accounts. The (app) layout sends anyone without
 * categories here, so this page must be the thing that creates them —
 * otherwise the two would bounce the user back and forth forever.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      // Pre-fill the name captured at sign-up.
      const metaName = (data.user.user_metadata as { name?: string } | null)?.name;
      if (metaName) setName(metaName);
    });
  }, [router]);

  async function finish() {
    setLoading(true);
    setError(null);

    const res = await completeOnboarding({
      displayName: name || null,
      currencyCode: currency,
      cashBalance: cash,
      bankBalance: bank,
    });

    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    toast("Your khata is ready!");
    // completeOnboarding revalidates the layout, so a refresh picks up the
    // newly created categories and the layout no longer bounces us back here.
    router.replace("/dashboard");
    router.refresh();
  }

  const symbol = CURRENCIES[currency]?.symbol ?? "Rs.";
  const totalOpening = (Number(cash) || 0) + (Number(bank) || 0);

  const STEPS = [
    {
      title: "Welcome to Khata",
      body: "Record an expense in seconds, track your household budget, and keep your lending khata in one place.",
      content: (
        <ul className="space-y-3 text-left">
          <li className="flex gap-3">
            <Zap className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
            <span className="text-sm text-muted">
              <strong className="text-ink">Two taps to log a spend.</strong> Amount and
              category are the only things you ever have to fill in.
            </span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
            <span className="text-sm text-muted">
              <strong className="text-ink">Only you can see it.</strong> Every record is
              locked to your account in the database itself.
            </span>
          </li>
          <li className="flex gap-3">
            <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
            <span className="text-sm text-muted">
              <strong className="text-ink">Everything in one place.</strong> Budgets,
              bills, shopping list and khata — all feeding the same numbers.
            </span>
          </li>
        </ul>
      ),
    },
    {
      title: "A few basics",
      body: "You can change any of this later in Settings.",
      content: (
        <div className="space-y-3 text-left">
          <Field label="What should we call you?" htmlFor="ob-name">
            <Input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </Field>
          <Field
            label="Currency"
            htmlFor="ob-cur"
            hint={`Amounts will look like ${formatMoney(2500, symbol)}`}
          >
            <Select
              id="ob-cur"
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
        </div>
      ),
    },
    {
      title: "What do you have right now?",
      body: "Optional — this becomes your opening balance so the dashboard is accurate from day one.",
      content: (
        <div className="space-y-3 text-left">
          <Field label="Cash in hand" htmlFor="ob-cash">
            <Input
              id="ob-cash"
              inputMode="decimal"
              value={cash}
              onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className="tnum"
            />
          </Field>
          <Field label="In the bank" htmlFor="ob-bank">
            <Input
              id="ob-bank"
              inputMode="decimal"
              value={bank}
              onChange={(e) => setBank(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className="tnum"
            />
          </Field>
          {totalOpening > 0 && (
            <p className="rounded-xl bg-brand-soft px-3 py-2 text-xs font-medium text-[var(--brand-text)]">
              Starting balance: {formatMoney(totalOpening, symbol)}
            </p>
          )}
          <p className="text-xs text-muted">
            We&apos;ll create a <strong className="text-ink">Cash</strong> and a{" "}
            <strong className="text-ink">Bank</strong> account, plus your default
            categories and payment methods.
          </p>
        </div>
      ),
    },
  ];

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--brand)] text-white shadow-xl">
          <Wallet className="h-10 w-10" />
        </div>

        <div className="mb-4 flex justify-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-[var(--brand)]" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>

        <h1 className="text-xl font-bold text-ink">{s.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>

        <div className="my-6">{s.content}</div>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger"
          >
            {error}
          </p>
        )}

        <div className="space-y-2">
          {isLast ? (
            <Button className="w-full" size="lg" onClick={finish} loading={loading}>
              <Check className="h-5 w-5" /> Set up my khata
            </Button>
          ) : (
            <Button className="w-full" size="lg" onClick={() => setStep(step + 1)}>
              Continue <ArrowRight className="h-5 w-5" />
            </Button>
          )}

          {step > 0 && !loading && (
            <Button variant="ghost" className="w-full" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
