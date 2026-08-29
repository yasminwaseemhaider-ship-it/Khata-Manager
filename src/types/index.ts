// ============================================================================
// Row shapes mirroring supabase/schema.sql.
// Kept hand-written (rather than `supabase gen types`) so the app compiles
// without a project ref; every field here matches a real column.
// ============================================================================

export type UUID = string;

export type TxType = "expense" | "income" | "transfer";
export type CategoryType = "expense" | "income";
export type Period = "monthly" | "weekly" | "yearly";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type Priority = "low" | "normal" | "high";
export type KhataDirection = "owing" | "owed";
export type KhataStatus = "open" | "partially_paid" | "settled";
export type Theme = "light" | "dark" | "system";

export interface UserSettings {
  user_id: UUID;
  display_name?: string | null;
  currency_code: string;
  currency_symbol: string;
  theme: Theme;
  week_starts_on: number;
  default_account_id?: UUID | null;
  notify_bills: boolean;
  notify_budgets: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: UUID;
  user_id: UUID;
  name: string;
  icon?: string | null;
  color?: string | null;
  type: CategoryType;
  parent_id?: UUID | null;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
}

export interface Subcategory {
  id: UUID;
  user_id: UUID;
  category_id: UUID;
  name: string;
  icon?: string | null;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
}

export interface Account {
  id: UUID;
  user_id: UUID;
  name: string;
  type: string;
  opening_balance: number;
  currency_code: string;
  icon?: string | null;
  color?: string | null;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface PaymentMethod {
  id: UUID;
  user_id: UUID;
  name: string;
  icon?: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface Vendor {
  id: UUID;
  user_id: UUID;
  name: string;
  icon?: string | null;
  created_at: string;
}

export interface Tag {
  id: UUID;
  user_id: UUID;
  name: string;
  color?: string | null;
  created_at: string;
}

export interface Transaction {
  id: UUID;
  user_id: UUID;
  type: TxType;
  amount: number;
  currency_code: string;
  category_id?: UUID | null;
  subcategory_id?: UUID | null;
  account_id?: UUID | null;
  transfer_to_account_id?: UUID | null;
  payment_method_id?: UUID | null;
  vendor_id?: UUID | null;
  note?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  created_at: string;
  updated_at: string;
  transaction_date: string;
  is_recurring: boolean;
  is_recurring_rule_id?: UUID | null;
}

/** A transaction joined with its tag ids — what the transactions page renders. */
export interface TransactionWithTags extends Transaction {
  tag_ids: UUID[];
  receipt_count?: number;
}

export interface Budget {
  id: UUID;
  user_id: UUID;
  name: string;
  amount: number;
  period: Period;
  category_id?: UUID | null;
  account_id?: UUID | null;
  starts_on: string;
  is_active: boolean;
  alert_at_pct: number;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface RecurringRule {
  id: UUID;
  user_id: UUID;
  title?: string | null;
  amount: number;
  type: CategoryType;
  category_id?: UUID | null;
  account_id?: UUID | null;
  payment_method_id?: UUID | null;
  vendor_id?: UUID | null;
  note?: string | null;
  frequency: Frequency;
  interval_step: number;
  day_of_month?: number | null;
  day_of_week?: number | null;
  next_run?: string | null;
  auto_post: boolean;
  remind_days_before: number;
  is_active: boolean;
  last_generated_at?: string | null;
  created_at: string;
}

export interface ShoppingList {
  id: UUID;
  user_id: UUID;
  name: string;
  is_archived: boolean;
  created_at: string;
}

export interface ShoppingItem {
  id: UUID;
  user_id: UUID;
  list_id?: UUID | null;
  name: string;
  category_id?: UUID | null;
  qty?: number | null;
  unit?: string | null;
  est_price?: number | null;
  priority: Priority;
  purchased: boolean;
  purchased_at?: string | null;
  transaction_id?: UUID | null;
  created_at: string;
}

export interface KhataPerson {
  id: UUID;
  user_id: UUID;
  name: string;
  phone?: string | null;
  note?: string | null;
  created_at: string;
}

export interface KhataEntry {
  id: UUID;
  user_id: UUID;
  person_id?: UUID | null;
  person_name: string;
  direction: KhataDirection;
  amount: number;
  note?: string | null;
  entry_date: string;
  due_date?: string | null;
  status: KhataStatus;
  created_at: string;
}

export interface KhataPayment {
  id: UUID;
  user_id: UUID;
  khata_entry_id: UUID;
  amount: number;
  paid_at: string;
  note?: string | null;
  created_at: string;
}

/** Khata entry enriched server-side with payment totals and derived state. */
export interface KhataEntryView extends KhataEntry {
  paid: number;
  remaining: number;
  is_overdue: boolean;
  payments: KhataPayment[];
}

export interface Receipt {
  id: UUID;
  user_id: UUID;
  transaction_id?: UUID | null;
  /** Where the file lives. Currently always "cloudinary". */
  provider: string;
  /** Cloudinary public id — the canonical identifier. */
  public_id?: string | null;
  /** Cloudinary resource type ("image" or "raw"), needed to sign a URL. */
  resource_type?: string | null;
  format?: string | null;
  /** Legacy Supabase Storage path, kept in sync with public_id. */
  storage_path: string;
  display_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  ocr_text?: string | null;
  ocr_data?: Record<string, unknown> | null;
  created_at: string;
}

export interface Reminder {
  id: UUID;
  user_id: UUID;
  title: string;
  due_date?: string | null;
  amount?: number | null;
  category_id?: UUID | null;
  repeat?: string | null;
  done: boolean;
  notify_me: boolean;
  created_at: string;
}

export type NotificationKind = "budget" | "bill" | "khata" | "recurring" | "system";

export interface AppNotification {
  id: UUID;
  user_id: UUID;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  ref_id?: UUID | null;
  read_at?: string | null;
  created_at: string;
}

/** Everything the shell + quick-add need in one round trip. */
export interface Taxonomy {
  categories: Category[];
  subcategories: Subcategory[];
  accounts: Account[];
  paymentMethods: PaymentMethod[];
  vendors: Vendor[];
  tags: Tag[];
  settings: UserSettings;
  balances: Record<UUID, number>;
  frequentCategoryIds: UUID[];
}

/** Result envelope returned by every server action. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };
