'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { acceptInvitationAction } from '../../actions';

export function AcceptButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState(() => acceptInvitationAction(token), undefined);
  return (
    <form action={action}>
      <Button variant="primary" disabled={pending}>
        {pending ? 'Uniéndote…' : 'Aceptar invitación'}
      </Button>
      {state?.error && (
        <p role="alert" className="mt-3 text-[13px] text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
