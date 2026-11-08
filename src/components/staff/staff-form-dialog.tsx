"use client";

import { Field, FormDialog, TextField } from "@/components/shared/form-dialog";
import { Input } from "@/components/ui/input";
import { saveStaff } from "@/lib/actions/staff";
import { STAFF_COLORS } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { Service, StaffMember } from "@/types";

const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const SWATCH: Record<string, string> = { violet: "bg-violet-400", fuchsia: "bg-fuchsia-400", indigo: "bg-indigo-400", purple: "bg-purple-400", sky: "bg-sky-400" };
const DEFAULT_HOURS: StaffMember["hours"] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "10:00", end: "19:00" }));

export function StaffFormDialog({ member, services, trigger }: { member?: StaffMember; services: Service[]; trigger: React.ReactElement }) {
  const hours = member ? member.hours : DEFAULT_HOURS;
  return (
    <FormDialog
      trigger={trigger}
      title={member ? "Редактирование специалиста" : "Новый специалист"}
      action={saveStaff.bind(null, member?.id ?? null)}
      submitLabel={member ? "Сохранить" : "Добавить"}
      className="sm:max-w-xl"
    >
      {(state) => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Имя" name="name" state={state} defaultValue={member?.name} maxLength={120} required />
            <TextField label="Должность" name="jobTitle" state={state} defaultValue={member?.role} maxLength={80} placeholder="Например, Мастер маникюра" />
            <TextField label="Телефон" name="phone" type="tel" state={state} defaultValue={member?.phone} />
            <TextField label="Email" name="email" type="email" state={state} defaultValue={member?.email} />
          </div>

          <Field label="Цвет в календаре" name="color" error={state.fields?.color}>
            <div className="flex gap-2">
              {STAFF_COLORS.map((c) => (
                <label key={c} className="cursor-pointer">
                  <input type="radio" name="color" value={c} defaultChecked={(member?.colorKey ?? "violet") === c} className="peer sr-only" />
                  <span className={cn("block size-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:ring-2", SWATCH[c])} />
                  <span className="sr-only">{c}</span>
                </label>
              ))}
            </div>
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Доступные услуги</legend>
            {services.length === 0 && <p className="text-sm text-muted-foreground">Сначала добавьте услуги.</p>}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="services" value={s.id} defaultChecked={member?.serviceIds.includes(s.id)} className="size-4 accent-primary" />
                  <span className={cn(!s.active && "text-muted-foreground")}>{s.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Рабочее расписание</legend>
            {DAYS.map((day, i) => {
              const n = i + 1;
              const h = hours.find((x) => x.weekday === n);
              return (
                <div key={n} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <label className="flex w-36 shrink-0 items-center gap-2">
                    <input type="checkbox" name={`day${n}`} defaultChecked={!!h} className="size-4 accent-primary" />
                    {day}
                  </label>
                  <Input type="time" name={`start${n}`} defaultValue={h?.start ?? "10:00"} aria-label={`${day}: начало`} className="w-28" />
                  <span className="text-muted-foreground">—</span>
                  <Input type="time" name={`end${n}`} defaultValue={h?.end ?? "19:00"} aria-label={`${day}: конец`} className="w-28" />
                  <span className="ml-1 text-xs text-muted-foreground">перерыв</span>
                  <Input type="time" name={`bstart${n}`} defaultValue={h?.breakStart ?? ""} aria-label={`${day}: начало перерыва`} className="w-28" />
                  <span className="text-muted-foreground">—</span>
                  <Input type="time" name={`bend${n}`} defaultValue={h?.breakEnd ?? ""} aria-label={`${day}: конец перерыва`} className="w-28" />
                </div>
              );
            })}
            {state.fields?.hours && <p role="alert" className="text-xs text-destructive">{state.fields.hours}</p>}
            <p className="text-xs text-muted-foreground">Дни без галочки — выходные. Перерыв необязателен: в это время запись недоступна.</p>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={member?.active ?? true} className="size-4 accent-primary" />
            Работает (доступен для новых записей)
          </label>
        </div>
      )}
    </FormDialog>
  );
}
