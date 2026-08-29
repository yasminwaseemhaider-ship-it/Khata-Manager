import { getAllTransactions } from "@/lib/server/data";
import { YearlyClient } from "./YearlyClient";

export const dynamic = "force-dynamic";

export default async function YearlyPage() {
  const transactions = await getAllTransactions();
  return <YearlyClient transactions={transactions} />;
}
