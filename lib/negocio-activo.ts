/**
 * Negocio activo (PROMPT_MAESTRO 4, 6.10 y 6.13). Solo servidor.
 *
 * Ninguna vista ni ruta usa DEMO_BUSINESS_ID directamente: todas llaman a
 * negocioActivo(). Hasta la Fase 8 devuelve siempre el negocio demo. En la
 * Fase 9 devolverá el negocio del usuario con sesión (verificada con
 * auth.getUser()), o el demo si no hay sesión, sin reescribir las vistas.
 */
import { DEMO_BUSINESS_ID } from './negocio-demo';

export interface NegocioActivo {
  businessId: string;
  esDemo: boolean;
}

export async function negocioActivo(): Promise<NegocioActivo> {
  return { businessId: DEMO_BUSINESS_ID, esDemo: true };
}
