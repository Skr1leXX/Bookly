"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/data/session";
import { clientSchema } from "@/lib/validation";
import { dbError, NO_ACCESS, parse, str, type ActionState } from "./util";

/** Create (id = null) or update a client. Bound as `saveClient.bind(null, id)` by the form. */
export async function saveClient(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const v = parse(clientSchema, { name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email"), note: str(fd, "note") });
  if ("state" in v) return v.state;

  const { supabase, orgId } = await getSession();
  const { error, data } = id
    ? await supabase.from("clients").update(v.data).eq("id", id).eq("org_id", orgId).select("id")
    : await supabase.from("clients").insert({ ...v.data, org_id: orgId }).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: "Клиент не найден или нет прав на изменение" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Delete a client together with their visits (FK cascade). RLS: owner/admin only. */
export async function deleteClient(id: string, redirectAfter: boolean): Promise<ActionState> {
  const { supabase, orgId } = await getSession();
  const { error, data } = await supabase.from("clients").delete().eq("id", id).eq("org_id", orgId).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: NO_ACCESS };
  revalidatePath("/", "layout");
  if (redirectAfter) redirect("/clients");
  return { ok: true };
}
