/**
 * Arma las dependencias reales de un agente para una ruta de API:
 * adaptador según PROVEEDOR_IA y registro de uso con los topes de 6.8.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { hoyEnChile } from '../fechas';
import { obtenerAdaptador } from './cliente';
import { crearRegistroUsoIa, leerTopes, type DependenciasAgente } from './limite';

export async function dependenciasAgente(db: SupabaseClient, businessId: string, ruta: string): Promise<DependenciasAgente> {
  return {
    adaptador: await obtenerAdaptador(),
    registrarUso: crearRegistroUsoIa(db, { businessId, ruta, hoy: hoyEnChile(), topes: leerTopes() }),
  };
}
