"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <PageContainer className="py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">{t("common.errorPage.title", "Something went wrong")}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">{t("common.errorPage.body", "This page failed to load. Please try again.")}</p>
      <div className="mt-6">
        <Button onClick={reset}>{t("common.errorPage.retry", "Try again")}</Button>
      </div>
    </PageContainer>
  );
}
