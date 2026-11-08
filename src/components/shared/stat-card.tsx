import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <Card className="shadow-sm shadow-primary/5 ring-0 border">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {trend && (
              <span className={cn("font-medium", trend.positive ? "text-emerald-600" : "text-rose-600")}>
                {trend.value}
              </span>
            )}
            {hint}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
