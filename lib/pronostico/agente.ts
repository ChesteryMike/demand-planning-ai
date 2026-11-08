/**
 * Agente de Pronóstico (PROMPT_MAESTRO 6.7). Solo servidor.
 *
 * Sugiere un ajuste ACOTADO sobre la línea base determinista de 6.2.
 * El código valida todo:
 *   · ajuste_pct se acota a [−20, +20];
 *   · si ajuste_pct ≠ 0 y el motivo está vacío, no cita fechas o cita una
 *     fecha que no está en el historial enviado → sospechoso: no se aplica.
 * Si falla, se muestra la línea base con aviso (no bloquea la vista).
 * El Plan de reposición NO usa este ajuste en esta versión.
 */
import { z } from 'zod';
import { generarConTope, type DependenciasAgente } from '../ia/limite';
import type { EscenarioDia, LineaBase } from './linea-base';

export const AJUSTE_MAXIMO = 20;
export const TIMEOUT_MS = 30_000;
export const AVISO_SIN_AJUSTE = 'Mostrando el pronóstico estadístico, sin ajuste.';

export const esquemaSalidaPronostico = z.object({
  ajuste_pct: z.number(),
  motivo: z.string(),
  fechas_citadas: z.array(z.string()),
});
export type SalidaPronostico = z.infer<typeof esquemaSalidaPronostico>;

export type EvaluacionAjuste =
  | { estado: 'aplicado'; pct: number; motivo: string; fechasCitadas: string[] }
  | { estado: 'sin_ajuste'; motivo: string }
  | { estado: 'sospechoso'; pct: number; motivo: string; mensaje: string };

export function textoSugerenciaNoAplicada(motivo: string): string {
  return `Sugerencia no aplicada: ${motivo.trim() || 'no explicó en qué datos se basaba.'}`;
}

/** Valida la salida del modelo contra el historial que se le envió. */
export function evaluarAjuste(salida: SalidaPronostico, fechasHistorial: ReadonlySet<string>): EvaluacionAjuste {
  const pct = Math.min(AJUSTE_MAXIMO, Math.max(-AJUSTE_MAXIMO, salida.ajuste_pct));
  const motivo = salida.motivo.trim();
  if (pct === 0) return { estado: 'sin_ajuste', motivo };

  const sospechoso =
    motivo === '' ||
    salida.fechas_citadas.length === 0 ||
    salida.fechas_citadas.some((fecha) => !fechasHistorial.has(fecha));
  if (sospechoso) return { estado: 'sospechoso', pct, motivo, mensaje: textoSugerenciaNoAplicada(motivo) };

  return { estado: 'aplicado', pct, motivo, fechasCitadas: salida.fechas_citadas };
}

/** Multiplica los tres escenarios por (1 + pct/100). */
export function aplicarAjuste(pronostico: EscenarioDia[], pct: number): EscenarioDia[] {
  const factor = 1 + pct / 100;
  return pronostico.map((d) => ({ fecha: d.fecha, bajo: d.bajo * factor, esperado: d.esperado * factor, alto: d.alto * factor }));
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Datos que recibe el modelo: solo lo que el código ya calculó. Sin σ ni términos estadísticos. */
export function datosParaModelo(producto: ResumenProducto, lineaBase: LineaBase) {
  return {
    producto: { nombre: producto.nombre, unidad: producto.unidad, perecible: producto.perecible },
    linea_base: {
      venta_diaria_base: r2(lineaBase.base),
      tendencia_pct: r2(lineaBase.tendencia * 100),
      factores_dia_semana: Object.fromEntries(DIAS.map((dia, i) => [dia, r2(lineaBase.factores[i] ?? 1)])),
      proximos_14_dias: lineaBase.pronostico.map((d) => ({ fecha: d.fecha, esperado: r2(d.esperado) })),
      historial_corto: lineaBase.historialCorto,
    },
    historial: lineaBase.historial.map((d) => ({ fecha: d.fecha, cantidad: d.cantidad })),
    fechas_atipicas: lineaBase.fechasAtipicas,
  };
}

export interface ResumenProducto {
  nombre: string;
  unidad: string;
  perecible: boolean;
}

export interface ResultadoPronostico {
  lineaBase: LineaBase;
  /** Pronóstico que se muestra: ajustado si el ajuste es válido; si no, la línea base. */
  pronostico: EscenarioDia[];
  ajuste: EvaluacionAjuste | null;
  /** Aviso cuando la IA falló o no está disponible. */
  aviso: string | null;
}

export async function pronosticarConAgente(
  entrada: { producto: ResumenProducto; lineaBase: LineaBase },
  deps: DependenciasAgente,
): Promise<ResultadoPronostico> {
  const { lineaBase } = entrada;
  const resultado = await generarConTope('pronostico', deps, {
    usuario: `<datos_producto>\n${JSON.stringify(datosParaModelo(entrada.producto, lineaBase))}\n</datos_producto>`,
    esquema: esquemaSalidaPronostico,
    nombreEsquema: 'ajuste_pronostico',
    timeoutMs: TIMEOUT_MS,
  });
  if (!resultado.ok) {
    return { lineaBase, pronostico: lineaBase.pronostico, ajuste: null, aviso: AVISO_SIN_AJUSTE };
  }

  const fechasHistorial = new Set(lineaBase.historial.map((d) => d.fecha));
  const ajuste = evaluarAjuste(resultado.datos, fechasHistorial);
  const pronostico = ajuste.estado === 'aplicado' ? aplicarAjuste(lineaBase.pronostico, ajuste.pct) : lineaBase.pronostico;
  return { lineaBase, pronostico, ajuste, aviso: null };
}
