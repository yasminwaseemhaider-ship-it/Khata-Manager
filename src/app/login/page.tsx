"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/form";
import { login } from "@/app/actions/auth";
import { useToast } from "@/context/ToastContext";
import {
  Wallet,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CircleAlert,
  ShieldCheck,
} from "lucide-react";

function LoginForm() {
  const search = useSearchParams();
  const redirect = search.get("redirect") || "/dashboard";
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // A failed email link (expired, already used, missing code) redirects here
  // with the reason attached, so seed the banner from it on first render.
  const [error, setError] = useState<string | null>(() => search.get("error"));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("redirect", redirect);

    const res = await login(formData);
    if (res && "error" in res && res.error) {
      setError(res.error);
      toast(res.error, { type: "error" });
      setLoading(false);
    }
  }

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
        {/* Brand lockup */}
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
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to continue to your khata
          </p>
        </div>

        {/* Sign-in card */}
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
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  className="h-12 rounded-2xl pl-11"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="password" className="mb-0">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-brand-text transition-colors hover:text-[var(--brand-hover)]"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
                <Input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
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
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-2xl text-base shadow-lg shadow-brand/20"
              size="lg"
              loading={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 border-t border-line pt-5 text-center text-sm text-muted">
            New to Khata?{" "}
            <Link
              href="/signup"
              className="font-semibold text-brand-text transition-colors hover:text-[var(--brand-hover)]"
            >
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-faint">
          <ShieldCheck className="h-3.5 w-3.5" />
          Your data stays private and encrypted
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}