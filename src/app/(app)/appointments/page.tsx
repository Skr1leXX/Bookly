import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import { AppointmentFormDialog } from "@/components/appointments/appointment-form-dialog";
import { AppointmentsTable } from "@/components/appointments/appointments-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Записи" };

async function AppointmentsContent() {
  const [data, session] = await Promise.all([getOrgData(), getSession()]);
  const ctx = { clients: data.clients, services: data.services, staff: data.staff, appointments: data.appointments, today: data.today };
  const myStaffId = data.staff.find((m) => m.userId === session.userId)?.id ?? null;
  return (
    <>
      <PageHeader
        title="Записи"
        description={`Записей за последние 90 дней и в будущем: ${data.appointments.length}`}
        actions={
          <>
            {session.role !== "staff" && (
              <a href="/api/export/appointments" download className={buttonVariants({ variant: "outline" })}>
                <Download /> Экспорт CSV
              </a>
            )}
            <AppointmentFormDialog
              {...ctx}
              trigger={
                <Button>
                  <Plus /> Новая запись
                </Button>
              }
            />
          </>
        }
      />
      <AppointmentsTable ctx={ctx} canEditAll={session.role !== "staff"} myStaffId={myStaffId} />
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AppointmentsContent />
    </Suspense>
  );
}
