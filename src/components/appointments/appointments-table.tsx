"use client";

import { ClipboardList, Globe, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { NativeSelect } from "@/components/shared/form-dialog";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { StatusBadge, statusMeta } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDayShort, formatMoney } from "@/lib/dates";
import type { AppointmentStatus, AppointmentView } from "@/types";
import { AppointmentActions } from "./appointment-actions";
import type { BookingContext } from "./appointment-form-dialog";

export function AppointmentsTable({ ctx, canEditAll, myStaffId }: { ctx: BookingContext; canEditAll: boolean; myStaffId: string | null }) {
  const { appointments, staff, today } = ctx;
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");
  const [staffId, setStaffId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Newest first.
  const rows = [...appointments]
    .reverse()
    .filter(
      (a) =>
        (status === "all" || a.status === status) &&
        (staffId === "all" || a.staffId === staffId) &&
        (!from || a.date >= from) &&
        (!to || a.date <= to) &&
        (!q || a.client.name.toLowerCase().includes(q) || a.service.name.toLowerCase().includes(q) || a.staff.name.toLowerCase().includes(q)),
    );
  const filtered = status !== "all" || staffId !== "all" || from || to || q;
  const reset = () => {
    setStatus("all");
    setStaffId("all");
    setFrom("");
    setTo("");
    setQuery("");
  };

  return (
    <Card className="border shadow-sm shadow-primary/5 ring-0">
      <div className="grid gap-2 px-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Клиент, услуга, специалист…" className="pl-9" aria-label="Поиск записей" />
        </div>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Статус">
          <option value="all">Все статусы</option>
          {Object.entries(statusMeta).map(([value, m]) => (
            <option key={value} value={value}>{m.label}</option>
          ))}
        </NativeSelect>
        <NativeSelect value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Специалист">
          <option value="all">Все специалисты</option>
          {staff.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </NativeSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Дата с" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Дата по" />
      </div>
      <div className="flex items-center justify-between px-4 text-sm text-muted-foreground">
        <span>Найдено: {rows.length}</span>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Сбросить фильтры
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Клиент</TableHead>
            <TableHead>Услуга</TableHead>
            <TableHead className="hidden md:table-cell">Специалист</TableHead>
            <TableHead>Дата и время</TableHead>
            <TableHead className="hidden sm:table-cell">Статус</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Сумма</TableHead>
            <TableHead className="w-12 pr-4">
              <span className="sr-only">Действия</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a: AppointmentView) => (
            <TableRow key={a.id} className={a.status === "cancelled" ? "opacity-60" : undefined}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-2.5">
                  <PersonAvatar name={a.client.name} size="sm" />
                  <span className="font-medium">{a.client.name}</span>
                  {a.source === "online" && <Badge variant="secondary" title="Создана через страницу онлайн-записи"><Globe /> Онлайн</Badge>}
                </div>
              </TableCell>
              <TableCell>{a.service.name}</TableCell>
              <TableCell className="hidden md:table-cell">{a.staff.name}</TableCell>
              <TableCell className="whitespace-nowrap">
                {a.date === today ? "Сегодня" : formatDayShort(a.date)}, {a.time}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <StatusBadge status={a.status} />
              </TableCell>
              <TableCell className="hidden text-right font-medium whitespace-nowrap lg:table-cell">{formatMoney(a.price)}</TableCell>
              <TableCell className="pr-4 text-right">
                {canEditAll || a.staffId === myStaffId ? <AppointmentActions appointment={a} ctx={ctx} /> : null}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                <ClipboardList className="mx-auto mb-2 size-8 opacity-40" />
                {appointments.length === 0 ? "Записей пока нет. Создайте первую." : "Записей не найдено. Измените фильтры."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
