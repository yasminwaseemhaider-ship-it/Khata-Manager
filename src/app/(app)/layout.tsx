import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AppDataProvider } from "@/context/AppDataContext";
import { getTaxonomy, getNotifications } from "@/lib/server/data";
import { getOptionalUser } from "@/lib/server/session";
import { claimDailyMaintenance, runDailyMaintenance } from "@/lib/server/maintenance";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `getOptionalUser` delegates to the cache()-wrapped `requireUser`, so this
  // verification is shared with every server call further down the tree. The
  // layout used to build its own client and call auth.getUser() raw, which
  // cache() could not dedupe — that was a second full auth round trip on every
  // navigation, for the same answer.
  const session = await getOptionalUser();
  if (!session) redirect("/login");

  // Housekeeping (posting due recurring bills, regenerating notifications) used
  // to run here on every single navigation. It now runs at most once a day; on
  // every other visit this is one cheap no-op UPDATE that matches no rows.
  if (await claimDailyMaintenance()) {
    // Deliberately awaited rather than left floating: it can insert transactions,
    // and the balances read below must already include them.
    await runDailyMaintenance();
  }

  const [taxonomy, notifications] = await Promise.all([
    getTaxonomy(),
    getNotifications(),
  ]);

  // A brand-new user with no categories has not finished setup.
  if (taxonomy.categories.length === 0) redirect("/onboarding");

  return (
    <AppDataProvider value={taxonomy}>
      <AppShell
        displayName={taxonomy.settings.display_name ?? session.email ?? "there"}
        email={session.email ?? ""}
        theme={taxonomy.settings.theme}
        notifications={notifications}
      >
        {children}
      </AppShell>
    </AppDataProvider>
  );
}
