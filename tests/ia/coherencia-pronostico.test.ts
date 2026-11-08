import { describe, expect, it } from 'vitest';
import { rangoFechas } from '@/lib/fechas';
import {
  MENSAJE_FALLO_COHERENCIA,
  revisarCoherencia,
  seleccionarCatalogo,
  seleccionarNuevos,
} from '@/lib/importar/coherencia';
import { AVISO_SIN_AJUSTE, evaluarAjuste, pronosticarConAgente } from '@/lib/pronostico/agente';
import { calcularLineaBase } from '@/lib/pronostico/linea-base';
import { crearAdaptadorFalso, crearRegistroFalso } from './adaptador-falso';

const CATALOGO = [
  { nombre: 'Marraqueta', unidades28: 1200 },
  { nombre: 'Hallulla', unidades28: 800 },
  { nombre: 'Leche entera 1L', unidades28: 500 },
];

describe('Agente de Coherencia (6.6) con adaptador falso', () => {
  it('los nombres que no estaban en la entrada se descartan', async () => {
    const { adaptador } = crearAdaptadorFalso({
      salida: {
        productos_ajenos: [
          { nombre: 'Neumático 175/70', motivo: 'Es un repuesto de auto, no un producto de panadería.' },
          { nombre: 'Producto inventado', motivo: 'no estaba en la lista' },
        ],
        confianza: 'alta',
      },
    });
    const { registrarUso, versiones } = crearRegistroFalso();
    const r = await revisarCoherencia(
      { catalogo: CATALOGO, nuevos: ['Neumático 175/70', 'Pan de molde'] },
      { adaptador, registrarUso },
    );
    expect(r).toEqual({
      estado: 'revisada',
      productosAjenos: [{ nombre: 'Neumático 175/70', motivo: 'Es un repuesto de auto, no un producto de panadería.' }],
      confianza: 'alta',
      avisos: [],
    });
    expect(versiones).toEqual(['coherencia_v1']);
  });

  it('no se ejecuta si no hay productos nuevos o si el catálogo está vacío', async () => {
    const { adaptador, llamadas } = crearAdaptadorFalso({ salida: { productos_ajenos: [], confianza: 'alta' } });
    const { registrarUso } = crearRegistroFalso();
    expect(await revisarCoherencia({ catalogo: CATALOGO, nuevos: [] }, { adaptador, registrarUso })).toEqual({ estado: 'omitida' });
    expect(await revisarCoherencia({ catalogo: [], nuevos: ['Kéfir'] }, { adaptador, registrarUso })).toEqual({ estado: 'omitida' });
    expect(llamadas).toHaveLength(0);
  });

  it('si falla, no interrumpe nada: solo el aviso', async () => {
    const { adaptador } = crearAdaptadorFalso({ error: { tipo: 'proveedor', detalle: '500' } });
    const { registrarUso } = crearRegistroFalso();
    expect(await revisarCoherencia({ catalogo: CATALOGO, nuevos: ['Kéfir'] }, { adaptador, registrarUso })).toEqual({
      estado: 'fallo',
      mensaje: MENSAJE_FALLO_COHERENCIA,
    });
  });

  it('catálogo: hasta 120, los más vendidos en 28 días, empates por orden alfabético', () => {
    const productos = Array.from({ length: 130 }, (_, i) => ({ nombre: `P${String(i).padStart(3, '0')}`, unidades28: i < 10 ? 999 : i }));
    const seleccion = seleccionarCatalogo([...productos, { nombre: 'Ñandú', unidades28: 999 }, { nombre: 'Abeja', unidades28: 999 }]);
    expect(seleccion).toHaveLength(120);
    expect(seleccion.slice(0, 3)).toEqual(['Abeja', 'Ñandú', 'P000'].sort((a, b) => a.localeCompare(b, 'es')));
    expect(seleccion).not.toContain('P010'); // el menos vendido queda fuera
  });

  it('nuevos: hasta 60 en orden alfabético; se avisa cuántos no se revisaron', async () => {
    const nuevos = Array.from({ length: 63 }, (_, i) => `Nuevo ${String(i).padStart(2, '0')}`);
    expect(seleccionarNuevos(nuevos)).toMatchObject({ sinRevisar: 3 });
    const { adaptador } = crearAdaptadorFalso({ salida: { productos_ajenos: [], confianza: 'media' } });
    const { registrarUso } = crearRegistroFalso();
    const r = await revisarCoherencia({ catalogo: CATALOGO, nuevos }, { adaptador, registrarUso });
    expect(r.estado === 'revisada' && r.avisos).toEqual([
      'Se revisaron solo los primeros 60 productos nuevos; 3 productos no se revisaron.',
    ]);
  });
});

