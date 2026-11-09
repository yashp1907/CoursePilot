import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-72" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
