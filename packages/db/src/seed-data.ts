import { rutClean, rutDV, rutFormat } from '@winzer/domain';

/** En v1 el seed recalculaba el dígito verificador (rutOk); aquí igual. */
const rutOk = (r: string) => {
  const c = rutClean(r).slice(0, -1);
  return rutFormat(c + rutDV(c));
};

/** Subconjunto del demo de v1 (js/data/seed.js) para las entidades ya migradas. */
export const demoDump = {
  app: 'vina-gestion',
  data: {
    cuartel: [
      {
        id: 'cua_c1',
        codigo: 'C-01',
        variedad: 'Sauvignon Blanc',
        tipo: 'blanco',
        superficie: 2.5,
        anioPlantacion: 2008,
        patron: 'Franco',
        conduccion: 'Espaldera VSP',
        densidad: 4000,
        plantas: 10000,
        cajonesEstimados: 1150,
        estadoSanitario: 'Bueno',
        sector: 'Sector Norte',
        valle: 'Colchagua',
        costoPlantacion: 22000000
      },
      {
        id: 'cua_c2',
        codigo: 'C-02',
        variedad: 'Cabernet Sauvignon',
        tipo: 'tinto',
        superficie: 3.2,
        anioPlantacion: 2003,
        patron: '1103 Paulsen',
        conduccion: 'Espaldera VSP',
        densidad: 3500,
        plantas: 11200,
        cajonesEstimados: 1350,
        estadoSanitario: 'Bueno',
        sector: 'Sector Ladera',
        valle: 'Colchagua',
        costoPlantacion: 26000000
      },
      {
        id: 'cua_c3',
        codigo: 'C-03',
        variedad: 'Carménère',
        tipo: 'tinto',
        superficie: 2.0,
        anioPlantacion: 2012,
        patron: 'Franco',
        conduccion: 'Espaldera VSP',
        densidad: 3800,
        plantas: 7600,
        cajonesEstimados: 800,
        estadoSanitario: 'Regular (oídio controlado)',
        sector: 'Sector Sur',
        valle: 'Colchagua',
        costoPlantacion: 18000000
      }
    ].map((r) => ({ ...r, _v: 2, _demo: true })),
    cliente: [
      {
        id: 'cli_dist',
        nombre: 'Distribuidora Andes SpA',
        rut: '76.888.999-0',
        tipo: 'Empresa',
        giro: 'Distribución de bebidas',
        contacto: 'Luis Andrade',
        email: 'compras@andes-demo.cl',
        direccion: 'Av. Las Industrias 1200',
        comuna: 'Rancagua',
        canal: 'distribuidor',
        condiciones: '30 días',
        plazo: 30
      },
      {
        id: 'cli_rest',
        nombre: 'Restaurante El Parrón Ltda.',
        rut: '77.999.111-0',
        tipo: 'Empresa',
        giro: 'Restaurante',
        contacto: 'Sofía Díaz',
        direccion: 'Calle Comercio 455',
        comuna: 'Santa Cruz',
        canal: 'restaurante',
        condiciones: '15 días',
        plazo: 15
      },
      {
        id: 'cli_vino',
        nombre: 'Vinoteca Santiago Ltda.',
        rut: '76.111.333-0',
        tipo: 'Empresa',
        giro: 'Venta de vinos',
        contacto: 'Ignacio Vera',
        direccion: 'Av. Providencia 2100',
        comuna: 'Providencia',
        canal: 'distribuidor',
        condiciones: '30 días',
        plazo: 30
      },
      {
        id: 'cli_part',
        nombre: 'Ventas en sala (consumidor final)',
        rut: '66.666.666-6',
        tipo: 'Persona',
        giro: '',
        canal: 'directa',
        condiciones: 'Contado',
        plazo: 0
      },
      { id: 'cli_web', nombre: 'Tienda online (consumidor final)', rut: '66.666.666-6', tipo: 'Persona', canal: 'ecommerce', condiciones: 'Contado', plazo: 0 },
      {
        id: 'cli_gran',
        nombre: 'Bodega Granel Curicó S.A.',
        rut: '96.222.444-0',
        tipo: 'Empresa',
        giro: 'Elaboración de vinos',
        contacto: 'Pedro Castro',
        direccion: 'Ruta 5 Sur km 190',
        comuna: 'Curicó',
        canal: 'granel',
        condiciones: '30 días',
        plazo: 30
      }
    ].map((r) => ({ ...r, rut: r.rut === '66.666.666-6' ? r.rut : rutOk(r.rut), _demo: true })),
    cobro: [
      { id: 'cob_1', fecha: '2026-10-10', clienteId: 'cli_dist', monto: 1395000, medio: 'transferencia', _demo: true },
      { id: 'cob_2', fecha: '2026-11-02', clienteId: 'cli_rest', monto: 418500, medio: 'transferencia', _demo: true }
    ]
  }
};
