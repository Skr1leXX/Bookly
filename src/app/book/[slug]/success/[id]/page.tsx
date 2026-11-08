import { CalendarDays, CheckCircle2, MapPin, Phone, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { formatFull, formatMoney } from "@/lib/dates";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicAppointment } from "@/types/booking";

// A private confirmation link: keep it out of search engines.
export const metadata: Metadata = { title: "Запись создана", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function SuccessContent({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { data, error } = await createPublicClient().rpc("public_appointment", { p_id: id });
  if (error) throw new Error(error.message);
  const a = data as PublicAppointment | null;
  if (!a || a.org.slug !== slug) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-8" /></span>
        <h1 className="text-2xl font-semibold tracking-tight">Запись создана{a.clientName ? `, ${a.clientName}` : ""}!</h1>
        <p className="text-sm text-muted-foreground">
          {a.status === "pending" ? "Администратор подтвердит запись и свяжется с вами, если понадобится уточнение." : "Ждём вас в назначенное время."}
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm shadow-primary/5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold">{a.service}</p>
          <p className="font-semibold text-primary">{formatMoney(a.price)}</p>
        </div>
        <ul className="space-y-2 border-t pt-3 text-sm">
          <li className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 size-4 text-muted-foreground" /><span>{formatFull(a.date)}, {a.time}–{a.endTime}</span></li>
          <li className="flex items-start gap-2.5"><User className="mt-0.5 size-4 text-muted-foreground" /><span>{a.staff}</span></li>
          <li className="flex items-start gap-2.5"><MapPin className="mt-0.5 size-4 text-muted-foreground" /><span>{a.org.name}{a.org.address ? `, ${a.org.address}` : ""}</span></li>
          {a.org.phone && <li className="flex items-start gap-2.5"><Phone className="mt-0.5 size-4 text-muted-foreground" /><span>{a.org.phone}</span></li>}
        </ul>
      </div>

      <Link href={`/book/${slug}`} className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full" })}>
        Записаться ещё раз
      </Link>
    </div>
  );
}

export default function SuccessPage(props: { params: Promise<{ slug: string; id: string }> }) {
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><div className="mx-auto size-14 animate-pulse rounded-full bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>}>
      <SuccessContent {...props} />
    </Suspense>
  );
}
