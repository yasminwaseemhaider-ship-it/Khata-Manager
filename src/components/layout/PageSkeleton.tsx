// ============================================================================
// The placeholder a route shows while its server render is in flight.
//
// There was no loading.tsx anywhere in the app, and no Suspense boundary, so a
// click painted nothing at all until the whole server waterfall finished — the
// previous page just sat there looking frozen. That made the wait feel far worse
// than it measured.
//
// Shapes here mirror the real page's layout (same container width, same header
// block) so the content does not jump when it arrives.
// ============================================================================
import { cn } from "@/lib/utils";

interface PageSkeletonProps {
  /** Match the real page's container, or the content will shift on arrival. */
  width?: string;
  /** Number of summary tiles above the list, if the page has them. */
  stats?: number;
  /** Number of list rows to suggest. */
  rows?: number;
  /** Draws a chart-shaped block between the tiles and the list. */
  chart?: boolean;
}

export function PageSkeleton({
  width = "max-w-3xl",
  stats = 0,
  rows = 6,
  chart = false,
}: PageSkeletonProps) {
  return (
    <div
      className={cn("mx-auto w-full px-3 py-4 md:px-6 md:py-6", width)}
      // The page title is announced by the real content a moment later; without
      // this a screen reader would read out a wall of meaningless boxes.
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="mb-5">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton mt-2 h-3.5 w-64 max-w-full" />
      </div>

      {stats > 0 && (
        <div
          className="mb-4 grid gap-3"
          style={{ gridTemplateColumns: `repeat(${stats}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      )}

      {chart && <div className="skeleton mb-4 h-56 w-full" />}

      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
