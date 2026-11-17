'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'ok' | 'bad' | 'info';
interface T {
  id: number;
  text: string;
  tone: Tone;
}
const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'bad' ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'bad' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto max-w-sm rounded-lg border px-3.5 py-2.5 text-[13px] font-medium',
              'animate-[toast-in_220ms_cubic-bezier(0.23,1,0.32,1)]',
              t.tone === 'bad' ? 'border-bad/25 bg-bad-soft text-bad' : t.tone === 'info' ? 'border-rule bg-raised text-ink' : 'border-ink bg-ink text-on-ink'
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </Ctx.Provider>
  );
}
