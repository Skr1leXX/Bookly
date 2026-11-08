import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types";

/** The signed-in user, their organization and role. Redirects to /login when there is no session. */
export const getSession = cache(async () => {
  await connection(); // per-user and clock-dependent: never part of the prerendered shell
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("org_id, role, organizations(name, timezone)")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (!membership) throw new Error("Аккаунт не привязан ни к одной организации");

  const org = membership.organizations as unknown as { name: string; timezone: string } | null;
  return {
    supabase,
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name || user.email || "",
    orgId: membership.org_id as string,
    orgName: org?.name ?? "",
    timezone: org?.timezone ?? "Europe/Moscow",
    role: membership.role as MemberRole,
  };
});

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Владелец", admin: "Администратор", staff: "Сотрудник" };

/** Owner/admin-only pages: send staff back to the dashboard. */
export async function requireManager() {
  const session = await getSession();
  if (session.role === "staff") redirect("/dashboard");
  return session;
}
