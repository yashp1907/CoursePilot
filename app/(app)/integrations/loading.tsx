import { HeaderSkeleton, PageSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <div className="max-w-3xl space-y-5"><Skeleton className="h-72" /><Skeleton className="h-40" /></div>
    </PageSkeleton>
  );
}
