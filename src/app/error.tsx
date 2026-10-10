"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <PageContainer className="py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">Something went wrong</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">This page failed to load. Please try again.</p>
      <div className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </div>
    </PageContainer>
  );
}
