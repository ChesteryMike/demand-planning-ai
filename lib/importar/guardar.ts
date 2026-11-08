/**
 * Persistencia de importaciones (PROMPT_MAESTRO 6.9). Solo servidor.
 *
 * Recibe el cliente de Supabase con service role (que se salta RLS), por eso
 * el business_id SIEMPRE llega como parámetro desde negocioActivo(), nunca
 * desde el cuerpo de la petición.
 *
 * Por defecto los productos nuevos se crean (regla 4) con: stock 0 a la
 * fecha de la importación, costo 0, precio 0, no perecible, 2 días de
 * entrega, 1 día de colchón y la marca "Faltan datos".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { FechaISO } from '../fechas';
import type { FilaLista, ProductoNuevo, TipoImportacion } from './mapeo';

export const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar la importación. Intente de nuevo.';
export const MENSAJE_SIN_FILAS = 'No hay filas válidas para guardar. Revise los motivos de cada fila excluida.';
export { AVISO_PRODUCTOS_NO_SE_ELIMINAN, textoConfirmacionEliminar } from './textos';

export interface EntradaGuardar {
  businessId: string;
  tipo: TipoImportacion;
  nombreArchivo: string;
  /** Fecha de la importación ("hoy" en Chile): será la fecha_stock_inicial de los productos nuevos. */
  fecha: FechaISO;
  filas: FilaLista[];
  productosNuevos: ProductoNuevo[];
}

export interface EnlaceProducto {
  id: string;
  nombre: string;
  /** Ficha de edición del producto nuevo (no el listado). */
  href: string;
}

export type ResultadoGuardar =
  | {
      ok: true;
      importacionId: string;
      filasGuardadas: number;
      productosCreados: EnlaceProducto[];
      mensaje: string;
    }
  | { ok: false; mensaje: string };

const esquemaRespuesta = z.object({
  importacion_id: z.string().uuid(),
  filas_guardadas: z.number().int().nonnegative(),
  productos_creados: z.array(z.object({ id: z.string().uuid(), nombre: z.string() })),
});

/** "Se guardaron N filas. Se crearon K productos nuevos: completen sus datos." */
export function mensajeFinal(filasGuardadas: number, productosCreados: number): string {
  const filas = filasGuardadas === 1 ? 'Se guardó 1 fila.' : `Se guardaron ${filasGuardadas} filas.`;
  if (productosCreados === 0) return filas;
  const productos =
    productosCreados === 1
      ? 'Se creó 1 producto nuevo: completen sus datos.'
      : `Se crearon ${productosCreados} productos nuevos: completen sus datos.`;
  return `${filas} ${productos}`;
}

export async function guardarImportacion(cliente: SupabaseClient, entrada: EntradaGuardar): Promise<ResultadoGuardar> {
  if (entrada.filas.length === 0) return { ok: false, mensaje: MENSAJE_SIN_FILAS };

  // Toda fila sin producto debe corresponder a un producto nuevo que se va a crear.
  const nuevos = new Set(entrada.productosNuevos.map((p) => p.nombreNormalizado));
  if (entrada.filas.some((f) => f.productoId === null && !nuevos.has(f.nombreNormalizado))) {
    return { ok: false, mensaje: MENSAJE_ERROR_GUARDAR };
  }

  const { data, error } = await cliente.rpc('guardar_importacion', {
    p_business_id: entrada.businessId,
    p_tipo: entrada.tipo,
    p_nombre_archivo: entrada.nombreArchivo,
    p_fecha: entrada.fecha,
    p_productos_nuevos: entrada.productosNuevos.map((p) => ({
      nombre: p.nombre,
      nombre_normalizado: p.nombreNormalizado,
    })),
    p_filas: entrada.filas.map((f) => ({
      producto_id: f.productoId,
      nombre_normalizado: f.nombreNormalizado,
      fecha: f.fecha,
      cantidad: f.cantidad,
      costo_unitario: entrada.tipo === 'compra' ? f.costoUnitario : null,
    })),
  });
  if (error) return { ok: false, mensaje: MENSAJE_ERROR_GUARDAR };

  const respuesta = esquemaRespuesta.safeParse(data);
  if (!respuesta.success) return { ok: false, mensaje: MENSAJE_ERROR_GUARDAR };

  const { importacion_id, filas_guardadas, productos_creados } = respuesta.data;
  return {
    ok: true,
    importacionId: importacion_id,
    filasGuardadas: filas_guardadas,
    productosCreados: productos_creados.map((p) => ({ id: p.id, nombre: p.nombre, href: `/productos/${p.id}` })),
    mensaje: mensajeFinal(filas_guardadas, productos_creados.length),
  };
}

/** Cuántas filas borraría eliminar la importación (para la confirmación). */
export async function contarFilasImportacion(
  cliente: SupabaseClient,
  businessId: string,
  importacionId: string,
): Promise<number | null> {
  const contar = async (tabla: 'ventas' | 'compras') => {
    const { count, error } = await cliente
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('importacion_id', importacionId);
    return error ? null : (count ?? 0);
  };
  const [ventas, compras] = await Promise.all([contar('ventas'), contar('compras')]);
  return ventas === null || compras === null ? null : ventas + compras;
}

/** Elimina una importación completa (sus filas caen por cascada). El stock se recalcula solo (5.2). */
export async function eliminarImportacion(
  cliente: SupabaseClient,
  businessId: string,
  importacionId: string,
): Promise<{ ok: true; eliminada: boolean } | { ok: false; mensaje: string }> {
  const { data, error } = await cliente
    .from('importaciones')
    .delete()
    .eq('id', importacionId)
    .eq('business_id', businessId)
    .select('id');
  if (error) return { ok: false, mensaje: 'No se pudo eliminar la importación. Intente de nuevo.' };
  return { ok: true, eliminada: (data ?? []).length > 0 };
}
