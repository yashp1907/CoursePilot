import { HeaderSkeleton, PageSkeleton, ToolbarSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ToolbarSkeleton />
      <Skeleton className="h-[34rem]" />
    </PageSkeleton>
  );
}
