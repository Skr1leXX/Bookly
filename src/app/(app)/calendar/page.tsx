import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { AppointmentFormDialog } from "@/components/appointments/appointment-form-dialog";
import { ScheduleCalendar } from "@/components/calendar/schedule-calendar";
import { StaffLegend } from "@/components/calendar/staff-legend";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Календарь" };

async function CalendarContent() {
  const [data, session] = await Promise.all([getOrgData(), getSession()]);
  const ctx = { clients: data.clients, services: data.services, staff: data.staff, appointments: data.appointments, today: data.today };
  const myStaffId = data.staff.find((m) => m.userId === session.userId)?.id ?? null;
  return (
    <>
      <PageHeader
        title="Календарь"
        description="Нажмите на свободное время, чтобы создать запись, или перетащите запись, чтобы перенести её"
        actions={
          <AppointmentFormDialog
            {...ctx}
            trigger={
              <Button>
                <Plus /> Новая запись
              </Button>
            }
          />
        }
      />
      <StaffLegend staff={data.staff} />
      <ScheduleCalendar ctx={ctx} canEditAll={session.role !== "staff"} myStaffId={myStaffId} />
    </>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CalendarContent />
    </Suspense>
  );
}
