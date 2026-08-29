import { getAllTransactions } from "@/lib/server/data";
import { AccountsClient } from "./AccountsClient";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const transactions = await getAllTransactions();
  return <AccountsClient transactions={transactions} />;
}
