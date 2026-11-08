import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Download, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ClientsTable } from "@/components/clients/clients-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Клиенты" };

async function ClientsContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [{ clients, today }, { role }] = await Promise.all([getOrgData(), getSession()]);
  return (
    <>
      <PageHeader
        title="Клиенты"
        description={`В базе ${clients.length} клиентов`}
        actions={
          <>
            {role !== "staff" && (
              <a href="/api/export/clients" download className={buttonVariants({ variant: "outline" })}>
                <Download /> Экспорт CSV
              </a>
            )}
            <ClientFormDialog
              trigger={
                <Button>
                  <UserPlus /> Добавить клиента
                </Button>
              }
            />
          </>
        }
      />
      <ClientsTable key={q ?? ""} clients={clients} today={today} canDelete={role !== "staff"} initialQuery={q ?? ""} />
    </>
  );
}

export default function ClientsPage(props: { searchParams: Promise<{ q?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientsContent {...props} />
    </Suspense>
  );
}
