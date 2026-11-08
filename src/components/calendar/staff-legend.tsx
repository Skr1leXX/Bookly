import { cn } from "@/lib/utils";
import type { StaffMember } from "@/types";

export function StaffLegend({ staff }: { staff: StaffMember[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {staff.map((s) => (
        <span key={s.id} className={cn("rounded-full border px-3 py-1 text-xs font-medium", s.color)}>
          {s.name}
        </span>
      ))}
    </div>
  );
}
