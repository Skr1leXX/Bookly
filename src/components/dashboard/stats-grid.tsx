import { CalendarCheck, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { dailyStats, newClientsCount, todayAppointments } from "@/lib/data/derive";
import type { OrgData } from "@/lib/data/org-data";
import { formatMoney } from "@/lib/dates";

const sum = <T,>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);

export function StatsGrid({ data }: { data: OrgData }) {
  const today = todayAppointments(data);
  const pending = today.filter((a) => a.status === "pending").length;

  // Последние 14 дней против предыдущих 14.
  const current = dailyStats(data, 14);
  const previous = dailyStats(data, 14, 14);
  const revenue = sum(current, (d) => d.revenue);
  const prevRevenue = sum(previous, (d) => d.revenue);
  const bookings = sum(current, (d) => d.bookings);
  const growth = prevRevenue > 0 ? Math.round((revenue / prevRevenue - 1) * 100) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Записей сегодня" value={String(today.length)} hint={`${pending} ожидают подтверждения`} icon={CalendarCheck} />
      <StatCard label="Новые клиенты" value={String(newClientsCount(data))} hint="за 7 дней" icon={UserPlus} />
      <StatCard
        label="Выручка за 14 дней"
        value={formatMoney(revenue)}
        hint={growth === null ? "нет данных за прошлый период" : "к прошлому периоду"}
        trend={growth === null ? undefined : { value: `${growth >= 0 ? "+" : ""}${growth}%`, positive: growth >= 0 }}
        icon={Wallet}
      />
      <StatCard label="Записей за 14 дней" value={String(bookings)} hint={`в среднем ${Math.round(bookings / 14)} в день`} icon={TrendingUp} />
    </div>
  );
}
