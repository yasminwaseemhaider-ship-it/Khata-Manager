import { getAllTransactions } from "@/lib/server/data";
import { TransactionsClient } from "./TransactionsClient";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const transactions = await getAllTransactions();
  return <TransactionsClient transactions={transactions} />;
}
