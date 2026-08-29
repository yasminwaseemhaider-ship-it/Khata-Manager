import { getAllTransactions, getBudgets, getKhata } from "@/lib/server/data";
import { InsightsClient } from "./InsightsClient";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const [transactions, budgets, khata] = await Promise.all([
    getAllTransactions(),
    getBudgets(),
    getKhata(),
  ]);
  return (
    <InsightsClient transactions={transactions} budgets={budgets} khata={khata.entries} />
  );
}
