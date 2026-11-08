/**
 * Evaluación del golden set del Normalizador (PROMPT_MAESTRO 6.14). Funciones puras.
 *
 * Un caso se APRUEBA si sus filas válidas coinciden EXACTAMENTE con las
 * esperadas (en cualquier orden) y se cumplen sus condiciones adicionales.
 * Las filas se comparan tras parseo.ts y el cruce con el catálogo demo:
 * fecha AAAA-MM-DD, producto normalizado, cantidad y costo.
 */
import { z } from 'zod';
import { cruzarNombres, normalizarNombre, type FilaValida, type ProductoCatalogo } from '../importar/mapeo';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const esquemaFilaEsperada = z.object({
  fecha,
  producto: z.string().min(1),
  cantidad: z.number().positive(),
  costo: z.number().nonnegative().nullable(),
});

export const esquemaCaso = z.object({
  id: z.string().regex(/^G\d+$/),
  tipo: z.enum(['venta', 'compra']),
  texto: z.string().min(1),
  filas_esperadas: z.array(esquemaFilaEsperada),
  excluidas_esperadas: z.number().int().nonnegative(),
  condiciones: z
    .object({
      /** Las excluidas deben ser exactamente excluidas_esperadas (cuando el resultado esperado lo indica). */
      excluidas_exactas: z.boolean().optional(),
      sin_cantidades: z.array(z.number()).optional(),
      sin_fechas: z.array(fecha).optional(),
      sin_productos_que_contengan: z.array(z.string().min(1)).optional(),
      min_advertencias: z.number().int().positive().optional(),
      no_interpretable: z.boolean().optional(),
    })
    .strict(),
});

export const esquemaGoldenSet = z.object({
  descripcion: z.string(),
  catalogo_demo: z.array(z.string().min(1)).min(1),
  casos: z.array(esquemaCaso).min(5),
});

export type CasoGolden = z.infer<typeof esquemaCaso>;
export type FilaComparable = z.infer<typeof esquemaFilaEsperada>;

/** Lo que produjo una ejecución del Normalizador (o null si la llamada falló). */
export type Ejecucion =
  | { ok: false; error: string }
  | { ok: true; filas: FilaComparable[]; excluidas: number; advertencias: string[]; noInterpretable: boolean };

export interface EvaluacionCaso {
  id: string;
  aprobado: boolean;
  jsonValido: boolean;
  correctas: number;
  perdidas: number;
  inventadas: number;
  condicionesFallidas: string[];
}

/** Filas válidas → filas comparables, con el producto cruzado contra el catálogo. */
export function filasComparables(validas: FilaValida[], catalogo: ProductoCatalogo[]): FilaComparable[] {
  const cruce = cruzarNombres(validas, catalogo);
  const porId = new Map(catalogo.map((p) => [p.id, normalizarNombre(p.nombre)]));
  return cruce.listas.map((f) => ({
    fecha: f.fecha,
    producto: f.productoId ? (porId.get(f.productoId) ?? f.nombreNormalizado) : f.nombreNormalizado,
    cantidad: f.cantidad,
    costo: f.costoUnitario,
  }));
}

const clave = (f: FilaComparable) => `${f.fecha}|${f.producto}|${f.cantidad}|${f.costo ?? ''}`;

/** Compara como multiconjuntos: cada fila esperada se puede usar una sola vez. */
export function compararFilas(esperadas: FilaComparable[], obtenidas: FilaComparable[]) {
  const pendientes = new Map<string, number>();
  for (const e of esperadas) pendientes.set(clave(e), (pendientes.get(clave(e)) ?? 0) + 1);
  let correctas = 0;
  let inventadas = 0;
  for (const o of obtenidas) {
    const quedan = pendientes.get(clave(o)) ?? 0;
    if (quedan > 0) {
      correctas++;
      pendientes.set(clave(o), quedan - 1);
    } else {
      inventadas++;
    }
  }
  return { correctas, perdidas: esperadas.length - correctas, inventadas };
}

