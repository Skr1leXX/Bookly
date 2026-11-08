"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Friendly fallback for an unexpected error: no technical details are shown to the user. */
export function ErrorView({ reset, homeHref, homeLabel }: { reset: () => void; homeHref: string; homeLabel: string }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
      <p className="text-sm text-muted-foreground">Не удалось загрузить страницу. Попробуйте ещё раз — если ошибка повторяется, зайдите позже.</p>
      <div className="flex gap-2">
        <Button onClick={reset}>Повторить</Button>
        <a href={homeHref} className="inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium hover:bg-accent">
          {homeLabel}
        </a>
      </div>
    </div>
  );
}
