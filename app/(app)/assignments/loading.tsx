import { HeaderSkeleton, ListSkeleton, PageSkeleton, ToolbarSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ToolbarSkeleton />
      <ListSkeleton rows={10} />
    </PageSkeleton>
  );
}
