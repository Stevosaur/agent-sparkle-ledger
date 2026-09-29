"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps operational screens live by re-fetching server data on an interval while the tab is visible. */
export function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
