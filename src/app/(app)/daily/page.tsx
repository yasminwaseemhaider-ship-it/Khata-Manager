import { getAllTransactions } from "@/lib/server/data";
import { DailyClient } from "./DailyClient";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const transactions = await getAllTransactions();
  return <DailyClient transactions={transactions} />;
}
