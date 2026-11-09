import { Skeleton } from "./states";

export function HeaderSkeleton({ action }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      {action && <Skeleton className="h-9 w-32" />}
    </div>
  );
}
export const CardGridSkeleton = ({ n = 3, h = "h-48" }: { n?: number; h?: string }) => <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className={h} />)}</div>;
export const ListSkeleton = ({ rows = 8 }: { rows?: number }) => <div className="space-y-px overflow-hidden rounded-lg border">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 rounded-none" />)}</div>;
export const ToolbarSkeleton = () => <div className="mb-4 flex flex-wrap gap-2"><Skeleton className="h-9 w-56" /><Skeleton className="h-9 w-44" /><Skeleton className="ml-auto h-9 w-36" /></div>;
export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return <div role="status" aria-label="Loading">{children}<span className="sr-only">Loading…</span></div>;
}
