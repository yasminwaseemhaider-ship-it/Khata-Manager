"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/form";
import { login } from "@/app/actions/auth";
import { useToast } from "@/context/ToastContext";
import { Wallet } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const redirect = search.get("redirect") || "/dashboard";
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
            <Wallet className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to your Khata account
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="password" className="mb-0">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Create one
          </Link>
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
