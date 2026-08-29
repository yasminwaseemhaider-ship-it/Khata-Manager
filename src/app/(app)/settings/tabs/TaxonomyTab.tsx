"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, CardHeader, CardTitle, Input } from "@/components/ui/form";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { createNamed, updateNamed, deleteNamed } from "@/app/actions/taxonomy";
import { cn } from "@/lib/utils";

type Table = "payment_methods" | "vendors" | "tags";

const PALETTE = [
  "#059669", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#14b8a6", "#ec4899", "#6366f1", "#84cc16", "#64748b",
];

/**
 * Shared editor for the three flat lists (payment methods, vendors, tags).
 * They have identical CRUD, so one component covers all three rather than
 * three near-identical pages.
 */
export function TaxonomyTab({
  table,
  title,
  description,
  placeholder,
  withColor = false,
}: {
  table: Table;
  title: string;
  description: string;
  placeholder: string;
  withColor?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { paymentMethods, vendors, tags } = useAppData();

  const items =
    table === "payment_methods" ? paymentMethods : table === "vendors" ? vendors : tags;

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const res = await createNamed(table, withColor ? { name, color: newColor } : { name });
    setAdding(false);
    if (!res.ok) {
      toast(res.error, { type: "error" });
      return;
    }
    toast("Added.");
    setNewName("");
    router.refresh();
  }

  async function handleRename(id: string) {
    const name = draft.trim();
    if (!name) return;
    const res = await updateNamed(table, id, { name });
    if (!res.ok) {
      toast(res.error, { type: "error" });
      return;
    }
    toast("Renamed.");
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteNamed(table, confirmDelete.id);
    if (res.ok) {
      toast("Deleted.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </CardHeader>

      <div className="mb-3 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={placeholder}
          aria-label={`New ${title.toLowerCase()}`}
        />
        <Button onClick={handleAdd} loading={adding} disabled={!newName.trim()}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>

      {withColor && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Colour:</span>
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={newColor === c}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                newColor === c ? "scale-110 border-ink" : "border-transparent"
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((item) => {
            const color = "color" in item ? (item.color as string | null) : null;
            const isEditing = editingId === item.id;

            return (
              <li key={item.id} className="flex items-center gap-2 py-2.5">
                {withColor && (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: color ?? "#64748b" }}
                  />
                )}

                {isEditing ? (
                  <>
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(item.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-9"
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => handleRename(item.id)}
                      aria-label="Save"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.name}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(item.id);
                        setDraft(item.name);
                      }}
                      aria-label={`Rename ${item.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => setConfirmDelete({ id: item.id, name: item.name })}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Delete "${confirmDelete?.name}"?`}
        body="Transactions keep their history — they will simply no longer show this label."
      />
    </Card>
  );
}
