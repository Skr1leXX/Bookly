"use client";

import { Clock, Mail, Pencil, Phone, Power, Star } from "lucide-react";
import { useState, useTransition } from "react";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setStaffActive } from "@/lib/actions/staff";
import { cn } from "@/lib/utils";
import type { Service, StaffMember } from "@/types";
import { StaffFormDialog } from "./staff-form-dialog";

export function StaffCard({
  member,
  services,
  todayCount,
  canManage,
}: {
  member: StaffMember;
  services: Service[];
  todayCount: number;
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const names = member.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean);

  const toggle = () =>
    start(async () => {
      const r = await setStaffActive(member.id, !member.active);
      setError(r.error);
    });

  return (
    <Card className={cn("border shadow-sm shadow-primary/5 ring-0", !member.active && "bg-muted/40")}>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <PersonAvatar name={member.name} size="lg" className={cn(!member.active && "opacity-60")} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{member.name}</h3>
            <p className="text-sm text-muted-foreground">{member.role || "Специалист"}</p>
          </div>
          {member.active ? (
            <span className="flex items-center gap-1 text-sm font-medium">
              <Star className="size-4 fill-amber-400 text-amber-400" /> {member.rating.toFixed(1)}
            </span>
          ) : (
            <Badge variant="outline">Отключён</Badge>
          )}
        </div>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Clock className="size-4" /> {member.schedule}</li>
          {member.phone && <li className="flex items-center gap-2"><Phone className="size-4" /> {member.phone}</li>}
          {member.email && <li className="flex items-center gap-2"><Mail className="size-4" /> {member.email}</li>}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          {names.length === 0 && <span className="text-sm text-muted-foreground">Услуги не назначены</span>}
          {names.map((name) => (
            <Badge key={name} variant="secondary">{name}</Badge>
          ))}
        </div>
        <p className="border-t pt-3 text-sm text-muted-foreground">
          Записей сегодня: <span className="font-semibold text-foreground">{todayCount}</span>
        </p>
        {canManage && (
          <div className="flex gap-2">
            <StaffFormDialog member={member} services={services} trigger={<Button variant="outline" size="sm" className="flex-1"><Pencil /> Изменить</Button>} />
            <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
              <Power /> {member.active ? "Отключить" : "Включить"}
            </Button>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
