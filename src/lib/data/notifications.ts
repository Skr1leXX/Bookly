import { cache } from "react";
import type { NotificationItem } from "@/types";
import { getSession } from "./session";

/** Own notifications only: RLS limits the table to user_id = auth.uid(). */
export const getNotifications = cache(async () => {
  const { supabase, orgId } = await getSession();
  const [{ data: items }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, is_read, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("is_read", false),
  ]);
  const list: NotificationItem[] = (items ?? []).map((n) => ({ id: n.id, title: n.title, body: n.body, isRead: n.is_read, createdAt: n.created_at }));
  return { items: list, unread: count ?? 0 };
});
