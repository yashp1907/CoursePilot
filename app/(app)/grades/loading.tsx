import { HeaderSkeleton, PageSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <Skeleton className="mb-6 h-48" />
      <Skeleton className="h-64" />
    </PageSkeleton>
  );
}
