import { HeaderSkeleton, PageSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <div className="max-w-2xl space-y-5"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </PageSkeleton>
  );
}
