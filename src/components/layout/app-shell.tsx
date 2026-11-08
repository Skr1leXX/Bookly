import { getOrgData } from "@/lib/data/org-data";
import { getNotifications } from "@/lib/data/notifications";
import { getSession, ROLE_LABEL } from "@/lib/data/session";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, notifications, data] = await Promise.all([getSession(), getNotifications(), getOrgData()]);
  const user = { name: session.fullName, email: session.email, roleLabel: ROLE_LABEL[session.role] };
  const booking = { clients: data.clients, services: data.services, staff: data.staff, appointments: data.appointments, today: data.today };
  return (
    <div className="min-h-screen">
      <Sidebar role={session.role} />
      <div className="lg:pl-64">
        <Topbar user={user} role={session.role} notifications={notifications} booking={booking} />
        <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
