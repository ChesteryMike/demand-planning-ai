/**
 * Agente Normalizador de importación (PROMPT_MAESTRO 6.5). Solo servidor.
 *
 * El modelo SOLO separa el texto en filas y copia los valores tal como
 * aparecen; parseo.ts convierte fechas y cantidades y aplica las exclusiones.
 * Si la llamada falla, nunca se simula una respuesta.
 */
import { z } from 'zod';
import { generarConTope, MENSAJE_TOPE_IA, type DependenciasAgente } from '../ia/limite';
import { validarFilas, type FilaCruda, type FilaExcluida, type FilaValida, type TipoImportacion } from './mapeo';

export const MIN_CARACTERES = 10;
export const MAX_CARACTERES = 60_000;
export const TIMEOUT_MS = 30_000;

export const MENSAJE_TEXTO_CORTO =
  'El texto es muy corto para leerlo. Pegue al menos una fila con fecha, producto y cantidad.';
export const AVISO_TEXTO_RECORTADO = 'El texto era muy largo; se leyeron solo los primeros 60.000 caracteres.';
export const MENSAJE_FALLO_NORMALIZADOR =
  'No pudimos leer este texto automáticamente. Puede intentarlo de nuevo o subir un Excel o CSV.';
export const MENSAJE_NO_INTERPRETABLE =
  'No encontramos filas de productos en este texto. Revise que tenga fecha, producto y cantidad.';

export const esquemaSalidaNormalizador = z.object({
  filas: z.array(
    z.object({
      fecha_original: z.string(),
      producto: z.string(),
      cantidad_original: z.string(),
      costo_original: z.string().nullable(),
    }),
  ),
  confianza: z.enum(['alta', 'media', 'baja']),
  advertencias: z.array(z.string()),
  no_interpretable: z.boolean(),
});
export type SalidaNormalizador = z.infer<typeof esquemaSalidaNormalizador>;

/**
 * Envía el texto del usuario como DATO, delimitado. Si el texto trae las
 * etiquetas, se neutralizan para que no pueda "cerrar" el bloque.
 */
export function envolverTexto(texto: string): string {
  const neutralizado = texto.replace(/<\/?\s*texto_importado\s*>/gi, '[texto_importado]');
  return `<texto_importado>\n${neutralizado}\n</texto_importado>`;
}

export type ResultadoNormalizador =
  | {
      ok: true;
      validas: FilaValida[];
      excluidas: FilaExcluida[];
      /** Avisos del recorte, del modelo y del parseo (costos ilegibles). */
      advertencias: string[];
      confianza: SalidaNormalizador['confianza'];
      noInterpretable: boolean;
      versionPrompt: string | null;
    }
  | { ok: false; mensaje: string; llamoIa: boolean };

export async function normalizarTexto(
  entrada: { texto: string; tipo: TipoImportacion },
  deps: DependenciasAgente,
): Promise<ResultadoNormalizador> {
  const limpio = entrada.texto.trim();
  if (limpio.length < MIN_CARACTERES) return { ok: false, mensaje: MENSAJE_TEXTO_CORTO, llamoIa: false };

  const advertencias: string[] = [];
  let texto = limpio;
  if (texto.length > MAX_CARACTERES) {
    texto = texto.slice(0, MAX_CARACTERES);
    advertencias.push(AVISO_TEXTO_RECORTADO);
  }

  const resultado = await generarConTope('normalizador', deps, {
    usuario: envolverTexto(texto),
    esquema: esquemaSalidaNormalizador,
    nombreEsquema: 'filas_importadas',
    timeoutMs: TIMEOUT_MS,
  });
  if (!resultado.ok) {
    const mensaje = resultado.error.tipo === 'tope' ? MENSAJE_TOPE_IA : MENSAJE_FALLO_NORMALIZADOR;
    const llamoIa = resultado.error.tipo !== 'no_configurada' && resultado.error.tipo !== 'tope';
    return { ok: false, mensaje, llamoIa };
  }

  const salida = resultado.datos;
  advertencias.push(...salida.advertencias);
  if (salida.no_interpretable && salida.filas.length === 0) advertencias.push(MENSAJE_NO_INTERPRETABLE);

  const crudas: FilaCruda[] = salida.filas.map((fila, i) => ({
    numero: i + 1,
    fechaOriginal: fila.fecha_original,
    producto: fila.producto,
    cantidadOriginal: fila.cantidad_original,
    costoOriginal: fila.costo_original,
  }));
  const validacion = validarFilas(crudas, entrada.tipo);

  return {
    ok: true,
    validas: validacion.validas,
    excluidas: validacion.excluidas,
    advertencias: [...advertencias, ...validacion.advertencias],
    confianza: salida.confianza,
    noInterpretable: salida.no_interpretable,
    versionPrompt: resultado.versionPrompt,
  };
}
