"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function BookError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorView reset={reset} homeHref="/" homeLabel="На главную" />;
}
