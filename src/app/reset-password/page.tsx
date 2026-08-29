"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/form";
import { updatePassword } from "@/app/actions/auth";
import { useToast } from "@/context/ToastContext";

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const pw = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (pw !== confirm) {
      toast("Passwords do not match.", { type: "error" });
      setLoading(false);
      return;
    }
    const res = await updatePassword(formData);
    setLoading(false);
    if (res && "error" in res && res.error) {
      toast(res.error, { type: "error" });
      return;
    }
    setDone(true);
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-emerald-50 to-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Choose a strong password for your account.
        </p>
        {done ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-600">Your password has been updated. You can now sign in.</p>
            <a href="/login" className="mt-4 inline-block text-sm font-semibold text-emerald-600">
              Go to sign in →
            </a>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" placeholder="At least 8 characters" required minLength={8} />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" name="confirm" type="password" placeholder="Re-enter password" required />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
