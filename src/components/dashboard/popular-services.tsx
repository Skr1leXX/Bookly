import { SectionCard } from "@/components/shared/section-card";
import { formatMoney } from "@/lib/dates";
import type { Service } from "@/types";

export function PopularServices({ items }: { items: { service: Service; count: number }[] }) {
  const max = items[0]?.count ?? 1;
  return (
    <SectionCard title="Популярные услуги" description="Записи за 30 дней">
      {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Пока нет записей</p>}
      <ul className="space-y-4">
        {items.map(({ service, count }) => (
          <li key={service.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{service.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {count} · {formatMoney(count * service.price)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-accent">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-chart-2" style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
