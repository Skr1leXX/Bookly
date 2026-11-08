"use client";

import { deleteClient } from "@/lib/actions/clients";
import { FormDialog } from "@/components/shared/form-dialog";
import type { Client } from "@/types";

export function DeleteClientDialog({ client, redirectAfter = false, trigger }: { client: Client; redirectAfter?: boolean; trigger: React.ReactElement }) {
  return (
    <FormDialog
      trigger={trigger}
      title="Удалить клиента?"
      description={`${client.name} и вся история записей клиента будут удалены без возможности восстановления.`}
      action={deleteClient.bind(null, client.id, redirectAfter)}
      submitLabel="Удалить"
      destructive
    >
      {() => null}
    </FormDialog>
  );
}
