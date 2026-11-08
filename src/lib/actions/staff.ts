"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/data/session";
import { staffSchema } from "@/lib/validation";
import { dbError, NO_ACCESS, parse, str, type ActionState } from "./util";

/** Create (id = null) or update a specialist with services and weekly schedule in one transaction (RPC save_staff). */
export async function saveStaff(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  // Form fields day1..day7 (checkbox), start1..start7, end1..end7; unchecked days are days off.
  const hours = [1, 2, 3, 4, 5, 6, 7]
    .filter((n) => fd.get(`day${n}`) === "on")
    .map((n) => ({ weekday: n, start: str(fd, `start${n}`), end: str(fd, `end${n}`), breakStart: str(fd, `bstart${n}`), breakEnd: str(fd, `bend${n}`) }));

  const v = parse(staffSchema, {
    name: str(fd, "name"),
    jobTitle: str(fd, "jobTitle"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    color: str(fd, "color"),
    active: fd.get("active") === "on",
    services: fd.getAll("services").map(String),
    hours,
  });
  if ("state" in v) return v.state;

  const { supabase, orgId } = await getSession();
  const { error } = await supabase.rpc("save_staff", {
    p_org: orgId,
    p_id: id,
    p_full_name: v.data.name,
    p_job_title: v.data.jobTitle,
    p_phone: v.data.phone,
    p_email: v.data.email,
    p_color: v.data.color,
    p_is_active: v.data.active,
    p_services: v.data.services,
    p_hours: v.data.hours,
  });
  if (error) return dbError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Temporarily switch a specialist off (no new bookings) or back on. */
export async function setStaffActive(id: string, active: boolean): Promise<ActionState> {
  const { supabase, orgId } = await getSession();
  const { error, data } = await supabase.from("staff").update({ is_active: active }).eq("id", id).eq("org_id", orgId).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: NO_ACCESS };
  revalidatePath("/", "layout");
  return { ok: true };
}
