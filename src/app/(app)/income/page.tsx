import { getAllTransactions, getRecurringRules } from "@/lib/server/data";
import { IncomeClient } from "./IncomeClient";

export const dynamic = "force-dynamic";

export default async function IncomePage() {
  const [transactions, rules] = await Promise.all([
    getAllTransactions(),
    getRecurringRules(),
  ]);
  return <IncomeClient transactions={transactions} rules={rules} />;
}
