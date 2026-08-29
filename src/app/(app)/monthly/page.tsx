import { getAllTransactions, getBudgets } from "@/lib/server/data";
import { MonthlyClient } from "./MonthlyClient";

export const dynamic = "force-dynamic";

export default async function MonthlyPage() {
  const [transactions, budgets] = await Promise.all([getAllTransactions(), getBudgets()]);
  return <MonthlyClient transactions={transactions} budgets={budgets} />;
}
