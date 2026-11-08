import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import type { Metadata } from "next";
import { CompanyForm } from "@/components/settings/company-form";
import { PageHeader } from "@/components/shared/page-header";
import { getOrgData } from "@/lib/data/org-data";
import { requireManager } from "@/lib/data/session";

export const metadata: Metadata = { title: "Настройки" };

async function SettingsContent() {
  await requireManager(); // сотрудникам (staff) настройки компании недоступны
  const { company } = await getOrgData();
  return (
    <>
      <PageHeader title="Настройки" description="Профиль компании и часы работы" />
      <CompanyForm company={company} />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}
