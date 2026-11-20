import { describe, expect, it } from 'vitest';
import { claveObjeto, MAX_BYTES_ADJUNTO, nombreSeguro, subidaInput } from '../src/entities/adjunto';

describe('adjuntos', () => {
  it('nombreSeguro quita rutas, tildes y caracteres raros', () => {
    expect(nombreSeguro('../../etc/passwd')).toBe('passwd');
    expect(nombreSeguro('C:\\docs\\Cartola Agosto (ñandú).pdf')).toBe('Cartola-Agosto-nandu-.pdf');
    expect(nombreSeguro('???')).toBe('archivo');
  });
  it('la clave siempre parte con la viña', () => {
    expect(claveObjeto('org1', 'cliente', 'c1', 'id1', 'a b.pdf')).toBe('org1/cliente/c1/id1-a-b.pdf');
  });
  it('valida entidad, tipo y tamaño', () => {
    const ok = { entidad: 'cliente', registroId: 'c1', nombre: 'x.pdf', mime: 'application/pdf', bytes: 1000 };
    expect(subidaInput.safeParse(ok).success).toBe(true);
    expect(subidaInput.safeParse({ ...ok, entidad: 'venta' }).success).toBe(false);
    expect(subidaInput.safeParse({ ...ok, mime: 'application/x-msdownload' }).success).toBe(false);
    expect(subidaInput.safeParse({ ...ok, bytes: MAX_BYTES_ADJUNTO + 1 }).success).toBe(false);
  });
});
