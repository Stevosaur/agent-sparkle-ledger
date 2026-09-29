"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

type Result = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

/** Calls a server action, toasts the outcome and refreshes server components. */
export function ActionButton({ action, confirm, children, onDone, ...props }: Omit<ButtonProps, "onClick" | "action"> & { action: () => Promise<Result>; confirm?: string; onDone?: (r: Result) => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r.ok) toast.success(r.message ?? "Done");
          else toast.error(r.error);
          onDone?.(r);
          router.refresh();
        });
      }}
    >
      {pending ? <span className="live-dot">Working…</span> : children}
    </Button>
  );
}

export function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return {
    pending,
    exec: (fn: () => Promise<Result>, opts: { onOk?: (r: Result & { ok: true }) => void; silent?: boolean } = {}) =>
      start(async () => {
        const r = await fn();
        if (r.ok) {
          if (!opts.silent) toast.success(r.message ?? "Done");
          opts.onOk?.(r);
        } else toast.error(r.error);
        router.refresh();
      }),
  };
}
