import { redirect } from "next/navigation";

// Tags are managed inside Settings; keep the old route working as a link.
export default function TagsPage() {
  redirect("/settings?tab=tags");
}
