"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** On phones the dialog becomes a bottom sheet (thumb-reachable, safe-area aware); pass `sheet={false}` to keep it centered. */
export function DialogContent({ className, children, title, description, sheet = true, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string; sheet?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm anim-fade" />
      <D.Content
        className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-[var(--shadow-pop)] anim-pop",
          sheet && "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:[--tw-translate-x:0] max-sm:[--tw-translate-y:0] max-sm:max-h-[92dvh] max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:px-5 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:pt-7 max-sm:anim-sheet", className)}
        {...props}
      >
        {sheet && <span aria-hidden className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-border sm:hidden" />}
        <div data-dialog-header className="mb-4 pr-6">
          <D.Title className="text-base font-semibold">{title}</D.Title>
          {description ? <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        </div>
        {children}
        <D.Close className="absolute right-3 top-3 rounded-md p-2 pointer-coarse:p-2.5 sm:right-4 sm:top-4 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
