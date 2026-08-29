"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./form";

/**
 * Confirmation for destructive actions.
 * Anything irreversible (erasing all data, deleting an account) can require the
 * user to type a phrase, so a stray tap can never trigger it.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  requirePhrase,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  requirePhrase?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const blocked = !!requirePhrase && typed.trim().toUpperCase() !== requirePhrase.toUpperCase();

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      setTyped("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-soft text-[var(--brand-text)]"
          }`}
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {body && <div className="mt-1 text-sm text-muted">{body}</div>}

          {requirePhrase && (
            <div className="mt-3">
              <label htmlFor="confirm-phrase" className="mb-1.5 block text-xs text-muted">
                Type <span className="font-semibold text-ink">{requirePhrase}</span> to confirm
              </label>
              <Input
                id="confirm-phrase"
                data-autofocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                placeholder={requirePhrase}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "destructive" : "primary"}
          className="flex-1"
          onClick={handleConfirm}
          loading={busy}
          disabled={blocked}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
