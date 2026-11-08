/**
 * Implementación del adaptador sobre el SDK oficial de Anthropic.
 *
 * Salida estructurada: client.messages.parse + zodOutputFormat
 * (https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
 * · No se envía `temperature`: la API vigente la rechaza en todos los modelos.
 * · effort "low": los agentes solo separan texto o sugieren un ajuste acotado.
 * · Se revisa stop_reason antes de usar la salida (refusal / max_tokens).
 * · La salida se vuelve a validar con el esquema zod antes de devolverla.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { errorIA, type AdaptadorIA, type ConfigIA, type ParametrosIA, type ResultadoIA } from './cliente';

const MAX_TOKENS = 16_000;

export function crearAdaptadorAnthropic(
  config: Pick<ConfigIA, 'modelo' | 'apiKey'>,
  cliente: Anthropic = new Anthropic({ apiKey: config.apiKey, maxRetries: 0 }),
): AdaptadorIA {
  return {
    proveedor: 'anthropic',
    modelo: config.modelo,

    async generarJSON<T>({ sistema, usuario, esquema, timeoutMs }: ParametrosIA<T>): Promise<ResultadoIA<T>> {
      try {
        const respuesta = await cliente.messages.parse(
          {
            model: config.modelo,
            max_tokens: MAX_TOKENS,
            system: sistema,
            messages: [{ role: 'user', content: usuario }],
            output_config: { format: zodOutputFormat(esquema), effort: 'low' },
          },
          { timeout: timeoutMs, maxRetries: 0 },
        );

        if (respuesta.stop_reason === 'refusal') return errorIA('rechazo', 'stop_reason: refusal');
        if (respuesta.stop_reason === 'max_tokens') return errorIA('esquema', 'stop_reason: max_tokens (salida cortada)');

        const validado = esquema.safeParse(respuesta.parsed_output);
        if (!validado.success) return errorIA('esquema', validado.error.message);

        return {
          ok: true,
          datos: validado.data,
          uso: { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens },
        };
      } catch (error) {
        if (error instanceof Anthropic.APIConnectionTimeoutError) return errorIA('tiempo', `más de ${timeoutMs} ms`);
        if (error instanceof Anthropic.APIError) return errorIA('proveedor', `${error.status ?? ''} ${error.message}`.trim());
        // El helper de parseo lanza un error común si el JSON no cumple el esquema.
        return errorIA('esquema', error instanceof Error ? error.message : String(error));
      }
    },
  };
}
