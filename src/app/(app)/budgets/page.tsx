import { getAllTransactions, getBudgets } from "@/lib/server/data";
import { BudgetsClient } from "./BudgetsClient";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [transactions, budgets] = await Promise.all([getAllTransactions(), getBudgets()]);
  return <BudgetsClient transactions={transactions} budgets={budgets} />;
}
