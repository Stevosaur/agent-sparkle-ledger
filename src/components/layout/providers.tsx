"use client";

import type { ReactNode } from "react";
import { LanguageProvider } from "@/lib/i18n/provider";
import { ViewerProvider } from "@/lib/auth/viewer-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <ViewerProvider>{children}</ViewerProvider>
    </LanguageProvider>
  );
}
