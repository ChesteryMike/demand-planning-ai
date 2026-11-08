/**
 * Llamadas del navegador a las rutas de API propias (nunca a Supabase).
 * Devuelve el mensaje de error en español que entrega la ruta.
 */
export type RespuestaApi<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

export const MENSAJE_SIN_CONEXION = 'No se pudo conectar. Revise su conexión e intente de nuevo.';

export async function llamarApi<T>(url: string, init: RequestInit = {}): Promise<RespuestaApi<T>> {
  try {
    const cabeceras = init.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init.headers };
    const respuesta = await fetch(url, { ...init, headers: cabeceras });
    const cuerpo = (await respuesta.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!respuesta.ok) return { ok: false, mensaje: cuerpo?.error ?? 'No se pudo completar la operación. Intente de nuevo.' };
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, mensaje: MENSAJE_SIN_CONEXION };
  }
}

export const enviarJson = <T>(url: string, metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo?: unknown) =>
  llamarApi<T>(url, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
