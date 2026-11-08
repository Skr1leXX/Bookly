"use client";

import Script from "next/script";

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string | HTMLElement) => void };
  }
}

/** Public site key of the Cloudflare Turnstile widget. Without it the CAPTCHA is simply not shown (local development, tests). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Turnstile fills a hidden `cf-turnstile-response` field inside the form; the server action passes it on to Supabase Auth. */
export function Turnstile() {
  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-language="ru" data-theme="light" />
    </>
  );
}

/** A token works once: after a failed attempt a fresh one is needed. */
export function resetTurnstile() {
  window.turnstile?.reset();
}
