'use client';
/** Imprimir / PDF del dashboard (v1: "Exportar dashboard (PDF)" → window.print). */
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BotonImprimir() {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <Printer size={15} /> Imprimir
    </Button>
  );
}
