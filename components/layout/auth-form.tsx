"use client";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { AuthState } from "@/lib/actions/auth";

export interface AuthFieldDef { name: string; label: string; type?: string; autoComplete?: string; placeholder?: string }

export function AuthForm({ action, fields, submitLabel, initialError }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; fields: AuthFieldDef[]; submitLabel: string; initialError?: string }) {
  const [state, formAction, pending] = useActionState(action, initialError ? { error: initialError } : {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <div className="flex gap-2 rounded-md bg-red-500/10 p-3 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </div>
      )}
      {state.message && (
        <div className="flex gap-2 rounded-md bg-green-500/10 p-3 text-sm text-success" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {state.message}
        </div>
      )}
      {fields.map((f) => (
        <Field key={f.name} label={f.label} error={state.fieldErrors?.[f.name]}>
          <Input name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} placeholder={f.placeholder} required />
        </Field>
      ))}
      <Button type="submit" className="w-full" loading={pending}>{submitLabel}</Button>
    </form>
  );
}
