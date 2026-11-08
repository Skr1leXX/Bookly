import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";
import { statusMeta } from "@/components/shared/status-badge";
import { formatDay, localParts } from "@/lib/dates";
import type { AppointmentStatus } from "@/types";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

type Session = Awaited<ReturnType<typeof getSession>>;

/** The whole appointment history (the pages only load a recent window). */
async function allAppointments({ supabase, orgId }: Session) {
  const rows: { client_id: string; service_id: string; staff_id: string; starts_at: string; status: AppointmentStatus; price: number | string; notes: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("appointments")
      .select("client_id, service_id, staff_id, starts_at, status, price, notes")
      .eq("org_id", orgId)
      .order("starts_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const session = await getSession(); // unauthenticated requests are redirected to /login by the proxy and here
  if (session.role === "staff") return NextResponse.json({ error: "Экспорт доступен владельцу и администратору" }, { status: 403 });
  if (entity !== "clients" && entity !== "appointments") return NextResponse.json({ error: "Неизвестный тип экспорта" }, { status: 404 });

  const [data, appts] = await Promise.all([getOrgData(), allAppointments(session)]);
  const tz = data.company.timezone;
  let csv: string;

  if (entity === "clients") {
    const done = appts.filter((a) => a.status === "completed");
    csv = toCsv(
      ["Имя", "Телефон", "Email", "Заметка", "Завершённых визитов", "Потрачено, ₽", "Последний визит", "Добавлен"],
      data.clients.map((c) => {
        const mine = done.filter((a) => a.client_id === c.id);
        const last = mine.reduce((m, a) => (a.starts_at > m ? a.starts_at : m), "");
        return [c.name, c.phone, c.email, c.note, mine.length, mine.reduce((s, a) => s + Number(a.price), 0), last ? formatDay(localParts(last, tz).date) : "", formatDay(c.createdAt)];
      }),
    );
  } else {
    const client = new Map(data.clients.map((c) => [c.id, c]));
    const service = new Map(data.services.map((s) => [s.id, s.name]));
    const staff = new Map(data.staff.map((s) => [s.id, s.name]));
    csv = toCsv(
      ["Дата", "Время", "Клиент", "Телефон", "Услуга", "Специалист", "Статус", "Цена, ₽", "Заметка"],
      appts.map((a) => {
        const { date, time } = localParts(a.starts_at, tz);
        const c = client.get(a.client_id);
        return [date, time, c?.name, c?.phone, service.get(a.service_id), staff.get(a.staff_id), statusMeta[a.status].label, Number(a.price), a.notes];
      }),
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookly-${entity}-${data.today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
