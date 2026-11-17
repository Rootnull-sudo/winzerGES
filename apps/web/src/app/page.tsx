import { redirect } from 'next/navigation';
import { getMemberships, getSession } from '@/lib/session';

export default async function Home() {
  const s = await getSession();
  if (!s) redirect('/login');
  const ms = await getMemberships(s.user.id);
  redirect(ms.length === 1 ? `/${ms[0]!.slug}` : '/onboarding');
}
