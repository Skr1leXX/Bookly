import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { ArrowLeft, CalendarX, Mail, Pencil, Phone, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { DeleteClientDialog } from "@/components/clients/delete-client-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrgData } from "@/lib/data/org-data";
import { getSession } from "@/lib/data/session";
import { formatDay, formatMoney, localParts } from "@/lib/dates";
import { CalendarCheck, Wallet, Clock } from "lucide-react";
import type { AppointmentStatus } from "@/types";

export const metadata: Metadata = { title: "Клиент" };

async function ClientContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, session] = await Promise.all([getOrgData(), getSession()]);
  const client = data.clients.find((c) => c.id === id);
  if (!client) notFound();

  // The whole visit history (not just the recent window used elsewhere).
  const { data: rows, error } = await session.supabase
    .from("appointments")
    .select("id, service_id, staff_id, starts_at, status, price")
    .eq("org_id", session.orgId)
    .eq("client_id", id)
    .order("starts_at", { ascending: false });
  if (error) throw new Error(error.message);

  const serviceName = new Map(data.services.map((s) => [s.id, s.name]));
  const staffName = new Map(data.staff.map((s) => [s.id, s.name]));
  const history = (rows ?? []).map((a) => ({ ...a, ...localParts(a.starts_at, data.company.timezone) }));

  return (
    <>
      <Link href="/clients" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft /> Все клиенты
      </Link>
      <PageHeader
        title={client.name}
        description={`Клиент с ${formatDay(client.createdAt)}`}
        actions={
          <>
            <ClientFormDialog client={client} trigger={<Button variant="outline"><Pencil /> Изменить</Button>} />
            {session.role !== "staff" && (
              <DeleteClientDialog client={client} redirectAfter trigger={<Button variant="outline" className="text-destructive"><Trash2 /> Удалить</Button>} />
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Завершённых визитов" value={String(client.visits)} icon={CalendarCheck} />
        <StatCard label="Потрачено" value={formatMoney(client.totalSpent)} icon={Wallet} />
        <StatCard label="Последний визит" value={client.lastVisit ? formatDay(client.lastVisit) : "—"} icon={Clock} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Контакты" className="h-fit">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <PersonAvatar name={client.name} size="lg" />
              <span className="font-medium">{client.name}</span>
            </div>
            <p className="flex items-center gap-2 text-muted-foreground"><Phone className="size-4" /> {client.phone}</p>
            <p className="flex items-center gap-2 text-muted-foreground"><Mail className="size-4" /> {client.email || "Email не указан"}</p>
            {client.note && <p className="rounded-lg bg-muted p-3">{client.note}</p>}
          </div>
        </SectionCard>

        <SectionCard title="История посещений" description={`Всего записей: ${history.length}`} className="lg:col-span-2">
          {history.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              <CalendarX className="mx-auto mb-2 size-8 opacity-40" />У клиента пока нет записей
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Услуга</TableHead>
                  <TableHead className="hidden sm:table-cell">Специалист</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{formatDay(a.date)}, {a.time}</TableCell>
                    <TableCell>{serviceName.get(a.service_id) ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{staffName.get(a.staff_id) ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={a.status as AppointmentStatus} /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatMoney(Number(a.price))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
    </>
  );
}

export default function ClientPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientContent {...props} />
    </Suspense>
  );
}
