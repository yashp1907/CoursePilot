import { HeaderSkeleton, PageSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <Skeleton className="h-[60vh]" />
    </PageSkeleton>
  );
}
