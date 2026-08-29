import { getRecurringRules } from "@/lib/server/data";
import { RecurringClient } from "./RecurringClient";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const rules = await getRecurringRules();
  return <RecurringClient rules={rules} />;
}
