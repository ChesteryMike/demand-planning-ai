/**
 * Cliente de Supabase de SOLO LECTURA para Server Components (6.10).
 *
 * Usa la anon key más la cookie de sesión (si existe, desde la Fase 9), de
 * modo que RLS decide qué filas se ven. El navegador nunca recibe ni la URL
 * ni la anon key: este cliente solo existe en el servidor.
 */
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ErrorConfiguracion } from './supabase-servidor';

export async function clienteLectura(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url) throw new ErrorConfiguracion('SUPABASE_URL');
  if (!anon) throw new ErrorConfiguracion('SUPABASE_ANON_KEY');
  const almacen = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => almacen.getAll(),
      // Un Server Component no puede escribir cookies; la sesión se refresca en proxy.ts (Fase 9).
      setAll: () => {},
    },
  });
}
