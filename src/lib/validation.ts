// ============================================================================
// Shared zod schemas. Imported by server actions (authoritative validation)
// and by client forms (instant feedback) so the rules can never drift apart.
// ============================================================================
import { z } from "zod";

const uuid = z.string().uuid();
/** Optional FK: "" from a <select> means "not set". */
export const optionalId = z
  .union([uuid, z.literal(""), z.null(), z.undefined()])
  .optional()
  .transform((v) => (v ? v : null))
  .nullable();

const money = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? Number(v.replace(/,/g, "")) : v))
  .refine((v) => Number.isFinite(v), { message: "Enter a valid amount." });

export const positiveMoney = money.refine((v) => v > 0, {
  message: "Amount must be greater than zero.",
});
export const nonNegativeMoney = money.refine((v) => v >= 0, {
  message: "Amount cannot be negative.",
});

const optionalNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .optional()
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
    return Number.isFinite(n) ? n : null;
  })
  .nullable();

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  })
  .nullable();

const isoDateTime = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString() : v))
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "Enter a valid date.",
  });

const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .transform((v) => (v ? v : null))
  .nullable();

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export const transactionSchema = z
  .object({
    type: z.enum(["expense", "income", "transfer"]),
    amount: positiveMoney,
    category_id: optionalId,
    subcategory_id: optionalId,
    account_id: optionalId,
    transfer_to_account_id: optionalId,
    payment_method_id: optionalId,
    vendor_id: optionalId,
    vendor_name: optionalText, // free-typed vendor, created on the fly
    // The title (note) names the transaction. Required so every expense,
    // income and transfer shows what it was for in the lists.
    note: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((v) => (v ?? "").trim())
      .refine((v) => v.length > 0, { message: "Add a title — what was this for?" }),
    qty: optionalNumber,
    unit_price: optionalNumber,
    transaction_date: isoDateTime.optional(),
    tag_ids: z.array(uuid).max(20).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "transfer") {
      if (!val.account_id)
        ctx.addIssue({
          code: "custom",
          path: ["account_id"],
          message: "Choose the account the money leaves.",
        });
      if (!val.transfer_to_account_id)
        ctx.addIssue({
          code: "custom",
          path: ["transfer_to_account_id"],
          message: "Choose the account the money goes to.",
        });
      if (
        val.account_id &&
        val.account_id === val.transfer_to_account_id
      )
        ctx.addIssue({
          code: "custom",
          path: ["transfer_to_account_id"],
          message: "Pick two different accounts.",
        });
    } else if (!val.category_id) {
      // The one hard requirement of the fast path: amount + category.
      ctx.addIssue({
        code: "custom",
        path: ["category_id"],
        message: "Pick a category.",
      });
    }
  });

export type TransactionInput = z.input<typeof transactionSchema>;

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------
export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  type: z.enum(["expense", "income"]),
  icon: optionalText,
  color: optionalText,
  sort_order: z.number().int().optional(),
});

export const subcategorySchema = z.object({
  category_id: uuid,
  name: z.string().trim().min(1, "Name is required.").max(60),
  icon: optionalText,
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  type: z.string().trim().min(1).max(30).default("cash"),
  opening_balance: nonNegativeMoney.optional(),
  currency_code: z.string().trim().length(3).optional(),
  icon: optionalText,
  color: optionalText,
  is_default: z.boolean().optional(),
});

export const namedSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  color: optionalText,
  icon: optionalText,
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export const budgetSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  amount: positiveMoney,
  period: z.enum(["monthly", "weekly", "yearly"]).default("monthly"),
  category_id: optionalId,
  account_id: optionalId,
  starts_on: optionalDate,
  alert_at_pct: z.number().int().min(1).max(200).default(80),
  is_active: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------
export const recurringSchema = z.object({
  title: z.string().trim().min(1, "Give the bill a name.").max(80),
  amount: nonNegativeMoney,
  type: z.enum(["expense", "income"]).default("expense"),
  category_id: optionalId,
  account_id: optionalId,
  payment_method_id: optionalId,
  vendor_id: optionalId,
  note: optionalText,
  frequency: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
  interval_step: z.number().int().min(1).max(365).default(1),
  next_run: optionalDate,
  auto_post: z.boolean().default(true),
  remind_days_before: z.number().int().min(0).max(30).default(1),
  is_active: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------
export const shoppingItemSchema = z.object({
  list_id: optionalId,
  name: z.string().trim().min(1, "Item name is required.").max(80),
  category_id: optionalId,
  qty: optionalNumber,
  unit: optionalText,
  est_price: optionalNumber,
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

// ---------------------------------------------------------------------------
// Khata
// ---------------------------------------------------------------------------
export const khataEntrySchema = z.object({
  person_id: optionalId,
  person_name: z.string().trim().min(1, "Whose khata is this?").max(60),
  direction: z.enum(["owing", "owed"]),
  amount: positiveMoney,
  note: optionalText,
  entry_date: optionalDate,
  due_date: optionalDate,
});

export const khataPaymentSchema = z.object({
  khata_entry_id: uuid,
  amount: positiveMoney,
  paid_at: isoDateTime.optional(),
  note: optionalText,
});

// ---------------------------------------------------------------------------
// Reminders + settings
// ---------------------------------------------------------------------------
export const reminderSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(80),
  due_date: optionalDate,
  amount: optionalNumber,
  category_id: optionalId,
  repeat: optionalText,
  notify_me: z.boolean().default(true),
});

export const settingsSchema = z.object({
  display_name: optionalText,
  currency_code: z.string().trim().length(3).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  week_starts_on: z.number().int().min(0).max(6).optional(),
  default_account_id: optionalId.optional(),
  notify_bills: z.boolean().optional(),
  notify_budgets: z.boolean().optional(),
});
