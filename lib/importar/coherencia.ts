/**
 * Agente de Coherencia de Catálogo (PROMPT_MAESTRO 6.6). Solo servidor.
 *
 * Avisa si un producto nuevo no encaja con el resto del catálogo.
 * NUNCA bloquea: por defecto todas las filas se guardan y, si falla,
 * la vista previa solo dice que no se pudo revisar.
 * Nunca se le declara el rubro: lo infiere del catálogo.
 */
import { z } from 'zod';
import { generarConTope, type DependenciasAgente } from '../ia/limite';
import { normalizarNombre } from './mapeo';

export const MAX_CATALOGO = 120;
export const MAX_NUEVOS = 60;
export const TIMEOUT_MS = 30_000;
export const MENSAJE_FALLO_COHERENCIA = 'No se pudo revisar la coherencia del catálogo.';

export function avisoNuevosSinRevisar(cantidad: number): string {
  return cantidad === 1
    ? 'Se revisaron solo los primeros 60 productos nuevos; 1 producto no se revisó.'
    : `Se revisaron solo los primeros 60 productos nuevos; ${cantidad} productos no se revisaron.`;
}

export const esquemaSalidaCoherencia = z.object({
  productos_ajenos: z.array(z.object({ nombre: z.string(), motivo: z.string() })),
  confianza: z.enum(['alta', 'media', 'baja']),
});

export interface ProductoConVentas {
  nombre: string;
  /** Unidades vendidas en los últimos 28 días. */
  unidades28: number;
}

const ordenAlfabetico = (a: string, b: string) => a.localeCompare(b, 'es');

/** Hasta 120 nombres: los más vendidos en 28 días; empates por orden alfabético. */
export function seleccionarCatalogo(productos: ProductoConVentas[]): string[] {
  return [...productos]
    .sort((a, b) => b.unidades28 - a.unidades28 || ordenAlfabetico(a.nombre, b.nombre))
    .slice(0, MAX_CATALOGO)
    .map((p) => p.nombre);
}

/** Hasta 60 productos nuevos, en orden alfabético y sin repetidos. */
export function seleccionarNuevos(nombres: string[]): { revisar: string[]; sinRevisar: number } {
  const unicos = [...new Map(nombres.map((n) => [normalizarNombre(n), n])).values()].sort(ordenAlfabetico);
  return { revisar: unicos.slice(0, MAX_NUEVOS), sinRevisar: Math.max(0, unicos.length - MAX_NUEVOS) };
}

function lista(nombres: string[]): string {
  return nombres.map((n) => `- ${n.replace(/<\/?\s*(catalogo_actual|productos_nuevos)\s*>/gi, '')}`).join('\n');
}

export type ResultadoCoherencia =
  | { estado: 'omitida' }
  | {
      estado: 'revisada';
      productosAjenos: { nombre: string; motivo: string }[];
      confianza: 'alta' | 'media' | 'baja';
      avisos: string[];
    }
  | { estado: 'fallo'; mensaje: string };

export async function revisarCoherencia(
  entrada: { catalogo: ProductoConVentas[]; nuevos: string[] },
  deps: DependenciasAgente,
): Promise<ResultadoCoherencia> {
  // No se ejecuta si no hay productos nuevos o si el catálogo está vacío.
  if (entrada.nuevos.length === 0 || entrada.catalogo.length === 0) return { estado: 'omitida' };

  const catalogo = seleccionarCatalogo(entrada.catalogo);
  const { revisar, sinRevisar } = seleccionarNuevos(entrada.nuevos);

  const resultado = await generarConTope('coherencia', deps, {
    usuario: `<catalogo_actual>\n${lista(catalogo)}\n</catalogo_actual>\n\n<productos_nuevos>\n${lista(revisar)}\n</productos_nuevos>`,
    esquema: esquemaSalidaCoherencia,
    nombreEsquema: 'coherencia_catalogo',
    timeoutMs: TIMEOUT_MS,
  });
  if (!resultado.ok) return { estado: 'fallo', mensaje: MENSAJE_FALLO_COHERENCIA };

  // Los nombres que no estaban en la lista de entrada se descartan.
  const enviados = new Map(revisar.map((n) => [normalizarNombre(n), n]));
  const vistos = new Set<string>();
  const productosAjenos = resultado.datos.productos_ajenos.flatMap((p) => {
    const clave = normalizarNombre(p.nombre);
    const original = enviados.get(clave);
    if (!original || vistos.has(clave)) return [];
    vistos.add(clave);
    return [{ nombre: original, motivo: p.motivo.trim() }];
  });

  return {
    estado: 'revisada',
    productosAjenos,
    confianza: resultado.datos.confianza,
    avisos: sinRevisar > 0 ? [avisoNuevosSinRevisar(sinRevisar)] : [],
  };
}
