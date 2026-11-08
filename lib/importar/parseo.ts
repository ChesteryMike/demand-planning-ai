/**
 * Conversión de fechas, cantidades y costos escritos "a la chilena"
 * (PROMPT_MAESTRO 6.3). Funciones puras: el modelo de IA copia los valores
 * tal como aparecen y ESTE código los convierte (principio rector).
 *
 * · Fechas: día primero, siempre. Nunca se asume mes-día.
 * · Números: punto de miles y coma decimal.
 */
import type { FechaISO } from '../fechas';

/** Valor de una celda tal como llega del lector (Excel puede dar números). */
export type ValorCelda = string | number | null | undefined;

// ---------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------

const MESES: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

/** Serie de Excel: días desde 1899-12-30 (incluye el error histórico del año 1900). */
const EPOCA_EXCEL_MS = Date.UTC(1899, 11, 30);
const SERIE_EXCEL_MIN = 1;
const SERIE_EXCEL_MAX = 2_958_465; // 31-12-9999

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** Arma 'AAAA-MM-DD' solo si la fecha existe en el calendario (31-02 no existe). */
function construirFecha(anio: number, mes: number, dia: number): FechaISO | null {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  if (anio < 1900 || anio > 9999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const instante = new Date(Date.UTC(anio, mes - 1, dia, 12));
  if (instante.getUTCFullYear() !== anio || instante.getUTCMonth() !== mes - 1 || instante.getUTCDate() !== dia) {
    return null;
  }
  return instante.toISOString().slice(0, 10);
}

/** Año de dos dígitos → 20AA. */
function anioCompleto(texto: string): number {
  const valor = Number(texto);
  return texto.length === 2 ? 2000 + valor : valor;
}

function desdeSerieExcel(serie: number): FechaISO | null {
  if (!Number.isFinite(serie) || serie < SERIE_EXCEL_MIN || serie > SERIE_EXCEL_MAX) return null;
  const instante = new Date(EPOCA_EXCEL_MS + Math.floor(serie) * 86_400_000 + 12 * 3_600_000);
  return construirFecha(instante.getUTCFullYear(), instante.getUTCMonth() + 1, instante.getUTCDate());
}

/**
 * Convierte una fecha chilena en 'AAAA-MM-DD'. Devuelve null si no tiene año,
 * no existe o no se reconoce (la fila se excluye con advertencia).
 *
 * Formatos: DD-MM-AAAA, DD/MM/AAAA, DD.MM.AAAA, D/M/AA, AAAA-MM-DD,
 * "3 de marzo de 2026", "03-mar-26" y número de serie de Excel.
 */
export function parsearFecha(valor: ValorCelda): FechaISO | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return desdeSerieExcel(valor);

  const texto = sinTildes(valor.trim().toLowerCase()).replace(/\s+/g, ' ');
  if (texto === '') return null;

  // AAAA-MM-DD (ISO)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  if (m) return construirFecha(Number(m[1]), Number(m[2]), Number(m[3]));

  // DD-MM-AAAA, DD/MM/AAAA, DD.MM.AAAA, D/M/AA (día primero)
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(texto);
  if (m) return construirFecha(anioCompleto(m[3]!), Number(m[2]), Number(m[1]));

  // "3 de marzo de 2026" / "3 de marzo del 2026"
  m = /^(\d{1,2}) de ([a-z]+) del? (\d{4})$/.exec(texto);
  if (m) {
    const mes = MESES[m[2]!];
    return mes ? construirFecha(Number(m[3]), mes, Number(m[1])) : null;
  }

  // "03-mar-26", "03/mar/2026", "3 mar 2026"
  m = /^(\d{1,2})[-/. ]([a-z]+)\.?[-/. ](\d{2}|\d{4})$/.exec(texto);
  if (m) {
    const mes = MESES[m[2]!];
    return mes ? construirFecha(anioCompleto(m[3]!), mes, Number(m[1])) : null;
  }

  // Serie de Excel guardada como texto (p. ej. en un CSV exportado): 5 dígitos.
  if (/^\d{5}$/.test(texto)) return desdeSerieExcel(Number(texto));

  return null;
}

