import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { UserCog, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StaffCard } from "@/components/staff/staff-card";
import { StaffFormDialog } from "@/components/staff/staff-form-dialog";
import { Button } from "@/components/ui/button";
import { todayAppointments } from "@/lib/data/derive";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Сотрудники" };

async function StaffContent() {
  const [data, { role }] = await Promise.all([getOrgData(), getSession()]);
  const canManage = role !== "staff";
  const today = todayAppointments(data);
  return (
    <>
      <PageHeader
        title="Сотрудники"
        description="Специалисты, графики работы и оказываемые услуги"
        actions={
          canManage && (
            <StaffFormDialog
              services={data.services}
              trigger={
                <Button>
                  <UserPlus /> Добавить специалиста
                </Button>
              }
            />
          )
        }
      />
      {data.staff.length === 0 && (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <UserCog className="mx-auto mb-2 size-8 opacity-40" />
          Специалистов пока нет.{canManage ? " Добавьте первого." : ""}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.staff.map((m) => (
          <StaffCard key={m.id} member={m} services={data.services} canManage={canManage} todayCount={today.filter((a) => a.staffId === m.id).length} />
        ))}
      </div>
    </>
  );
}

export default function StaffPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StaffContent />
    </Suspense>
  );
}
