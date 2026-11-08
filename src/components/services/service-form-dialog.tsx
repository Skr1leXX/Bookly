"use client";

import { Field, FormDialog, TextArea, TextField } from "@/components/shared/form-dialog";
import { saveService } from "@/lib/actions/services";
import type { Service } from "@/types";

export function ServiceFormDialog({ service, categories, trigger }: { service?: Service; categories: string[]; trigger: React.ReactElement }) {
  return (
    <FormDialog
      trigger={trigger}
      title={service ? "Редактирование услуги" : "Новая услуга"}
      action={saveService.bind(null, service?.id ?? null)}
      submitLabel={service ? "Сохранить" : "Создать"}
    >
      {(state) => (
        <div className="space-y-3">
          <TextField label="Название" name="name" state={state} defaultValue={service?.name} maxLength={120} required />
          <div>
            <TextField label="Категория" name="category" state={state} defaultValue={service?.category} maxLength={60} list="service-categories" placeholder="Например, Массаж" />
            <datalist id="service-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Field label="Описание" name="description" error={state.fields?.description}>
            <TextArea id="description" name="description" defaultValue={service?.description} maxLength={500} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Длительность, мин" name="duration" type="number" inputMode="numeric" min={5} max={720} step={5} state={state} defaultValue={service?.duration ?? 60} required />
            <TextField label="Цена, ₽" name="price" type="number" inputMode="decimal" min={0} step={50} state={state} defaultValue={service?.price ?? ""} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={service?.active ?? true} className="size-4 accent-primary" />
            Услуга активна (доступна для записи)
          </label>
        </div>
      )}
    </FormDialog>
  );
}
