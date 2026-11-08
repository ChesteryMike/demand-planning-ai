/**
 * Utilidades comunes de las rutas de API (solo servidor).
 *
 * Toda escritura sigue el mismo orden (6.10):
 *   1. límite por IP (antes de hacer nada);
 *   2. negocio activo desde el servidor (nunca el business_id del cuerpo);
 *   3. validación de la entrada con zod;
 *   4. escritura con la service role, filtrando por business_id.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { diasEntre } from './fechas';
import { almacenSupabase, verificarLimiteIp } from './limite-ip';
import { negocioActivo, type NegocioActivo } from './negocio-activo';
import { clienteServidor } from './supabase-servidor';
import type { SupabaseClient } from '@supabase/supabase-js';

export const MENSAJE_DATOS_INVALIDOS = 'Revise los datos ingresados.';
export const MENSAJE_ERROR_GENERAL = 'No se pudo completar la operación. Intente de nuevo.';
export const MENSAJE_NO_ENCONTRADO = 'No se encontró el registro.';

export function respuestaError(status: number, mensaje: string): NextResponse {
  return NextResponse.json({ error: mensaje }, { status });
}

/** Fecha 'AAAA-MM-DD' que existe en el calendario. */
export const esquemaFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((f) => {
    try {
      diasEntre(f, f);
      return true;
    } catch {
      return false;
    }
  });

export const esquemaId = z.string().uuid();

export async function leerJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export interface ContextoEscritura {
  negocio: NegocioActivo;
  db: SupabaseClient;
}

/**
 * Pasos 1 y 2 de toda escritura. Devuelve el contexto o la respuesta de error
 * lista para devolver (429 por IP, 503 si falta configuración).
 */
export async function iniciarEscritura(
  request: Request,
  ruta: string,
): Promise<{ ok: true; contexto: ContextoEscritura } | { ok: false; respuesta: NextResponse }> {
  let db: SupabaseClient;
  try {
    db = clienteServidor();
  } catch {
    return { ok: false, respuesta: respuestaError(503, 'El servicio no está disponible en este momento. Intente más tarde.') };
  }
  const limite = await verificarLimiteIp(request, ruta, { almacen: almacenSupabase(db), sal: process.env.SAL_IP });
  if (!limite.ok) return { ok: false, respuesta: respuestaError(limite.status, limite.mensaje) };
  return { ok: true, contexto: { negocio: await negocioActivo(), db } };
}
