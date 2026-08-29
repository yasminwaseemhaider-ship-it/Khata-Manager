"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Pencil, Archive, Trash2, ChevronDown, ChevronRight, CornerDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, CardHeader, CardTitle, Field, Input, Select, Badge } from "@/components/ui/form";
import { CategoryIcon, ICON_NAMES } from "@/components/CategoryIcon";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  createCategory, updateCategory, archiveCategory, deleteCategory,
  createSubcategory, deleteSubcategory,
} from "@/app/actions/taxonomy";
import { cn } from "@/lib/utils";
import type { Category, CategoryType } from "@/types";

const PALETTE = [
  "#059669", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6",
  "#ec4899", "#6366f1", "#84cc16", "#f97316", "#64748b", "#0ea5e9",
];

const EMPTY = { name: "", type: "expense" as CategoryType, icon: "Tag", color: PALETTE[0] };

export function CategoriesTab() {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, subcategories } = useAppData();

  const [type, setType] = useState<CategoryType>("expense");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const [subParent, setSubParent] = useState<Category | null>(null);
  const [subName, setSubName] = useState("");
  const [subSaving, setSubSaving] = useState(false);

  const visible = categories.filter(
    (c) => c.type === type && (showArchived || !c.is_archived)
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, type });
    setError(null);
    setShowForm(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({
      name: c.name,
      type: c.type,
      icon: c.icon ?? "Tag",
      color: c.color ?? PALETTE[0],
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = editing
      ? await updateCategory(editing.id, form)
      : await createCategory(form);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(editing ? "Category updated." : "Category added.");
    setShowForm(false);
    router.refresh();
  }

  async function handleArchive(c: Category) {
    const res = await archiveCategory(c.id, !c.is_archived);
    if (res.ok) {
      toast(c.is_archived ? "Category restored." : "Category archived.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteCategory(confirmDelete.id);
    if (res.ok) {
      toast("Category deleted.", { type: "info" });
      router.refresh();
    } else {
      // The action refuses when transactions still reference it.
      toast(res.error, { type: "error" });
    }
  }

  async function handleAddSub() {
    if (!subParent || !subName.trim()) return;
    setSubSaving(true);
    const res = await createSubcategory({ category_id: subParent.id, name: subName });
    setSubSaving(false);
    if (!res.ok) {
      toast(res.error, { type: "error" });
      return;
    }
    toast("Subcategory added.");
    setSubName("");
    setExpanded((e) => (e.includes(subParent.id) ? e : [...e, subParent.id]));
    setSubParent(null);
    router.refresh();
  }

  async function handleDeleteSub(id: string) {
    const res = await deleteSubcategory(id);
    if (res.ok) {
      toast("Subcategory removed.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </CardHeader>

        <div role="tablist" className="mb-3 flex gap-1 rounded-xl bg-surface-2 p-1">
          {(["expense", "income"] as CategoryType[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              onClick={() => setType(t)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors",
                type === t ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            No {type} categories yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((c) => {
              const subs = subcategories.filter((s) => s.category_id === c.id);
              const isOpen = expanded.includes(c.id);

              return (
                <li key={c.id} className={cn(c.is_archived && "opacity-60")}>
                  <div className="flex items-center gap-2 py-2.5">
                    <button
                      onClick={() =>
                        setExpanded((e) =>
                          e.includes(c.id) ? e.filter((x) => x !== c.id) : [...e, c.id]
                        )
                      }
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} subcategories of ${c.name}`}
                      className="shrink-0 rounded p-0.5 text-faint hover:text-ink"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: (c.color ?? "#64748b") + "22",
                        color: c.color ?? undefined,
                      }}
                    >
                      <CategoryIcon name={c.icon} className="h-4 w-4" />
                    </span>

                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {c.name}
                      {subs.length > 0 && (
                        <span className="ml-1.5 text-xs text-faint">({subs.length})</span>
                      )}
                    </span>

                    {c.is_archived && <Badge>Archived</Badge>}

                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setSubParent(c);
                          setSubName("");
                        }}
                        aria-label={`Add subcategory to ${c.name}`}
                        title="Add subcategory"
                      >
                        <CornerDownRight className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => openEdit(c)}
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => handleArchive(c)}
                        aria-label={`${c.is_archived ? "Restore" : "Archive"} ${c.name}`}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setConfirmDelete(c)}
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <ul className="ml-8 space-y-1 pb-2">
                      {subs.length === 0 && (
                        <li className="py-1 text-xs text-faint">
                          No subcategories. Use the ↳ button to add one.
                        </li>
                      )}
                      {subs.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 py-1">
                          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-faint" />
                          <span className="min-w-0 flex-1 truncate text-xs text-ink">
                            {s.name}
                          </span>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => handleDeleteSub(s.id)}
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <button
          onClick={() => setShowArchived((s) => !s)}
          className="mt-3 text-xs font-medium text-[var(--brand-text)] hover:underline"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </Card>

      {/* ---------- Category form ---------- */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit category" : "New category"}
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
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required htmlFor="c-name">
            <Input
              id="c-name"
              data-autofocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Groceries"
            />
          </Field>

          <Field label="Type" htmlFor="c-type">
            <Select
              id="c-type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CategoryType }))}
              disabled={!!editing}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Colour</p>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  aria-label={`Colour ${c}`}
                  aria-pressed={form.color === c}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-transform",
                    form.color === c ? "scale-110 border-ink" : "border-transparent"
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Icon</p>
            <div className="grid max-h-40 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border border-line p-2">
              {ICON_NAMES.map((n) => (
                <button
                  key={n}
                  onClick={() => setForm((f) => ({ ...f, icon: n }))}
                  aria-label={n}
                  aria-pressed={form.icon === n}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                    form.icon === n
                      ? "bg-brand-soft text-[var(--brand-text)]"
                      : "text-muted hover:bg-surface-2"
                  )}
                >
                  <CategoryIcon name={n} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* ---------- Subcategory ---------- */}
      <Modal
        open={!!subParent}
        onClose={() => setSubParent(null)}
        title="Add subcategory"
        description={subParent ? `Inside ${subParent.name}` : ""}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setSubParent(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleAddSub}
              loading={subSaving}
              disabled={!subName.trim()}
            >
              Add
            </Button>
          </div>
        }
      >
        <Field label="Name" required htmlFor="sub-name">
          <Input
            id="sub-name"
            data-autofocus
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSub()}
            placeholder="e.g. Vegetables"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Delete "${confirmDelete?.name}"?`}
        body="Categories that still have transactions cannot be deleted — archive them instead so your history stays readable."
      />
    </div>
  );
}
