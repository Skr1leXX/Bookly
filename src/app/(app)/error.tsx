"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorView reset={reset} homeHref="/dashboard" homeLabel="На дашборд" />;
}
