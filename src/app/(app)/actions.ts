"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/data/session";

/** RLS + the column grant allow a user to flip only is_read on their own notifications. */
export async function markAllNotificationsRead() {
  const { supabase, orgId } = await getSession();
  await supabase.from("notifications").update({ is_read: true }).eq("org_id", orgId).eq("is_read", false);
  revalidatePath("/", "layout");
}
