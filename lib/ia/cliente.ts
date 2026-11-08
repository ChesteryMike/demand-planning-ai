/**
 * Adaptador de IA (PROMPT_MAESTRO 6.8). Solo servidor.
 *
 * Interfaz común: generarJSON({ sistema, usuario, esquema, timeoutMs })
 *   → objeto validado con zod | error tipado.
 *
 * El proveedor sale de PROVEEDOR_IA y el modelo de MODELO_IA, sin valores
 * por defecto en el código: si falta algo, el error es "IA no configurada".
 * Los agentes reciben el adaptador como parámetro; así los tests usan un
 * adaptador falso y nunca llaman a un proveedor real.
 */
import type { z } from 'zod';

export const MENSAJE_IA_NO_CONFIGURADA = 'IA no configurada';

export type TipoErrorIA =
  | 'no_configurada' // falta proveedor, modelo, clave o el archivo del prompt
  | 'proveedor' //      error de red o de la API del proveedor
  | 'esquema' //        la salida no cumple el esquema (o quedó cortada)
  | 'tiempo' //         se superó timeoutMs
  | 'rechazo' //        el modelo se negó a responder
  | 'tope'; //          tope diario de IA alcanzado (lo produce limite.ts)

export interface ErrorIA {
  tipo: TipoErrorIA;
  /** Detalle técnico para los registros del servidor; nunca se muestra al usuario. */
  detalle: string;
}

export interface UsoTokens {
  entrada: number;
  salida: number;
}

export type ResultadoIA<T> = { ok: true; datos: T; uso: UsoTokens } | { ok: false; error: ErrorIA };

export interface ParametrosIA<T> {
  sistema: string;
  usuario: string;
  esquema: z.ZodType<T>;
  /** Nombre del esquema para el proveedor (solo letras, números y _). */
  nombreEsquema: string;
  timeoutMs: number;
}

export interface AdaptadorIA {
  readonly proveedor: string;
  readonly modelo: string;
  generarJSON<T>(parametros: ParametrosIA<T>): Promise<ResultadoIA<T>>;
}

export const PROVEEDORES = ['anthropic', 'openai'] as const;
export type ProveedorIA = (typeof PROVEEDORES)[number];

export interface ConfigIA {
  proveedor: ProveedorIA;
  modelo: string;
  apiKey: string;
}

type Entorno = Record<string, string | undefined>;

/** Lee la configuración desde variables de entorno. Null si falta algo (nunca hay un valor por defecto oculto). */
export function leerConfigIA(entorno: Entorno = process.env): ConfigIA | null {
  const proveedor = entorno.PROVEEDOR_IA?.trim();
  const modelo = entorno.MODELO_IA?.trim();
  if (!proveedor || !modelo || !(PROVEEDORES as readonly string[]).includes(proveedor)) return null;
  const apiKey = (proveedor === 'anthropic' ? entorno.ANTHROPIC_API_KEY : entorno.OPENAI_API_KEY)?.trim();
  if (!apiKey) return null;
  return { proveedor: proveedor as ProveedorIA, modelo, apiKey };
}

export function errorIA(tipo: TipoErrorIA, detalle: string): { ok: false; error: ErrorIA } {
  return { ok: false, error: { tipo, detalle } };
}

/** Adaptador que siempre falla con "IA no configurada" (cuando faltan variables). */
export const adaptadorNoConfigurado: AdaptadorIA = {
  proveedor: 'ninguno',
  modelo: 'ninguno',
  async generarJSON() {
    return errorIA('no_configurada', MENSAJE_IA_NO_CONFIGURADA);
  },
};

/** Elige la implementación según PROVEEDOR_IA. Carga el SDK solo cuando se usa. */
export async function obtenerAdaptador(entorno: Entorno = process.env): Promise<AdaptadorIA> {
  const config = leerConfigIA(entorno);
  if (!config) return adaptadorNoConfigurado;
  if (config.proveedor === 'anthropic') {
    const { crearAdaptadorAnthropic } = await import('./anthropic');
    return crearAdaptadorAnthropic(config);
  }
  const { crearAdaptadorOpenAI } = await import('./openai');
  return crearAdaptadorOpenAI(config);
}
