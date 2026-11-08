/**
 * Lecturas del catálogo para el importador (solo servidor, service role).
 * Siempre filtran por el business_id del negocio activo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sumarDias, type FechaISO } from '../fechas';
import type { ProductoConVentas } from './coherencia';
import type { ProductoCatalogo } from './mapeo';

const PAGINA = 1000;

async function paginar<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error('No se pudo leer el catálogo');
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

export async function leerCatalogo(db: SupabaseClient, businessId: string): Promise<ProductoCatalogo[]> {
  return paginar<ProductoCatalogo>((d, h) =>
    db.from('productos').select('id, nombre').eq('business_id', businessId).order('nombre').range(d, h),
  );
}

/** Catálogo con las unidades vendidas en los últimos 28 días (entrada del Agente de Coherencia). */
export async function leerCatalogoConVentas(db: SupabaseClient, businessId: string, hoy: FechaISO): Promise<ProductoConVentas[]> {
  const [productos, ventas] = await Promise.all([
    leerCatalogo(db, businessId),
    paginar<{ producto_id: string; cantidad: number | string }>((d, h) =>
      db
        .from('ventas')
        .select('producto_id, cantidad')
        .eq('business_id', businessId)
        .gte('fecha', sumarDias(hoy, -28))
        .lte('fecha', sumarDias(hoy, -1))
        .order('id')
        .range(d, h),
    ),
  ]);
  const unidades = new Map<string, number>();
  for (const v of ventas) unidades.set(v.producto_id, (unidades.get(v.producto_id) ?? 0) + Number(v.cantidad));
  return productos.map((p) => ({ nombre: p.nombre, unidades28: unidades.get(p.id) ?? 0 }));
}
