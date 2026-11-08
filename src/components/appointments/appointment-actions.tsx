"use client";

import { Check, CircleSlash, MoreHorizontal, Pencil, UserX, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { statusMeta } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setAppointmentStatus } from "@/lib/actions/appointments";
import { APPOINTMENT_STATUSES } from "@/lib/validation";
import type { AppointmentStatus, AppointmentView } from "@/types";
import { AppointmentFormDialog, type BookingContext } from "./appointment-form-dialog";

const ICON: Record<AppointmentStatus, React.ReactNode> = {
  pending: <CircleSlash />,
  confirmed: <Check />,
  completed: <Check />,
  cancelled: <XCircle />,
  no_show: <UserX />,
};

/** Row menu: edit, change status (including cancel). */
export function AppointmentActions({ appointment, ctx }: { appointment: AppointmentView; ctx: BookingContext }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const setStatus = (status: AppointmentStatus) =>
    start(async () => {
      const r = await setAppointmentStatus({ id: appointment.id, status });
      setError(r.error);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={pending} aria-label="Действия с записью" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil /> Изменить
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
          <DropdownMenuLabel>Статус</DropdownMenuLabel>
          {APPOINTMENT_STATUSES.filter((s) => s !== appointment.status).map((s) => (
            <DropdownMenuItem key={s} variant={s === "cancelled" ? "destructive" : "default"} onClick={() => setStatus(s as AppointmentStatus)}>
              {ICON[s as AppointmentStatus]} {s === "cancelled" ? "Отменить запись" : statusMeta[s as AppointmentStatus].label}
            </DropdownMenuItem>
          ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p role="alert" className="max-w-48 text-right text-xs text-destructive">{error}</p>}
      <AppointmentFormDialog appointment={appointment} open={editing} onOpenChange={setEditing} {...ctx} />
    </div>
  );
}
