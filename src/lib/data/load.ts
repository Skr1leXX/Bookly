import { addDays, addMinutes, localParts, todayIn } from "../dates.ts";
import type { Appointment, AppointmentView, Client, Company, Service, StaffMember } from "../../types/index.ts";

const STAFF_COLORS: Record<string, string> = {
  violet: "bg-violet-100 text-violet-800 border-violet-300",
  fuchsia: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
  sky: "bg-sky-100 text-sky-800 border-sky-300",
};

// Structural type: keeps this module free of framework imports so it can be tested with a stub client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Res<T> = { data: T | null; error: { message: string } | null };

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const hhmm = (t: string) => t.slice(0, 5);

/** "Пн–Пт, 10:00–19:00" from per-weekday rows. */
function scheduleLabel(rows: Row[]) {
  const groups = new Map<string, number[]>();
  for (const r of [...rows].sort((a, b) => a.weekday - b.weekday)) {
    const key = `${hhmm(r.start_time)}–${hhmm(r.end_time)}`;
    groups.set(key, [...(groups.get(key) ?? []), r.weekday]);
  }
  return [...groups]
    .map(([hours, days]) => {
      const ranges: string[] = [];
      for (let i = 0; i < days.length; ) {
        let j = i;
        while (days[j + 1] === days[j] + 1) j++;
        ranges.push(j > i ? `${WEEKDAYS_SHORT[days[i] - 1]}–${WEEKDAYS_SHORT[days[j] - 1]}` : WEEKDAYS_SHORT[days[i] - 1]);
        i = j + 1;
      }
      return `${ranges.join(", ")}, ${hours}`;
    })
    .join("; ") || "График не задан";
}

/** Window of appointments loaded for the UI. shortcut: client totals/visits are computed inside it, move to SQL aggregates for long histories. */
const HISTORY_DAYS = 90;

/** Everything the pages need, loaded through the user's own (RLS-scoped) Supabase client. */
export async function loadOrgData(supabase: SupabaseLike, orgId: string, timezone: string) {
  const today = todayIn(timezone);
  const since = `${addDays(today, -HISTORY_DAYS)}T00:00:00Z`;

  const [org, clients, services, staff, hours, appts] = (await Promise.all([
    supabase.from("organizations").select("name, slug, phone, email, address, description, timezone").eq("id", orgId).single(),
    supabase.from("clients").select("id, name, phone, email, note, created_at").eq("org_id", orgId).order("name"),
    supabase.from("services").select("id, name, category, description, duration_min, price, is_active").eq("org_id", orgId).order("category").order("name"),
    supabase.from("staff").select("id, user_id, full_name, job_title, phone, email, rating, color, is_active, staff_services(service_id)").eq("org_id", orgId).order("created_at"),
    supabase.from("working_hours").select("staff_id, weekday, start_time, end_time, break_start, break_end").eq("org_id", orgId),
    supabase
      .from("appointments")
      .select("id, client_id, service_id, staff_id, starts_at, status, price, notes, source")
      .eq("org_id", orgId)
      .gte("starts_at", since)
      .order("starts_at")
      .limit(1000),
  ])) as [Res<Row>, Res<Row[]>, Res<Row[]>, Res<Row[]>, Res<Row[]>, Res<Row[]>];
  for (const r of [org, clients, services, staff, hours, appts]) if (r.error) throw new Error(r.error.message);

  const hoursRows = hours.data ?? [];
  const company: Company = {
    name: org.data!.name,
    slug: org.data!.slug,
    phone: org.data!.phone,
    email: org.data!.email,
    address: org.data!.address,
    description: org.data!.description,
    timezone,
    hours: WEEKDAYS.map((day, i) => {
      const h = hoursRows.find((r) => r.staff_id === null && r.weekday === i + 1);
      return { day, open: h ? hhmm(h.start_time) : "", close: h ? hhmm(h.end_time) : "" };
    }),
  };

  const serviceList: Service[] = (services.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    duration: s.duration_min,
    price: Number(s.price),
    active: s.is_active,
  }));
  const serviceById = new Map(serviceList.map((s) => [s.id, s]));

  const staffList: StaffMember[] = (staff.data ?? []).map((m) => ({
    id: m.id,
    name: m.full_name,
    role: m.job_title,
    phone: m.phone,
    email: m.email,
    serviceIds: m.staff_services.map((x: Row) => x.service_id),
    schedule: scheduleLabel(hoursRows.filter((r) => r.staff_id === m.id)),
    rating: Number(m.rating ?? 0),
    color: STAFF_COLORS[m.color] ?? STAFF_COLORS.violet,
    colorKey: STAFF_COLORS[m.color] ? m.color : "violet",
    active: m.is_active,
    userId: m.user_id,
    hours: hoursRows
      .filter((r) => r.staff_id === m.id)
      .map((r) => ({
        weekday: r.weekday,
        start: hhmm(r.start_time),
        end: hhmm(r.end_time),
        ...(r.break_start ? { breakStart: hhmm(r.break_start), breakEnd: hhmm(r.break_end) } : {}),
      }))
      .sort((a, b) => a.weekday - b.weekday),
  }));
  const staffById = new Map(staffList.map((m) => [m.id, m]));

  const appointments: Appointment[] = (appts.data ?? []).map((a) => {
    const { date, time } = localParts(a.starts_at, timezone);
    return { id: a.id, clientId: a.client_id, serviceId: a.service_id, staffId: a.staff_id, date, time, status: a.status, notes: a.notes, source: a.source };
  });
  const priceById = new Map((appts.data ?? []).map((a) => [a.id, Number(a.price)]));

  // Client stats come from completed visits.
  const done = appointments.filter((a) => a.status === "completed");
  const clientList: Client[] = (clients.data ?? []).map((c) => {
    const mine = done.filter((a) => a.clientId === c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      note: c.note || undefined,
      createdAt: localParts(c.created_at, timezone).date,
      visits: mine.length,
      totalSpent: mine.reduce((sum, a) => sum + (priceById.get(a.id) ?? 0), 0),
      lastVisit: mine.reduce((max, a) => (a.date > max ? a.date : max), ""),
    };
  });
  const clientById = new Map(clientList.map((c) => [c.id, c]));

  const views: AppointmentView[] = appointments.flatMap((a) => {
    const client = clientById.get(a.clientId);
    const service = serviceById.get(a.serviceId);
    const member = staffById.get(a.staffId);
    if (!client || !service || !member) return [];
    return [{ ...a, client, service, staff: member, endTime: addMinutes(a.time, service.duration), price: priceById.get(a.id) ?? service.price }];
  });

  return { today, company, clients: clientList, services: serviceList, staff: staffList, appointments: views };
}

export type OrgData = Awaited<ReturnType<typeof loadOrgData>>;
