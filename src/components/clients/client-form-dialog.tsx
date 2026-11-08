"use client";

import { saveClient } from "@/lib/actions/clients";
import { Field, FormDialog, TextArea, TextField } from "@/components/shared/form-dialog";
import type { Client } from "@/types";

export function ClientFormDialog({ client, trigger }: { client?: Client; trigger: React.ReactElement }) {
  return (
    <FormDialog
      trigger={trigger}
      title={client ? "Редактирование клиента" : "Новый клиент"}
      action={saveClient.bind(null, client?.id ?? null)}
      submitLabel={client ? "Сохранить" : "Добавить"}
    >
      {(state) => (
        <div className="space-y-3">
          <TextField label="Имя" name="name" state={state} defaultValue={client?.name} maxLength={120} autoComplete="off" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Телефон" name="phone" type="tel" state={state} defaultValue={client?.phone} placeholder="+7 (900) 000-00-00" required />
            <TextField label="Email" name="email" type="email" state={state} defaultValue={client?.email} placeholder="name@example.com" />
          </div>
          <Field label="Заметки" name="note" error={state.fields?.note}>
            <TextArea id="note" name="note" defaultValue={client?.note} maxLength={1000} placeholder="Предпочтения, аллергии…" />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}
