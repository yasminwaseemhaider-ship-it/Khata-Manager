import { redirect } from "next/navigation";

// Vendors are managed inside Settings; keep the old route working as a link.
export default function VendorsPage() {
  redirect("/settings?tab=vendors");
}
