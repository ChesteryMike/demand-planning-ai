/**
 * Formato chileno para la interfaz (PROMPT_MAESTRO 6.11). Funciones puras.
 * Punto de miles y coma decimal: $124.500 · 2,5 días · 30-03-2026.
 * Se implementa a mano (sin Intl) para no depender de los datos de idioma
 * que traiga la imagen de Node en el servidor.
 */
import type { FechaISO } from './fechas';

function agruparMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Número con una cantidad fija de decimales: (1250.5, 1) → "1.250,5"; (3, 1) → "3,0". */
export function formatoNumero(valor: number, decimales = 0): string {
  const fijo = Math.abs(valor).toFixed(decimales);
  const [entero = '0', fraccion] = fijo.split('.');
  const signo = valor < 0 && Number(fijo) !== 0 ? '-' : '';
  return `${signo}${agruparMiles(entero)}${fraccion ? `,${fraccion}` : ''}`;
}

/** Cantidad con hasta 3 decimales, sin ceros sobrantes: 2.5 → "2,5"; 1250 → "1.250". */
export function formatoCantidad(valor: number): string {
  const texto = formatoNumero(valor, 3);
  return texto.includes(',') ? texto.replace(/,?0+$/, '') : texto;
}

/** Pesos chilenos, sin decimales: 124500 → "$124.500"; -1500 → "-$1.500". */
export function formatoPesos(valor: number): string {
  const redondeado = Math.round(valor);
  const signo = redondeado < 0 ? '-' : '';
  return `${signo}$${agruparMiles(String(Math.abs(redondeado)))}`;
}

/** 'AAAA-MM-DD' → 'DD-MM-AAAA'. */
export function formatoFecha(fecha: FechaISO): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
}

/** Instante (timestamptz) → 'DD-MM-AAAA HH:MM' en hora de Chile. */
export function formatoFechaHora(instante: string | Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instante));
  const v = (t: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === t)?.value ?? '';
  return `${v('day')}-${v('month')}-${v('year')} ${v('hour')}:${v('minute')}`;
}

const UNIDADES: Record<string, [singular: string, plural: string]> = {
  un: ['unidad', 'unidades'],
  u: ['unidad', 'unidades'],
  unid: ['unidad', 'unidades'],
  kg: ['kg', 'kg'],
  g: ['g', 'g'],
  lt: ['litro', 'litros'],
  l: ['litro', 'litros'],
  cc: ['cc', 'cc'],
};

/** Unidad escrita para leerse en una frase: "un" → "unidades", "lt" → "litros". Si no la conoce, la deja igual. */
export function nombreUnidad(unidad: string, plural = true): string {
  const par = UNIDADES[unidad.trim().toLowerCase()];
  return par ? par[plural ? 1 : 0] : unidad;
}

/** "1 unidad", "76 unidades", "12,5 kg". */
export function textoUnidades(cantidad: number, unidad: string): string {
  return `${formatoCantidad(cantidad)} ${nombreUnidad(unidad, cantidad !== 1)}`;
}

/** "1 día", "2 días". Para enteros; un número con decimales siempre va en plural. */
export function textoDias(dias: number): string {
  return `${formatoCantidad(dias)} ${dias === 1 ? 'día' : 'días'}`;
}
