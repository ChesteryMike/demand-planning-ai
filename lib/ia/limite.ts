/**
 * Tope diario de llamadas a la IA (PROMPT_MAESTRO 6.8). Solo servidor.
 *
 * Antes de cada llamada se incrementa uso_ia (con la versión del prompt) en
 * una función SQL atómica que revisa dos topes:
 *   · TOPE_DIARIO_IA (por negocio y día, por defecto 200)
 *   · TOPE_DIARIO_IA_GLOBAL (todos los negocios, por defecto 500)
 * Es la primera barrera; la segunda es el límite de gasto mensual
 * configurado en la consola del proveedor (8.2).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { FechaISO } from '../fechas';
import { errorIA, type AdaptadorIA, type ResultadoIA } from './cliente';
import { cargarPrompt, type Agente, type OpcionesPrompt, type ResultadoPrompt } from './prompts';

export const MENSAJE_TOPE_IA =
  'Se alcanzó el límite diario de consultas a la IA de esta demostración. Intente mañana.';

export const TOPE_DIARIO_IA_POR_DEFECTO = 200;
export const TOPE_DIARIO_IA_GLOBAL_POR_DEFECTO = 500;

export interface Topes {
  porNegocio: number;
  global: number;
}

function enteroPositivo(valor: string | undefined, porDefecto: number): number {
  const numero = Number(valor);
  return valor !== undefined && valor.trim() !== '' && Number.isInteger(numero) && numero > 0 ? numero : porDefecto;
}

export function leerTopes(entorno: Record<string, string | undefined> = process.env): Topes {
  return {
    porNegocio: enteroPositivo(entorno.TOPE_DIARIO_IA, TOPE_DIARIO_IA_POR_DEFECTO),
    global: enteroPositivo(entorno.TOPE_DIARIO_IA_GLOBAL, TOPE_DIARIO_IA_GLOBAL_POR_DEFECTO),
  };
}

export type ResultadoUso = { permitido: true } | { permitido: false; motivo: 'negocio' | 'global' | 'error' };

/** Registra una llamada con la versión del prompt usada; decide si se permite. */
export type RegistrarUsoIA = (versionPrompt: string) => Promise<ResultadoUso>;

const esquemaRespuestaUso = z.object({
  permitido: z.boolean(),
  motivo: z.enum(['negocio', 'global']).nullable(),
});

/** Registro de uso sobre Supabase (service role). Ante un error, NO permite la llamada. */
export function crearRegistroUsoIa(
  cliente: SupabaseClient,
  datos: { businessId: string; ruta: string; hoy: FechaISO; topes: Topes },
): RegistrarUsoIA {
  return async (versionPrompt) => {
    const { data, error } = await cliente.rpc('registrar_uso_ia', {
      p_business_id: datos.businessId,
      p_fecha: datos.hoy,
      p_ruta: datos.ruta,
      p_version_prompt: versionPrompt,
      p_tope_negocio: datos.topes.porNegocio,
      p_tope_global: datos.topes.global,
    });
    if (error) return { permitido: false, motivo: 'error' };
    const respuesta = esquemaRespuestaUso.safeParse(data);
    if (!respuesta.success) return { permitido: false, motivo: 'error' };
    if (respuesta.data.permitido) return { permitido: true };
    return { permitido: false, motivo: respuesta.data.motivo ?? 'error' };
  };
}

export interface DependenciasAgente {
  adaptador: AdaptadorIA;
  registrarUso: RegistrarUsoIA;
  /** Por defecto, el cargador real de /prompts. Los tests pueden reemplazarlo. */
  cargarPrompt?: (agente: Agente, opciones?: OpcionesPrompt) => Promise<ResultadoPrompt>;
  /** Fuerza una versión del prompt (golden set). */
  versionPrompt?: string;
}

export type ResultadoAgenteIA<T> = ResultadoIA<T> & { versionPrompt: string | null };

/**
 * Secuencia común de los tres agentes:
 *   1. carga el prompt versionado (si falta → "IA no configurada");
 *   2. registra el uso con su versión y revisa los topes (si se superan → error "tope");
 *   3. llama al adaptador, que devuelve la salida ya validada con zod.
 */
export async function generarConTope<T>(
  agente: Agente,
  deps: DependenciasAgente,
  parametros: { usuario: string; esquema: z.ZodType<T>; nombreEsquema: string; timeoutMs: number },
): Promise<ResultadoAgenteIA<T>> {
  if (deps.adaptador.proveedor === 'ninguno') {
    return { ...errorIA('no_configurada', 'faltan PROVEEDOR_IA, MODELO_IA o la clave'), versionPrompt: null };
  }

  const cargado = await (deps.cargarPrompt ?? cargarPrompt)(
    agente,
    deps.versionPrompt ? { version: deps.versionPrompt } : {},
  );
  if (!cargado.ok) return { ok: false, error: cargado.error, versionPrompt: null };
  const { texto, versionPrompt } = cargado.prompt;

  const uso = await deps.registrarUso(versionPrompt);
  if (!uso.permitido) {
    return { ...errorIA('tope', `tope alcanzado (${uso.motivo})`), versionPrompt };
  }

  const resultado = await deps.adaptador.generarJSON({ sistema: texto, ...parametros });
  return { ...resultado, versionPrompt };
}
