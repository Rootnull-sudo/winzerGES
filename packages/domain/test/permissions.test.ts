import { describe, expect, it } from 'vitest';
import { assertCan, can, PermissionError, ROLES } from '../src/permissions';
import { isOfflineModule, MODULES } from '../src/modules';
import { clienteInput, cuartelInput, rutValid } from '../src';
import { loadLegacy } from './legacy';

describe('permisos — paridad con v1', () => {
  const VG = loadLegacy(['js/auth/permissions.js']);
  VG.db.get = () => null;

  it('mismos roles y mismos permisos por módulo', () => {
    for (const id of Object.keys(VG.permissions.ROLES)) {
      for (const mod of VG.permissions.MODULES)
        for (const a of 'vcedx') expect(can(id, mod, a as 'v'), `${id} ${mod} ${a}`).toBe(VG.permissions.check(id, mod, a));
    }
    expect(Object.keys(ROLES).sort()).toEqual(Object.keys(VG.permissions.ROLES).sort());
  });

  it('roles personalizados y errores', () => {
    const custom = [{ id: 'bodeguero', nombre: 'Bodeguero', descripcion: '', permisos: { bodega: 'vc' } }];
    expect(can('bodeguero', 'bodega', 'c', custom)).toBe(true);
    expect(can('bodeguero', 'bodega', 'd', custom)).toBe(false);
    expect(can('inexistente', 'bodega')).toBe(false);
    expect(() => assertCan('ventas', 'catastro', 'e', 'cuarteles')).toThrow(PermissionError);
  });

  it('módulos offline = áreas Operación, Bodega y Administración', () => {
    expect(isOfflineModule('catastro')).toBe(true);
    expect(isOfflineModule('fermentacion')).toBe(true);
    expect(isOfflineModule('usuarios')).toBe(true);
    expect(isOfflineModule('clientes')).toBe(false);
    expect(isOfflineModule('tributario')).toBe(false);
    expect(MODULES).toHaveLength(27);
  });
});

describe('esquemas', () => {
  it('RUT', () => {
    expect(rutValid('76.888.999-0')).toBe(VGrut('76.888.999-0'));
    expect(rutValid('66.666.666-6')).toBe(true);
    expect(rutValid('12.345.678-0')).toBe(false);
  });
  it('cliente: formatea RUT y rechaza inválidos', () => {
    const ok = clienteInput.parse({ nombre: 'Vinoteca', rut: '666666666', tipo: 'Persona' });
    expect(ok.rut).toBe('66.666.666-6');
    expect(ok.plazo).toBe(30);
    expect(clienteInput.safeParse({ nombre: 'X', rut: '1-1', tipo: 'Empresa' }).success).toBe(false);
  });
  it('cuartel: calcula plantas desde densidad', () => {
    const c = cuartelInput.parse({ codigo: 'C-09', variedad: 'Syrah', tipo: 'tinto', superficie: '2,5', densidad: 4000 });
    expect(c.superficie).toBe(2.5);
    expect(c.plantas).toBe(10000);
    expect(cuartelInput.safeParse({ codigo: '', variedad: 'Syrah', tipo: 'tinto', superficie: 0 }).success).toBe(false);
  });
});

function VGrut(r: string) {
  return loadLegacy([]).utils.rutValid(r);
}
