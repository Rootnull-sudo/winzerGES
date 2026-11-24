import { rutClean, rutDV, rutFormat } from '@winzer/domain';

/** Fecha ISO `base` + n días (para las curvas de demo). */
const dia = (base: string, n: number) => new Date(Date.parse(`${base}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** En v1 el seed recalculaba el dígito verificador (rutOk); aquí igual. */
const rutOk = (r: string) => {
  const c = rutClean(r).slice(0, -1);
  return rutFormat(c + rutDV(c));
};

/** Subconjunto del demo de v1 (js/data/seed.js) para las entidades ya migradas, más datos ficticios de viñedo (F1). */
export const demoDump = {
  app: 'vina-gestion',
  data: {
    // Emisor de DTE (v1: config.empresa) con datos ficticios, y folios autorizados de prueba (F6-1).
    config: [
      {
        id: 'main',
        empresa: {
          giro: 'Elaboración de vinos',
          acteco: '110200',
          direccion: 'Camino Los Robles km 4',
          comuna: 'Santa Cruz',
          resolucionSII: { numero: '80', fecha: '2014-08-22' },
          certificadoVence: '2027-09-30'
        }
      }
    ],
    caf: [
      { id: 'caf_33', tipo: 33, desde: 1, hasta: 200, fechaAutorizacion: '2026-01-15', _demo: true },
      { id: 'caf_39', tipo: 39, desde: 1, hasta: 500, fechaAutorizacion: '2026-01-15', _demo: true },
      { id: 'caf_61', tipo: 61, desde: 1, hasta: 100, fechaAutorizacion: '2026-01-15', _demo: true }
    ],
    // F29 de septiembre pagado y octubre declarado (sin foto: se calculan al importar) y obligaciones cumplidas (F6-2).
    f29: [
      { id: 'f29_d09', periodo: '2026-09', estado: 'pagado', folioSII: '7700000101', fechaPago: '2026-10-20', _demo: true },
      { id: 'f29_d10', periodo: '2026-10', estado: 'declarado', folioSII: '7700000102', _demo: true }
    ],
    obligacion: [
      { id: 'obl_d1', key: 'CONTRIB-2026-3ª', estado: 'cumplida', fecha: '2026-09-28', _demo: true },
      { id: 'obl_d2', key: 'PATALC-2026-2ª cuota', estado: 'cumplida', fecha: '2026-07-25', _demo: true }
    ],
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
      // Cobro total de la venta 1 y abono parcial de la venta 2 (aplicados a la venta: F5-4).
      { id: 'cob_1', fecha: '2026-10-10', clienteId: 'cli_dist', ventaId: 'ven_d1', monto: 3766500, medio: 'transferencia', _demo: true },
      { id: 'cob_2', fecha: '2026-11-02', clienteId: 'cli_rest', ventaId: 'ven_d2', monto: 1000000, medio: 'transferencia', _demo: true }
    ],
    // --- Viñedo (F1): datos ficticios de dos temporadas (2026 y 2027) ---
    proveedor: [
      {
        id: 'prv_vidrio',
        nombre: 'Envases del Valle Demo SpA',
        rut: '76.111.222-8',
        categoria: 'Envases vidrio',
        contacto: 'Mesa de ventas',
        telefono: '+56 9 0000 0001',
        condiciones: '30 días',
        plazo: 30,
        _demo: true
      },
      {
        id: 'prv_agro',
        nombre: 'Agroinsumos Demo Ltda.',
        rut: '76.333.444-9',
        categoria: 'Insumos agrícolas',
        contacto: 'Vendedor zona',
        condiciones: 'Contado',
        plazo: 0,
        _demo: true
      },
      { id: 'prv_eno', nombre: 'Enología Demo S.A.', rut: '76.555.666-K', categoria: 'Insumos enológicos', condiciones: '45 días', plazo: 45, _demo: true },
      { id: 'prv_etq', nombre: 'Etiquetas Demo SpA', rut: '76.777.888-0', categoria: 'Etiquetas', condiciones: '30 días', plazo: 30, _demo: true },
      { id: 'prv_luz', nombre: 'Eléctrica Demo S.A.', rut: '76.999.000-3', categoria: 'Servicios básicos', condiciones: 'Mensual', plazo: 20, _demo: true }
    ],
    insumo: [
      {
        id: 'ins_azufre',
        proveedorId: 'prv_agro',
        nombre: 'Azufre mojable',
        categoria: 'agricola',
        tipo: 'Fungicida',
        unidad: 'kg',
        precio: 1850,
        stockInicial: 200,
        stockMinimo: 50,
        carencia: 7,
        _demo: true
      },
      {
        id: 'ins_cobre',
        proveedorId: 'prv_agro',
        nombre: 'Oxicloruro de cobre',
        categoria: 'agricola',
        tipo: 'Fungicida',
        unidad: 'kg',
        precio: 5200,
        stockInicial: 40,
        stockMinimo: 20,
        carencia: 14,
        vencimiento: '2027-03-31',
        _demo: true
      },
      {
        id: 'ins_urea',
        proveedorId: 'prv_agro',
        nombre: 'Urea',
        categoria: 'agricola',
        tipo: 'Fertilizante',
        unidad: 'kg',
        precio: 780,
        stockInicial: 500,
        npk: '46-0-0',
        _demo: true
      },
      {
        id: 'ins_mbk',
        proveedorId: 'prv_eno',
        nombre: 'Metabisulfito de potasio',
        categoria: 'enologico',
        tipo: 'Sulfitante',
        unidad: 'kg',
        precio: 6500,
        stockInicial: 25,
        quimico: 'K2S2O5',
        so2Pct: 57,
        _demo: true
      },
      {
        id: 'ins_levadura',
        proveedorId: 'prv_eno',
        nombre: 'Levadura seca activa',
        categoria: 'enologico',
        tipo: 'Levadura',
        unidad: 'kg',
        precio: 98000,
        stockInicial: 2,
        vencimiento: '2027-01-15',
        _demo: true
      },
      { id: 'ins_bento', nombre: 'Bentonita sódica', categoria: 'enologico', tipo: 'Clarificante', unidad: 'kg', precio: 4200, stockInicial: 50, _demo: true },
      {
        id: 'ins_corcho',
        nombre: 'Corcho natural 45 mm',
        categoria: 'envasado',
        tipo: 'Cierre',
        unidad: 'un',
        precio: 170,
        stockInicial: 6000,
        stockMinimo: 2000,
        _demo: true
      },
      {
        id: 'ins_capsula',
        nombre: 'Cápsula de estaño',
        categoria: 'envasado',
        tipo: 'Cápsula',
        unidad: 'un',
        precio: 65,
        stockInicial: 6000,
        stockMinimo: 2000,
        _demo: true
      },
      {
        id: 'ins_caja',
        nombre: 'Caja de cartón 12 botellas',
        categoria: 'envasado',
        tipo: 'Caja',
        unidad: 'un',
        precio: 980,
        stockInicial: 500,
        stockMinimo: 150,
        _demo: true
      },
      {
        id: 'ins_etq_sb',
        nombre: 'Etiqueta Reserva Sauvignon Blanc',
        categoria: 'etiquetado',
        tipo: 'Etiqueta',
        unidad: 'un',
        precio: 92,
        proveedorId: 'prv_etq',
        stockInicial: 5000,
        stockMinimo: 1500,
        _demo: true
      },
      {
        id: 'ins_botella',
        proveedorId: 'prv_vidrio',
        nombre: 'Botella Bordelesa 750 mL',
        categoria: 'envasado',
        tipo: 'Envase vidrio',
        unidad: 'un',
        precio: 420,
        stockInicial: 6000,
        stockMinimo: 2000,
        plazoEntrega: 15,
        _demo: true
      }
    ],
    fermentacion: [
      {
        id: 'fer_d1',
        codigo: 'FA-L-2026-SB',
        loteId: 'lot_d1',
        estanqueId: 'est_d1',
        tipo: 'blanco',
        variedad: 'Sauvignon Blanc',
        volumen: 2750,
        brixInicial: 22.5,
        phInicial: 3.28,
        acidezInicial: 7.1,
        levadura: 'Levadura seca activa',
        temperaturaObjetivo: '14–16 °C',
        diasPlanificados: 18,
        fechaMolienda: '2026-03-11',
        inicioFA: '2026-03-12',
        inicioTumultuosa: '2026-03-14',
        finFA: '2026-03-30',
        alcoholFinal: 13.2,
        azucarResidual: 2.1,
        estado: 'cerrada',
        _demo: true
      },
      {
        id: 'fer_d2',
        codigo: 'FA-L-2026-CS',
        loteId: 'lot_d2',
        estanqueId: 'est_d2',
        tipo: 'tinto',
        variedad: 'Cabernet Sauvignon',
        volumen: 4150,
        brixInicial: 24.6,
        phInicial: 3.55,
        acidezInicial: 5.9,
        levadura: 'Levadura seca activa',
        temperaturaObjetivo: '26–28 °C',
        diasPlanificados: 10,
        fechaMolienda: '2026-03-26',
        inicioFA: '2026-03-27',
        inicioTumultuosa: '2026-03-28',
        finFA: '2026-04-08',
        inicioMaceracion: '2026-03-27',
        finMaceracion: '2026-04-15',
        inicioFML: '2026-04-21',
        finFML: '2026-05-20',
        alcoholFinal: 14.1,
        azucarResidual: 1.6,
        estado: 'cerrada',
        _demo: true
      }
    ],
    seguimiento: [
      ...[24.6, 22.1, 18.4, 14.2, 10.1, 6.3, 3.0, 0.4, -1.2].map((brix, i) => ({
        id: `seg_d2_${i}`,
        fermentacionId: 'fer_d2',
        fecha: dia('2026-03-27', i),
        brix,
        temperatura: 24 + (i % 3) * 2,
        so2Libre: i === 8 ? 18 : null,
        responsable: 'Enólogo',
        _demo: true
      })),
      ...[22.5, 20.2, 16.8, 12.9, 8.7, 4.4, 1.1, -1.0].map((brix, i) => ({
        id: `seg_d1_${i}`,
        fermentacionId: 'fer_d1',
        fecha: dia('2026-03-12', i * 2),
        brix,
        temperatura: 15 + (i % 2),
        responsable: 'Enólogo',
        _demo: true
      }))
    ],
    adicionSO2: [
      {
        id: 'so2_d1',
        fermentacionId: 'fer_d2',
        fecha: '2026-04-10',
        insumoId: 'ins_mbk',
        producto: 'Metabisulfito de potasio',
        fraccion: 0.57,
        gramos: 110,
        volumen: 4100,
        so2Previo: 18,
        so2Medido: 32,
        modo: 'suave',
        motivo: 'Post FA',
        costo: 715,
        _demo: true
      }
    ],
    analisis: [
      {
        id: 'ana_d1',
        fecha: '2026-04-02',
        loteId: 'lot_d1',
        laboratorio: 'Laboratorio Enológico Demo',
        autorizadoSAG: true,
        ph: 3.3,
        acidezTotal: 6.7,
        acidezVolatil: 0.31,
        so2Libre: 26,
        so2Total: 80,
        alcohol: 13.1,
        azucarResidual: 1.8,
        densidad: 991.8,
        _demo: true
      },
      {
        id: 'ana_d2',
        fecha: '2026-07-28',
        loteId: 'lot_d1',
        laboratorio: 'Laboratorio Enológico Demo',
        autorizadoSAG: true,
        ph: 3.32,
        acidezTotal: 6.5,
        acidezVolatil: 0.34,
        so2Libre: 32,
        so2Total: 104,
        alcohol: 13.1,
        azucarResidual: 1.8,
        turbidez: 0.9,
        densidad: 991.9,
        color: 'Amarillo verdoso brillante',
        certificadoDO: true,
        _demo: true
      },
      {
        id: 'ana_d3',
        fecha: '2026-05-25',
        loteId: 'lot_d2',
        laboratorio: 'Laboratorio Enológico Demo',
        autorizadoSAG: true,
        ph: 3.66,
        acidezTotal: 5.6,
        acidezVolatil: 0.48,
        so2Libre: 24,
        so2Total: 75,
        alcohol: 14.4,
        azucarResidual: 1.5,
        densidad: 993.6,
        color: 'Rojo violáceo profundo',
        _demo: true
      },
      {
        id: 'ana_d4',
        fecha: '2026-08-20',
        loteId: 'lot_d2',
        laboratorio: 'Laboratorio interno',
        autorizadoSAG: false,
        ph: 3.84,
        acidezTotal: 5.3,
        acidezVolatil: 0.61,
        so2Libre: 18,
        so2Total: 70,
        alcohol: 14.6,
        azucarResidual: 2.1,
        densidad: 994,
        _demo: true
      }
    ],
    aditivo: [
      {
        id: 'adi_d1',
        fecha: '2026-03-12',
        loteId: 'lot_d1',
        estanqueId: 'est_d1',
        tipo: 'bentonita',
        insumoId: 'ins_bento',
        volumen: 2750,
        dosis: 40,
        cantidad: 1.1,
        costo: 4620,
        objetivo: 'Estabilidad proteica',
        _demo: true
      },
      {
        id: 'adi_d2',
        fecha: '2026-03-27',
        loteId: 'lot_d2',
        estanqueId: 'est_d2',
        tipo: 'levadura',
        insumoId: 'ins_levadura',
        volumen: 4150,
        dosis: 25,
        cantidad: 1.0375,
        costo: 101675,
        objetivo: 'Inoculación',
        _demo: true
      }
    ],
    // Formato v1: una línea por compra (las de varias líneas se registran en v2). Los movimientos y precios los
    // genera registrarCompra al importar.
    compra: [
      {
        id: 'com_d1',
        fecha: '2026-09-01',
        proveedorId: 'prv_eno',
        documento: 'factura',
        folio: '5101',
        insumoId: 'ins_mbk',
        descripcion: 'Metabisulfito de potasio',
        cantidad: 10,
        precioUnitario: 6500,
        exento: 0,
        vencimiento: '2026-10-16',
        estadoPago: 'pagado',
        fechaPago: '2026-10-10',
        _demo: true
      },
      {
        id: 'com_d2',
        fecha: '2026-10-05',
        proveedorId: 'prv_vidrio',
        documento: 'factura',
        folio: '8801',
        insumoId: 'ins_botella',
        descripcion: 'Botella Bordelesa 750 mL',
        cantidad: 6000,
        precioUnitario: 420,
        exento: 0,
        vencimiento: '2026-11-04',
        estadoPago: 'pendiente',
        _demo: true
      },
      {
        id: 'com_d3',
        fecha: '2026-10-20',
        proveedorId: 'prv_agro',
        documento: 'factura',
        folio: '3301',
        insumoId: 'ins_azufre',
        descripcion: 'Azufre mojable',
        cantidad: 100,
        precioUnitario: 1900,
        exento: 0,
        vencimiento: '2026-10-20',
        estadoPago: 'pagado',
        fechaPago: '2026-10-20',
        _demo: true
      },
      {
        id: 'com_d4',
        fecha: '2026-11-10',
        proveedorId: 'prv_etq',
        documento: 'factura',
        folio: '1201',
        descripcion: 'Impresión de etiquetas Reserva',
        cantidad: 1,
        precioUnitario: 850000,
        exento: 0,
        vencimiento: '2026-12-10',
        estadoPago: 'pendiente',
        _demo: true
      },
      {
        id: 'com_d5',
        fecha: '2026-11-15',
        proveedorId: 'prv_eno',
        documento: 'factura',
        folio: '5140',
        insumoId: 'ins_levadura',
        descripcion: 'Levadura seca activa',
        cantidad: 2,
        precioUnitario: 99000,
        exento: 0,
        vencimiento: '2026-12-30',
        estadoPago: 'pendiente',
        _demo: true
      }
    ],
    // Pago parcial de la factura de etiquetas; las compras "pagado" sin pago reciben uno al importar.
    pago: [{ id: 'pag_d1', fecha: '2026-11-18', proveedorId: 'prv_etq', compraId: 'com_d4', monto: 500000, medio: 'transferencia', _demo: true }],
    gasto: [
      {
        id: 'gas_d1',
        fecha: '2026-07-08',
        categoria: 'servicios',
        descripcion: 'Electricidad bodega julio',
        monto: 480000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'variable',
        area: 'produccion',
        proveedorId: 'prv_luz',
        folio: '7701',
        _demo: true
      },
      {
        id: 'gas_d2',
        fecha: '2026-08-08',
        categoria: 'servicios',
        descripcion: 'Electricidad bodega agosto',
        monto: 455000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'variable',
        area: 'produccion',
        proveedorId: 'prv_luz',
        folio: '7742',
        _demo: true
      },
      {
        id: 'gas_d3',
        fecha: '2026-09-08',
        categoria: 'servicios',
        descripcion: 'Electricidad bodega septiembre',
        monto: 470000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'variable',
        area: 'produccion',
        proveedorId: 'prv_luz',
        folio: '7790',
        _demo: true
      },
      {
        id: 'gas_d4',
        fecha: '2026-10-08',
        categoria: 'servicios',
        descripcion: 'Electricidad bodega octubre',
        monto: 510000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'variable',
        area: 'produccion',
        proveedorId: 'prv_luz',
        folio: '7833',
        _demo: true
      },
      {
        id: 'gas_d5',
        fecha: '2026-11-08',
        categoria: 'servicios',
        descripcion: 'Electricidad bodega noviembre',
        monto: 530000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pendiente',
        tipoCosto: 'variable',
        area: 'produccion',
        proveedorId: 'prv_luz',
        folio: '7871',
        _demo: true
      },
      {
        id: 'gas_d6',
        fecha: '2026-07-15',
        categoria: 'seguros',
        descripcion: 'Seguro de incendio bodega',
        monto: 1200000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'fijo',
        area: 'admin',
        _demo: true
      },
      {
        id: 'gas_d7',
        fecha: '2026-08-20',
        categoria: 'marketing',
        descripcion: 'Feria de vinos regional',
        monto: 850000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'variable',
        area: 'ventas',
        _demo: true
      },
      {
        id: 'gas_d8',
        fecha: '2026-09-30',
        categoria: 'mantencion',
        descripcion: 'Mantención prensa neumática',
        monto: 640000,
        documento: 'factura',
        afectoIVA: true,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'fijo',
        area: 'produccion',
        _demo: true
      },
      {
        id: 'gas_d9',
        fecha: '2026-10-05',
        categoria: 'combustible',
        descripcion: 'Petróleo tractor',
        monto: 180000,
        documento: 'boleta',
        afectoIVA: false,
        medioPago: 'tarjeta',
        estado: 'pagado',
        tipoCosto: 'variable',
        area: 'produccion',
        _demo: true
      },
      {
        id: 'gas_d10',
        fecha: '2026-11-02',
        categoria: 'patentes',
        descripcion: 'Patente de alcoholes segundo semestre',
        monto: 320000,
        documento: 'otro',
        afectoIVA: false,
        medioPago: 'transferencia',
        estado: 'pagado',
        tipoCosto: 'fijo',
        area: 'admin',
        _demo: true
      }
    ],
    presupuesto: [
      { id: 'pre_d1', anio: 2026, categoria: 'servicios', monto: 6000000, _demo: true },
      { id: 'pre_d2', anio: 2026, categoria: 'seguros', monto: 1500000, _demo: true },
      { id: 'pre_d3', anio: 2026, categoria: 'marketing', monto: 2000000, _demo: true },
      { id: 'pre_d4', anio: 2026, categoria: 'mantencion', monto: 1200000, _demo: true },
      { id: 'pre_d5', anio: 2026, categoria: 'combustible', monto: 1800000, _demo: true },
      { id: 'pre_d6', anio: 2026, categoria: 'patentes', monto: 650000, _demo: true },
      { id: 'pre_d7', anio: 2026, categoria: 'profesionales', monto: 2400000, _demo: true }
    ],
    activo: [
      { id: 'act_d1', nombre: 'Prensa neumática 50 hL', valor: 18000000, vidaUtil: 10, fechaCompra: '2018-02-01', _demo: true },
      { id: 'act_d2', nombre: 'Equipo de frío 30 kW', valor: 12500000, vidaUtil: 12, fechaCompra: '2021-09-15', _demo: true },
      { id: 'act_d3', nombre: 'Bomba de trasiego', valor: 2400000, vidaUtil: 5, fechaCompra: '2019-03-01', _demo: true }
    ],
    trabajador: [
      {
        id: 'tra_d1',
        nombre: 'Trabajador Demo Uno',
        rut: '15.111.222-6',
        cargo: 'Bodeguero',
        area: 'produccion',
        contrato: 'indefinido',
        ingreso: '2022-03-01',
        sueldoBase: 750000,
        gratificacion: 'art50',
        colacion: 60000,
        movilizacion: 40000,
        afp: 'Modelo',
        salud: 'Fonasa',
        vacacionesPendientes: 8,
        _demo: true
      },
      {
        id: 'tra_d2',
        nombre: 'Trabajadora Demo Dos',
        rut: '16.333.444-5',
        cargo: 'Enóloga asistente',
        area: 'produccion',
        contrato: 'plazo_fijo',
        ingreso: '2026-03-01',
        sueldoBase: 1400000,
        gratificacion: 'art50',
        afp: 'Habitat',
        salud: 'Isapre',
        planSalud: 180000,
        _demo: true
      },
      {
        id: 'tra_d3',
        nombre: 'Trabajador Demo Tres',
        rut: '17.555.666-4',
        cargo: 'Vendedor',
        area: 'ventas',
        contrato: 'indefinido',
        ingreso: '2026-11-16',
        sueldoBase: 650000,
        gratificacion: 'art50',
        comisiones: 80000,
        afp: 'Uno',
        salud: 'Fonasa',
        _demo: true
      }
    ],
    // Sin montos: el importador los calcula con los indicadores de cada mes.
    remuneracion: [
      { id: 'rem_tra_d1_2026-09', trabajadorId: 'tra_d1', periodo: '2026-09', estado: 'pagada', fechaPago: '2026-09-30', _demo: true },
      { id: 'rem_tra_d2_2026-09', trabajadorId: 'tra_d2', periodo: '2026-09', estado: 'pagada', fechaPago: '2026-09-30', _demo: true },
      { id: 'rem_tra_d1_2026-10', trabajadorId: 'tra_d1', periodo: '2026-10', estado: 'pagada', fechaPago: '2026-10-30', _demo: true },
      { id: 'rem_tra_d2_2026-10', trabajadorId: 'tra_d2', periodo: '2026-10', estado: 'pagada', fechaPago: '2026-10-30', _demo: true },
      { id: 'rem_tra_d1_2026-11', trabajadorId: 'tra_d1', periodo: '2026-11', estado: 'calculada', _demo: true },
      { id: 'rem_tra_d2_2026-11', trabajadorId: 'tra_d2', periodo: '2026-11', estado: 'calculada', _demo: true },
      { id: 'rem_tra_d3_2026-11', trabajadorId: 'tra_d3', periodo: '2026-11', estado: 'calculada', _demo: true }
    ],
    honorario: [
      {
        id: 'hon_d1',
        fecha: '2026-08-05',
        nombre: 'Asesor Enológico Demo',
        rut: '13.222.333-5',
        numero: 101,
        descripcion: 'Asesoría de vendimia',
        bruto: 420000,
        estado: 'pagada',
        fechaPago: '2026-08-10',
        _demo: true
      },
      {
        id: 'hon_d2',
        fecha: '2026-09-05',
        nombre: 'Asesor Enológico Demo',
        rut: '13.222.333-5',
        numero: 102,
        descripcion: 'Asesoría de vendimia',
        bruto: 420000,
        estado: 'pagada',
        fechaPago: '2026-09-10',
        _demo: true
      },
      {
        id: 'hon_d3',
        fecha: '2026-10-05',
        nombre: 'Asesor Enológico Demo',
        rut: '13.222.333-5',
        numero: 103,
        descripcion: 'Asesoría de vendimia',
        bruto: 420000,
        estado: 'pagada',
        fechaPago: '2026-10-12',
        _demo: true
      },
      {
        id: 'hon_d4',
        fecha: '2026-11-05',
        nombre: 'Diseñadora Demo',
        rut: '14.444.555-4',
        numero: 58,
        descripcion: 'Diseño de etiqueta Reserva',
        bruto: 650000,
        estado: 'pendiente',
        _demo: true
      }
    ],
    formato: [
      { id: 'fmt_075', nombre: 'Botella 0,75 L', litros: 0.75, envase: 'vidrio', unidadesCaja: 12, stockMinimo: 600, _demo: true },
      { id: 'fmt_15', nombre: 'Magnum 1,5 L', litros: 1.5, envase: 'vidrio', unidadesCaja: 6, stockMinimo: 60, _demo: true },
      { id: 'fmt_bib3', nombre: 'Bag in box 3 L', litros: 3, envase: 'BIB', unidadesCaja: 4, stockMinimo: 40, _demo: true },
      { id: 'fmt_bib5', nombre: 'Bag in box 5 L', litros: 5, envase: 'BIB', unidadesCaja: 2, stockMinimo: 20, _demo: true }
    ],
    marca: [
      {
        id: 'mar_d1',
        nombre: 'Viña Demo Reserva',
        titular: 'Viña Demo SpA',
        numeroINAPI: '1.000.001',
        clases: '33',
        fechaRegistro: '2017-03-10',
        vencimiento: '2027-03-10',
        costo: 1350000,
        _demo: true
      }
    ],
    etiqueta: [
      {
        id: 'etq_sb',
        nombre: 'Reserva Sauvignon Blanc',
        version: 2,
        marcaId: 'mar_d1',
        fecha: '2026-02-10',
        disenador: 'Estudio Gráfico Demo',
        aprobacionLegal: true,
        costoDiseno: 850000,
        costoFotografia: 0,
        costoIlustracion: 250000,
        tirajeEstimado: 20000,
        tirajeMinimo: 5000,
        costoImpresion: 92,
        proveedorId: 'prv_etq',
        varietal: 'Sauvignon Blanc',
        graduacion: 13,
        do: 'Valle de Casablanca',
        denominacion: 'Vino',
        contenido: '750 mL',
        _demo: true
      },
      {
        id: 'etq_cs',
        nombre: 'Reserva Cabernet Sauvignon',
        version: 1,
        marcaId: 'mar_d1',
        fecha: '2026-03-20',
        disenador: 'Estudio Gráfico Demo',
        aprobacionLegal: false,
        costoDiseno: 900000,
        costoFotografia: 300000,
        costoIlustracion: 0,
        tirajeEstimado: 25000,
        tirajeMinimo: 5000,
        costoImpresion: 98,
        proveedorId: 'prv_etq',
        varietal: 'Cabernet Sauvignon',
        graduacion: 14,
        do: 'Valle del Maipo',
        denominacion: 'Vino',
        contenido: '750 mL',
        _demo: true
      }
    ],
    ordenEnvasado: [
      {
        id: 'oe_d1',
        fecha: '2026-08-20',
        estanqueId: 'est_d1',
        loteId: 'lot_d1',
        formatoId: 'fmt_075',
        unidades: 1200,
        mermaPct: 1.5,
        responsable: 'Enólogo',
        envaseId: 'ins_botella',
        cierreId: 'ins_corcho',
        capsulaId: 'ins_capsula',
        cajaId: 'ins_caja',
        etiquetaId: 'etq_sb',
        etiquetaInsumoId: 'ins_etq_sb',
        manoObra: 96000,
        energiaAgua: 21600,
        graduacion: 13,
        declaraDO: true,
        pctUvaZona: 100,
        certificadoDO: 'DO-2026-0001',
        estado: 'confirmada',
        _demo: true
      },
      {
        id: 'oe_d2',
        fecha: '2026-09-15',
        estanqueId: 'est_d3',
        loteId: 'lot_d2',
        formatoId: 'fmt_075',
        unidades: 1800,
        mermaPct: 2,
        responsable: 'Enólogo',
        envaseId: 'ins_botella',
        cierreId: 'ins_corcho',
        capsulaId: 'ins_capsula',
        cajaId: 'ins_caja',
        etiquetaId: 'etq_cs',
        manoObra: 144000,
        energiaAgua: 32400,
        graduacion: 14,
        declaraDO: false,
        estado: 'confirmada',
        _demo: true
      },
      {
        id: 'oe_d3',
        fecha: '2026-11-20',
        estanqueId: 'est_d1',
        loteId: 'lot_d1',
        formatoId: 'fmt_15',
        unidades: 120,
        mermaPct: 1.5,
        responsable: 'Enólogo',
        envaseId: 'ins_botella',
        cierreId: 'ins_corcho',
        etiquetaId: 'etq_sb',
        manoObra: 18000,
        estado: 'borrador',
        _demo: true
      }
    ],
    // Ventas en formato v1 (una línea). Sin código ni folio: los asigna confirmarVenta al importar.
    venta: [
      {
        id: 'ven_d1',
        fecha: '2026-09-10',
        tipo: 'envasado',
        clienteId: 'cli_dist',
        canal: 'distribuidor',
        ordenEnvasadoId: 'oe_d1',
        cantidad: 600,
        precio: 4500,
        afectoILA: true,
        documento: 'factura',
        generarDTE: true,
        vencimiento: '2026-10-10',
        estado: 'confirmada',
        _demo: true
      },
      {
        id: 'ven_d2',
        fecha: '2026-10-05',
        tipo: 'envasado',
        clienteId: 'cli_rest',
        canal: 'restaurante',
        ordenEnvasadoId: 'oe_d2',
        cantidad: 360,
        precio: 5200,
        afectoILA: true,
        documento: 'factura',
        generarDTE: true,
        vencimiento: '2026-10-20',
        estado: 'confirmada',
        _demo: true
      },
      {
        id: 'ven_d3',
        fecha: '2026-10-20',
        tipo: 'granel',
        clienteId: 'cli_gran',
        canal: 'granel',
        estanqueId: 'est_d3',
        loteId: 'lot_d2',
        cantidad: 500,
        precio: 2200,
        afectoILA: false,
        documento: 'factura',
        generarDTE: true,
        vencimiento: '2026-11-19',
        estado: 'confirmada',
        descripcion: 'Vino tinto a granel',
        _demo: true
      },
      {
        id: 'ven_d4',
        fecha: '2026-11-12',
        tipo: 'envasado',
        clienteId: 'cli_part',
        canal: 'directa',
        ordenEnvasadoId: 'oe_d1',
        cantidad: 24,
        precio: 8990,
        afectoILA: true,
        documento: 'boleta',
        generarDTE: true,
        estado: 'confirmada',
        estadoPago: 'pagado',
        fechaPago: '2026-11-12',
        _demo: true
      },
      {
        id: 'ven_d5',
        fecha: '2026-11-22',
        tipo: 'envasado',
        clienteId: 'cli_vino',
        canal: 'distribuidor',
        ordenEnvasadoId: 'oe_d2',
        cantidad: 120,
        precio: 5100,
        afectoILA: true,
        documento: 'factura',
        generarDTE: true,
        vencimiento: '2026-12-22',
        estado: 'borrador',
        _demo: true
      }
    ],
    movInsumo: [{ id: 'mov_d2', fecha: '2026-10-15', insumoId: 'ins_urea', cantidad: -20, tipo: 'ajuste', motivo: 'Merma', _demo: true }],
    fenologia: [
      {
        id: 'fen_d1',
        cuartelId: 'cua_c1',
        temporada: 2026,
        desborreInicio: '2025-09-12',
        desborre50: '2025-09-18',
        desborreFin: '2025-09-26',
        bbch: 'BBCH 89 — Cosecha',
        floracion: '2025-11-10',
        envero: '2026-01-20',
        _demo: true
      },
      {
        id: 'fen_d2',
        cuartelId: 'cua_c2',
        temporada: 2026,
        desborreInicio: '2025-09-20',
        desborre50: '2025-09-27',
        desborreFin: '2025-10-06',
        bbch: 'BBCH 89 — Cosecha',
        floracion: '2025-11-18',
        envero: '2026-01-28',
        _demo: true
      },
      {
        id: 'fen_d3',
        cuartelId: 'cua_c3',
        temporada: 2026,
        desborreInicio: '2025-09-24',
        desborre50: '2025-10-01',
        desborreFin: '2025-10-09',
        bbch: 'BBCH 89 — Cosecha',
        floracion: '2025-11-20',
        envero: '2026-02-02',
        _demo: true
      },
      {
        id: 'fen_d4',
        cuartelId: 'cua_c1',
        temporada: 2027,
        desborreInicio: '2026-09-08',
        desborre50: '2026-09-15',
        desborreFin: '2026-09-22',
        bbch: 'BBCH 61 — Inicio floración',
        _demo: true
      },
      {
        id: 'fen_d5',
        cuartelId: 'cua_c2',
        temporada: 2027,
        desborreInicio: '2026-09-29',
        desborre50: '2026-10-06',
        bbch: 'BBCH 53 — Racimos visibles',
        _demo: true
      }
    ],
    clima: climaDemo(),
    aplicacion: [
      {
        id: 'apl_d1',
        fecha: '2025-11-15',
        temporada: 2026,
        cuartelId: 'cua_c1',
        insumoId: 'ins_azufre',
        dosis: 4,
        cantidad: 10,
        carencia: 7,
        costo: 18500,
        responsable: 'Encargado de campo',
        _demo: true
      },
      {
        id: 'apl_d2',
        fecha: '2026-01-10',
        temporada: 2026,
        cuartelId: 'cua_c2',
        insumoId: 'ins_cobre',
        dosis: 2,
        cantidad: 6.4,
        carencia: 14,
        costo: 33280,
        _demo: true
      },
      {
        id: 'apl_d3',
        fecha: '2026-10-28',
        temporada: 2027,
        cuartelId: 'cua_c2',
        insumoId: 'ins_azufre',
        dosis: 4,
        cantidad: 12.8,
        carencia: 7,
        costo: 23680,
        _demo: true
      },
      { id: 'apl_d4', fecha: '2026-11-05', temporada: 2027, cuartelId: 'cua_c1', insumoId: 'ins_urea', dosis: 60, cantidad: 150, costo: 117000, _demo: true }
    ],
    labor: [
      { id: 'lab_d1', fecha: '2026-07-20', temporada: 2027, cuartelId: 'cua_c1', tipo: 'Poda', jornadas: 6, valorJornada: 30000, _demo: true },
      {
        id: 'lab_d2',
        fecha: '2026-08-10',
        temporada: 2027,
        cuartelId: 'cua_c2',
        tipo: 'Amarra',
        jornadas: 4,
        valorJornada: 30000,
        otrosCostos: 15000,
        _demo: true
      },
      { id: 'lab_d3', fecha: '2026-10-20', temporada: 2027, cuartelId: 'cua_c3', tipo: 'Desbrote', jornadas: 3, valorJornada: 32000, _demo: true }
    ],
    lote: [
      {
        id: 'lot_d1',
        codigo: 'L-2026-SB',
        temporada: 2026,
        cuartelIds: ['cua_c1'],
        variedad: 'Sauvignon Blanc',
        tipo: 'blanco',
        valle: 'Casablanca',
        estado: 'En guarda',
        fechaVendimiaPlan: '2026-03-08',
        diasFA: 18,
        diasGuarda: 120,
        litrosEstimados: 2800,
        _demo: true
      },
      {
        id: 'lot_d2',
        codigo: 'L-2026-CS',
        temporada: 2026,
        cuartelIds: ['cua_c2'],
        variedad: 'Cabernet Sauvignon',
        tipo: 'tinto',
        valle: 'Maipo',
        estado: 'En guarda',
        fechaVendimiaPlan: '2026-03-26',
        diasFA: 10,
        diasMaceracion: 15,
        diasFML: 30,
        diasGuarda: 180,
        litrosEstimados: 4100,
        _demo: true
      },
      {
        id: 'lot_d3',
        codigo: 'L-2027-SB',
        temporada: 2027,
        cuartelIds: ['cua_c1'],
        variedad: 'Sauvignon Blanc',
        tipo: 'blanco',
        valle: 'Casablanca',
        estado: 'Planificado',
        fechaVendimiaPlan: '2027-03-05',
        diasVendimia: 3,
        diasFA: 18,
        diasGuarda: 120,
        litrosEstimados: 3000,
        _demo: true
      },
      {
        id: 'lot_d4',
        codigo: 'L-2027-CS',
        temporada: 2027,
        cuartelIds: ['cua_c2'],
        variedad: 'Cabernet Sauvignon',
        tipo: 'tinto',
        valle: 'Maipo',
        estado: 'Planificado',
        fechaVendimiaPlan: '2027-03-28',
        diasVendimia: 3,
        diasFA: 10,
        diasMaceracion: 15,
        diasFML: 30,
        diasGuarda: 180,
        litrosEstimados: 4300,
        _demo: true
      },
      {
        id: 'lot_d5',
        codigo: 'L-2027-CA',
        temporada: 2027,
        cuartelIds: ['cua_c3'],
        variedad: 'Carménère',
        tipo: 'tinto',
        valle: 'Colchagua',
        estado: 'Planificado',
        fechaVendimiaPlan: '2027-04-12',
        diasVendimia: 2,
        diasFA: 12,
        diasMaceracion: 20,
        diasFML: 35,
        diasGuarda: 240,
        litrosEstimados: 2100,
        _demo: true
      }
    ],
    estanque: [
      {
        id: 'est_d1',
        codigo: 'E-01',
        capacidad: 16000,
        material: 'Acero inoxidable',
        tipo: 'Fermentación con camisa de frío',
        ubicacion: 'Nave 1',
        estado: 'operativo',
        _demo: true
      },
      {
        id: 'est_d2',
        codigo: 'E-02',
        capacidad: 20000,
        material: 'Acero inoxidable',
        tipo: 'Fermentación tintos',
        ubicacion: 'Nave 1',
        estado: 'operativo',
        _demo: true
      },
      { id: 'est_d3', codigo: 'E-03', capacidad: 12000, material: 'Hormigón epóxico', tipo: 'Guarda', ubicacion: 'Nave 2', estado: 'operativo', _demo: true },
      {
        id: 'est_d4',
        codigo: 'E-04',
        capacidad: 8000,
        material: 'Acero inoxidable',
        tipo: 'Pulmón de embotellado',
        ubicacion: 'Nave 2',
        estado: 'mantencion',
        _demo: true
      }
    ],
    movBodega: [
      { id: 'mb_d1', fecha: '2026-03-11', estanqueId: 'est_d1', loteId: 'lot_d1', litros: 2750, tipo: 'entrada', origen: 'mosto', kgUva: 3990, _demo: true },
      { id: 'mb_d2', fecha: '2026-03-26', estanqueId: 'est_d2', loteId: 'lot_d2', litros: 4150, tipo: 'entrada', origen: 'uva', kgUva: 5850, _demo: true },
      {
        id: 'mb_d3',
        fecha: '2026-04-20',
        estanqueId: 'est_d2',
        loteId: 'lot_d2',
        litros: -4000,
        tipo: 'trasiego_salida',
        grupo: 'tr_d1',
        glosa: 'Descube',
        _demo: true
      },
      {
        id: 'mb_d4',
        fecha: '2026-04-20',
        estanqueId: 'est_d3',
        loteId: 'lot_d2',
        litros: 3880,
        tipo: 'trasiego_entrada',
        grupo: 'tr_d1',
        glosa: 'Descube',
        _demo: true
      },
      {
        id: 'mb_d5',
        fecha: '2026-04-20',
        estanqueId: 'est_d2',
        loteId: 'lot_d2',
        litros: -120,
        tipo: 'merma',
        grupo: 'tr_d1',
        motivo: 'Borras de trasiego',
        _demo: true
      },
      { id: 'mb_d6', fecha: '2026-05-10', estanqueId: 'est_d1', loteId: 'lot_d1', litros: -60, tipo: 'merma', motivo: 'Borras', _demo: true }
    ],
    cosecha: [
      {
        id: 'cos_d1',
        loteId: 'lot_d1',
        fecha: '2026-03-10',
        temporada: 2026,
        cuartelId: 'cua_c1',
        cajones: 210,
        kg: 3990,
        destino: 'Vinificación propia',
        costoBins: 42000,
        costoTransporte: 30000,
        costoAlimentacion: 24000,
        _demo: true
      },
      {
        id: 'cos_d2',
        loteId: 'lot_d2',
        fecha: '2026-03-25',
        temporada: 2026,
        cuartelId: 'cua_c2',
        cajones: 300,
        kg: 5850,
        destino: 'Vinificación propia',
        costoBins: 60000,
        costoTransporte: 45000,
        costoAlimentacion: 36000,
        _demo: true
      },
      {
        id: 'cos_d3',
        fecha: '2026-04-02',
        temporada: 2026,
        cuartelId: 'cua_c3',
        cajones: 150,
        kg: 2880,
        destino: 'Venta de uva',
        costoTransporte: 20000,
        _demo: true
      }
    ],
    jornal: [
      {
        id: 'jor_d1',
        cosechaId: 'cos_d1',
        nombre: 'Cuadrilla Los Aromos',
        trabajadores: 7,
        horas: 8,
        tarifaTipo: 'cajon',
        tarifa: 650,
        cajones: 210,
        _demo: true
      },
      { id: 'jor_d2', cosechaId: 'cos_d2', nombre: 'Cuadrilla Los Aromos', trabajadores: 9, horas: 8, tarifaTipo: 'kg', tarifa: 35, kg: 5850, _demo: true },
      {
        id: 'jor_d3',
        cosechaId: 'cos_d3',
        nombre: 'Jornaleros de temporada',
        trabajadores: 4,
        horas: 8,
        tarifaTipo: 'dia',
        tarifa: 35000,
        jornadas: 4,
        _demo: true
      }
    ]
  }
};

/**
 * Temperaturas ficticias: dos registros por mes de septiembre a abril (temporada 2026) y de septiembre a noviembre
 * (temporada 2027), con una curva de estación simple. Suficiente para ver grados día y Winkler.
 */
function climaDemo() {
  const meses = [
    ['2025-09', 2026, 17, 4],
    ['2025-10', 2026, 21, 6],
    ['2025-11', 2026, 25, 8],
    ['2025-12', 2026, 28, 10],
    ['2026-01', 2026, 31, 12],
    ['2026-02', 2026, 30, 12],
    ['2026-03', 2026, 27, 9],
    ['2026-04', 2026, 22, 6],
    ['2026-09', 2027, 18, 4],
    ['2026-10', 2027, 22, 7],
    ['2026-11', 2027, 26, 9]
  ] as const;
  return meses.flatMap(([mes, temporada, tmax, tmin], i) =>
    [10, 20].map((dia, k) => ({
      id: `cli_d${i}_${k}`,
      fecha: `${mes}-${dia}`,
      temporada,
      tmax: tmax + k,
      tmin: tmin + (k ? 1 : 0),
      estacion: 'Estación propia',
      _demo: true
    }))
  );
}
