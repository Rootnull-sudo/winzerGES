import { describe, expect, it } from 'vitest';
import { csvExistencias, estadoCumplimiento, libroExistencias, recordatoriosSag } from '../src/entities/cumplimiento';

describe('cumplimiento', () => {
  it('estado como v1: pendiente, sin vencimiento, vencido y por vencer según los días de aviso', () => {
    const hoy = '2026-11-24';
    expect(estadoCumplimiento({ estado: 'pendiente', vencimiento: '2020-01-01' }, hoy)).toBe('pendiente');
    expect(estadoCumplimiento({ estado: 'vigente', vencimiento: null }, hoy)).toBe('vigente');
    expect(estadoCumplimiento({ estado: 'vigente', vencimiento: '2026-11-23' }, hoy)).toBe('vencido');
    expect(estadoCumplimiento({ estado: 'vigente', vencimiento: '2026-12-01', avisoDias: 30 }, hoy)).toBe('por vencer');
    expect(estadoCumplimiento({ estado: 'vigente', vencimiento: '2027-01-31', avisoDias: 45 }, hoy)).toBe('vigente');
    expect(estadoCumplimiento({ estado: 'vigente', vencimiento: '2027-01-31', avisoDias: 70 }, hoy)).toBe('por vencer');
  });

  it('recordatorios SAG por fecha', () => {
    expect(recordatoriosSag('2027-01-10').existencias.activa).toBe(true);
    expect(recordatoriosSag('2027-01-20').existencias.activa).toBe(false);
    expect(recordatoriosSag('2027-06-15').cosecha.activa).toBe(true);
    expect(recordatoriosSag('2027-07-16').cosecha.activa).toBe(false);
  });

  it('libro de existencias: granel y producto terminado en litros, en CSV con ; y BOM', () => {
    const filas = libroExistencias(
      [{ estanque: 'E-01', lote: 'L-2026-SB', variedad: 'Sauvignon Blanc', tipo: 'blanco', anada: 2026, litros: 3810.4 }],
      [
        { lote: 'L-2026-CS', variedad: 'Cabernet Sauvignon', tipo: 'tinto', anada: 2026, formato: 'Botella 0,75 L', litrosFormato: 0.75, stock: 1440 },
        { lote: 'L-2026-CS', variedad: 'Cabernet Sauvignon', tipo: 'tinto', anada: 2026, formato: 'Magnum 1,5 L', litrosFormato: 1.5, stock: 0 }
      ]
    );
    expect(filas.map((f) => [f.ubicacion, f.estado, f.litros])).toEqual([
      ['E-01', 'Granel', 3810],
      ['Bodega PT', 'Envasado Botella 0,75 L (1.440 un)', 1080]
    ]);
    const csv = csvExistencias(filas);
    expect(csv.startsWith('﻿Ubicación;Lote;Variedad;Tipo;Añada;Estado;Litros\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
  });
});
