/**
 * Límite de operaciones por IP (PROMPT_MAESTRO 6.10). Solo servidor.
 *
 * La demo es pública y editable: toda ruta de escritura llama a
 * verificarLimiteIp() antes de hacer nada.
 *   · escritura de datos ............ 60 cada 10 minutos
 *   · rutas de IA (api/agentes/*) .... 20 cada 10 minutos
 *   · api/demo/restaurar .............  3 cada hora
 *   · api/cuenta/registro ............  5 cada hora
 * La IP sale del origen configurado en IP_CLIENTE_ORIGEN (por defecto, el primer
 * valor de x-forwarded-for o x-real-ip) y se guarda solo como HMAC-SHA-256 con
 * SAL_IP: nunca la IP en claro. Detrás de Render hay que configurarlo (ver abajo).
 * El conteo es por ruta y por ventana fija de tiempo.
 */
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const MENSAJE_LIMITE_IP = 'Hizo demasiadas operaciones seguidas. Espere unos minutos e intente de nuevo.';
export const MENSAJE_SERVICIO_NO_DISPONIBLE = 'El servicio no está disponible en este momento. Intente más tarde.';

const MINUTO = 60_000;
export type GrupoRuta = 'escritura' | 'ia' | 'restaurar' | 'registro';

export const LIMITES: Record<GrupoRuta, { maximo: number; ventanaMs: number }> = {
  escritura: { maximo: 60, ventanaMs: 10 * MINUTO },
  ia: { maximo: 20, ventanaMs: 10 * MINUTO },
  restaurar: { maximo: 3, ventanaMs: 60 * MINUTO },
  registro: { maximo: 5, ventanaMs: 60 * MINUTO },
};

export function grupoDeRuta(ruta: string): GrupoRuta {
  const limpia = ruta.replace(/^\/+/, '');
  if (limpia.startsWith('api/agentes/')) return 'ia';
  if (limpia === 'api/demo/restaurar') return 'restaurar';
  if (limpia === 'api/cuenta/registro') return 'registro';
  return 'escritura';
}

export const IP_DESCONOCIDA = 'desconocida';
/** IPv4 o IPv6 (no valida rangos: solo descarta basura en la cabecera). */
const PATRON_IP = /^[0-9a-f:.]{3,45}$/i;

/**
 * De dónde sale la IP del cliente. Se configura con IP_CLIENTE_ORIGEN:
 *   (vacío) | xff-primero      primer valor de x-forwarded-for (local y Cloud Run, 8.3).
 *                              OJO: el cliente puede falsificarlo si el proxy no lo limpia.
 *   cabecera:<nombre>          una cabecera que fija la plataforma y el cliente no puede
 *                              falsificar. En Render: cabecera:cf-connecting-ip (Cloudflare
 *                              rechaza con 403 la petición que la trae falsificada).
 *   xff-desde-final:<n>        n-ésimo valor de x-forwarded-for contando desde el final
 *                              (1 = el último). En Render, 3 = la IP real del cliente.
 * Un valor de configuración inválido NO vuelve al modo falsificable: la IP queda "desconocida".
 */
export type OrigenIp =
  | { tipo: 'xff-primero' }
  | { tipo: 'cabecera'; nombre: string }
  | { tipo: 'xff-desde-final'; n: number }
  | { tipo: 'invalido' };

export function leerOrigenIp(valor: string | undefined): OrigenIp {
  const v = valor?.trim().toLowerCase();
  if (!v || v === 'xff-primero') return { tipo: 'xff-primero' };
  if (v.startsWith('cabecera:')) {
    const nombre = v.slice('cabecera:'.length).trim();
    if (/^[a-z0-9-]+$/.test(nombre)) return { tipo: 'cabecera', nombre };
  }
  if (v.startsWith('xff-desde-final:')) {
    const n = Number(v.slice('xff-desde-final:'.length));
    if (Number.isInteger(n) && n >= 1 && n <= 10) return { tipo: 'xff-desde-final', n };
  }
  return { tipo: 'invalido' };
}

function ipValida(texto: string | undefined | null): string {
  const ip = texto?.trim();
  return ip && PATRON_IP.test(ip) ? ip : IP_DESCONOCIDA;
}

/** IP del cliente según el origen configurado (por defecto, primer valor de x-forwarded-for; si no, x-real-ip). */
export function ipDelCliente(cabeceras: Headers, origen: OrigenIp = leerOrigenIp(process.env.IP_CLIENTE_ORIGEN)): string {
  switch (origen.tipo) {
    case 'cabecera':
      return ipValida(cabeceras.get(origen.nombre));
    case 'xff-desde-final': {
      const valores = (cabeceras.get('x-forwarded-for') ?? '').split(',').map((v) => v.trim()).filter(Boolean);
      return ipValida(valores[valores.length - origen.n]);
    }
    case 'invalido':
      return IP_DESCONOCIDA;
    case 'xff-primero': {
      const reenviada = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim();
      if (reenviada) return reenviada;
      return cabeceras.get('x-real-ip')?.trim() || IP_DESCONOCIDA;
    }
  }
}

export function hashIp(ip: string, sal: string): string {
  return createHmac('sha256', sal).update(ip).digest('hex');
}

export function inicioVentana(ahora: Date, ventanaMs: number): Date {
  return new Date(Math.floor(ahora.getTime() / ventanaMs) * ventanaMs);
}

/** Dónde se cuentan las llamadas. Devuelve el total de la ventana tras sumar esta. */
export interface AlmacenLimiteIp {
  incrementar(ipHash: string, ruta: string, ventanaInicio: Date): Promise<number>;
}

export function almacenSupabase(cliente: SupabaseClient): AlmacenLimiteIp {
  return {
    async incrementar(ipHash, ruta, ventanaInicio) {
      const { data, error } = await cliente.rpc('registrar_llamada_ip', {
        p_ip_hash: ipHash,
        p_ruta: ruta,
        p_ventana_inicio: ventanaInicio.toISOString(),
      });
      if (error || typeof data !== 'number') throw new Error('No se pudo registrar la llamada');
      return data;
    },
  };
}

export type ResultadoLimiteIp = { ok: true } | { ok: false; status: 429 | 503; mensaje: string };

export async function verificarLimiteIp(
  request: Request,
  ruta: string,
  deps: { almacen: AlmacenLimiteIp; sal: string | undefined; ahora?: Date; origenIp?: string },
): Promise<ResultadoLimiteIp> {
  if (!deps.sal) return { ok: false, status: 503, mensaje: MENSAJE_SERVICIO_NO_DISPONIBLE };
  const { maximo, ventanaMs } = LIMITES[grupoDeRuta(ruta)];
  const origen = leerOrigenIp(deps.origenIp ?? process.env.IP_CLIENTE_ORIGEN);
  const ipHash = hashIp(ipDelCliente(request.headers, origen), deps.sal);
  try {
    const llamadas = await deps.almacen.incrementar(ipHash, ruta, inicioVentana(deps.ahora ?? new Date(), ventanaMs));
    return llamadas > maximo ? { ok: false, status: 429, mensaje: MENSAJE_LIMITE_IP } : { ok: true };
  } catch {
    return { ok: false, status: 503, mensaje: MENSAJE_SERVICIO_NO_DISPONIBLE };
  }
}
