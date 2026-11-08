/**
 * Implementación alternativa del adaptador sobre el SDK oficial de OpenAI
 * (Responses API + zodTextFormat). Permite migrar de proveedor cambiando
 * PROVEEDOR_IA y la clave, sin tocar el código de negocio (sección 12).
 * La entrega usa Anthropic; este adaptador solo se prueba con un SDK simulado.
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { errorIA, type AdaptadorIA, type ConfigIA, type ParametrosIA, type ResultadoIA } from './cliente';

export function crearAdaptadorOpenAI(
  config: Pick<ConfigIA, 'modelo' | 'apiKey'>,
  cliente: OpenAI = new OpenAI({ apiKey: config.apiKey, maxRetries: 0 }),
): AdaptadorIA {
  return {
    proveedor: 'openai',
    modelo: config.modelo,

    async generarJSON<T>({ sistema, usuario, esquema, nombreEsquema, timeoutMs }: ParametrosIA<T>): Promise<ResultadoIA<T>> {
      try {
        const respuesta = await cliente.responses.parse(
          {
            model: config.modelo,
            instructions: sistema,
            input: usuario,
            text: { format: zodTextFormat(esquema, nombreEsquema) },
          },
          { timeout: timeoutMs, maxRetries: 0 },
        );

        if (respuesta.status === 'incomplete') return errorIA('esquema', 'respuesta incompleta');
        const rechazo = respuesta.output.some(
          (item) => item.type === 'message' && item.content.some((parte) => parte.type === 'refusal'),
        );
        if (rechazo) return errorIA('rechazo', 'refusal');

        const validado = esquema.safeParse(respuesta.output_parsed);
        if (!validado.success) return errorIA('esquema', validado.error.message);

        return {
          ok: true,
          datos: validado.data,
          uso: { entrada: respuesta.usage?.input_tokens ?? 0, salida: respuesta.usage?.output_tokens ?? 0 },
        };
      } catch (error) {
        if (error instanceof OpenAI.APIConnectionTimeoutError) return errorIA('tiempo', `más de ${timeoutMs} ms`);
        if (error instanceof OpenAI.APIError) return errorIA('proveedor', `${error.status ?? ''} ${error.message}`.trim());
        return errorIA('esquema', error instanceof Error ? error.message : String(error));
      }
    },
  };
}
