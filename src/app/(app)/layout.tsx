import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";

// The shell and every page read the session (cookies), so they render at request time behind this boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
