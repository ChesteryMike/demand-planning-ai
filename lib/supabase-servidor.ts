/**
 * Cliente de Supabase con SERVICE ROLE. Solo servidor: rutas de API.
 *
 * La service role se salta RLS, por eso toda escritura fija
 * business_id = negocioActivo() en el código (6.10) y nunca confía en el
 * business_id que mande el navegador. Las variables se leen al ejecutar
 * (no en el build): la misma imagen sirve para local y para Cloud Run.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class ErrorConfiguracion extends Error {
  constructor(variable: string) {
    super(`Falta la variable de entorno ${variable}`);
    this.name = 'ErrorConfiguracion';
  }
}

let cliente: SupabaseClient | null = null;

export function clienteServidor(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new ErrorConfiguracion('SUPABASE_URL');
  if (!clave) throw new ErrorConfiguracion('SUPABASE_SERVICE_ROLE_KEY');
  cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cliente;
}
