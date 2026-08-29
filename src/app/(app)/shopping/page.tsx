import { getShopping } from "@/lib/server/data";
import { ShoppingClient } from "./ShoppingClient";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const { lists, items } = await getShopping();
  return <ShoppingClient lists={lists} items={items} />;
}
