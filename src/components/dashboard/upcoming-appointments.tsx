import Link from "next/link";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDayShort } from "@/lib/dates";
import type { AppointmentView } from "@/types";

export function UpcomingAppointments({ items, today }: { items: AppointmentView[]; today: string }) {
  return (
    <SectionCard
      title="Ближайшие записи"
      action={
        <Link href="/appointments" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Все записи
        </Link>
      }
    >
      {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Ближайших записей нет</p>}
      <ul className="divide-y">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <PersonAvatar name={a.client.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.client.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {a.service.name} · {a.staff.name}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-medium">
                {a.date === today ? "Сегодня" : formatDayShort(a.date)}, {a.time}
              </span>
              <StatusBadge status={a.status} />
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
