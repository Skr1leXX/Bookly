"use client";

import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { AppointmentFormDialog, type AppointmentDefaults, type BookingContext } from "@/components/appointments/appointment-form-dialog";
import { NativeSelect } from "@/components/shared/form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { moveAppointment } from "@/lib/actions/appointments";
import { addDays, formatDayShort, formatFull, formatWeekday, startOfWeek, toMinutes } from "@/lib/dates";
import { findConflict, slotProblem } from "@/lib/scheduling";
import { cn } from "@/lib/utils";
import type { AppointmentView, StaffMember } from "@/types";
import { AppointmentBlocks } from "./appointment-block";

const HOUR_PX = 64;
const SNAP = 15; // минут
const pad = (n: number) => String(n).padStart(2, "0");

interface Column {
  key: string;
  title: string;
  subtitle?: string;
  date: string;
  staffId?: string; // колонка конкретного специалиста (режим «День»)
  isToday: boolean;
}

export function ScheduleCalendar({ ctx, canEditAll, myStaffId }: { ctx: BookingContext; canEditAll: boolean; myStaffId: string | null }) {
  const { appointments, staff, today } = ctx;
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(today);
  const [staffFilter, setStaffFilter] = useState("all");
  const [selected, setSelected] = useState<AppointmentView | null>(null);
  const [creating, setCreating] = useState<AppointmentDefaults | null>(null);
  const [drag, setDrag] = useState<{ a: AppointmentView; grab: number } | null>(null);
  const [message, setMessage] = useState<string>();
  const [pending, startMove] = useTransition();

  const canEdit = (a: AppointmentView) => canEditAll || a.staffId === myStaffId;
  const shownStaff = staff.filter((m) => (staffFilter === "all" ? m.active : m.id === staffFilter));

  const columns: Column[] =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => {
          const date = addDays(startOfWeek(anchor), i);
          return { key: date, title: formatWeekday(date), subtitle: String(Number(date.slice(8))), date, isToday: date === today };
        })
      : shownStaff.map((m) => ({ key: m.id, title: m.name.split(" ")[0], subtitle: m.role, date: anchor, staffId: m.id, isToday: anchor === today }));

  const inColumn = (c: Column) =>
    appointments.filter((a) => a.date === c.date && (c.staffId ? a.staffId === c.staffId : staffFilter === "all" || a.staffId === staffFilter));

  // Visible hours: 9–21 by default, widened if some visit lies outside.
  const visible = columns.flatMap(inColumn).filter((a) => a.status !== "cancelled");
  const startHour = Math.min(9, ...visible.map((a) => Math.floor(toMinutes(a.time) / 60)));
  const endHour = Math.max(21, ...visible.map((a) => Math.ceil(toMinutes(a.endTime) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const step = view === "week" ? 7 : 1;
  const weekStart = startOfWeek(anchor);
  const label = view === "week" ? `${formatDayShort(weekStart)} — ${formatDayShort(addDays(weekStart, 6))}` : formatFull(anchor);

  const minutesAt = (e: React.DragEvent | React.MouseEvent, grab = 0) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = ((e.clientY - rect.top) / HOUR_PX) * 60 + startHour * 60 - grab;
    return Math.max(startHour * 60, Math.round(raw / SNAP) * SNAP);
  };
  const timeOf = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

  const drop = (e: React.DragEvent, col: Column) => {
    e.preventDefault();
    if (!drag) return;
    const { a } = drag;
    const time = timeOf(minutesAt(e, drag.grab));
    const targetStaff = staff.find((m) => m.id === (col.staffId ?? a.staffId))!;
    setDrag(null);
    setMessage(undefined);

    if (a.date === col.date && a.time === time && a.staffId === targetStaff.id) return;
    // Quick feedback without a round trip; the database re-checks everything.
    const problem = slotProblem(targetStaff, col.date, time, a.service.duration);
    if (problem) return setMessage(`Нельзя перенести: ${problem.toLowerCase()}`);
    const clash = findConflict(appointments, { staffId: targetStaff.id, date: col.date, time, duration: a.service.duration, excludeId: a.id });
    if (clash) return setMessage(`Нельзя перенести: у специалиста уже есть запись ${clash.time}–${clash.endTime} (${clash.client.name})`);

    startMove(async () => {
      const r = await moveAppointment({ id: a.id, staffId: targetStaff.id, date: col.date, time });
      if (r.error) setMessage(r.error);
    });
  };

  return (
    <Card className="border shadow-sm shadow-primary/5 ring-0">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Режим просмотра">
          {(["day", "week"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} onClick={() => setView(v)} aria-pressed={view === v}>
              {v === "day" ? "День" : "Неделя"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={() => setAnchor(addDays(anchor, -step))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => setAnchor(today)}>
            Сегодня
          </Button>
          <Button variant="outline" size="icon" aria-label="Вперёд" onClick={() => setAnchor(addDays(anchor, step))}>
            <ChevronRight />
          </Button>
        </div>
        <h2 className="font-semibold">{label}</h2>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Сохранение" />}
        <NativeSelect value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="sm:ml-auto sm:w-56" aria-label="Специалист">
          <option value="all">Все специалисты</option>
          {staff.map((m: StaffMember) => (
            <option key={m.id} value={m.id}>{m.name}{m.active ? "" : " (отключён)"}</option>
          ))}
        </NativeSelect>
      </div>

      {message && (
        <p role="alert" className="mx-4 flex items-start justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
          <button type="button" onClick={() => setMessage(undefined)} aria-label="Закрыть"><X className="size-4" /></button>
        </p>
      )}

      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(640, columns.length * 110 + 56) }}>
          <div className="grid border-y" style={{ gridTemplateColumns: `3.5rem repeat(${Math.max(columns.length, 1)}, 1fr)` }}>
            <div />
            {columns.map((c) => (
              <div key={c.key} className="px-1 py-2 text-center">
                <p className="truncate text-xs text-muted-foreground uppercase">{c.title}</p>
                {c.subtitle && (
                  <p className={cn("mt-0.5 truncate text-sm font-semibold", view === "week" && c.isToday && "mx-auto flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground")}>
                    {c.subtitle}
                  </p>
                )}
              </div>
            ))}
          </div>

          {columns.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Нет активных специалистов для отображения</p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, 1fr)`, height: hours.length * HOUR_PX }}>
              <div>
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }} className="pr-2 text-right text-xs text-muted-foreground">
                    <span className="relative -top-2">{pad(h)}:00</span>
                  </div>
                ))}
              </div>
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={cn("relative cursor-cell border-l", view === "week" && c.isToday && "bg-accent/30")}
                  onClick={(e) => setCreating({ date: c.date, time: timeOf(minutesAt(e)), staffId: c.staffId ?? (staffFilter === "all" ? undefined : staffFilter) })}
                  onDragOver={(e) => drag && e.preventDefault()}
                  onDrop={(e) => drop(e, c)}
                >
                  {hours.map((h) => (
                    <div key={h} style={{ height: HOUR_PX }} className="border-b border-dashed" />
                  ))}
                  <AppointmentBlocks
                    items={inColumn(c)}
                    startHour={startHour}
                    hourPx={HOUR_PX}
                    draggable={canEdit}
                    draggingId={drag?.a.id ?? null}
                    onOpen={setSelected}
                    onDragStart={(a, grab) => setDrag({ a, grab })}
                    onDragEnd={() => setDrag(null)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {visible.length === 0 && <p className="px-4 pb-2 text-center text-sm text-muted-foreground">В этом периоде записей нет. Нажмите на свободное время, чтобы создать запись.</p>}

      {selected &&
        (canEdit(selected) ? (
          <AppointmentFormDialog key={selected.id} appointment={selected} open onOpenChange={(o) => !o && setSelected(null)} {...ctx} />
        ) : null)}
      {creating && <AppointmentFormDialog key={`${creating.date}${creating.time}${creating.staffId}`} defaults={creating} open onOpenChange={(o) => !o && setCreating(null)} {...ctx} />}
    </Card>
  );
}
