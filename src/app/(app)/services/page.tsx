import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Plus, Scissors } from "lucide-react";
import type { Metadata } from "next";
import { ServiceCard } from "@/components/services/service-card";
import { ServiceFormDialog } from "@/components/services/service-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Услуги" };

async function ServicesContent() {
  const [{ services }, { role }] = await Promise.all([getOrgData(), getSession()]);
  const canManage = role !== "staff";
  const categories = [...new Set(services.map((s) => s.category))].filter(Boolean);
  const groups = [...new Set(services.map((s) => s.category))];
  return (
    <>
      <PageHeader
        title="Услуги"
        description="Каталог услуг, цены и длительность"
        actions={
          canManage && (
            <ServiceFormDialog
              categories={categories}
              trigger={
                <Button>
                  <Plus /> Добавить услугу
                </Button>
              }
            />
          )
        }
      />
      {services.length === 0 && (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <Scissors className="mx-auto mb-2 size-8 opacity-40" />
          Услуг пока нет.{canManage ? " Добавьте первую." : ""}
        </div>
      )}
      {groups.map((category) => (
        <section key={category} className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{category || "Без категории"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {services
              .filter((s) => s.category === category)
              .map((s) => (
                <ServiceCard key={s.id} service={s} categories={categories} canManage={canManage} />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ServicesContent />
    </Suspense>
  );
}
