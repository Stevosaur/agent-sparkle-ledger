"use client";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...p }: T.TabsListProps) {
  return <T.List className={cn("mb-3 inline-flex gap-1 rounded-lg border border-border bg-panel p-1", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: T.TabsTriggerProps) {
  return <T.Trigger className={cn("rounded-md px-3 py-1.5 text-xs font-medium text-muted data-[state=active]:bg-panel-3 data-[state=active]:text-text", className)} {...p} />;
}
export const TabsContent = T.Content;
