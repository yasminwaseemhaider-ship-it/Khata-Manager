import { getAllTransactions } from "@/lib/server/data";
import { CalendarClient } from "./CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const transactions = await getAllTransactions();
  return <CalendarClient transactions={transactions} />;
}
