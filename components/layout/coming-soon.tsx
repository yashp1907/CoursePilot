import type { LucideIcon } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/states";

export function ComingSoon({ title, icon: Icon, phase, description }: { title: string; icon: LucideIcon; phase: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Icon />} title={`${title} isn't available yet`} description={`${description} Planned for ${phase}. Nothing on this page is functional yet.`} />
    </>
  );
}
