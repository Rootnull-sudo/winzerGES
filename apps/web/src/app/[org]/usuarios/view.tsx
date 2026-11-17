'use client';
import { Check, Copy, UserPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { inviteAction, setRoleAction } from './actions';

interface Member {
  userId: string;
  nombre: string;
  email: string;
  role: string;
  estado: string;
  desde: string;
}
interface Inv {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}
interface Role {
  id: string;
  nombre: string;
  descripcion: string;
}

export function UsuariosView({ members, invitations, roles, me }: { members: Member[]; invitations: Inv[]; roles: Role[]; me: string }) {
  const can = useCan();
  const { org } = useOrg();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [pending, start] = useTransition();
  const roleName = (id: string) => roles.find((r) => r.id === id)?.nombre ?? id;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-label text-[20px]">
          Miembros <span className="tabular text-ink-4">{members.length}</span>
        </h2>
        {can('usuarios', 'c') && (
          <Button variant="primary" onClick={() => setInviting(true)}>
            <UserPlus size={16} /> Invitar
          </Button>
        )}
      </div>
      <ul className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-raised">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-ink-2">
              {m.nombre
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {m.nombre} {m.userId === me && <span className="text-ink-4">(tú)</span>}
              </span>
              <span className="block truncate text-[13px] text-ink-3">{m.email}</span>
            </span>
            {can('usuarios', 'e') && m.userId !== me ? (
              <Select
                aria-label={`Rol de ${m.nombre}`}
                className="w-auto min-w-48"
                defaultValue={m.role}
                disabled={pending}
                onChange={(e) => {
                  const role = e.target.value;
                  start(async () => {
                    const r = await setRoleAction(org.slug, m.userId, role);
                    toast(r.error ?? `${m.nombre} ahora es ${roleName(role)}.`, r.error ? 'bad' : 'ok');
                  });
                }}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </Select>
            ) : (
              <Badge>{roleName(m.role)}</Badge>
            )}
          </li>
        ))}
      </ul>

      {invitations.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 font-label text-[20px]">Invitaciones pendientes</h2>
          <ul className="divide-y divide-rule rounded-card border border-rule bg-raised">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
                <span className="flex-1">{i.email}</span>
                <Badge tone="info">{roleName(i.role)}</Badge>
                <span className="text-[12px] text-ink-3">vence {new Date(i.expiresAt).toLocaleDateString('es-CL')}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 mb-3 font-label text-[20px]">Roles</h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {roles.map((r) => (
          <div key={r.id} className="border-t border-rule pt-3">
            <dt className="font-medium">{r.nombre}</dt>
            <dd className="text-[13px] text-ink-3">{r.descripcion}</dd>
          </div>
        ))}
      </dl>

      {inviting && <InviteDialog roles={roles} onClose={() => setInviting(false)} />}
    </>
  );
}

function InviteDialog({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const { org } = useOrg();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState('enologo');
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    start(async () => {
      const r = await inviteAction(org.slug, email, role);
      if (r.error) setError(r.error);
      else setLink(r.link!);
    });
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Invitar a la viña"
      description="Se genera un enlace personal válido por 7 días. Envíalo por correo o WhatsApp."
      footer={
        link ? (
          <Button variant="primary" onClick={onClose}>
            Listo
          </Button>
        ) : (
          <>
            <Button type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="invite-form" variant="primary" disabled={pending}>
              {pending ? 'Generando…' : 'Generar enlace'}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px]">Comparte este enlace. Solo funciona con el correo invitado.</p>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12px]" />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
              aria-label="Copiar enlace"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Correo" required>
            {(id) => <Input id={id} name="email" type="email" required autoFocus />}
          </Field>
          <Field label="Rol" hint={roles.find((r) => r.id === role)?.descripcion}>
            {(id, d) => (
              <Select id={id} value={role} onChange={(e) => setRole(e.target.value)} aria-describedby={d}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {error && (
            <p role="alert" className="text-[13px] text-bad">
              {error}
            </p>
          )}
        </form>
      )}
    </Dialog>
  );
}
