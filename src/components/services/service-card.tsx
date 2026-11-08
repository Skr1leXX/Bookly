"use client";

import { Clock, Pencil, Power } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setServiceActive } from "@/lib/actions/services";
import { formatMoney } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Service } from "@/types";
import { ServiceFormDialog } from "./service-form-dialog";

export function ServiceCard({ service, categories, canManage }: { service: Service; categories: string[]; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const toggle = () =>
    start(async () => {
      const r = await setServiceActive(service.id, !service.active);
      setError(r.error);
    });

  return (
    <Card className="border shadow-sm shadow-primary/5 ring-0">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn("font-semibold", !service.active && "text-muted-foreground")}>{service.name}</h3>
          <Badge variant={service.active ? "secondary" : "outline"}>{service.active ? "Активна" : "Отключена"}</Badge>
        </div>
        <p className="flex-1 text-sm text-muted-foreground">{service.description || "Без описания"}</p>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" /> {service.duration} мин
          </span>
          <span className={cn("text-lg font-semibold text-primary", !service.active && "text-muted-foreground")}>{formatMoney(service.price)}</span>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <ServiceFormDialog service={service} categories={categories} trigger={<Button variant="outline" size="sm" className="flex-1"><Pencil /> Изменить</Button>} />
            <Button variant="outline" size="sm" onClick={toggle} disabled={pending} aria-label={service.active ? "Отключить услугу" : "Включить услугу"}>
              <Power /> {service.active ? "Отключить" : "Включить"}
            </Button>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
