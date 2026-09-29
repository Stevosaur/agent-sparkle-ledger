"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, wide }: { className?: string; children: React.ReactNode; title: string; description?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <D.Content className={cn("fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[calc(100vw-24px)] -translate-x-1/2 overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl", wide ? "max-w-3xl" : "max-w-lg", className)}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <D.Title className="text-base font-semibold text-text">{title}</D.Title>
            {description && <D.Description className="mt-0.5 text-xs text-muted">{description}</D.Description>}
          </div>
          <D.Close className="rounded p-1 text-muted hover:bg-panel-2 hover:text-text" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="p-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
