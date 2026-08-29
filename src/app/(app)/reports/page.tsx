import { getAllTransactions } from "@/lib/server/data";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const transactions = await getAllTransactions();
  return <ReportsClient transactions={transactions} />;
}
