/**
 * Fechas de calendario (PROMPT_MAESTRO 5.3). Funciones puras.
 *
 * Todas trabajan con texto 'AAAA-MM-DD' (FechaISO), sin hora ni zona.
 * "Hoy" es la fecha calendario en America/Santiago: Cloud Run corre en UTC,
 * así que nunca se decide el día con new Date() directo.
 */

export type FechaISO = string;

export const ZONA_HORARIA = 'America/Santiago';
const MS_POR_DIA = 86_400_000;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Convierte 'AAAA-MM-DD' en un instante a mediodía UTC (evita saltos por horario de verano). */
function aMediodiaUtc(fecha: FechaISO): Date {
  if (!PATRON_FECHA.test(fecha)) {
    throw new Error(`Fecha con formato inválido: «${fecha}» (se esperaba AAAA-MM-DD)`);
  }
  const instante = new Date(`${fecha}T12:00:00Z`);
  if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) !== fecha) {
    throw new Error(`Fecha inexistente: «${fecha}»`);
  }
  return instante;
}

/**
 * Fecha calendario de hoy en Chile. Recibe el instante como parámetro para
 * poder probarla; en producción se llama sin argumentos.
 */
export function hoyEnChile(ahora: Date = new Date()): FechaISO {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Día de la semana: 0 = domingo … 6 = sábado. */
export function diaSemana(fecha: FechaISO): number {
  return aMediodiaUtc(fecha).getUTCDay();
}

/** Suma (o resta, si es negativo) días calendario. */
export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  const instante = aMediodiaUtc(fecha);
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString().slice(0, 10);
}

/** Días calendario de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return Math.round((aMediodiaUtc(hasta).getTime() - aMediodiaUtc(desde).getTime()) / MS_POR_DIA);
}

/** Todas las fechas de `desde` a `hasta`, ambas incluidas. Vacío si desde > hasta. */
export function rangoFechas(desde: FechaISO, hasta: FechaISO): FechaISO[] {
  const total = diasEntre(desde, hasta);
  const fechas: FechaISO[] = [];
  for (let i = 0; i <= total; i++) fechas.push(sumarDias(desde, i));
  return fechas;
}
