import { getKhata } from "@/lib/server/data";
import { KhataClient } from "./KhataClient";

export const dynamic = "force-dynamic";

export default async function KhataPage() {
  const { entries, people } = await getKhata();
  return <KhataClient entries={entries} people={people} />;
}
