"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "@/components/shared/section-card";
import { formatDayShort } from "@/lib/dates";
import type { DailyStat } from "@/types";

export function BookingsChart({ data }: { data: DailyStat[] }) {
  return (
    <SectionCard title="Записи по дням" description="Последние 14 дней" className="lg:col-span-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="bookingsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={formatDayShort} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
            <Tooltip
              labelFormatter={(d) => formatDayShort(String(d))}
              formatter={(v) => [v, "Записей"]}
              contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 4px 16px rgb(0 0 0 / 0.06)" }}
            />
            <Area type="monotone" dataKey="bookings" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#bookingsFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
