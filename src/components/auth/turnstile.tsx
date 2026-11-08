"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

/** Public site key of the Cloudflare Turnstile widget. Without it the CAPTCHA is simply not shown (local development, tests). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Renders the widget explicitly when the form appears. Implicit rendering only scans the page once, when the script loads,
 * so a form reached by a client-side link (login → register) would have no widget.
 * Turnstile fills a hidden `cf-turnstile-response` field inside the form; the server action passes it on to Supabase Auth.
 */
export function Turnstile() {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let widget: string | undefined;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !box.current || !window.turnstile) return false;
      widget = window.turnstile.render(box.current, { sitekey: TURNSTILE_SITE_KEY, language: "ru", theme: "light" });
      return true;
    };
    // The script may still be loading: wait for it.
    const timer = mount() ? undefined : setInterval(() => mount() && clearInterval(timer), 100);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (widget) window.turnstile?.remove(widget);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={box} />
    </>
  );
}

/** A token works once: after a failed attempt a fresh one is needed. */
export function resetTurnstile() {
  window.turnstile?.reset();
}
