'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import type { Result } from './actions';

export interface ProveedorRow {
  id: string;
  version: number;
  demo: boolean;
  nombre: string;
  rut: string;
  categoria: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  condiciones: string | null;
  plazo: number;
}

export const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

/** Ejecuta una Server Action: toast y refresh si va bien; errores generales y por campo si no. */
export function useSubmit(onDone: () => void) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<Result>, ok: string) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast(ok);
        onDone();
        router.refresh();
      } else {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }
  return { pending, errors, error, run };
}

export function ErrorForm({ error, className }: { error: string | null; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={`rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad ${className ?? ''}`}>
      {error}
    </p>
  );
}
