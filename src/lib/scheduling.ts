// Client-side hints that mirror the booking rules. The database is the authority (exclusion constraint + validate_appointment).
import { toMinutes } from "./dates.ts";
import type { AppointmentView, StaffMember } from "../types/index.ts";

/** Another active appointment of the same specialist that overlaps [time, time + duration). */
export function findConflict(
  appointments: AppointmentView[],
  o: { staffId: string; date: string; time: string; duration: number; excludeId?: string },
) {
  const start = toMinutes(o.time);
  const end = start + o.duration;
  return appointments.find(
    (a) =>
      a.id !== o.excludeId &&
      a.staffId === o.staffId &&
      a.date === o.date &&
      a.status !== "cancelled" &&
      toMinutes(a.time) < end &&
      toMinutes(a.endTime) > start,
  );
}

/** ISO weekday (1 = Monday) of a yyyy-mm-dd date. */
export const isoWeekday = (date: string) => ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

/** The specialist's working window on that date, or null on a day off. */
export function workingWindow(staff: StaffMember, date: string) {
  return staff.hours.find((h) => h.weekday === isoWeekday(date)) ?? null;
}

/** null when the slot is OK, otherwise the reason it is not. */
export function slotProblem(staff: StaffMember, date: string, time: string, duration: number): string | null {
  const w = workingWindow(staff, date);
  if (!w) return "У специалиста в этот день выходной";
  if (toMinutes(time) < toMinutes(w.start) || toMinutes(time) + duration > toMinutes(w.end)) {
    return `Специалист работает с ${w.start} до ${w.end}`;
  }
  const { breakStart: b0, breakEnd: b1 } = w;
  if (b0 && b1 && toMinutes(time) < toMinutes(b1) && toMinutes(time) + duration > toMinutes(b0)) return `У специалиста перерыв с ${b0} до ${b1}`;
  return null;
}