// ---------------------------------------------------------------------
// Cantidades y costos
// ---------------------------------------------------------------------

/** Sufijos de unidad que se descartan (sin distinguir mayúsculas). El orden importa: los largos primero. */
const PATRON_UNIDAD = /\s*(unidades|unid|un|u|kg|g|lt|l|cc)\.?$/i;

/** Número chileno: "1.250,5" → 1250.5; "1,5" → 1.5; "12" → 12. Null si no calza el formato. */
function numeroChileno(texto: string): number | null {
  const limpio = texto.trim();
  let normalizado: string | null = null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)) {
    normalizado = limpio.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+(,\d+)?$/.test(limpio)) {
    normalizado = limpio.replace(',', '.');
  }
  if (normalizado === null) return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

export type ResultadoCantidad =
  | { ok: true; valor: number }
  | { ok: false; motivo: 'vacia' | 'no_numerica' | 'no_positiva' };

/**
 * Cantidad > 0. Descarta un sufijo de unidad conocido ("12,5 kg" → 12.5,
 * "48un" → 48): la unidad es solo texto que se ignora.
 */
export function parsearCantidad(valor: ValorCelda): ResultadoCantidad {
  if (valor === null || valor === undefined) return { ok: false, motivo: 'vacia' };
  let numero: number | null;
  if (typeof valor === 'number') {
    numero = Number.isFinite(valor) ? valor : null;
  } else {
    const texto = valor.trim();
    if (texto === '') return { ok: false, motivo: 'vacia' };
    numero = numeroChileno(texto.replace(PATRON_UNIDAD, ''));
  }
  if (numero === null) return { ok: false, motivo: 'no_numerica' };
  if (numero <= 0) return { ok: false, motivo: 'no_positiva' };
  return { ok: true, valor: numero };
}

export type ResultadoCosto = { ok: true; valor: number | null } | { ok: false };

/**
 * Costo unitario (solo compras). Acepta "$" y "c/u": "$1.250 c/u" → 1250.
 * Vacío o nulo → null sin advertencia. No numérico → { ok: false }: el costo
 * queda en null con advertencia, pero la fila NO se excluye.
 */
export function parsearCosto(valor: ValorCelda): ResultadoCosto {
  if (valor === null || valor === undefined) return { ok: true, valor: null };
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? { ok: true, valor } : { ok: false };
  const texto = valor.trim();
  if (texto === '' || /^(null|nulo|-)$/i.test(texto)) return { ok: true, valor: null };
  const sinAdornos = texto
    .replace(/\s*c\s*\/\s*u\.?$/i, '')
    .replace(/^\$\s*/, '')
    .trim();
  const numero = numeroChileno(sinAdornos);
  return numero !== null && numero >= 0 ? { ok: true, valor: numero } : { ok: false };
}

// ---------------------------------------------------------------------
// Mensajes (se muestran en la vista previa)
// ---------------------------------------------------------------------

function textoOriginal(valor: ValorCelda): string {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

export function advertenciaFecha(fila: number, original: ValorCelda): string {
  return `Fila ${fila}: no se pudo leer la fecha «${textoOriginal(original)}»`;
}

export function advertenciaCantidad(
  fila: number,
  original: ValorCelda,
  motivo: 'vacia' | 'no_numerica' | 'no_positiva',
): string {
  switch (motivo) {
    case 'vacia':
      return `Fila ${fila}: falta la cantidad`;
    case 'no_numerica':
      return `Fila ${fila}: la cantidad «${textoOriginal(original)}» no es un número`;
    case 'no_positiva':
      return `Fila ${fila}: la cantidad «${textoOriginal(original)}» debe ser mayor que cero`;
  }
}

export function advertenciaCosto(fila: number, original: ValorCelda): string {
  return `Fila ${fila}: no se pudo leer el costo «${textoOriginal(original)}»`;
}
