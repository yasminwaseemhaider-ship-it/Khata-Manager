import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AppDataProvider } from "@/context/AppDataContext";
import { getTaxonomy, getNotifications } from "@/lib/server/data";
import { generateNotifications } from "@/lib/server/notify";
import { postDueRecurring } from "@/app/actions/transactions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Any recurring bill that has come due becomes a real transaction before the
  // page renders, so every total on screen already includes it.
  await postDueRecurring();

  // Then raise any budget/bill/khata alerts. Runs after the step above so a
  // bill that just auto-posted doesn't also get reported as still due.
  await generateNotifications();

  const [taxonomy, notifications] = await Promise.all([
    getTaxonomy(),
    getNotifications(),
  ]);

  // A brand-new user with no categories has not finished setup.
  if (taxonomy.categories.length === 0) redirect("/onboarding");

  return (
    <AppDataProvider value={taxonomy}>
      <AppShell
        displayName={taxonomy.settings.display_name ?? user.email ?? "there"}
        email={user.email ?? ""}
        theme={taxonomy.settings.theme}
        notifications={notifications}
      >
        {children}
      </AppShell>
    </AppDataProvider>
  );
}
