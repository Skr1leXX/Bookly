import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

export const statusMeta: Record<AppointmentStatus, { label: string; className: string }> = {
  pending: { label: "Ожидает подтверждения", className: "bg-amber-50 text-amber-700" },
  confirmed: { label: "Подтверждена", className: "bg-emerald-50 text-emerald-700" },
  completed: { label: "Завершена", className: "bg-violet-50 text-violet-700" },
  cancelled: { label: "Отменена", className: "bg-rose-50 text-rose-700" },
  no_show: { label: "Клиент не пришёл", className: "bg-slate-100 text-slate-600" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = statusMeta[status];
  return <Badge className={cn("font-medium", className)}>{label}</Badge>;
}