export function evaluarCaso(caso: CasoGolden, ejecucion: Ejecucion): EvaluacionCaso {
  if (!ejecucion.ok) {
    return {
      id: caso.id,
      aprobado: false,
      jsonValido: false,
      correctas: 0,
      perdidas: caso.filas_esperadas.length,
      inventadas: 0,
      condicionesFallidas: [`la llamada falló: ${ejecucion.error}`],
    };
  }

  const { correctas, perdidas, inventadas } = compararFilas(caso.filas_esperadas, ejecucion.filas);
  const c = caso.condiciones;
  const fallidas: string[] = [];
  if (c.excluidas_exactas && ejecucion.excluidas !== caso.excluidas_esperadas) {
    fallidas.push(`excluidas: ${ejecucion.excluidas} (se esperaban ${caso.excluidas_esperadas})`);
  }
  for (const n of c.sin_cantidades ?? []) {
    if (ejecucion.filas.some((f) => f.cantidad === n)) fallidas.push(`hay una fila con cantidad ${n}`);
  }
  for (const f of c.sin_fechas ?? []) {
    if (ejecucion.filas.some((x) => x.fecha === f)) fallidas.push(`hay una fila con fecha ${f}`);
  }
  for (const texto of c.sin_productos_que_contengan ?? []) {
    const buscado = normalizarNombre(texto);
    if (ejecucion.filas.some((f) => f.producto.includes(buscado))) fallidas.push(`hay un producto que contiene «${texto}»`);
  }
  if (c.min_advertencias !== undefined && ejecucion.advertencias.length < c.min_advertencias) {
    fallidas.push(`advertencias: ${ejecucion.advertencias.length} (mínimo ${c.min_advertencias})`);
  }
  if (c.no_interpretable !== undefined && ejecucion.noInterpretable !== c.no_interpretable) {
    fallidas.push(`no_interpretable = ${ejecucion.noInterpretable} (se esperaba ${c.no_interpretable})`);
  }

  const filasExactas = perdidas === 0 && inventadas === 0;
  return {
    id: caso.id,
    aprobado: filasExactas && fallidas.length === 0,
    jsonValido: true,
    correctas,
    perdidas,
    inventadas,
    condicionesFallidas: fallidas,
  };
}

// ---------------------------------------------------------------------
// Métricas por versión: cada repetición recorre todos los casos.
// ---------------------------------------------------------------------

export interface MetricasRepeticion {
  aprobados: number;
  casos: number;
  correctas: number;
  perdidas: number;
  inventadas: number;
  /** % de llamadas con JSON válido al primer intento (no hay reintentos). */
  jsonValidoPct: number;
  tokensEntradaPromedio: number;
  tokensSalidaPromedio: number;
}

export function metricasRepeticion(evaluaciones: EvaluacionCaso[], tokens: { entrada: number; salida: number }[]): MetricasRepeticion {
  const suma = (f: (e: EvaluacionCaso) => number) => evaluaciones.reduce((t, e) => t + f(e), 0);
  const promedio = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    aprobados: suma((e) => (e.aprobado ? 1 : 0)),
    casos: evaluaciones.length,
    correctas: suma((e) => e.correctas),
    perdidas: suma((e) => e.perdidas),
    inventadas: suma((e) => e.inventadas),
    jsonValidoPct: evaluaciones.length === 0 ? 0 : (100 * suma((e) => (e.jsonValido ? 1 : 0))) / evaluaciones.length,
    tokensEntradaPromedio: promedio(tokens.map((t) => t.entrada)),
    tokensSalidaPromedio: promedio(tokens.map((t) => t.salida)),
  };
}

/** Promedio y peor resultado de cada métrica entre repeticiones (6.14). */
export function resumirRepeticiones(reps: MetricasRepeticion[]) {
  const prom = (f: (m: MetricasRepeticion) => number) => reps.reduce((t, m) => t + f(m), 0) / reps.length;
  const min = (f: (m: MetricasRepeticion) => number) => Math.min(...reps.map(f));
  const max = (f: (m: MetricasRepeticion) => number) => Math.max(...reps.map(f));
  return {
    repeticiones: reps.length,
    promedio: {
      aprobados: prom((m) => m.aprobados),
      correctas: prom((m) => m.correctas),
      perdidas: prom((m) => m.perdidas),
      inventadas: prom((m) => m.inventadas),
      jsonValidoPct: prom((m) => m.jsonValidoPct),
      tokensEntrada: prom((m) => m.tokensEntradaPromedio),
      tokensSalida: prom((m) => m.tokensSalidaPromedio),
    },
    peor: {
      aprobados: min((m) => m.aprobados),
      correctas: min((m) => m.correctas),
      perdidas: max((m) => m.perdidas),
      inventadas: max((m) => m.inventadas),
      jsonValidoPct: min((m) => m.jsonValidoPct),
    },
  };
}
