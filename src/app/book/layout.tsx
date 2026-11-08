import { CalendarCheck } from "lucide-react";

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">{children}</main>
      <footer className="pb-8 text-center text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarCheck className="size-3.5 text-primary" /> Онлайн-запись на Bookly
        </span>
      </footer>
    </div>
  );
}
