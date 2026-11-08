/**
 * Lector de archivos (PROMPT_MAESTRO 6.9, paso 1). Solo servidor.
 *
 *   Excel (.xlsx, .xls) y CSV → hoja (filas y columnas) → mapeo determinista, sin IA.
 *   TXT, PDF y Word (.docx)   → texto                   → Agente Normalizador.
 *
 * El CSV se lee con un parser propio, siempre como texto: así "1.250"
 * llega intacto a parseo.ts en vez de convertirse en 1,25.
 */
import type { ValorCelda } from './parseo';

export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

export type ContenidoLeido =
  | { tipo: 'hoja'; filas: ValorCelda[][] }
  | { tipo: 'texto'; texto: string };

export type ResultadoLectura = { ok: true; contenido: ContenidoLeido } | { ok: false; mensaje: string };

export const MENSAJE_FORMATO_NO_SOPORTADO =
  'Este tipo de archivo no se puede leer. Suba un Excel (.xlsx o .xls), un CSV, un TXT, un PDF o un Word (.docx).';
export const MENSAJE_ARCHIVO_GRANDE = 'El archivo pesa más de 5 MB. Divídalo en partes más pequeñas.';
export const MENSAJE_ARCHIVO_ILEGIBLE =
  'No pudimos abrir el archivo. Revise que no esté dañado o protegido con contraseña.';

function extension(nombreArchivo: string): string {
  const punto = nombreArchivo.lastIndexOf('.');
  return punto < 0 ? '' : nombreArchivo.slice(punto + 1).toLowerCase();
}

function decodificarTexto(bytes: Uint8Array): string {
  // Sin BOM y en UTF-8; si hay caracteres inválidos, se reintenta como Windows-1252 (Excel en español).
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ---------------------------------------------------------------------
// CSV (puro)
// ---------------------------------------------------------------------

/** Elige el separador más frecuente en la primera línea, fuera de comillas: ; , o tabulador. */
export function detectarSeparador(primeraLinea: string): string {
  const conteo = new Map<string, number>([[';', 0], [',', 0], ['\t', 0]]);
  let enComillas = false;
  for (const c of primeraLinea) {
    if (c === '"') enComillas = !enComillas;
    else if (!enComillas && conteo.has(c)) conteo.set(c, (conteo.get(c) ?? 0) + 1);
  }
  let mejor = ',';
  let maximo = 0;
  for (const [separador, veces] of conteo) {
    if (veces > maximo) {
      mejor = separador;
      maximo = veces;
    }
  }
  return mejor;
}

/** Parser CSV (RFC 4180): comillas dobles, comillas escapadas ("") y saltos de línea dentro de comillas. */
export function parsearCsv(texto: string): string[][] {
  const contenido = texto.replace(/^﻿/, '');
  const primeraLinea = contenido.split(/\r?\n/, 1)[0] ?? '';
  const separador = detectarSeparador(primeraLinea);
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]!;
    if (enComillas) {
      if (c === '"' && contenido[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        enComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenido[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------------
// Lectura según el tipo de archivo
// ---------------------------------------------------------------------

async function leerExcel(bytes: Uint8Array): Promise<ValorCelda[][]> {
  const XLSX = await import('xlsx');
  // cellDates: false → las fechas llegan como número de serie y las convierte parseo.ts.
  const libro = XLSX.read(bytes, { type: 'array', cellDates: false });
  const nombreHoja = libro.SheetNames[0];
  if (!nombreHoja) return [];
  const hoja = libro.Sheets[nombreHoja];
  if (!hoja) return [];
  const filas = XLSX.utils.sheet_to_json<ValorCelda[]>(hoja, { header: 1, raw: true, defval: null, blankrows: false });
  return filas.map((fila) => fila.map((celda) => (typeof celda === 'string' || typeof celda === 'number' ? celda : null)));
}

async function leerPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const documento = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(documento, { mergePages: true });
  return text;
}

async function leerWord(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

export async function leerArchivo(nombreArchivo: string, bytes: Uint8Array): Promise<ResultadoLectura> {
  if (bytes.byteLength > TAMANO_MAXIMO_BYTES) return { ok: false, mensaje: MENSAJE_ARCHIVO_GRANDE };
  const ext = extension(nombreArchivo);
  try {
    switch (ext) {
      case 'xlsx':
      case 'xls':
        return { ok: true, contenido: { tipo: 'hoja', filas: await leerExcel(bytes) } };
      case 'csv':
        return { ok: true, contenido: { tipo: 'hoja', filas: parsearCsv(decodificarTexto(bytes)) } };
      case 'txt':
        return { ok: true, contenido: { tipo: 'texto', texto: decodificarTexto(bytes) } };
      case 'pdf':
        return { ok: true, contenido: { tipo: 'texto', texto: await leerPdf(bytes) } };
      case 'docx':
        return { ok: true, contenido: { tipo: 'texto', texto: await leerWord(bytes) } };
      default:
        return { ok: false, mensaje: MENSAJE_FORMATO_NO_SOPORTADO };
    }
  } catch {
    return { ok: false, mensaje: MENSAJE_ARCHIVO_ILEGIBLE };
  }
}
