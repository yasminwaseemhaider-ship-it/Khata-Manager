import { PageSkeleton } from "@/components/layout/PageSkeleton";

export default function Loading() {
  return <PageSkeleton width="max-w-4xl" stats={3} rows={6} chart />;
}
