"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import { Field, TextArea, TextField } from "@/components/shared/form-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCompany } from "@/lib/actions/company";
import type { Company } from "@/types";

const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

/** Company profile and opening hours: one form, saved to Supabase. Days without a tick are closed. */
export function CompanyForm({ company }: { company: Company }) {
  const [state, action, actionPending] = useActionState(saveCompany, {});
  const [transitioning, startTransition] = useTransition();
  const pending = actionPending || transitioning;
  return (
    // onSubmit instead of action=: React 19 would reset the fields after the action, wiping input on a validation error.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      method="post" // never a GET: if submitted before hydration, field values must not end up in the URL
      className="space-y-6"
      noValidate
    >
      <SectionCard title="Онлайн-запись" description="Отправьте эту ссылку клиентам: они смогут записаться без регистрации">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-muted px-3 py-2 text-sm break-all">/book/{company.slug}</code>
          <a href={`/book/${company.slug}`} target="_blank" rel="noopener" className="text-sm font-medium text-primary hover:underline">
            Открыть страницу
          </a>
        </div>
      </SectionCard>

      <SectionCard title="Данные компании" description="Отображаются клиентам и в документах">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Название компании" name="name" state={state} defaultValue={company.name} maxLength={120} required />
          <TextField label="Телефон" name="phone" type="tel" state={state} defaultValue={company.phone} />
          <TextField label="Email" name="email" type="email" state={state} defaultValue={company.email} />
          <TextField label="Адрес" name="address" state={state} defaultValue={company.address} maxLength={200} />
          <Field label="Описание" name="description" error={state.fields?.description} className="sm:col-span-2">
            <TextArea id="description" name="description" defaultValue={company.description} maxLength={1000} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Часы работы" description="Общий график компании">
        <ul className="space-y-3">
          {company.hours.map((h, i) => (
            <li key={h.day} className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex w-40 items-center gap-2 font-medium">
                <input type="checkbox" name={`day${i + 1}`} defaultChecked={!!h.open} className="size-4 accent-primary" />
                {DAYS[i]}
              </label>
              <Input type="time" name={`start${i + 1}`} defaultValue={h.open || "09:00"} aria-label={`${h.day}: открытие`} className="w-28" />
              <span className="text-muted-foreground">—</span>
              <Input type="time" name={`end${i + 1}`} defaultValue={h.close || "21:00"} aria-label={`${h.day}: закрытие`} className="w-28" />
            </li>
          ))}
        </ul>
        {state.fields?.hours && <p role="alert" className="mt-2 text-xs text-destructive">{state.fields.hours}</p>}
      </SectionCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Сохранение…" : "Сохранить"}
        </Button>
        {state.ok && !pending && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="size-4" /> Сохранено
          </span>
        )}
        {state.error && <span role="alert" className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  );
}
