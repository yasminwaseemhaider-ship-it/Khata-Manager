import { PageSkeleton } from "@/components/layout/PageSkeleton";

export default function Loading() {
  return <PageSkeleton width="max-w-5xl" stats={4} rows={4} chart />;
}
