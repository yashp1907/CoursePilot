import { PageSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-6 h-32" />
      <Skeleton className="mb-5 h-10" />
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-56 lg:col-span-2" /><Skeleton className="h-56" /></div>
    </PageSkeleton>
  );
}
