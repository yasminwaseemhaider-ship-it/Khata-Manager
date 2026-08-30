import { PageSkeleton } from "@/components/layout/PageSkeleton";

export default function Loading() {
  return <PageSkeleton width="max-w-6xl" stats={4} rows={5} chart />;
}
