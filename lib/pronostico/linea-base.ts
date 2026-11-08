/**
 * Pronóstico determinista de 14 días (PROMPT_MAESTRO 6.2). Función pura.
 * El Agente de Pronóstico (6.7) solo puede sugerir un ajuste acotado
 * sobre este resultado; nunca lo reemplaza.
 */
import { diaSemana, rangoFechas, sumarDias, type FechaISO } from '../fechas';
import { DIAS_VENTANA, ventanaVentas, type VentaDia } from '../planificacion';

export const HORIZONTE_DIAS = 14;
export const TENDENCIA_MAXIMA = 0.2;
export const ADVERTENCIA_HISTORIAL_CORTO = 'Hay poco historial; el pronóstico es aproximado.';
/** Por debajo de esto, σ se considera 0 (ruido de punto flotante). */
const CERO_NUMERICO = 1e-9;

export interface EscenarioDia {
  fecha: FechaISO;
  bajo: number;
  esperado: number;
  alto: number;
}

export interface LineaBase {
  base: number;
  n: number;
  /** Índice 0 = domingo … 6 = sábado. */
  factores: number[];
  tendencia: number;
  sigma: number;
  historialCorto: boolean;
  advertencia: string | null;
  /** Los 28 días de la ventana (hoy − 28 a hoy − 1), con ceros. */
  historial: VentaDia[];
  /** 14 días, de hoy a hoy + 13. Con decimales: se redondea solo al mostrar. */
  pronostico: EscenarioDia[];
  /** Días con |venta − base × factor| > 2σ (entrada del Agente de Pronóstico, 6.7). */
  fechasAtipicas: FechaISO[];
}

/** (Σ últimos 14 / Σ 14 anteriores) − 1, acotada a ±0,20. Si la suma anterior es 0, la tendencia es 0. */
export function calcularTendencia(sumaReciente: number, sumaAnterior: number): number {
  if (sumaAnterior === 0) return 0;
  const tendencia = sumaReciente / sumaAnterior - 1;
  return Math.min(TENDENCIA_MAXIMA, Math.max(-TENDENCIA_MAXIMA, tendencia));
}

function desviacionPoblacional(valores: number[]): number {
  if (valores.length === 0) return 0;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const varianza = valores.reduce((a, v) => a + (v - media) ** 2, 0) / valores.length;
  return Math.sqrt(varianza);
}

/** @param ventasProducto ventas diarias de UN producto. */
export function calcularLineaBase(ventasProducto: VentaDia[], hoy: FechaISO): LineaBase {
  const { serie, n, suma } = ventanaVentas(ventasProducto, hoy);
  const base = n === 0 ? 0 : suma / n;
  const historialCorto = n < DIAS_VENTANA;

  // Factor por día de la semana: promedio de ese día en la ventana / base.
  const factores = [1, 1, 1, 1, 1, 1, 1];
  if (!historialCorto && base > 0) {
    for (let d = 0; d < 7; d++) {
      const delDia = serie.filter((v) => diaSemana(v.fecha) === d);
      const promedioDia = delDia.reduce((a, v) => a + v.cantidad, 0) / delDia.length;
      factores[d] = promedioDia / base;
    }
  }

  let tendencia = 0;
  if (!historialCorto) {
    const anterior = serie.slice(0, 14).reduce((a, v) => a + v.cantidad, 0);
    const reciente = serie.slice(14).reduce((a, v) => a + v.cantidad, 0);
    tendencia = calcularTendencia(reciente, anterior);
  }

  // Residuos sobre los días con historial real (los últimos n de la ventana).
  const diasConHistorial = n === 0 ? [] : serie.slice(DIAS_VENTANA - n);
  const residuos = diasConHistorial.map((v) => ({
    fecha: v.fecha,
    residuo: v.cantidad - base * (factores[diaSemana(v.fecha)] ?? 1),
  }));
  let sigma = desviacionPoblacional(residuos.map((r) => r.residuo));
  if (sigma < CERO_NUMERICO) sigma = 0;

  const fechasAtipicas =
    sigma === 0 ? [] : residuos.filter((r) => Math.abs(r.residuo) > 2 * sigma).map((r) => r.fecha);

  const pronostico = rangoFechas(hoy, sumarDias(hoy, HORIZONTE_DIAS - 1)).map((fecha) => {
    const esperado = base * (factores[diaSemana(fecha)] ?? 1) * (1 + tendencia);
    return { fecha, bajo: Math.max(0, esperado - sigma), esperado, alto: esperado + sigma };
  });

  return {
    base,
    n,
    factores,
    tendencia,
    sigma,
    historialCorto,
    advertencia: historialCorto ? ADVERTENCIA_HISTORIAL_CORTO : null,
    historial: serie,
    pronostico,
    fechasAtipicas,
  };
}
