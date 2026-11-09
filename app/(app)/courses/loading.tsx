import { CardGridSkeleton, HeaderSkeleton, PageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action />
      <CardGridSkeleton n={6} h="h-52" />
    </PageSkeleton>
  );
}
