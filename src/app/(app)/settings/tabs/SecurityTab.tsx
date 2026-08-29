"use client";

import { useState } from "react";
import { ShieldCheck, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, Field, Input } from "@/components/ui/form";
import { useToast } from "@/context/ToastContext";
import { changePassword, logout } from "@/app/actions/auth";

export function SecurityTab() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  async function handleSave() {
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setSaving(true);
    const res = await changePassword(password);
    setSaving(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Password updated.");
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>

        <div className="space-y-3">
          <Field
            label="New password"
            required
            htmlFor="sec-pw"
            error={tooShort ? "Use at least 8 characters." : null}
          >
            <Input
              id="sec-pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={tooShort}
            />
          </Field>

          <Field
            label="Confirm new password"
            required
            htmlFor="sec-pw2"
            error={mismatch ? "These do not match." : null}
          >
            <Input
              id="sec-pw2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}

          <Button
            onClick={handleSave}
            loading={saving}
            disabled={password.length < 8 || mismatch}
          >
            <KeyRound className="h-4 w-4" /> Update password
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How your data is protected</CardTitle>
        </CardHeader>
        <ul className="space-y-2 text-xs leading-relaxed text-muted">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
            Every row you create is tied to your account id. Row Level Security is
            enforced in the database itself, so another signed-in user cannot read
            or change your records even with a direct query.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
            Every change goes through the server, which re-checks your session and
            confirms that each category, account and tag you reference is your own.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
            Receipt images live in a private bucket, in a folder keyed to your user
            id, and are only ever served through short-lived signed links.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
            Passwords are hashed by Supabase Auth. This app never sees or stores them.
          </li>
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <p className="mb-3 text-xs text-muted">
          Signing out clears your session on this device.
        </p>
        <Button variant="outline" onClick={() => logout()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </Card>
    </div>
  );
}
