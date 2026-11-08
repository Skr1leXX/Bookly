import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import type { Metadata } from "next";
import { BookingsChart } from "@/components/dashboard/bookings-chart";
import { PopularServices } from "@/components/dashboard/popular-services";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments";
import { PageHeader } from "@/components/shared/page-header";
import { dailyStats, popularServices, upcomingAppointments } from "@/lib/data/derive";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";
import { formatFull, localParts } from "@/lib/dates";

export const metadata: Metadata = { title: "Дашборд" };

async function DashboardContent() {
  const [data, { fullName }] = await Promise.all([getOrgData(), getSession()]);
  const nowTime = localParts(new Date().toISOString(), data.company.timezone).time;
  const firstName = fullName.split(" ")[0];

  return (
    <>
      <PageHeader title={`Добрый день, ${firstName} 👋`} description={`Сегодня ${formatFull(data.today)} — обзор вашего бизнеса`} />
      <StatsGrid data={data} />
      <div className="grid gap-4 lg:grid-cols-3">
        <BookingsChart data={dailyStats(data)} />
        <PopularServices items={popularServices(data)} />
      </div>
      <UpcomingAppointments items={upcomingAppointments(data, nowTime, 6)} today={data.today} />
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
