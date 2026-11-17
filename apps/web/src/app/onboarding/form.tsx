'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { createOrgAction } from '../actions';

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(createOrgAction, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre de la viña" required className="sm:col-span-2">
        {(id) => <Input id={id} name="nombre" placeholder="Viña Los Robles" required />}
      </Field>
      <Field label="Razón social">{(id) => <Input id={id} name="razonSocial" />}</Field>
      <Field label="RUT empresa">{(id) => <Input id={id} name="rut" placeholder="76.123.456-0" />}</Field>
      {state?.error && (
        <p role="alert" className="text-[13px] text-bad sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button variant="primary" disabled={pending}>
          {pending ? 'Creando…' : 'Crear viña'}
        </Button>
      </div>
    </form>
  );
}
