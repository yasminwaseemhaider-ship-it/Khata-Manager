"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/form";
import { signup } from "@/app/actions/auth";
import { useToast } from "@/context/ToastContext";
import {
  Wallet,
  MailCheck,
  Mail,
  Lock,
  UserRound,
  Eye,
  EyeOff,
  CircleAlert,
  Check,
} from "lucide-react";

export default function SignupPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // Sign-up no longer lands the user straight in the app: the account exists
  // but stays unconfirmed until they open the emailed link, so the page has to
  // say so rather than silently doing nothing.
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (pw !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await signup(formData);
    setLoading(false);
    if (res && "error" in res && res.error) {
      setError(res.error);
      toast(res.error, { type: "error" });
      return;
    }
    if (res && "email" in res && res.email) {
      setSentTo(res.email);
    }
  }

  // Live "strength" meter derived purely from the current value — never blocks
  // submission, the server is still the authority on what is valid.
  const strength = pw.length === 0 ? 0 : pw.length >= 8 ? 2 : 1;
  const matchOk = confirm.length > 0 && confirm === pw;

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-bg px-4 py-10">
      {/* Decorative background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[length:22px_22px] opacity-40" />
        <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-brand-soft opacity-90 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-brand-soft opacity-70 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-brand-soft opacity-60 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {sentTo ? (
          /* ------------ Email sent ------------ */
          <div className="text-center">
            <div className="relative mx-auto mb-6 h-20 w-20">
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-brand/25 blur-xl"
              />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[var(--brand-hover)] text-white shadow-lg">
                <MailCheck className="h-9 w-9" />
              </div>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-text">
              Almost there
            </p>
            <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
              Check your inbox
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              We sent a confirmation link to{" "}
              <strong className="font-semibold text-ink">{sentTo}</strong>. Open
              it and your khata is ready. The link expires in 24 hours.
            </p>

            <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-left shadow-[var(--shadow)]">
              <ul className="space-y-3 text-sm text-muted">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                    <Check className="h-3 w-3" />
                  </span>
                  Open the confirmation link in the email
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                    <Check className="h-3 w-3" />
                  </span>
                  You&apos;ll land straight in your dashboard
                </li>
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
                Nothing yet? Check the spam folder — the first message from a new
                sender often lands there.
              </p>
            </div>

            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-2xl border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          /* ------------ Create account ------------ */
          <>
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-3xl bg-brand/25 blur-xl"
                />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand to-[var(--brand-hover)] text-white shadow-lg">
                  <Wallet className="h-8 w-8" />
                </div>
              </div>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-text">
                Khata
              </p>
              <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
                Create your account
              </h1>
              <p className="mt-1 text-sm text-muted">
                Set up your personal khata in seconds
              </p>
            </div>

            <div className="rounded-3xl border border-line bg-surface p-6 shadow-[0_24px_60px_-24px_rgba(5,150,105,0.35)]">
              <form onSubmit={onSubmit} className="space-y-5">
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
                  >
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <Label htmlFor="name">Your name</Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="e.g. Ali Khan"
                      autoComplete="name"
                      required
                      minLength={2}
                      className="h-12 rounded-2xl pl-11"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      className="h-12 rounded-2xl pl-11"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
                    <Input
                      id="password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      required
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      className="h-12 rounded-2xl pl-11 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-faint transition-colors hover:bg-surface-2 hover:text-muted"
                    >
                      {showPw ? (
                        <EyeOff className="h-[18px] w-[18px]" />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>
                  {pw.length > 0 && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex flex-1 gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i < strength
                                ? strength === 1
                                  ? "bg-warning"
                                  : "bg-brand"
                                : "bg-line"
                            }`}
                          />
                        ))}
                      </div>
                      <span
                        className={`text-[11px] font-medium ${
                          strength === 2 ? "text-brand-text" : "text-faint"
                        }`}
                      >
                        {strength === 0
                          ? "Too short"
                          : strength === 1
                            ? "Getting there"
                            : "Strong enough"}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="confirm">Confirm password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
                    <Input
                      id="confirm"
                      name="confirm"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="h-12 rounded-2xl pl-11 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-faint transition-colors hover:bg-surface-2 hover:text-muted"
                    >
                      {showConfirm ? (
                        <EyeOff className="h-[18px] w-[18px]" />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>
                  {confirm.length > 0 &&
                    (matchOk ? (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-brand-text">
                        <Check className="h-3.5 w-3.5" />
                        Passwords match
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs font-medium text-danger">
                        Passwords do not match
                      </p>
                    ))}
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-2xl text-base shadow-lg shadow-brand/20"
                  size="lg"
                  loading={loading}
                >
                  {loading ? "Creating account…" : "Create account"}
                </Button>
              </form>

              <p className="mt-5 border-t border-line pt-5 text-center text-sm text-muted">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-brand-text transition-colors hover:text-[var(--brand-hover)]"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}