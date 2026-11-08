import { CalendarCheck } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
        <CalendarCheck className="size-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Bookly</span>
    </div>
  );
}
