import { addDays } from "../dates.ts";
import type { AppointmentView, DailyStat } from "../../types/index.ts";
import type { OrgData } from "./load.ts";

/** Состоявшиеся и предстоящие записи: без отменённых и неявок. */
const active = (a: AppointmentView) => a.status !== "cancelled" && a.status !== "no_show";

export const todayAppointments = ({ appointments, today }: OrgData) => appointments.filter((a) => a.date === today && active(a));

/** Ближайшие записи: подтверждённые и ожидающие, начиная с текущего момента (по времени организации). */
export function upcomingAppointments({ appointments, today }: OrgData, nowTime: string, limit: number) {
  return appointments
    .filter((a) => (a.status === "confirmed" || a.status === "pending") && a.date + a.time >= today + nowTime)
    .slice(0, limit);
}

export const newClientsCount = ({ clients, today }: OrgData, days = 7) => clients.filter((c) => c.createdAt >= addDays(today, -days)).length;

/** Записи (без отменённых и неявок) и выручка (только завершённые визиты) по дням за последние `days` дней, включая сегодня. */
export function dailyStats({ appointments, today }: OrgData, days = 14, offset = 0): DailyStat[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1 - offset);
    const day = appointments.filter((a) => a.date === date && active(a));
    return { date, bookings: day.length, revenue: day.filter((a) => a.status === "completed").reduce((s, a) => s + a.price, 0) };
  });
}

/** Популярные услуги за 30 дней по числу неотменённых записей. */
export function popularServices({ appointments, services, today }: OrgData, limit = 6) {
  const from = addDays(today, -30);
  const counts = new Map<string, number>();
  for (const a of appointments) if (active(a) && a.date >= from && a.date <= today) counts.set(a.serviceId, (counts.get(a.serviceId) ?? 0) + 1);
  return services
    .filter((s) => counts.has(s.id))
    .map((service) => ({ service, count: counts.get(service.id)! }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
