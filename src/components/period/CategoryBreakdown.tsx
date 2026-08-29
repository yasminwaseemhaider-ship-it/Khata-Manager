"use client";

import { CategoryIcon } from "@/components/CategoryIcon";
import { Card, CardHeader, CardTitle, Meter } from "@/components/ui/form";
import { useAppData } from "@/context/AppDataContext";
import type { Slice } from "@/lib/analytics";

/**
 * Ranked category list with share-of-total bars.
 * Shows the exact figure next to every bar — charts alone never carry a number.
 */
export function CategoryBreakdown({
  slices,
  title = "By category",
  emptyText = "No spending in this period.",
}: {
  slices: Slice[];
  title?: string;
  emptyText?: string;
}) {
  const { categories, money } = useAppData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {slices.length > 0 && (
          <span className="tnum text-xs font-semibold text-muted">
            {money(slices.reduce((s, x) => s + x.total, 0))}
          </span>
        )}
      </CardHeader>

      {slices.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {slices.map((s) => {
            const cat = categories.find((c) => c.id === s.id);
            return (
              <li key={s.id ?? "none"}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: (s.color ?? "#64748b") + "22",
                      color: s.color ?? undefined,
                    }}
                  >
                    <CategoryIcon name={cat?.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {s.name}
                    <span className="ml-1.5 text-faint">
                      · {s.count} {s.count === 1 ? "entry" : "entries"}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-xs font-semibold text-ink">
                    {money(s.total)}
                  </span>
                  <span className="tnum w-10 shrink-0 text-right text-[11px] text-faint">
                    {s.pct.toFixed(0)}%
                  </span>
                </div>
                <Meter pct={s.pct} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
