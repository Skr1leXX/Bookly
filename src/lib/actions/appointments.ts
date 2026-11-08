"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/data/session";
import { localToIso } from "@/lib/dates";
import { appointmentSchema, moveSchema, statusSchema } from "@/lib/validation";
import { dbError, parse, str, type ActionState } from "./util";

const NOT_FOUND = "Запись не найдена или нет прав на её изменение";
const done = (): ActionState => {
  revalidatePath("/", "layout");
  return { ok: true };
};

/** Create (id = null) or edit an appointment. Overlaps and working hours are enforced by the database. */
export async function saveAppointment(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const v = parse(appointmentSchema, {
    clientId: str(fd, "clientId"),
    serviceId: str(fd, "serviceId"),
    staffId: str(fd, "staffId"),
    date: str(fd, "date"),
    time: str(fd, "time"),
    status: str(fd, "status"),
    notes: str(fd, "notes"),
  });
  if ("state" in v) return v.state;
  const d = v.data;

  const { supabase, orgId, timezone, userId } = await getSession();
  const { data: service } = await supabase.from("services").select("duration_min, price").eq("id", d.serviceId).eq("org_id", orgId).maybeSingle();
  if (!service) return { error: "Услуга не найдена", fields: { serviceId: "Выберите услугу" } };

  const startsAt = localToIso(d.date, d.time, timezone);
  const endsAt = new Date(Date.parse(startsAt) + service.duration_min * 60_000).toISOString();
  const row = {
    client_id: d.clientId,
    service_id: d.serviceId,
    staff_id: d.staffId,
    starts_at: startsAt,
    ends_at: endsAt,
    status: d.status,
    notes: d.notes,
  };

  if (!id) {
    const { error } = await supabase.from("appointments").insert({ ...row, org_id: orgId, price: Number(service.price), created_by: userId });
    return error ? dbError(error) : done();
  }

  // The price is fixed at booking time: it changes only when the service itself is changed.
  const { data: current } = await supabase.from("appointments").select("service_id, price").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!current) return { error: NOT_FOUND };
  const price = current.service_id === d.serviceId ? Number(current.price) : Number(service.price);
  const { error, data } = await supabase.from("appointments").update({ ...row, price }).eq("id", id).eq("org_id", orgId).select("id");
  if (error) return dbError(error);
  return data?.length ? done() : { error: NOT_FOUND };
}

/** Reschedule: new date/time and optionally another specialist; the duration is kept. */
export async function moveAppointment(input: { id: string; staffId: string; date: string; time: string }): Promise<ActionState> {
  const v = parse(moveSchema, input);
  if ("state" in v) return { error: Object.values(v.state.fields ?? {})[0] ?? "Некорректные данные" };

  const { supabase, orgId, timezone } = await getSession();
  const { data: current } = await supabase.from("appointments").select("starts_at, ends_at").eq("id", v.data.id).eq("org_id", orgId).maybeSingle();
  if (!current) return { error: NOT_FOUND };

  const length = Date.parse(current.ends_at) - Date.parse(current.starts_at);
  const startsAt = localToIso(v.data.date, v.data.time, timezone);
  const { error, data } = await supabase
    .from("appointments")
    .update({ staff_id: v.data.staffId, starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + length).toISOString() })
    .eq("id", v.data.id)
    .eq("org_id", orgId)
    .select("id");
  if (error) return dbError(error);
  return data?.length ? done() : { error: NOT_FOUND };
}

export async function setAppointmentStatus(input: { id: string; status: string }): Promise<ActionState> {
  const v = parse(statusSchema, input);
  if ("state" in v) return { error: "Некорректный статус" };
  const { supabase, orgId } = await getSession();
  const { error, data } = await supabase.from("appointments").update({ status: v.data.status }).eq("id", v.data.id).eq("org_id", orgId).select("id");
  if (error) return dbError(error);
  return data?.length ? done() : { error: NOT_FOUND };
}
