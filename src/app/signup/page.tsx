"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/form";
import { signup } from "@/app/actions/auth";
import { useToast } from "@/context/ToastContext";
import { Wallet, MailCheck } from "lucide-react";

export default function SignupPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
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

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-white px-4 py-10">
      <div className="w-full max-w-sm">
        {sentTo ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
              <MailCheck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Check your inbox</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              We sent a confirmation link to{" "}
              <strong className="text-slate-900">{sentTo}</strong>. Open it and your
              khata is ready. The link expires in 24 hours.
            </p>
            <p className="mt-4 text-xs text-slate-400">
              Nothing yet? Check the spam folder — the first message from a new sender
              often lands there.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
        <>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
            <Wallet className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Set up your personal khata in seconds
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Ali Khan"
              autoComplete="name"
              required
              minLength={2}
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              placeholder="Re-enter password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Sign in
          </Link>
        </p>
        </>
        )}
      </div>
    </div>
  );
}
