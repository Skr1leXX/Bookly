"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AuthField {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}

export function AuthForm({
  title,
  description,
  fields,
  action,
  submitLabel,
  footer,
}: {
  title: string;
  description: string;
  fields: AuthField[];
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  submitLabel: string;
  footer: { text: string; linkLabel: string; href: string };
}) {
  const [state, formAction, actionPending] = useActionState(action, {});
  const [transitioning, startTransition] = useTransition();
  const pending = actionPending || transitioning;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <Card className="border shadow-md shadow-primary/5 ring-0">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* onSubmit instead of action=: React 19 resets the fields after a form action, which would wipe the e-mail after a failed sign-in. */}
          <form
            method="post" // never a GET: if submitted before hydration, credentials must not end up in the URL
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              startTransition(() => formAction(data));
            }}
            className="space-y-4"
          >
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input id={f.name} name={f.name} type={f.type} autoComplete={f.autoComplete} placeholder={f.placeholder} required />
              </div>
            ))}
            {state.error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            {state.message && (
              <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {state.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Подождите…" : submitLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {footer.text}{" "}
        <Link href={footer.href} className="font-medium text-primary hover:underline">
          {footer.linkLabel}
        </Link>
      </p>
    </div>
  );
}
