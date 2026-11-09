import { HeaderSkeleton, PageSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </PageSkeleton>
  );
}
