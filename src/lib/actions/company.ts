"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/data/session";
import { companySchema } from "@/lib/validation";
import { dbError, parse, str, type ActionState } from "./util";

/** Organization profile and opening hours (RPC save_company, one transaction). RLS: owner/admin only. */
export async function saveCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  const hours = [1, 2, 3, 4, 5, 6, 7]
    .filter((n) => fd.get(`day${n}`) === "on")
    .map((n) => ({ weekday: n, start: str(fd, `start${n}`), end: str(fd, `end${n}`) }));
  const v = parse(companySchema, {
    name: str(fd, "name"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    address: str(fd, "address"),
    description: str(fd, "description"),
    hours,
  });
  if ("state" in v) return v.state;

  const { supabase, orgId } = await getSession();
  const { error } = await supabase.rpc("save_company", {
    p_org: orgId,
    p_name: v.data.name,
    p_phone: v.data.phone,
    p_email: v.data.email,
    p_address: v.data.address,
    p_description: v.data.description,
    p_hours: v.data.hours,
  });
  if (error) return dbError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
