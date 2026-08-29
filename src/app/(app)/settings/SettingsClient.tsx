"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  User, Shapes, CreditCard, Store, Tag as TagIcon, Palette, ShieldCheck, Database,
} from "lucide-react";
import { SectionTitle } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { ProfileTab } from "./tabs/ProfileTab";
import { CategoriesTab } from "./tabs/CategoriesTab";
import { TaxonomyTab } from "./tabs/TaxonomyTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { DataTab } from "./tabs/DataTab";
import type { TransactionWithTags } from "@/types";

const TABS = [
  { id: "profile", label: "Profile & currency", icon: User },
  { id: "categories", label: "Categories", icon: Shapes },
  { id: "methods", label: "Payment methods", icon: CreditCard },
  { id: "vendors", label: "Vendors", icon: Store },
  { id: "tags", label: "Tags", icon: TagIcon },
  { id: "appearance", label: "Appearance & alerts", icon: Palette },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "data", label: "Export, import & data", icon: Database },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsClient({ transactions }: { transactions: TransactionWithTags[] }) {
  const params = useSearchParams();
  const initial = (params.get("tab") as TabId) ?? "profile";
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === initial) ? initial : "profile"
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle title="Settings" sub="Make Khata work the way you do" />

      <div className="flex flex-col gap-4 md:flex-row">
        {/* ---------- Tab list ---------- */}
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 scrollbar-hide md:w-56 md:shrink-0 md:flex-col md:bg-transparent md:p-0"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors md:rounded-xl md:py-2.5",
                tab === id
                  ? "bg-surface text-ink shadow-sm md:bg-brand-soft md:text-[var(--brand-text)] md:shadow-none"
                  : "text-muted hover:text-ink md:hover:bg-surface-2"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="md:truncate">{label}</span>
            </button>
          ))}
        </nav>

        {/* ---------- Panel ---------- */}
        <div className="min-w-0 flex-1">
          {tab === "profile" && <ProfileTab />}
          {tab === "categories" && <CategoriesTab />}
          {tab === "methods" && (
            <TaxonomyTab
              table="payment_methods"
              title="Payment methods"
              description="Cash, cards and mobile wallets you pay with."
              placeholder="e.g. Easypaisa"
            />
          )}
          {tab === "vendors" && (
            <TaxonomyTab
              table="vendors"
              title="Vendors & shops"
              description="Places you buy from. New ones are added automatically as you type them into a transaction."
              placeholder="e.g. Imtiaz Super Market"
            />
          )}
          {tab === "tags" && (
            <TaxonomyTab
              table="tags"
              title="Tags"
              description="Free-form labels to slice your spending any way you like — trip, Ramzan, guests."
              placeholder="e.g. Eid shopping"
              withColor
            />
          )}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "data" && <DataTab transactions={transactions} />}
        </div>
      </div>
    </div>
  );
}
