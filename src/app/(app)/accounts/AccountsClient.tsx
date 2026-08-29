"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet, Plus, ArrowLeftRight, Pencil, Archive, Trash2, Star, Landmark,
  CreditCard, Smartphone, PiggyBank, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, Field, Input, Select, StatCard, SectionTitle, Badge } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuickAddModal } from "@/components/transaction/QuickAddModal";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  createAccount, updateAccount, archiveAccount, deleteAccount, setDefaultAccount,
} from "@/app/actions/accounts";
import { cn } from "@/lib/utils";
import type { Account, TransactionWithTags } from "@/types";

const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank", label: "Bank account", icon: Landmark },
  { value: "card", label: "Credit / debit card", icon: CreditCard },
  { value: "wallet", label: "Mobile wallet (JazzCash, Easypaisa…)", icon: Smartphone },
  { value: "savings", label: "Savings", icon: PiggyBank },
] as const;

function typeIcon(type: string) {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.icon ?? Wallet;
}

const EMPTY_FORM = { name: "", type: "cash", opening_balance: "", is_default: false };

export function AccountsClient({ transactions }: { transactions: TransactionWithTags[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { accounts, balances, money } = useAppData();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const visible = accounts.filter((a) => showArchived || !a.is_archived);
  const totalBalance = accounts
    .filter((a) => !a.is_archived)
    .reduce((s, a) => s + (balances[a.id] ?? Number(a.opening_balance)), 0);

  /** Per-account movement, so each card shows real in/out figures. */
  const movement = useMemo(() => {
    const map = new Map<string, { in: number; out: number; count: number }>();
    for (const t of transactions) {
      const amount = Number(t.amount);
      if (t.account_id) {
        const cur = map.get(t.account_id) ?? { in: 0, out: 0, count: 0 };
        if (t.type === "income") cur.in += amount;
        else cur.out += amount; // expense or transfer out
        cur.count += 1;
        map.set(t.account_id, cur);
      }
      if (t.type === "transfer" && t.transfer_to_account_id) {
        const cur = map.get(t.transfer_to_account_id) ?? { in: 0, out: 0, count: 0 };
        cur.in += amount;
        cur.count += 1;
        map.set(t.transfer_to_account_id, cur);
      }
    }
    return map;
  }, [transactions]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(a: Account) {
    setEditing(a);
    setForm({
      name: a.name,
      type: a.type,
      opening_balance: String(a.opening_balance),
      is_default: a.is_default,
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      type: form.type,
      opening_balance: form.opening_balance || 0,
      is_default: form.is_default,
    };
    const res = editing
      ? await updateAccount(editing.id, payload)
      : await createAccount(payload);
    setSaving(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(editing ? "Account updated." : "Account added.");
    setShowForm(false);
    router.refresh();
  }

  async function handleArchive(a: Account) {
    const res = await archiveAccount(a.id, !a.is_archived);
    if (res.ok) {
      toast(a.is_archived ? "Account restored." : "Account archived.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteAccount(confirmDelete.id);
    if (res.ok) {
      toast("Account deleted.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  async function handleSetDefault(a: Account) {
    const res = await setDefaultAccount(a.id);
    if (res.ok) {
      toast(`${a.name} is now your default account.`);
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle
        title="Accounts"
        sub="Cash, bank, cards and wallets"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTransfer(true)}>
              <ArrowLeftRight className="h-4 w-4" />
              <span className="hidden sm:inline">Transfer</span>
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add account</span>
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <StatCard
          label="Total balance across all accounts"
          value={money(totalBalance)}
          tone={totalBalance >= 0 ? "brand" : "expense"}
          icon={<Wallet className="h-4 w-4" />}
          sub="Opening balance + income − expenses ± transfers"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="No accounts yet"
          body="Add your cash, bank account or mobile wallet to track balances."
          actionLabel="Add account"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((a) => {
            const Icon = typeIcon(a.type);
            const bal = balances[a.id] ?? Number(a.opening_balance);
            const mv = movement.get(a.id);
            return (
              <Card key={a.id} className={cn(a.is_archived && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[var(--brand-text)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold text-ink">{a.name}</h3>
                      {a.is_default && <Badge tone="brand">Default</Badge>}
                      {a.is_archived && <Badge>Archived</Badge>}
                    </div>
                    <p className="text-xs capitalize text-muted">
                      {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                    </p>
                  </div>
                </div>

                <p
                  className={cn(
                    "tnum mt-3 text-xl font-bold",
                    bal < 0 ? "text-expense" : "text-ink"
                  )}
                >
                  {money(bal)}
                </p>
                <p className="mt-0.5 text-[11px] text-faint">
                  Opened with {money(Number(a.opening_balance))}
                  {mv ? ` · ${mv.count} transaction${mv.count === 1 ? "" : "s"}` : ""}
                </p>

                {mv && (
                  <div className="mt-2 flex gap-3 text-[11px]">
                    <span className="text-income">In {money(mv.in)}</span>
                    <span className="text-expense">Out {money(mv.out)}</span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {!a.is_default && !a.is_archived && (
                    <Button size="sm" variant="ghost" onClick={() => handleSetDefault(a)}>
                      <Star className="h-3.5 w-3.5" /> Default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(a)}>
                    <Archive className="h-3.5 w-3.5" /> {a.is_archived ? "Restore" : "Archive"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setConfirmDelete(a)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {accounts.some((a) => a.is_archived) && (
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="mt-4 text-xs font-medium text-[var(--brand-text)] hover:underline"
        >
          {showArchived ? "Hide archived accounts" : "Show archived accounts"}
        </button>
      )}

      {/* ---------- Create / edit ---------- */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit account" : "New account"}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              loading={saving}
              disabled={!form.name.trim()}
            >
              {editing ? "Save" : "Add account"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required htmlFor="acc-name">
            <Input
              id="acc-name"
              data-autofocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Meezan Bank"
            />
          </Field>

          <Field label="Type" htmlFor="acc-type">
            <Select
              id="acc-type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Opening balance"
            htmlFor="acc-open"
            hint="What is in this account right now. Balances are recalculated from it."
          >
            <Input
              id="acc-open"
              inputMode="decimal"
              value={form.opening_balance}
              onChange={(e) =>
                setForm((f) => ({ ...f, opening_balance: e.target.value.replace(/[^0-9.]/g, "") }))
              }
              placeholder="0"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            <span className="text-sm text-ink">Use as my default account</span>
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Delete ${confirmDelete?.name}?`}
        body="Accounts with transactions cannot be deleted — archive them instead so your history stays correct."
      />

      <QuickAddModal
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        preset={{ type: "transfer" }}
      />
    </div>
  );
}
