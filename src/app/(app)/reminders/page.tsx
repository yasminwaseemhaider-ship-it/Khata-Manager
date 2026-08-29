import { getReminders } from "@/lib/server/data";
import { RemindersClient } from "./RemindersClient";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const reminders = await getReminders();
  return <RemindersClient reminders={reminders} />;
}
