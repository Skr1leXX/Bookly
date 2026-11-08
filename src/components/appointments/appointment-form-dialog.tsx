"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Field, FormDialog, NativeSelect, TextArea } from "@/components/shared/form-dialog";
import { statusMeta } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { saveAppointment } from "@/lib/actions/appointments";
import type { ActionState } from "@/lib/actions/util";
import { formatDayShort } from "@/lib/dates";
import { findConflict, slotProblem } from "@/lib/scheduling";
import { APPOINTMENT_STATUSES } from "@/lib/validation";
import type { AppointmentStatus, AppointmentView, Client, Service, StaffMember } from "@/types";

export interface BookingContext {
  clients: Client[];
  services: Service[];
  staff: StaffMember[];
  appointments: AppointmentView[];
  today: string;
}

export interface AppointmentDefaults {
  date?: string;
  time?: string;
  staffId?: string;
  clientId?: string;
}

interface Props extends BookingContext {
  appointment?: AppointmentView;
  defaults?: AppointmentDefaults;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AppointmentFormDialog({ appointment, defaults, trigger, open, onOpenChange, ...ctx }: Props) {
  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={appointment ? "Редактирование записи" : "Новая запись"}
      action={saveAppointment.bind(null, appointment?.id ?? null)}
      submitLabel={appointment ? "Сохранить" : "Создать запись"}
    >
      {(state) => <AppointmentFields state={state} appointment={appointment} defaults={defaults} {...ctx} />}
    </FormDialog>
  );
}

function AppointmentFields({ state, appointment, defaults, clients, services, staff, appointments, today }: BookingContext & { state: ActionState; appointment?: AppointmentView; defaults?: AppointmentDefaults }) {
  const activeServices = services.filter((s) => s.active || s.id === appointment?.serviceId);
  const offering = (serviceId: string) => staff.filter((m) => m.serviceIds.includes(serviceId) && (m.active || m.id === appointment?.staffId));

  const firstService = appointment?.serviceId ?? activeServices[0]?.id ?? "";
  const [serviceId, setServiceId] = useState(firstService);
  const [staffId, setStaffId] = useState(appointment?.staffId ?? defaults?.staffId ?? offering(firstService)[0]?.id ?? "");
  const [date, setDate] = useState(appointment?.date ?? defaults?.date ?? today);
  const [time, setTime] = useState(appointment?.time ?? defaults?.time ?? "10:00");

  const available = offering(serviceId);
  const service = services.find((s) => s.id === serviceId);
  const member = staff.find((m) => m.id === staffId);

  const onService = (id: string) => {
    setServiceId(id);
    if (!offering(id).some((m) => m.id === staffId)) setStaffId(offering(id)[0]?.id ?? "");
  };

  // Hints only; the database rejects conflicts and slots outside working hours anyway.
  const conflict = service && staffId && time ? findConflict(appointments, { staffId, date, time, duration: service.duration, excludeId: appointment?.id }) : undefined;
  const problem = service && member && date && time ? slotProblem(member, date, time, service.duration) : null;

  const err = (n: string) => state.fields?.[n];
  return (
    <div className="space-y-3">
      <Field label="Клиент" name="clientId" error={err("clientId")}>
        <NativeSelect id="clientId" name="clientId" defaultValue={appointment?.clientId ?? defaults?.clientId ?? ""} aria-invalid={!!err("clientId")} required>
          <option value="" disabled>Выберите клиента</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
          ))}
        </NativeSelect>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Услуга" name="serviceId" error={err("serviceId")}>
          <NativeSelect id="serviceId" name="serviceId" value={serviceId} onChange={(e) => onService(e.target.value)} required>
            {activeServices.length === 0 && <option value="">Нет активных услуг</option>}
            {activeServices.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.duration} мин</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Специалист" name="staffId" error={err("staffId")}>
          <NativeSelect id="staffId" name="staffId" value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
            {available.length === 0 && <option value="">Никто не оказывает эту услугу</option>}
            {available.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.active ? "" : " (отключён)"}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Дата" name="date" error={err("date")}>
          <Input id="date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Время начала" name="time" error={err("time")} hint={service ? `Длительность: ${service.duration} мин` : undefined}>
          <Input id="time" name="time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
      </div>

      {(conflict || problem) && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {conflict && `Время занято: у специалиста уже есть запись ${formatDayShort(conflict.date)} ${conflict.time}–${conflict.endTime} (${conflict.client.name}). `}
            {problem}
          </span>
        </p>
      )}

      <Field label="Статус" name="status" error={err("status")}>
        <NativeSelect id="status" name="status" defaultValue={appointment?.status ?? "confirmed"}>
          {APPOINTMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{statusMeta[s as AppointmentStatus].label}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Заметка" name="notes" error={err("notes")}>
        <TextArea id="notes" name="notes" defaultValue={appointment?.notes} maxLength={1000} className="min-h-16" />
      </Field>
    </div>
  );
}
