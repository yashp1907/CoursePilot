"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex gap-1 border-b overflow-x-auto", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn("px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors rounded-t-md whitespace-nowrap cursor-pointer hover:bg-accent/60 hover:text-foreground data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_0_var(--primary)]", className)}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("pt-5", className)} {...props} />;
}
