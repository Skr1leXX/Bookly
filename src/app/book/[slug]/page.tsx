import { MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicOrg } from "@/types/booking";

export const metadata: Metadata = { title: "Онлайн-запись", description: "Запишитесь онлайн без регистрации" };

async function BookContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, error } = await createPublicClient().rpc("public_org", { p_slug: slug });
  if (error) throw new Error(error.message);
  if (!data) notFound();
  const org = data as PublicOrg;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        {org.description && <p className="text-sm text-muted-foreground">{org.description}</p>}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {org.address && <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {org.address}</span>}
          {org.phone && <a href={`tel:${org.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-1.5 hover:text-primary"><Phone className="size-4" /> {org.phone}</a>}
        </p>
      </header>
      <BookingWizard slug={slug} org={org} />
    </div>
  );
}

export default function BookPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>}>
      <BookContent {...props} />
    </Suspense>
  );
}