// ---------------------------------------------------------------------
const HOY = '2026-03-30';
const VENTAS = rangoFechas('2026-03-02', '2026-03-29').map((fecha) => ({ fecha, cantidad: 10 }));
const LINEA_BASE = calcularLineaBase(VENTAS, HOY);
const PRODUCTO = { nombre: 'Marraqueta', unidad: 'kg', perecible: true };

describe('Agente de Pronóstico (6.7) con adaptador falso', () => {
  it('ajuste_pct = 35 se acota a 20 y se aplica a los tres escenarios', async () => {
    const { adaptador } = crearAdaptadorFalso({
      salida: { ajuste_pct: 35, motivo: 'Las últimas dos semanas vendió más que antes.', fechas_citadas: ['2026-03-28', '2026-03-29'] },
    });
    const { registrarUso, versiones } = crearRegistroFalso();
    const r = await pronosticarConAgente({ producto: PRODUCTO, lineaBase: LINEA_BASE }, { adaptador, registrarUso });
    expect(r.ajuste).toMatchObject({ estado: 'aplicado', pct: 20 });
    expect(r.pronostico[0]!.esperado).toBeCloseTo(12, 10);
    expect(r.pronostico[0]!.bajo).toBeCloseTo(LINEA_BASE.pronostico[0]!.bajo * 1.2, 10);
    expect(r.pronostico[0]!.alto).toBeCloseTo(LINEA_BASE.pronostico[0]!.alto * 1.2, 10);
    expect(r.aviso).toBeNull();
    expect(versiones).toEqual(['pronostico_v1']);
  });

  it('un ajuste que cita una fecha que no está en el historial no se aplica', async () => {
    const { adaptador } = crearAdaptadorFalso({
      salida: { ajuste_pct: 10, motivo: 'Se acerca el 18 de septiembre.', fechas_citadas: ['2026-09-18'] },
    });
    const { registrarUso } = crearRegistroFalso();
    const r = await pronosticarConAgente({ producto: PRODUCTO, lineaBase: LINEA_BASE }, { adaptador, registrarUso });
    expect(r.ajuste).toEqual({
      estado: 'sospechoso',
      pct: 10,
      motivo: 'Se acerca el 18 de septiembre.',
      mensaje: 'Sugerencia no aplicada: Se acerca el 18 de septiembre.',
    });
    expect(r.pronostico).toEqual(LINEA_BASE.pronostico);
  });

  it('un ajuste ≠ 0 sin motivo o sin fechas citadas es sospechoso', () => {
    const fechas = new Set(LINEA_BASE.historial.map((d) => d.fecha));
    expect(evaluarAjuste({ ajuste_pct: 5, motivo: '', fechas_citadas: ['2026-03-29'] }, fechas).estado).toBe('sospechoso');
    expect(evaluarAjuste({ ajuste_pct: 5, motivo: 'Subió.', fechas_citadas: [] }, fechas).estado).toBe('sospechoso');
    expect(evaluarAjuste({ ajuste_pct: 0, motivo: 'Sin cambios.', fechas_citadas: [] }, fechas).estado).toBe('sin_ajuste');
    expect(evaluarAjuste({ ajuste_pct: -50, motivo: 'Bajó.', fechas_citadas: ['2026-03-29'] }, fechas)).toMatchObject({ pct: -20 });
  });

  it('un fallo del adaptador muestra la línea base con aviso (no bloquea la vista)', async () => {
    const { adaptador } = crearAdaptadorFalso({ error: { tipo: 'tiempo', detalle: '30 s' } });
    const { registrarUso } = crearRegistroFalso();
    const r = await pronosticarConAgente({ producto: PRODUCTO, lineaBase: LINEA_BASE }, { adaptador, registrarUso });
    expect(r).toEqual({ lineaBase: LINEA_BASE, pronostico: LINEA_BASE.pronostico, ajuste: null, aviso: AVISO_SIN_AJUSTE });
  });

  it('al modelo no se le envía σ: solo datos de negocio ya calculados por código', async () => {
    const { adaptador, llamadas } = crearAdaptadorFalso({ salida: { ajuste_pct: 0, motivo: 'Estable.', fechas_citadas: [] } });
    const { registrarUso } = crearRegistroFalso();
    await pronosticarConAgente({ producto: PRODUCTO, lineaBase: LINEA_BASE }, { adaptador, registrarUso });
    const usuario = llamadas[0]!.usuario;
    expect(usuario.startsWith('<datos_producto>')).toBe(true);
    expect(usuario).not.toMatch(/sigma|desviaci/i);
    expect(usuario).toContain('"historial"');
  });
});
