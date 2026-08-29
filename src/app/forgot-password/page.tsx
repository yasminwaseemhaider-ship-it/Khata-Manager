"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/form";
import { sendPasswordReset } from "@/app/actions/auth";
import { useToast } from "@/context/ToastContext";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await sendPasswordReset(formData);
    setLoading(false);
    if (res && "error" in res && res.error) {
      toast(res.error, { type: "error" });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-emerald-50 to-white px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Check your email</h2>
          <p className="mt-2 text-sm text-slate-500">
            We sent a password reset link to your email. Follow the link to set a new password.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-emerald-50 to-white px-4">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Reset password</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
