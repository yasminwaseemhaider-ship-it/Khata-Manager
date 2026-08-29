import { getAllTransactions } from "@/lib/server/data";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const transactions = await getAllTransactions();
  return <SettingsClient transactions={transactions} />;
}
