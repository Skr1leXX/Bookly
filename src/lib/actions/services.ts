"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/data/session";
import { serviceSchema } from "@/lib/validation";
import { dbError, NO_ACCESS, parse, str, type ActionState } from "./util";

/** Create (id = null) or update a service. RLS: owner/admin only. */
export async function saveService(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const v = parse(serviceSchema, {
    name: str(fd, "name"),
    category: str(fd, "category"),
    description: str(fd, "description"),
    duration: str(fd, "duration"),
    price: str(fd, "price"),
    active: fd.get("active") === "on",
  });
  if ("state" in v) return v.state;

  const { name, category, description, duration, price, active } = v.data;
  const row = { name, category, description, duration_min: duration, price, is_active: active };
  const { supabase, orgId } = await getSession();
  const { error, data } = id
    ? await supabase.from("services").update(row).eq("id", id).eq("org_id", orgId).select("id")
    : await supabase.from("services").insert({ ...row, org_id: orgId }).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: NO_ACCESS };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setServiceActive(id: string, active: boolean): Promise<ActionState> {
  const { supabase, orgId } = await getSession();
  const { error, data } = await supabase.from("services").update({ is_active: active }).eq("id", id).eq("org_id", orgId).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: NO_ACCESS };
  revalidatePath("/", "layout");
  return { ok: true };
}
