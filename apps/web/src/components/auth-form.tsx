'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { authClient } from '@/lib/auth-client';

export function AuthForm({ mode }: { mode: 'login' | 'registro' }) {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email')).trim();
    const password = String(f.get('password'));
    setBusy(true);
    setError(null);
    const res =
      mode === 'login'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(f.get('name')).trim() });
    setBusy(false);
    if (res.error) {
      const code = res.error.code ?? '';
      setError(
        res.error.status === 429
          ? 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'
          : code.includes('INVALID_EMAIL_OR_PASSWORD')
            ? 'Correo o contraseña incorrectos.'
            : code.includes('USER_ALREADY_EXISTS')
              ? 'Ya existe una cuenta con ese correo. Inicia sesión.'
              : code.includes('PASSWORD_TOO_SHORT')
                ? 'La contraseña debe tener al menos 8 caracteres.'
                : res.error.message || 'No se pudo continuar. Inténtalo de nuevo.'
      );
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <h1 className="font-label text-[28px] leading-tight">{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</h1>
      <p className="mt-1.5 text-[14px] text-ink-3">{mode === 'login' ? 'Entra a tus viñas.' : 'Después creas tu viña o aceptas una invitación.'}</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        {mode === 'registro' && (
          <Field label="Nombre" required>
            {(id) => <Input id={id} name="name" autoComplete="name" required />}
          </Field>
        )}
        <Field label="Correo" required>
          {(id) => <Input id={id} name="email" type="email" autoComplete="email" required />}
        </Field>
        <Field label="Contraseña" required hint={mode === 'registro' ? 'Mínimo 8 caracteres.' : undefined}>
          {(id, d) => (
            <Input
              id={id}
              name="password"
              type="password"
              minLength={8}
              aria-describedby={d}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy} className="mt-2 h-10">
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="mt-6 text-[13px] text-ink-3">
        {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
        <Link
          href={(mode === 'login' ? '/registro' : '/login') + (next !== '/' ? `?next=${encodeURIComponent(next)}` : '')}
          className="font-medium text-ink underline underline-offset-4"
        >
          {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
        </Link>
      </p>
    </>
  );
}
