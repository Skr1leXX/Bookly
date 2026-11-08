"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/actions/util";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

interface FormDialogProps {
  title: string;
  description?: string;
  action: Action;
  /** Form body; receives the last action result to show field errors. */
  children: (state: ActionState) => React.ReactNode;
  submitLabel?: string;
  destructive?: boolean;
  /** Element that opens the dialog (rendered as the trigger itself). Omit when `open` is controlled. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** Modal form bound to a server action: pending state, general and per-field errors, closes itself on success. */
export function FormDialog({ trigger, open: controlled, onOpenChange, ...rest }: FormDialogProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInner(v));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className={cn("sm:max-w-lg", rest.className)}>
        {/* Mounted only while open, so every opening starts with a clean form and no stale errors. */}
        <DialogForm {...rest} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DialogForm({ title, description, action, children, submitLabel = "Сохранить", destructive, onDone }: Omit<FormDialogProps, "trigger" | "open" | "onOpenChange"> & { onDone: () => void }) {
  const [state, formAction, actionPending] = useActionState(action, {});
  const [transitioning, startTransition] = useTransition();
  const pending = actionPending || transitioning;
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    // onSubmit instead of action=: React 19 resets uncontrolled fields after a form action, wiping the input on a validation error.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      method="post" // never a GET: if submitted before hydration, field values must not end up in the URL
      className="flex flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children(state)}
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Подождите…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Label + control + inline error message. */
export function Field({ label, name, error, hint, children, className }: { label: string; name: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, name, state, ...input }: { label: string; name: string; state: ActionState } & React.ComponentProps<typeof Input>) {
  const error = state.fields?.[name];
  return (
    <Field label={label} name={name} error={error}>
      <Input id={name} name={name} aria-invalid={!!error} {...input} />
    </Field>
  );
}

const controlClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive";

/** Native <select>: works with FormData and is accessible out of the box. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(controlClass, "pr-7", className)} {...props} />;
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(controlClass, "h-auto min-h-20 py-2", className)} {...props} />;
}
