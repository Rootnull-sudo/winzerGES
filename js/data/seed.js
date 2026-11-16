/**
 * data/seed.js — Datos de demostración (ficticios). Todos los registros llevan
 * `_demo: true` para poder borrarlos con "Borrar datos demo".
 * Se carga solo bajo demanda (onboarding, Configuración › Datos o ?dev=1&seed=1).
 *
 * ⚠ RUT, nombres y montos son inventados. No usar como referencia tributaria.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;

  async function load() {
    const db = VG.db, F = VG.calc.financial, T = VG.calc.tax, DTE = VG.integrations.dte;
    const sys = { system: true, silent: true };
    const D = o => Object.assign({ _demo: true }, o);
    const put = async (entity, list) => db.saveMany(entity, list.map(D), sys);
    const one = async (entity, o) => db.save(entity, D(o), sys);
    let seq = 0; const id = p => p + '_d' + (++seq).toString(36);
    const cfg = VG.store.config();
    const tasaIVA = 0.19, tasaILA = 0.205;
    const tot = (neto, ila = true) => { const iva = Math.round(neto * tasaIVA), il = ila ? Math.round(neto * tasaILA) : 0; return { neto: Math.round(neto), iva, ila: il, total: Math.round(neto) + iva + il }; };

    /* ---------------- Configuración ---------------- */
    // La configuración de la empresa NUNCA se marca como demo. Si el usuario ya configuró su viña,
    // se conserva; si no, se usa la empresa ficticia y se recuerda para restaurarla al borrar los datos demo.
    const prevCfg = db.get('config', 'main');
    const tieneEmpresaPropia = prevCfg && prevCfg.empresa && prevCfg.empresa.nombreFantasia && !db.getMeta('configDemo');
    if (!tieneEmpresaPropia) {
      await db.setMeta('empresaPrevia', prevCfg && prevCfg.empresa ? prevCfg.empresa : null);
      await db.setMeta('configDemo', true);
      await db.save('config', Object.assign({}, prevCfg || {}, { id: 'main', _demo: false, empresa: Object.assign({}, cfg.empresa, { nombreFantasia: 'Viña Los Robles (demo)', razonSocial: 'Viña Los Robles Demo SpA', rut: '76.543.210-3', resolucionSII: { numero: 80, fecha: '2014-08-22' }, certificadoVence: '2027-03-15' }) }), sys);
    }

    /* ---------------- Usuarios (PIN 1234) ---------------- */
    const users = [
      ['usr_admin', 'Francisca Rojas', 'admin', 'Dueña y gerente', '12.345.678-5'],
      ['usr_enologo', 'Tomás Muñoz', 'enologo', 'Enólogo', '15.678.901-2'],
      ['usr_agronomo', 'Diego Pérez', 'agronomo', 'Agrónomo', '16.789.012-8'],
      ['usr_ventas', 'Camila Soto', 'ventas', 'Ejecutiva comercial', '17.890.123-K'],
      ['usr_contador', 'Paula Vergara', 'administrativo', 'Contadora', '13.456.789-6']
    ];
    for (const [uid, nombre, rol, cargo, rut] of users) {
      await db.save('usuario', D({ id: uid, nombre, rol, cargo, rut: U.rutFormat(U.rutClean(rut).slice(0, -1) + U.rutDV(U.rutClean(rut).slice(0, -1))), email: nombre.split(' ')[0].toLowerCase() + '@losrobles-demo.cl', estado: 'activo', tema: 'light', pinHash: await VG.auth.hashPin(uid, '1234') }), sys);
    }
    const rutOk = r => { const c = U.rutClean(r).slice(0, -1); return U.rutFormat(c + U.rutDV(c)); };

    /* ---------------- Catastro ---------------- */
    const C1 = 'cua_c01', C2 = 'cua_c02', C3 = 'cua_c03';
    await put('cuartel', [
      { id: C1, codigo: 'C-01', variedad: 'Sauvignon Blanc', tipo: 'blanco', superficie: 2.5, anioPlantacion: 2008, patron: 'Franco', conduccion: 'Espaldera VSP', densidad: 4000, plantas: 10000, cajonesEstimados: 1150, estadoSanitario: 'Bueno', sector: 'Sector Norte', valle: 'Colchagua', costoPlantacion: 22000000 },
      { id: C2, codigo: 'C-02', variedad: 'Cabernet Sauvignon', tipo: 'tinto', superficie: 3.2, anioPlantacion: 2003, patron: '1103 Paulsen', conduccion: 'Espaldera VSP', densidad: 3500, plantas: 11200, cajonesEstimados: 1350, estadoSanitario: 'Bueno', sector: 'Sector Ladera', valle: 'Colchagua', costoPlantacion: 26000000 },
      { id: C3, codigo: 'C-03', variedad: 'Carménère', tipo: 'tinto', superficie: 2.0, anioPlantacion: 2012, patron: 'Franco', conduccion: 'Espaldera VSP', densidad: 3800, plantas: 7600, cajonesEstimados: 800, estadoSanitario: 'Regular (oídio controlado)', sector: 'Sector Sur', valle: 'Colchagua', costoPlantacion: 18000000 }
    ].map(c => Object.assign(c, { _v: 2 })));

    /* ---------------- Fenología y clima ---------------- */
    const fen = [];
    [[2025, '2024'], [2026, '2025'], [2027, '2026']].forEach(([temp, y]) => {
      [[C1, 0], [C2, 9], [C3, 13]].forEach(([c, off]) => {
        const ini = U.addDays(`${y}-09-08`, off + (temp - 2025) * 2);
        fen.push({ cuartelId: c, temporada: temp, desborreInicio: ini, desborre50: U.addDays(ini, 6), desborreFin: U.addDays(ini, 13), floracion: temp < 2027 ? U.addDays(ini, 70) : '', envero: temp < 2027 ? U.addDays(ini, 140) : '', bbch: temp < 2027 ? 'BBCH 89 — cosecha' : 'BBCH 15 — 5 hojas', observaciones: '' });
      });
    });
    await put('fenologia', fen);
    const clima = [];
    for (let d = U.parseDate('2025-09-01'); d <= U.parseDate('2026-04-30'); d.setDate(d.getDate() + 1)) {
      const doy = (d - U.parseDate('2025-09-01')) / 86400000;
      const s = Math.sin(Math.PI * doy / 242);
      clima.push({ fecha: U.isoDate(d), temporada: 2026, tmax: U.round(18 + 13 * s + Math.sin(doy * 1.7) * 2.5, 1), tmin: U.round(4 + 9 * s + Math.cos(doy * 1.3) * 1.5, 1), estacion: 'Estación propia' });
    }
    await put('clima', clima);

    /* ---------------- Proveedores y clientes ---------------- */
    const P = { cris: 'prv_cris', cor: 'prv_cor', imp: 'prv_imp', agro: 'prv_agro', eno: 'prv_eno', pet: 'prv_pet', luz: 'prv_luz' };
    await put('proveedor', [
      { id: P.cris, nombre: 'Cristalería Demo S.A.', rut: rutOk('96.111.222-0'), categoria: 'Envases vidrio', contacto: 'Jorge Lagos', email: 'ventas@cristaleria-demo.cl', telefono: '+56 2 2345 6789', condiciones: '30 días', plazo: 30 },
      { id: P.cor, nombre: 'Corchos del Sur Ltda.', rut: rutOk('77.222.333-0'), categoria: 'Corchos y cápsulas', contacto: 'Ana Fuentes', condiciones: '30 días', plazo: 30 },
      { id: P.imp, nombre: 'Imprenta Etiquetas Maule SpA', rut: rutOk('76.333.444-0'), categoria: 'Etiquetas', contacto: 'Rodrigo Silva', condiciones: '45 días', plazo: 45 },
      { id: P.agro, nombre: 'Agrocomercial Colchagua Ltda.', rut: rutOk('78.444.555-0'), categoria: 'Insumos agrícolas', contacto: 'María Reyes', condiciones: 'Contado', plazo: 0 },
      { id: P.eno, nombre: 'Enoquímica Demo SpA', rut: rutOk('76.555.666-0'), categoria: 'Insumos enológicos', contacto: 'Felipe Ortiz', condiciones: '30 días', plazo: 30 },
      { id: P.pet, nombre: 'Envases PET Centro Ltda.', rut: rutOk('77.666.777-0'), categoria: 'Envases PET', contacto: 'Carla Núñez', condiciones: '30 días', plazo: 30 },
      { id: P.luz, nombre: 'Compañía Eléctrica Demo', rut: rutOk('96.777.888-0'), categoria: 'Servicios básicos', condiciones: 'Mensual', plazo: 20 }
    ]);
    const CL = { dist: 'cli_dist', rest: 'cli_rest', vino: 'cli_vino', part: 'cli_part', web: 'cli_web', gran: 'cli_gran' };
    await put('cliente', [
      { id: CL.dist, nombre: 'Distribuidora Andes SpA', rut: rutOk('76.888.999-0'), tipo: 'Empresa', giro: 'Distribución de bebidas', contacto: 'Luis Andrade', email: 'compras@andes-demo.cl', direccion: 'Av. Las Industrias 1200', comuna: 'Rancagua', canal: 'distribuidor', condiciones: '30 días', plazo: 30 },
      { id: CL.rest, nombre: 'Restaurante El Parrón Ltda.', rut: rutOk('77.999.111-0'), tipo: 'Empresa', giro: 'Restaurante', contacto: 'Sofía Díaz', direccion: 'Calle Comercio 455', comuna: 'Santa Cruz', canal: 'restaurante', condiciones: '15 días', plazo: 15 },
      { id: CL.vino, nombre: 'Vinoteca Santiago Ltda.', rut: rutOk('76.111.333-0'), tipo: 'Empresa', giro: 'Venta de vinos', contacto: 'Ignacio Vera', direccion: 'Av. Providencia 2100', comuna: 'Providencia', canal: 'distribuidor', condiciones: '30 días', plazo: 30 },
      { id: CL.part, nombre: 'Ventas en sala (consumidor final)', rut: '66.666.666-6', tipo: 'Persona', giro: '', canal: 'directa', condiciones: 'Contado', plazo: 0 },
      { id: CL.web, nombre: 'Tienda online (consumidor final)', rut: '66.666.666-6', tipo: 'Persona', canal: 'ecommerce', condiciones: 'Contado', plazo: 0 },
      { id: CL.gran, nombre: 'Bodega Granel Curicó S.A.', rut: rutOk('96.222.444-0'), tipo: 'Empresa', giro: 'Elaboración de vinos', contacto: 'Pedro Castro', direccion: 'Ruta 5 Sur km 190', comuna: 'Curicó', canal: 'granel', condiciones: '30 días', plazo: 30 }
    ]);

    /* ---------------- Insumos ---------------- */
    const I = {};
    const insumos = [
      ['urea', 'Urea 46% N', 'agricola', 'Fertilizante', 'kg', 980, P.agro, 0, '2027-06-30', 150],
      ['npk', 'NPK 12-12-17', 'agricola', 'Fertilizante', 'kg', 1150, P.agro, 0, '2027-06-30', 100],
      ['azufre', 'Azufre mojable 80%', 'agricola', 'Fungicida', 'kg', 2400, P.agro, 14, '2027-01-31', 30],
      ['fungi', 'Fungicida sistémico (oídio)', 'agricola', 'Fungicida', 'L', 38000, P.agro, 21, '2026-12-05', 5],
      ['herb', 'Herbicida glifosato 48%', 'agricola', 'Herbicida', 'L', 6500, P.agro, 14, '2028-01-01', 10],
      ['bioest', 'Bioestimulante algas', 'agricola', 'Bioestimulante', 'L', 15000, P.agro, 0, '2027-09-01', 0],
      ['meta', 'Metabisulfito de potasio (K₂S₂O₅)', 'enologico', 'Sulfitante', 'kg', 6800, P.eno, 0, '2028-03-01', 5],
      ['bento', 'Bentonita sódica', 'enologico', 'Clarificante', 'kg', 4200, P.eno, 0, '2028-01-01', 10],
      ['lev', 'Levadura seca activa', 'enologico', 'Levadura', 'kg', 52000, P.eno, 0, '2027-05-01', 2],
      ['nutri', 'Nutriente fosfato diamónico', 'enologico', 'Nutriente', 'kg', 9500, P.eno, 0, '2027-12-01', 5],
      ['tart', 'Ácido tartárico', 'enologico', 'Corrector', 'kg', 7800, P.eno, 0, '2029-01-01', 10],
      ['enz', 'Enzima pectolítica', 'enologico', 'Enzima', 'kg', 89000, P.eno, 0, '2026-12-20', 0.5],
      ['tan', 'Tanino enológico', 'enologico', 'Tanino', 'kg', 64000, P.eno, 0, '2028-01-01', 0],
      ['bot750', 'Botella vidrio Bordelesa 750 ml', 'envasado', 'Envase vidrio', 'un', 430, P.cris, 0, '', 2000],
      ['bot1l', 'Botella vidrio 1 L', 'envasado', 'Envase vidrio', 'un', 520, P.cris, 0, '', 50],
      ['pet2', 'Botella PET 2 L', 'envasado', 'Envase PET', 'un', 260, P.pet, 0, '', 50],
      ['pet5', 'Bidón PET 5 L', 'envasado', 'Envase PET', 'un', 690, P.pet, 0, '', 20],
      ['corcho', 'Corcho natural técnico', 'envasado', 'Cierre', 'un', 170, P.cor, 0, '', 2000],
      ['rosca', 'Tapa rosca', 'envasado', 'Cierre', 'un', 55, P.cor, 0, '', 200],
      ['caps', 'Cápsula termocontraíble', 'envasado', 'Cápsula', 'un', 58, P.cor, 0, '', 1000],
      ['caja12', 'Caja cartón 12 × 750 ml', 'envasado', 'Caja', 'un', 880, P.cris, 0, '', 150],
      ['caja6', 'Caja cartón 6 × 1 L', 'envasado', 'Caja', 'un', 720, P.cris, 0, '', 20],
      ['etqfam', 'Etiqueta autoadhesiva línea familiar', 'etiquetado', 'Etiqueta', 'un', 45, P.imp, 0, '', 300]
    ];
    await put('insumo', insumos.map(([k, nombre, categoria, tipo, unidad, precio, prov, carencia, venc, min]) => {
      I[k] = 'ins_' + k;
      return { id: I[k], nombre, categoria, tipo, unidad, precio, proveedorId: prov, carencia, vencimiento: venc, stockMinimo: min, stockInicial: ({ urea: 450, npk: 700, azufre: 70, fungi: 9, herb: 25, bento: 12, lev: 5, nutri: 6, tart: 25, enz: 0.6, tan: 1.5, meta: 2 })[k] || 0, quimico: k === 'meta' ? 'K2S2O5' : '', so2Pct: k === 'meta' ? 57 : '', npk: k === 'urea' ? '46-0-0' : k === 'npk' ? '12-12-17' : '' };
    }));

    /* ---------------- Aplicaciones y labores ---------------- */
    const apl = [], lab = [];
    [2025, 2026].forEach(temp => {
      const y = temp - 1;
      [[C1, 2.5], [C2, 3.2], [C3, 2.0]].forEach(([c, ha]) => {
        apl.push({ fecha: `${y}-09-20`, temporada: temp, cuartelId: c, insumoId: I.urea, dosis: 60, unidadDosis: 'kg/ha', cantidad: 60 * ha, costo: Math.round(60 * ha * 980), responsable: 'Diego Pérez', carencia: 0 });
        apl.push({ fecha: `${y}-10-15`, temporada: temp, cuartelId: c, insumoId: I.npk, dosis: 120, unidadDosis: 'kg/ha', cantidad: 120 * ha, costo: Math.round(120 * ha * 1150), responsable: 'Diego Pérez', carencia: 0 });
        [`${y}-11-05`, `${y}-11-25`, `${y}-12-18`, `${temp}-01-15`].forEach(f => apl.push({ fecha: f, temporada: temp, cuartelId: c, insumoId: I.azufre, dosis: 4, unidadDosis: 'kg/ha', cantidad: 4 * ha, costo: Math.round(4 * ha * 2400), responsable: 'Diego Pérez', carencia: 14 }));
        apl.push({ fecha: `${temp}-01-28`, temporada: temp, cuartelId: c, insumoId: I.fungi, dosis: 0.5, unidadDosis: 'L/ha', cantidad: 0.5 * ha, costo: Math.round(0.5 * ha * 38000), responsable: 'Diego Pérez', carencia: 21 });
        [['Poda', 380000], ['Amarra', 90000], ['Desbrote', 140000], ['Deshoje', 160000], ['Raleo', 110000], ['Riego (energía)', 120000], ['Mantención', 70000]].forEach(([tipo, porHa], i) => lab.push({ fecha: U.addDays(`${y}-07-10`, i * 30), temporada: temp, cuartelId: c, tipo, jornadas: Math.round(porHa * ha / 30000), costo: Math.round(porHa * ha), responsable: 'Cuadrilla propia' }));
      });
    });
    await put('aplicacion', apl); await put('labor', lab);

    /* ---------------- Estanques ---------------- */
    const E1 = 'est_e01', E2 = 'est_e02', E3 = 'est_e03', E4 = 'est_e04';
    await put('estanque', [
      { id: E1, codigo: 'E-01', capacidad: 16000, material: 'Acero inoxidable', tipo: 'Fermentación con camisa de frío', ubicacion: 'Nave 1', estado: 'operativo', costoMantencion: 180000 },
      { id: E2, codigo: 'E-02', capacidad: 20000, material: 'Acero inoxidable', tipo: 'Fermentación tintos', ubicacion: 'Nave 1', estado: 'operativo', costoMantencion: 200000 },
      { id: E3, codigo: 'E-03', capacidad: 12000, material: 'Acero inoxidable', tipo: 'Fermentación tintos', ubicacion: 'Nave 2', estado: 'operativo', costoMantencion: 150000 },
      { id: E4, codigo: 'E-04', capacidad: 8000, material: 'Hormigón epóxico', tipo: 'Guarda', ubicacion: 'Nave 2', estado: 'operativo', costoMantencion: 90000 }
    ]);

    /* ---------------- Lotes ---------------- */
    const L = { sb25: 'lot_sb25', cs25: 'lot_cs25', sb26: 'lot_sb26', cs26: 'lot_cs26', ca26: 'lot_ca26' };
    await put('lote', [
      { id: L.sb25, codigo: 'L-2025-SB', temporada: 2025, variedad: 'Sauvignon Blanc', tipo: 'blanco', cuartelIds: [C1], valle: 'Colchagua', estado: 'Finalizado', fechaVendimiaPlan: '2025-03-05', diasFA: 18, diasMaceracion: 0, diasFML: 0, diasGuarda: 90, litrosEstimados: 12000 },
      { id: L.cs25, codigo: 'L-2025-CS', temporada: 2025, variedad: 'Cabernet Sauvignon', tipo: 'tinto', cuartelIds: [C2], valle: 'Colchagua', estado: 'En guarda', fechaVendimiaPlan: '2025-03-28', diasFA: 10, diasMaceracion: 8, diasFML: 30, diasGuarda: 300, litrosEstimados: 15000 },
      { id: L.sb26, codigo: 'L-2026-SB', temporada: 2026, variedad: 'Sauvignon Blanc', tipo: 'blanco', cuartelIds: [C1], valle: 'Colchagua', estado: 'En guarda', fechaVendimiaPlan: '2026-03-04', diasFA: 18, diasMaceracion: 0, diasFML: 0, diasGuarda: 120, litrosEstimados: 14600 },
      { id: L.cs26, codigo: 'L-2026-CS', temporada: 2026, variedad: 'Cabernet Sauvignon', tipo: 'tinto', cuartelIds: [C2], valle: 'Colchagua', estado: 'En guarda', fechaVendimiaPlan: '2026-03-27', diasFA: 10, diasMaceracion: 7, diasFML: 30, diasGuarda: 365, litrosEstimados: 18400 },
      { id: L.ca26, codigo: 'L-2026-CA', temporada: 2026, variedad: 'Carménère', tipo: 'tinto', cuartelIds: [C3], valle: 'Colchagua', estado: 'En guarda', fechaVendimiaPlan: '2026-04-10', diasFA: 10, diasMaceracion: 8, diasFML: 35, diasGuarda: 365, litrosEstimados: 10800 },
      { id: 'lot_sb27', codigo: 'L-2027-SB', temporada: 2027, variedad: 'Sauvignon Blanc', tipo: 'blanco', cuartelIds: [C1], valle: 'Colchagua', estado: 'Planificado', fechaVendimiaPlan: '2027-03-03', diasFA: 18, diasMaceracion: 0, diasFML: 0, diasGuarda: 120, litrosEstimados: 14500 }
    ]);

    /* ---------------- Cosecha y jornales ---------------- */
    const cos = [], jor = [];
    const cosecha = (fecha, temporada, cuartelId, loteId, kg, cajones) => {
      const cid = id('cos');
      cos.push({ id: cid, fecha, temporada, cuartelId, loteId, kg, cajones, destino: 'Vinificación propia', costoBins: 60000, costoTransporte: 120000, costoAlimentacion: 95000, otrosCostos: 0 });
      const nT = Math.round(cajones / 32);
      jor.push({ cosechaId: cid, fecha, nombre: 'Cuadrilla A (contratista)', rut: rutOk('77.123.123-0'), cuadrilla: 'A', trabajadores: Math.ceil(nT / 2), horas: 8, tarifaTipo: 'cajon', tarifa: 650, cajones: Math.round(cajones * 0.55), kg: 0 });
      jor.push({ cosechaId: cid, fecha, nombre: 'Cuadrilla B (propia)', rut: '', cuadrilla: 'B', trabajadores: Math.floor(nT / 2), horas: 8, tarifaTipo: 'cajon', tarifa: 650, cajones: cajones - Math.round(cajones * 0.55), kg: 0 });
    };
    cosecha('2025-03-06', 2025, C1, L.sb25, 9400, 494); cosecha('2025-03-08', 2025, C1, L.sb25, 9100, 478);
    cosecha('2025-03-29', 2025, C2, L.cs25, 10600, 556); cosecha('2025-03-31', 2025, C2, L.cs25, 10400, 547);
    cosecha('2026-03-05', 2026, C1, L.sb26, 11300, 593); cosecha('2026-03-07', 2026, C1, L.sb26, 11200, 588);
    cosecha('2026-03-28', 2026, C2, L.cs26, 8600, 452); cosecha('2026-03-30', 2026, C2, L.cs26, 8500, 446); cosecha('2026-04-01', 2026, C2, L.cs26, 8500, 447);
    cosecha('2026-04-12', 2026, C3, L.ca26, 7500, 394); cosecha('2026-04-14', 2026, C3, L.ca26, 7500, 345);
    await put('cosecha', cos); await put('jornal', jor);

    /* ---------------- Movimientos de bodega ---------------- */
    const mb = [];
    const mv = (fecha, est, lote, litros, tipo, glosa, extra) => mb.push(Object.assign({ fecha, estanqueId: est, loteId: lote, litros, tipo, glosa }, extra || {}));
    mv('2025-03-09', E1, L.sb25, 12000, 'entrada', 'Mosto Sauvignon Blanc 2025', { origen: 'mosto' });
    mv('2025-04-01', E2, L.cs25, 15000, 'entrada', 'Uva despalillada Cabernet 2025', { origen: 'uva' });
    mv('2025-12-15', E2, L.cs25, -300, 'merma', 'Borras post FML', { motivo: 'Borras' });
    mv('2025-10-30', E1, L.sb25, -200, 'merma', 'Borras finas', { motivo: 'Borras' });
    mv('2026-02-10', E2, L.cs25, -4174, 'trasiego_salida', 'Trasiego a guarda', { grupo: 'tr1' });
    mv('2026-02-10', E4, L.cs25, 4174, 'trasiego_entrada', 'Trasiego desde E-02', { grupo: 'tr1' });
    mv('2026-03-08', E1, L.sb26, 14600, 'entrada', 'Mosto Sauvignon Blanc 2026', { origen: 'mosto' });
    mv('2026-04-02', E2, L.cs26, 18400, 'entrada', 'Uva despalillada Cabernet 2026', { origen: 'uva' });
    mv('2026-04-15', E3, L.ca26, 10800, 'entrada', 'Uva despalillada Carménère 2026', { origen: 'uva' });
    mv('2026-05-25', E2, L.cs26, -350, 'merma', 'Borras gruesas descube', { motivo: 'Borras' });
    mv('2026-06-15', E3, L.ca26, -220, 'merma', 'Borras post FML', { motivo: 'Borras' });
    await put('movBodega', mb);

    /* ---------------- Fermentaciones ---------------- */
    const FSB = 'fer_sb26', FCS = 'fer_cs26', FCA = 'fer_ca26';
    await put('fermentacion', [
      { id: FSB, codigo: 'FA-L-2026-SB', loteId: L.sb26, estanqueId: E1, tipo: 'blanco', variedad: 'Sauvignon Blanc', volumen: 14600, fechaMolienda: '2026-03-08', inicioFA: '2026-03-09', inicioTumultuosa: '2026-03-11', finFA: '2026-03-27', brixInicial: 22.4, phInicial: 3.28, acidezInicial: 6.9, levaduraId: I.lev, levadura: 'Saccharomyces cerevisiae (aromática)', nutrientes: 'DAP 20 g/hL', diasPlanificados: 18, estado: 'cerrada', temperaturaObjetivo: '14–16 °C', alcoholFinal: 13.1, azucarResidual: 1.8 },
      { id: FCS, codigo: 'FA-L-2026-CS', loteId: L.cs26, estanqueId: E2, tipo: 'tinto', variedad: 'Cabernet Sauvignon', volumen: 18400, fechaMolienda: '2026-04-02', inicioFA: '2026-04-03', inicioTumultuosa: '2026-04-05', finFA: '2026-04-13', inicioMaceracion: '2026-04-02', finMaceracion: '2026-04-20', inicioFML: '2026-04-22', finFML: '2026-05-21', brixInicial: 24.8, phInicial: 3.55, acidezInicial: 5.6, levadura: 'Saccharomyces cerevisiae (tintos)', nutrientes: 'DAP 25 g/hL', diasPlanificados: 10, estado: 'cerrada', temperaturaObjetivo: '24–28 °C', alcoholFinal: 14.4, azucarResidual: 1.5 },
      { id: FCA, codigo: 'FA-L-2026-CA', loteId: L.ca26, estanqueId: E3, tipo: 'tinto', variedad: 'Carménère', volumen: 10800, fechaMolienda: '2026-04-15', inicioFA: '2026-04-16', inicioTumultuosa: '2026-04-19', finFA: '2026-04-30', inicioMaceracion: '2026-04-15', finMaceracion: '2026-05-04', inicioFML: '2026-05-06', finFML: '2026-06-12', brixInicial: 25.2, phInicial: 3.62, acidezInicial: 5.2, levadura: 'Saccharomyces cerevisiae (tintos)', nutrientes: 'DAP 25 g/hL', diasPlanificados: 10, estado: 'activa', temperaturaObjetivo: '24–28 °C' }
    ]);
    const segs = [];
    const curve = (fid, ini, dias, b0, t0, t1, so2) => {
      for (let i = 0; i <= dias; i++) {
        const x = i / dias, f = 1 / (1 + Math.exp(-10 * (x - 0.45)));
        const brix = Math.max(-1.8, b0 - (b0 + 2) * f);
        segs.push({ fermentacionId: fid, fecha: U.addDays(ini, i), brix: U.round(brix, 1), densidad: U.round(1000 + brix * 4.1, 1), temperatura: U.round(t0 + (t1 - t0) * Math.sin(Math.PI * x), 1), ph: U.round(3.3 + 0.1 * x, 2), acidezVolatil: U.round(0.18 + 0.12 * x, 2), so2Libre: i % 4 === 0 ? U.round(so2 * (1 - 0.6 * x), 0) : '', so2Total: i % 4 === 0 ? U.round(so2 * 2.4, 0) : '', responsable: 'Tomás Muñoz', observaciones: i === 2 ? 'Inicio tumultuosa, buen sombrero/espuma' : '' });
      }
    };
    curve(FSB, '2026-03-09', 18, 22.4, 14, 17, 22);
    curve(FCS, '2026-04-03', 10, 24.8, 22, 28.5, 18);
    curve(FCA, '2026-04-16', 14, 25.2, 23, 29, 17);
    [['2026-04-15', 28], ['2026-06-10', 31], ['2026-08-20', 33], ['2026-10-20', 38]].forEach(([f, v]) => segs.push({ fermentacionId: FSB, fecha: f, so2Libre: v, so2Total: v * 3, temperatura: 12, responsable: 'Tomás Muñoz', observaciones: 'Control en guarda' }));
    [['2026-06-01', 24], ['2026-09-01', 27]].forEach(([f, v]) => segs.push({ fermentacionId: FCS, fecha: f, so2Libre: v, so2Total: v * 3.1, temperatura: 15, responsable: 'Tomás Muñoz', observaciones: 'Control en guarda' }));
    [['2026-06-20', 22], ['2026-09-10', 26]].forEach(([f, v]) => segs.push({ fermentacionId: FCA, fecha: f, so2Libre: v, so2Total: v * 3, temperatura: 15, responsable: 'Tomás Muñoz' }));
    await put('seguimiento', segs);
    const so2 = (fid, fecha, gramos, litros, previo, medido, motivo) => { const dosis = VG.calc.oenology.dosisMgL(gramos, litros, 0.57); return { fermentacionId: fid, fecha, insumoId: I.meta, producto: 'K₂S₂O₅', fraccion: 0.57, gramos, volumen: litros, dosisMgL: U.round(dosis, 1), so2Previo: previo, so2Medido: medido, so2Teorico: U.round(previo + dosis, 1), costo: Math.round(gramos / 1000 * 6800), motivo, modo: 'suave', responsable: 'Tomás Muñoz' }; };
    await put('adicionSO2', [
      so2(FSB, '2026-03-08', 700, 14600, 0, 22, 'Protección del mosto'), so2(FSB, '2026-03-29', 600, 14400, 8, 26, 'Post FA'), so2(FSB, '2026-10-12', 520, 6990, 24, 38, 'Ajuste previo a envasado'),
      so2(FCS, '2026-04-02', 640, 18400, 0, 18, 'Encubado'), so2(FCS, '2026-05-22', 900, 18050, 6, 24, 'Post FML'),
      so2(FCA, '2026-04-15', 380, 10800, 0, 17, 'Encubado'), so2(FCA, '2026-06-13', 520, 10580, 7, 22, 'Post FML')
    ]);

    /* ---------------- Aditivos (vinificación) ---------------- */
    await put('aditivo', [
      { fecha: '2025-03-10', loteId: L.sb25, tipo: 'levadura', insumoId: I.lev, producto: 'Levadura seca activa', dosis: 20, unidadDosis: 'g/hL', volumen: 12000, cantidad: 2.4, costo: 124800, objetivo: 'Inoculación' },
      { fecha: '2025-04-02', loteId: L.cs25, tipo: 'levadura', insumoId: I.lev, producto: 'Levadura seca activa', dosis: 20, unidadDosis: 'g/hL', volumen: 15000, cantidad: 3, costo: 156000, objetivo: 'Inoculación' },
      { fecha: '2026-03-09', loteId: L.sb26, tipo: 'levadura', insumoId: I.lev, producto: 'Levadura seca activa', dosis: 20, unidadDosis: 'g/hL', volumen: 14600, cantidad: 2.92, costo: 151840, objetivo: 'Inoculación' },
      { fecha: '2026-03-09', loteId: L.sb26, tipo: 'enzima', insumoId: I.enz, producto: 'Enzima pectolítica', dosis: 2, unidadDosis: 'g/hL', volumen: 14600, cantidad: 0.292, costo: 25988, objetivo: 'Desfangado' },
      { fecha: '2026-03-12', loteId: L.sb26, tipo: 'nutriente', insumoId: I.nutri, producto: 'Fosfato diamónico', dosis: 20, unidadDosis: 'g/hL', volumen: 14600, cantidad: 2.92, costo: 27740, objetivo: 'Nutrición' },
      { fecha: '2026-07-10', loteId: L.sb26, tipo: 'bentonita', insumoId: I.bento, producto: 'Bentonita sódica', dosis: 60, unidadDosis: 'g/hL', volumen: 14400, cantidad: 8.64, costo: 36288, objetivo: 'Estabilidad proteica' },
      { fecha: '2026-04-03', loteId: L.cs26, tipo: 'levadura', insumoId: I.lev, producto: 'Levadura seca activa', dosis: 20, unidadDosis: 'g/hL', volumen: 18400, cantidad: 3.68, costo: 191360, objetivo: 'Inoculación' },
      { fecha: '2026-04-03', loteId: L.cs26, tipo: 'tartarico', insumoId: I.tart, producto: 'Ácido tartárico', dosis: 100, unidadDosis: 'g/hL', volumen: 18400, cantidad: 18.4, costo: 143520, objetivo: 'Corrección de acidez' },
      { fecha: '2026-04-06', loteId: L.cs26, tipo: 'tanino', insumoId: I.tan, producto: 'Tanino enológico', dosis: 10, unidadDosis: 'g/hL', volumen: 18400, cantidad: 1.84, costo: 117760, objetivo: 'Estabilizar color' },
      { fecha: '2026-04-16', loteId: L.ca26, tipo: 'levadura', insumoId: I.lev, producto: 'Levadura seca activa', dosis: 20, unidadDosis: 'g/hL', volumen: 10800, cantidad: 2.16, costo: 112320, objetivo: 'Inoculación' },
      { fecha: '2026-04-16', loteId: L.ca26, tipo: 'tartarico', insumoId: I.tart, producto: 'Ácido tartárico', dosis: 150, unidadDosis: 'g/hL', volumen: 10800, cantidad: 16.2, costo: 126360, objetivo: 'Corrección de acidez' }
    ]);

    /* ---------------- Laboratorio ---------------- */
    const an = (fecha, loteId, lab, sag, o) => Object.assign({ fecha, loteId, laboratorio: lab, autorizadoSAG: sag }, o);
    await put('analisis', [
      an('2025-06-20', L.sb25, 'Laboratorio Enológico Demo', true, { ph: 3.31, acidezTotal: 6.4, acidezVolatil: 0.36, so2Libre: 30, so2Total: 98, alcohol: 13.0, azucarResidual: 1.9, turbidez: 1.2, densidad: 992.1, color: 'Amarillo verdoso brillante', certificadoDO: true }),
      an('2025-09-25', L.cs25, 'Laboratorio Enológico Demo', true, { ph: 3.62, acidezTotal: 5.4, acidezVolatil: 0.52, so2Libre: 26, so2Total: 82, alcohol: 14.2, azucarResidual: 1.6, densidad: 993.4, color: 'Rojo rubí intenso', certificadoDO: true }),
      an('2026-04-02', L.sb26, 'Laboratorio Enológico Demo', true, { ph: 3.30, acidezTotal: 6.7, acidezVolatil: 0.31, so2Libre: 26, so2Total: 80, alcohol: 13.1, azucarResidual: 1.8, densidad: 991.8 }),
      an('2026-07-28', L.sb26, 'Laboratorio Enológico Demo', true, { ph: 3.32, acidezTotal: 6.5, acidezVolatil: 0.34, so2Libre: 32, so2Total: 104, alcohol: 13.1, azucarResidual: 1.8, turbidez: 0.9, densidad: 991.9, certificadoDO: true }),
      an('2026-05-25', L.cs26, 'Laboratorio Enológico Demo', true, { ph: 3.66, acidezTotal: 5.6, acidezVolatil: 0.48, so2Libre: 24, so2Total: 75, alcohol: 14.4, azucarResidual: 1.5, densidad: 993.6, color: 'Rojo violáceo profundo' }),
      an('2026-06-15', L.ca26, 'Laboratorio interno', false, { ph: 3.71, acidezTotal: 5.3, acidezVolatil: 0.61, so2Libre: 22, so2Total: 70, alcohol: 14.6, azucarResidual: 2.1, densidad: 994.0 })
    ]);

    /* ---------------- Marca y etiquetas ---------------- */
    await put('marca', [{ id: 'mar_1', nombre: 'Los Robles Reserva', numeroINAPI: '1.234.567', clases: '33', fechaRegistro: '2019-05-14', vencimiento: '2029-05-14', costo: 1350000, titular: 'Viña Los Robles Demo SpA' }]);
    const ET = { sb: 'etq_sb', cs: 'etq_cs', fam: 'etq_fam' };
    await put('etiqueta', [
      { id: ET.sb, nombre: 'Los Robles Reserva Sauvignon Blanc', version: 2, marcaId: 'mar_1', fecha: '2025-05-02', disenador: 'Estudio Gráfico Demo', costoDiseno: 850000, costoFotografia: 0, costoIlustracion: 250000, costoImpresion: 92, proveedorId: P.imp, tirajeMinimo: 5000, tirajeEstimado: 20000, aprobacionLegal: true, varietal: 'Sauvignon Blanc', graduacion: 13, contenido: '750 ml', denominacion: 'Vino', do: 'Valle de Colchagua' },
      { id: ET.cs, nombre: 'Los Robles Reserva Cabernet Sauvignon', version: 3, marcaId: 'mar_1', fecha: '2025-08-10', disenador: 'Estudio Gráfico Demo', costoDiseno: 900000, costoFotografia: 300000, costoIlustracion: 0, costoImpresion: 98, proveedorId: P.imp, tirajeMinimo: 5000, tirajeEstimado: 25000, aprobacionLegal: true, varietal: 'Cabernet Sauvignon', graduacion: 14, contenido: '750 ml', denominacion: 'Vino', do: 'Valle de Colchagua' },
      { id: ET.fam, nombre: 'Los Robles Familiar', version: 1, marcaId: 'mar_1', fecha: '2025-12-01', disenador: 'Estudio Gráfico Demo', costoDiseno: 350000, costoImpresion: 45, proveedorId: P.imp, tirajeMinimo: 2000, tirajeEstimado: 6000, aprobacionLegal: true, denominacion: 'Vino', graduacion: 13.5 }
    ]);

    /* ---------------- Formatos ---------------- */
    const FM = { b75: 'fmt_075', b1: 'fmt_1', p2: 'fmt_2', p5: 'fmt_5' };
    const existFmt = db.list('formato').length;
    if (!existFmt) await put('formato', [
      { id: FM.b75, nombre: 'Botella 0,75 L', litros: 0.75, envase: 'vidrio', unidadesCaja: 12, stockMinimo: 600 },
      { id: FM.b1, nombre: 'Botella 1 L', litros: 1, envase: 'vidrio', unidadesCaja: 6, stockMinimo: 120 },
      { id: FM.p2, nombre: 'PET 2 L', litros: 2, envase: 'PET', unidadesCaja: 6, stockMinimo: 60 },
      { id: FM.p5, nombre: 'Bidón 5 L', litros: 5, envase: 'PET', unidadesCaja: 1, stockMinimo: 20 }
    ]);

    /* ---------------- Compras (antes del envasado: stock de insumos) ---------------- */
    const compras = [];
    let folioProv = 4100;
    const compra = (fecha, prov, insumoKey, cantidad, precio, pagado, desc) => {
      const t = tot(cantidad * precio, false);
      const plazo = (db.get('proveedor', prov) || {}).plazo || 30;
      compras.push({ id: id('com'), fecha, proveedorId: prov, documento: 'factura', folio: ++folioProv, descripcion: desc || (insumos.find(x => x[0] === insumoKey) || [])[1], insumoId: insumoKey ? I[insumoKey] : '', cantidad, precioUnitario: precio, neto: t.neto, exento: 0, iva: t.iva, total: t.total, vencimiento: U.addDays(fecha, plazo), estadoPago: pagado ? 'pagado' : 'pendiente', fechaPago: pagado ? U.addDays(fecha, plazo) : '', categoria: 'insumos' });
    };
    // 2025
    compra('2024-09-10', P.agro, 'urea', 500, 960, true); compra('2024-10-05', P.agro, 'npk', 1000, 1120, true); compra('2024-11-01', P.agro, 'azufre', 120, 2350, true); compra('2025-01-10', P.agro, 'fungi', 4, 37000, true);
    compra('2025-02-20', P.eno, 'lev', 6, 50000, true); compra('2025-02-20', P.eno, 'meta', 25, 6500, true);
    compra('2025-06-15', P.cris, 'bot750', 18000, 410, true); compra('2025-06-15', P.cor, 'corcho', 18000, 165, true); compra('2025-06-15', P.cor, 'caps', 19000, 56, true); compra('2025-06-20', P.cris, 'caja12', 1500, 860, true);
    compra('2025-06-25', P.imp, null, 1, 1650000, true, 'Impresión etiquetas SB/CS 18.000 un.');
    // 2026
    compra('2025-09-12', P.agro, 'urea', 500, 980, true); compra('2025-10-03', P.agro, 'npk', 1000, 1150, true); compra('2025-11-02', P.agro, 'azufre', 130, 2400, true); compra('2026-01-12', P.agro, 'fungi', 5, 38000, true);
    compra('2025-12-10', P.pet, 'pet2', 700, 250, true); compra('2025-12-10', P.pet, 'pet5', 150, 680, true); compra('2025-12-10', P.cor, 'rosca', 2600, 55, true); compra('2025-12-12', P.imp, 'etqfam', 2000, 45, true);
    compra('2026-02-18', P.eno, 'lev', 10, 52000, true); compra('2026-02-18', P.eno, 'meta', 30, 6800, true); compra('2026-02-18', P.eno, 'tart', 40, 7800, true); compra('2026-02-18', P.eno, 'enz', 0.5, 89000, true); compra('2026-02-18', P.eno, 'tan', 2, 64000, true); compra('2026-02-18', P.eno, 'nutri', 10, 9500, true); compra('2026-06-30', P.eno, 'bento', 15, 4200, true);
    compra('2026-07-20', P.cris, 'bot750', 9000, 430, true); compra('2026-07-20', P.cor, 'corcho', 9000, 170, true); compra('2026-07-20', P.cor, 'caps', 9000, 58, true); compra('2026-07-22', P.cris, 'caja12', 750, 880, true);
    compra('2026-08-25', P.cris, 'bot1l', 1600, 520, true); compra('2026-08-25', P.cris, 'caja6', 280, 720, true);
    compra('2026-10-15', P.cris, 'bot750', 6000, 445, false); compra('2026-10-20', P.cor, 'corcho', 6000, 172, false); compra('2026-11-05', P.imp, null, 1, 980000, false, 'Impresión etiquetas CS 2026 10.000 un.');
    await put('compra', compras);
    await put('movInsumo', compras.filter(c => c.insumoId).map(c => ({ fecha: c.fecha, insumoId: c.insumoId, cantidad: c.cantidad, tipo: 'compra', ref: 'compra:' + c.id, costoUnitario: c.precioUnitario })));
    // consumo de insumos aplicados en campo y bodega
    await put('movInsumo', apl.map(a => ({ fecha: a.fecha, insumoId: a.insumoId, cantidad: -a.cantidad, tipo: 'aplicacion', ref: 'aplicacion' })).concat(
      db.list('aditivo').map(a => ({ fecha: a.fecha, insumoId: a.insumoId, cantidad: -a.cantidad, tipo: 'aditivo', ref: 'aditivo:' + a.id })),
      db.list('adicionSO2').map(a => ({ fecha: a.fecha, insumoId: a.insumoId, cantidad: -a.gramos / 1000, tipo: 'so2', ref: 'so2:' + a.id }))));

    /* ---------------- Órdenes de envasado ---------------- */
    const ordenes = [];
    const orden = async (cod, fecha, loteId, est, fmt, unidades, ins, etq, mo) => {
      const o = { id: id('oe'), codigo: cod, fecha, loteId, estanqueId: est, formatoId: fmt, unidades, mermaPct: 1.5, envaseId: I[ins.env], cierreId: I[ins.cie], capsulaId: ins.cap ? I[ins.cap] : '', cajaId: ins.caja ? I[ins.caja] : '', etiquetaId: etq, manoObra: mo, energiaAgua: Math.round(unidades * 18), responsable: 'Tomás Muñoz', estado: 'confirmada', declaraDO: fmt === FM.b75, pctUvaZona: 100, certificadoDO: fmt === FM.b75 ? 'Cert. D.O. Colchagua N° 2026-118 (entidad autorizada SAG)' : '', graduacion: 13.5 };
      const c = F.costoEnvasado(o);
      Object.assign(o, { costoUnitario: Math.round(c.unitario), costoTotal: Math.round(c.total), litrosConsumidos: U.round(c.litrosConsumidos, 1), costoPartes: c.partes });
      await one('ordenEnvasado', o);
      await put('movBodega', [{ fecha, estanqueId: est, loteId, litros: -U.round(c.litrosConsumidos, 1), tipo: 'envasado', ref: 'envasado:' + o.id, glosa: 'Envasado ' + cod }]);
      const fm = db.get('formato', fmt);
      await put('movInsumo', [[o.envaseId, unidades], [o.cierreId, unidades], [o.capsulaId, unidades], [o.cajaId, Math.ceil(unidades / (fm.unidadesCaja || 12))], [ins.etqIns ? I[ins.etqIns] : '', unidades]].filter(x => x[0]).map(([iid, q]) => ({ fecha, insumoId: iid, cantidad: -q, tipo: 'consumo_envasado', ref: 'envasado:' + o.id })));
      ordenes.push(o); return o;
    };
    const vid = { env: 'bot750', cie: 'corcho', cap: 'caps', caja: 'caja12' };
    const O1 = await orden('OE-2025-01', '2025-07-15', L.sb25, E1, FM.b75, 8000, vid, ET.sb, 1400000);
    const O2 = await orden('OE-2025-02', '2025-10-20', L.cs25, E2, FM.b75, 9600, vid, ET.cs, 1650000);
    const O3 = await orden('OE-2026-01', '2026-01-20', L.cs25, E2, FM.p2, 600, { env: 'pet2', cie: 'rosca', etqIns: 'etqfam' }, ET.fam, 220000);
    const O4 = await orden('OE-2026-02', '2026-03-03', L.cs25, E4, FM.p5, 120, { env: 'pet5', cie: 'rosca', etqIns: 'etqfam' }, ET.fam, 80000);
    const O5 = await orden('OE-2026-03', '2026-08-18', L.sb26, E1, FM.b75, 8000, vid, ET.sb, 1450000);
    const O6 = await orden('OE-2026-04', '2026-09-08', L.sb26, E1, FM.b1, 1500, { env: 'bot1l', cie: 'rosca', cap: 'caps', caja: 'caja6' }, ET.sb, 300000);

    /* ---------------- Ventas + DTE ---------------- */
    const ventas = [], dtes = [], cobros = [];
    const folios = { 33: 0, 39: 0, 52: 0, 61: 0 };
    let vn = 0;
    const venta = (fecha, tipo, cli, canal, qty, precio, src, pagado, extra = {}) => {
      const c = db.get('cliente', cli);
      const isBoleta = canal === 'directa' || canal === 'ecommerce';
      const t = tot(qty * precio);
      const fmt = src.formatoId ? db.get('formato', src.formatoId) : null;
      const litros = tipo === 'granel' ? qty : qty * fmt.litros;
      const costoUnitario = tipo === 'granel' ? Math.round(F.costoLitroLote(src.loteId).costoLitro) : src.costoUnitario;
      const v = Object.assign({ id: id('ven'), codigo: 'V-' + String(++vn).padStart(4, '0'), fecha, tipo, clienteId: cli, canal: tipo === 'granel' ? 'granel' : canal, cantidad: qty, litros, precio, documento: isBoleta ? 'boleta' : 'factura', estado: 'confirmada', estadoPago: pagado ? 'pagado' : 'pendiente', fechaPago: pagado ? U.addDays(fecha, c.plazo || 0) : '', vencimiento: U.addDays(fecha, c.plazo || 0), costoUnitario, graduacion: tipo === 'granel' ? 13.5 : 13.5 }, t, extra);
      if (tipo === 'granel') Object.assign(v, { loteId: src.loteId, estanqueId: src.estanqueId, descripcion: (db.get('lote', src.loteId) || {}).codigo });
      else Object.assign(v, { formatoId: src.formatoId, ordenEnvasadoId: src.id, loteId: src.loteId });
      const tipoDTE = isBoleta ? 39 : 33;
      const d = { id: id('dte'), direccion: 'emitido', tipo: tipoDTE, folio: ++folios[tipoDTE], fecha, estado: fecha < '2026-11-01' ? 'aceptado' : 'enviado', ventaId: v.id, contraparteRut: c.rut, contraparte: c.nombre, giro: c.giro || '', direccionContraparte: c.direccion || '', comuna: c.comuna || '', detalle: [{ nombre: tipo === 'granel' ? 'Vino a granel ' + v.descripcion : 'Vino ' + fmt.nombre + ' ' + ((db.get('lote', src.loteId) || {}).variedad || ''), cantidad: qty, unidad: tipo === 'granel' ? 'L' : 'UN', precio, monto: t.neto }], neto: t.neto, exento: 0, iva: t.iva, ila: t.ila, total: t.total, formaPago: pagado ? 1 : 2, vencimiento: v.vencimiento };
      d.xml = DTE.xml(d, VG.store.config());
      v.dteId = d.id; v.folio = d.folio;
      ventas.push(v); dtes.push(d);
      if (pagado) cobros.push({ fecha: v.fechaPago, clienteId: cli, ventaId: v.id, monto: v.total, medio: 'transferencia' });
      return v;
    };
    const gSB25 = { loteId: L.sb25, estanqueId: E1 }, gCS25 = { loteId: L.cs25, estanqueId: E2 };
    // 2025
    const vg1 = venta('2025-09-18', 'granel', CL.gran, 'granel', 3800, 850, gSB25, true);
    venta('2025-08-05', 'envasado', CL.dist, 'distribuidor', 2400, 5800, O1, true);
    venta('2025-09-22', 'envasado', CL.rest, 'restaurante', 360, 7400, O1, true);
    venta('2025-10-28', 'envasado', CL.vino, 'distribuidor', 1800, 6000, O1, true);
    venta('2025-11-03', 'envasado', CL.part, 'directa', 440, 9500, O1, true);
    const vg2 = venta('2025-11-12', 'granel', CL.gran, 'granel', 2000, 950, gCS25, true);
    venta('2025-12-02', 'envasado', CL.dist, 'distribuidor', 1200, 6000, O2, true);
    venta('2025-12-15', 'envasado', CL.web, 'ecommerce', 180, 8900, O2, true);
    // 2026
    const vg3 = venta('2026-02-12', 'granel', CL.gran, 'granel', 1910, 800, gSB25, true);
    venta('2026-01-14', 'envasado', CL.dist, 'distribuidor', 2400, 6000, O2, true);
    venta('2026-02-20', 'envasado', CL.rest, 'restaurante', 480, 7500, O2, true);
    venta('2026-03-18', 'envasado', CL.vino, 'distribuidor', 1500, 6000, O2, true);
    venta('2026-04-10', 'envasado', CL.dist, 'distribuidor', 760, 5900, O1, true);
    venta('2026-04-22', 'envasado', CL.part, 'directa', 300, 9500, O2, true);
    venta('2026-05-06', 'envasado', CL.rest, 'restaurante', 220, 9000, O3, true);
    venta('2026-05-30', 'envasado', CL.web, 'ecommerce', 140, 8900, O2, true);
    const vg4 = venta('2026-06-16', 'granel', CL.gran, 'granel', 2500, 1000, { loteId: L.cs26, estanqueId: E2 }, true);
    venta('2026-06-25', 'envasado', CL.part, 'directa', 90, 19000, O4, true);
    venta('2026-07-08', 'envasado', CL.dist, 'distribuidor', 1400, 6000, O2, true);
    venta('2026-08-26', 'envasado', CL.dist, 'distribuidor', 2400, 6000, O5, true);
    venta('2026-09-10', 'envasado', CL.vino, 'distribuidor', 1200, 6100, O5, true);
    venta('2026-09-17', 'envasado', CL.part, 'directa', 520, 9500, O5, true);
    venta('2026-09-30', 'envasado', CL.rest, 'restaurante', 600, 6500, O6, true);
    venta('2026-10-08', 'envasado', CL.rest, 'restaurante', 180, 9000, O3, true);
    const vg5 = venta('2026-10-14', 'granel', CL.gran, 'granel', 3000, 900, { loteId: L.sb26, estanqueId: E1 }, false);
    venta('2026-10-21', 'envasado', CL.dist, 'distribuidor', 1500, 6000, O5, false);
    venta('2026-10-29', 'envasado', CL.web, 'ecommerce', 260, 8900, O5, true);
    venta('2026-11-04', 'envasado', CL.vino, 'distribuidor', 300, 6500, O6, false);
    venta('2026-09-05', 'envasado', CL.dist, 'distribuidor', 680, 5900, O2, false, { vencimiento: '2026-10-05' });
    await put('venta', ventas);
    await put('movBodega', [vg1, vg2, vg3, vg4, vg5].map(v => ({ fecha: v.fecha, estanqueId: v.estanqueId, loteId: v.loteId, litros: -v.litros, tipo: 'venta_granel', ref: 'venta:' + v.id, glosa: 'Venta granel ' + v.codigo })));
    await put('cobro', cobros);

    /* ---------------- CAF (folios) ---------------- */
    await put('caf', [
      { tipo: 33, desde: 1, hasta: 26, fechaAutorizacion: '2025-01-05' },
      { tipo: 39, desde: 1, hasta: 500, fechaAutorizacion: '2025-01-05' },
      { tipo: 52, desde: 1, hasta: 100, fechaAutorizacion: '2025-01-05' },
      { tipo: 61, desde: 1, hasta: 50, fechaAutorizacion: '2025-01-05' }
    ]);

    /* ---------------- Trabajadores, remuneraciones, honorarios ---------------- */
    const TR = [
      { id: 'tra_1', nombre: 'Marcela Ibáñez', rut: rutOk('14.111.222-0'), cargo: 'Administradora', contrato: 'indefinido', area: 'admin', sueldoBase: 1150000, gratificacion: 'art50', bonos: 0, comisiones: 0, colacion: 60000, movilizacion: 40000, afp: 'Modelo', salud: 'Fonasa', ingreso: '2018-03-01', vacacionesPendientes: 8 },
      { id: 'tra_2', nombre: 'Tomás Muñoz', rut: rutOk('15.678.901-0'), cargo: 'Enólogo', contrato: 'indefinido', area: 'produccion', sueldoBase: 1350000, gratificacion: 'art50', bonos: 80000, comisiones: 0, colacion: 60000, movilizacion: 40000, afp: 'Habitat', salud: 'Isapre', planSalud: 140000, ingreso: '2016-08-01', vacacionesPendientes: 12 },
      { id: 'tra_3', nombre: 'Jorge Contreras', rut: rutOk('11.222.333-0'), cargo: 'Bodeguero', contrato: 'indefinido', area: 'produccion', sueldoBase: 620000, gratificacion: 'art50', bonos: 30000, comisiones: 0, colacion: 50000, movilizacion: 30000, afp: 'Capital', salud: 'Fonasa', ingreso: '2019-01-15', vacacionesPendientes: 5 },
      { id: 'tra_4', nombre: 'Camila Soto', rut: rutOk('17.890.123-0'), cargo: 'Ejecutiva comercial', contrato: 'indefinido', area: 'ventas', sueldoBase: 600000, gratificacion: 'art50', bonos: 0, comisiones: 120000, colacion: 50000, movilizacion: 30000, afp: 'Uno', salud: 'Fonasa', ingreso: '2022-05-02', vacacionesPendientes: 10 }
    ];
    await put('trabajador', TR);
    const rems = [];
    const meses = U.monthsOfYear(2025).concat(U.monthsOfYear(2026).filter(m => m <= '2026-10'));
    meses.forEach(per => TR.forEach(t => { const l = T.liquidacion(t); rems.push(Object.assign({ trabajadorId: t.id, periodo: per, estado: 'pagada', fechaPago: per + '-30' }, l)); }));
    await put('remuneracion', rems);
    await put('honorario', meses.map(per => { const bruto = 420000, ret = Math.round(bruto * 0.1525); return { fecha: per + '-05', nombre: 'Asesoría contable externa', rut: rutOk('10.333.444-0'), numero: Number(per.replace('-', '')) % 1000, bruto, retencion: ret, liquido: bruto - ret, estado: 'pagada', descripcion: 'Contabilidad mensual' }; }));

    /* ---------------- Gastos ---------------- */
    const gastos = [];
    meses.forEach(per => {
      const g = (dia, categoria, descripcion, monto, o = {}) => gastos.push(Object.assign({ fecha: per + '-' + dia, categoria, descripcion, monto, afectoIVA: true, documento: 'factura', medioPago: 'transferencia', estado: 'pagado', tipoCosto: 'fijo', area: 'admin', proveedor: '' }, o));
      g('10', 'servicios', 'Electricidad', 320000 + (['01', '02', '03', '04'].includes(per.slice(5)) ? 180000 : 0), { area: 'produccion', tipoCosto: 'variable', proveedorId: P.luz });
      g('10', 'servicios', 'Agua potable', 65000, { area: 'produccion' });
      g('12', 'servicios', 'Internet y telefonía', 42000);
      g('15', 'seguros', 'Seguro instalaciones y vehículos', 145000, { afectoIVA: false, documento: 'otro' });
      g('18', 'combustible', 'Combustible camioneta y maquinaria', 180000, { area: 'produccion', tipoCosto: 'variable' });
      g('20', 'marketing', 'Marketing digital y redes', 240000, { area: 'ventas', tipoCosto: 'variable' });
      g('25', 'financiero', 'Intereses crédito bancario', 115000, { afectoIVA: false, documento: 'otro', medioPago: 'cargo automático' });
      g('26', 'financiero', 'Comisiones bancarias', 12000, { afectoIVA: false, documento: 'otro', medioPago: 'cargo automático' });
      const m = per.slice(5);
      if (m === '01' || m === '07') { g('28', 'patentes', 'Patente municipal (semestre)', 580000, { afectoIVA: false, documento: 'otro' }); g('28', 'patentes', 'Patente de alcoholes (semestre)', 175000, { afectoIVA: false, documento: 'otro' }); }
      if (['04', '06', '09', '11'].includes(m)) g('27', 'contribuciones', 'Contribuciones de bienes raíces', 245000, { afectoIVA: false, documento: 'otro' });
      if (m === '05' || m === '10') g('14', 'mantencion', 'Mantención equipos de bodega', 420000, { area: 'produccion' });
      if (m === '08') g('22', 'certificaciones', 'Auditoría certificación sustentable', 650000, {});
      if (m === '03') g('19', 'otros', 'Almuerzo de vendimia y regalos', 160000, { noDeducible: true, afectoIVA: false, documento: 'boleta' });
    });
    await put('gasto', gastos);
    await put('presupuesto', [['servicios', 6200000], ['seguros', 1740000], ['combustible', 2000000], ['marketing', 2400000], ['financiero', 1500000], ['patentes', 1500000], ['contribuciones', 980000], ['mantencion', 700000], ['certificaciones', 600000], ['otros', 300000]].map(([categoria, monto]) => ({ anio: 2026, categoria, monto })));
    await put('activo', [
      { nombre: 'Prensa neumática 50 hL', valor: 18000000, vidaUtil: 10, fechaCompra: '2018-02-01' },
      { nombre: 'Estanques acero inoxidable (3)', valor: 42000000, vidaUtil: 20, fechaCompra: '2016-01-15' },
      { nombre: 'Línea de embotellado semiautomática', valor: 12500000, vidaUtil: 10, fechaCompra: '2020-06-01' },
      { nombre: 'Camioneta 4x4', valor: 16000000, vidaUtil: 7, fechaCompra: '2022-03-01' }
    ]);

    /* ---------------- DTE recibidos (compras y gastos con factura) ---------------- */
    let folioG = 900;
    db.list('compra').forEach(c => { const p = db.get('proveedor', c.proveedorId) || {}; dtes.push({ id: id('dte'), direccion: 'recibido', tipo: 33, folio: c.folio, fecha: c.fecha, estado: 'aceptado', compraId: c.id, contraparteRut: p.rut, contraparte: p.nombre, neto: c.neto, exento: 0, iva: c.iva, ila: 0, total: c.total, detalle: [{ nombre: c.descripcion, cantidad: c.cantidad, unidad: 'UN', precio: c.precioUnitario, monto: c.neto }] }); });
    gastos.filter(g => g.afectoIVA && g.documento === 'factura').forEach(g => { const t = tot(g.monto, false); dtes.push({ id: id('dte'), direccion: 'recibido', tipo: 33, folio: ++folioG, fecha: g.fecha, estado: 'aceptado', gastoRef: g.descripcion, contraparteRut: rutOk('96.777.888-0'), contraparte: g.descripcion === 'Electricidad' ? 'Compañía Eléctrica Demo' : 'Proveedor de servicios demo', neto: t.neto, exento: 0, iva: t.iva, ila: 0, total: t.total }); });
    await put('dte', dtes);

    /* ---------------- Banco y conciliación ---------------- */
    const CTA = 'cta_1';
    await put('cuentaBanco', [{ id: CTA, banco: 'Banco Demo de Chile', tipo: 'Cuenta corriente', numero: '00-123-45678-9', moneda: 'CLP', saldoInicial: 18500000, fechaInicio: '2026-09-01' }]);
    const movs = [];
    const libros = VG.integrations.recon.candidatos().filter(c => c.fecha >= '2026-09-01' && c.fecha <= '2026-10-31');
    libros.forEach((c, i) => {
      if (i % 5 === 4) return; // algunas partidas quedan en tránsito (no aparecen aún en el banco)
      const conc = i % 3 !== 2;
      movs.push({ cuentaId: CTA, fecha: U.addDays(c.fecha, i % 2), glosa: (c.monto > 0 ? 'Abono ' : 'Cargo ') + c.desc.slice(0, 40), monto: Math.round(c.monto), estado: conc ? 'conciliado' : 'pendiente', matchRef: conc ? c.ref : '', matchDesc: conc ? c.tipo + ' · ' + c.desc : '' });
    });
    movs.push({ cuentaId: CTA, fecha: '2026-10-31', glosa: 'Comisión mantención cuenta', monto: -8900, estado: 'diferencia', nota: 'Comisión no registrada en libros' });
    movs.push({ cuentaId: CTA, fecha: '2026-10-31', glosa: 'Intereses a favor', monto: 3200, estado: 'pendiente' });
    await put('movBanco', movs);

    /* ---------------- Tributario: pagos PPM / F29, declaraciones ---------------- */
    const pagos = [], obl = [];
    const pers = U.monthsOfYear(2025).concat(U.monthsOfYear(2026).filter(m => m <= '2026-09'));
    for (const per of pers) {
      const f = T.f29(per);
      const [y, m] = per.split('-').map(Number);
      const fechaPago = (m === 12 ? y + 1 : y) + '-' + String(m === 12 ? 1 : m + 1).padStart(2, '0') + '-20';
      pagos.push({ tipo: 'F29', periodo: per, fecha: fechaPago, monto: f.total, folioSII: String(7000000 + pagos.length * 37) });
      pagos.push({ tipo: 'PPM', periodo: per, fecha: fechaPago, monto: f.ppm, incluidoEnF29: true });
      obl.push({ key: 'F29-' + per, estado: 'cumplida', fecha: fechaPago });
    }
    await put('pagoImpuesto', pagos);
    await put('f29', ['2026-08', '2026-09', '2026-10'].map(per => ({ periodo: per, estado: per === '2026-10' ? 'borrador' : 'pagado', folioSII: per === '2026-10' ? '' : '78' + per.replace('-', ''), snapshot: T.f29(per) })));
    ['PATMUN-2026-1ª cuota', 'PATALC-2026-1ª cuota', 'PATMUN-2026-2ª cuota', 'PATALC-2026-2ª cuota', 'CONTRIB-2026-1ª', 'CONTRIB-2026-2ª', 'CONTRIB-2026-3ª', 'SAG-EXIST-2026', 'SAG-COSECHA-2026', 'SAG-COSECHA-CORR-2026', 'RENTA-2026'].forEach(k => obl.push({ key: k, estado: 'cumplida' }));
    await put('obligacion', obl);
    const r25 = T.renta(2025);
    await put('renta', [{ anioTributario: 2026, anioComercial: 2025, estado: 'declarado', folioSII: 'F22-2026-55321', snapshot: r25 }]);

    /* ---------------- Cumplimiento normativo ---------------- */
    await put('cumplimiento', [
      { nombre: 'Inscripción de productos en el SAG', tipo: 'SAG', numero: 'SAG-VI-04521', estado: 'vigente', fecha: '2015-03-10', vencimiento: '', responsable: 'Francisca Rojas', notas: 'Inscribir cada producto nuevo antes de comercializar.' },
      { nombre: 'Inicio de actividades SII', tipo: 'SII', numero: 'Res. 2014', estado: 'vigente', fecha: '2014-06-01', vencimiento: '' },
      { nombre: 'Inscripción como viña/bodega ante SAG', tipo: 'SAG', estado: 'vigente', fecha: '2014-07-15', vencimiento: '' },
      { nombre: 'Patente de alcoholes (Ley 19.925) — 2º semestre', tipo: 'Patente', numero: 'PA-2231', estado: 'vigente', fecha: '2026-07-28', vencimiento: '2027-01-31', avisoDias: 45 },
      { nombre: 'Registro de marca INAPI "Los Robles Reserva"', tipo: 'INAPI', numero: '1.234.567', estado: 'vigente', fecha: '2019-05-14', vencimiento: '2029-05-14', avisoDias: 180 },
      { nombre: 'Certificado D.O. Valle de Colchagua — cosecha 2026', tipo: 'D.O.', numero: '2026-118', estado: 'vigente', fecha: '2026-07-30', vencimiento: '2027-07-30' },
      { nombre: 'Certificación Código Nacional de Sustentabilidad', tipo: 'Certificación', numero: 'CS-0932', estado: 'vigente', fecha: '2023-12-01', vencimiento: '2026-12-01', avisoDias: 30 },
      { nombre: 'Libro de existencias de vino (actualizado)', tipo: 'SAG', estado: 'vigente', fecha: '2026-10-31', vencimiento: '' },
      { nombre: 'Análisis en laboratorio autorizado SAG (lotes 2026)', tipo: 'SAG', estado: 'pendiente', fecha: '', vencimiento: '2026-11-30', avisoDias: 30, notas: 'Falta análisis autorizado para L-2026-CA.' }
    ]);

    /* ---------------- Tareas ---------------- */
    await put('tarea', [
      { titulo: 'Revisar borrador F29 de octubre', descripcion: 'Validar con la contadora antes del día 20.', rol: 'administrativo', estado: 'pendiente', fecha: '2026-11-10', ruta: '#/tributario', modulo: 'tributario' },
      { titulo: 'Análisis autorizado SAG para L-2026-CA', descripcion: 'Enviar muestra a laboratorio autorizado.', rol: 'enologo', estado: 'pendiente', fecha: '2026-11-08', ruta: '#/laboratorio', modulo: 'laboratorio' },
      { titulo: 'Cobrar factura vencida a Distribuidora Andes', descripcion: 'Venta del 05-09 vencida el 05-10.', rol: 'ventas', estado: 'pendiente', fecha: '2026-11-06', ruta: '#/clientes/cobranza', modulo: 'clientes' }
    ]);

    await db.setMeta('season', 2026);
    VG.store.state.season = 2026;
    VG.events.emit('data.saved', { entity: '*', many: true });
  }

  VG.seed = { load };
})(window.VG);
