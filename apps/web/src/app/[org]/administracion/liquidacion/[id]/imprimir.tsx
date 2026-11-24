'use client';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Imprimir() {
  return (
    <Button variant="primary" onClick={() => window.print()} aria-label="Imprimir o guardar en PDF">
      <Printer size={16} /> Imprimir o PDF
    </Button>
  );
}
