/**
 * Adaptador falso que implementa la interfaz de lib/ia/cliente.ts.
 * Devuelve respuestas grabadas y, como los adaptadores reales, las valida con
 * el esquema zod: una salida mal formada produce un error "esquema", nunca datos.
 * Cero llamadas reales al modelo.
 */
import { vi } from 'vitest';
import type { AdaptadorIA, ErrorIA, ParametrosIA, ResultadoIA } from '@/lib/ia/cliente';
import type { RegistrarUsoIA, ResultadoUso } from '@/lib/ia/limite';

export type RespuestaGrabada = { salida: unknown } | { error: ErrorIA };

export function crearAdaptadorFalso(...respuestas: RespuestaGrabada[]) {
  const llamadas: ParametrosIA<unknown>[] = [];
  let i = 0;
  const adaptador: AdaptadorIA = {
    proveedor: 'falso',
    modelo: 'modelo-falso',
    async generarJSON<T>(parametros: ParametrosIA<T>): Promise<ResultadoIA<T>> {
      llamadas.push(parametros as ParametrosIA<unknown>);
      const respuesta = respuestas[Math.min(i++, respuestas.length - 1)];
      if (!respuesta) throw new Error('El adaptador falso no tiene respuestas grabadas');
      if ('error' in respuesta) return { ok: false, error: respuesta.error };
      const validado = parametros.esquema.safeParse(respuesta.salida);
      if (!validado.success) return { ok: false, error: { tipo: 'esquema', detalle: validado.error.message } };
      return { ok: true, datos: validado.data, uso: { entrada: 100, salida: 50 } };
    },
  };
  return { adaptador, llamadas };
}

/** Registro de uso falso: guarda las versiones de prompt y responde lo indicado. */
export function crearRegistroFalso(resultado: ResultadoUso = { permitido: true }) {
  const versiones: string[] = [];
  const registrarUso: RegistrarUsoIA = vi.fn(async (versionPrompt: string) => {
    versiones.push(versionPrompt);
    return resultado;
  });
  return { registrarUso, versiones };
}
