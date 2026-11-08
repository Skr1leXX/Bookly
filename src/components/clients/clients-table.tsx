"use client";

import { Mail, Pencil, Phone, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { NativeSelect } from "@/components/shared/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, formatDay, formatMoney } from "@/lib/dates";
import type { Client } from "@/types";
import { ClientFormDialog } from "./client-form-dialog";
import { DeleteClientDialog } from "./delete-client-dialog";

const FILTERS = [
  { value: "all", label: "Все клиенты" },
  { value: "new", label: "Новые (7 дней)" },
  { value: "regular", label: "Постоянные (3+ визита)" },
  { value: "none", label: "Без визитов" },
];

export function ClientsTable({ clients, today, canDelete, initialQuery = "" }: { clients: Client[]; today: string; canDelete: boolean; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState("all");
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");

  const rows = clients.filter((c) => {
    const matches =
      !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits));
    const inFilter =
      filter === "all" ||
      (filter === "new" && c.createdAt >= addDays(today, -7)) ||
      (filter === "regular" && c.visits >= 3) ||
      (filter === "none" && c.visits === 0);
    return matches && inFilter;
  });

  return (
    <Card className="border shadow-sm shadow-primary/5 ring-0">
      <div className="flex flex-col gap-2 px-4 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, телефон или email…" className="pl-9" aria-label="Поиск клиентов" />
        </div>
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-56" aria-label="Фильтр клиентов">
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground sm:ml-auto">Найдено: {rows.length}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Клиент</TableHead>
            <TableHead className="hidden md:table-cell">Контакты</TableHead>
            <TableHead className="text-center">Визиты</TableHead>
            <TableHead className="hidden sm:table-cell">Последний визит</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Потрачено</TableHead>
            <TableHead className="w-24 pr-4 text-right">
              <span className="sr-only">Действия</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="pl-4">
                <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5 hover:text-primary">
                  <PersonAvatar name={c.name} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {c.name}
                      {c.createdAt >= addDays(today, -7) && <Badge variant="secondary">Новый</Badge>}
                    </p>
                    {c.note && <p className="max-w-56 truncate text-xs text-muted-foreground">{c.note}</p>}
                  </div>
                </Link>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                <p className="flex items-center gap-1.5"><Phone className="size-3.5" />{c.phone}</p>
                {c.email && <p className="flex items-center gap-1.5"><Mail className="size-3.5" />{c.email}</p>}
              </TableCell>
              <TableCell className="text-center">{c.visits}</TableCell>
              <TableCell className="hidden whitespace-nowrap sm:table-cell">{c.lastVisit ? formatDay(c.lastVisit) : "—"}</TableCell>
              <TableCell className="hidden text-right font-medium whitespace-nowrap lg:table-cell">{formatMoney(c.totalSpent)}</TableCell>
              <TableCell className="pr-4">
                <div className="flex justify-end gap-1">
                  <ClientFormDialog client={c} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Изменить: ${c.name}`}><Pencil /></Button>} />
                  {canDelete && (
                    <DeleteClientDialog client={c} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Удалить: ${c.name}`}><Trash2 className="text-destructive" /></Button>} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                <Users className="mx-auto mb-2 size-8 opacity-40" />
                {clients.length === 0 ? "Клиентов пока нет. Добавьте первого." : "Клиенты не найдены. Измените запрос или фильтр."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
