/**
 * Adaptadores anthropic.ts y openai.ts con SDKs SIMULADOS (vi.mock) que
 * devuelven la forma real de respuesta de cada proveedor.
 * Cero llamadas reales al modelo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const sdk = vi.hoisted(() => {
  class APIError extends Error {
    status: number | undefined;
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
    }
  }
  class APIConnectionTimeoutError extends APIError {
    constructor() {
      super(undefined, 'Request timed out.');
    }
  }
  return { anthropicParse: vi.fn(), openaiParse: vi.fn(), APIError, APIConnectionTimeoutError };
});

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = sdk.APIError;
    static APIConnectionTimeoutError = sdk.APIConnectionTimeoutError;
    messages = { parse: sdk.anthropicParse };
  }
  return { default: Anthropic, APIError: sdk.APIError, APIConnectionTimeoutError: sdk.APIConnectionTimeoutError };
});

vi.mock('openai', () => {
  class OpenAI {
    static APIError = sdk.APIError;
    static APIConnectionTimeoutError = sdk.APIConnectionTimeoutError;
    responses = { parse: sdk.openaiParse };
  }
  return { default: OpenAI, APIError: sdk.APIError, APIConnectionTimeoutError: sdk.APIConnectionTimeoutError };
});

const { crearAdaptadorAnthropic } = await import('@/lib/ia/anthropic');
const { crearAdaptadorOpenAI } = await import('@/lib/ia/openai');
const { leerConfigIA, obtenerAdaptador, MENSAJE_IA_NO_CONFIGURADA } = await import('@/lib/ia/cliente');

const esquema = z.object({ ajuste_pct: z.number(), motivo: z.string() });
const parametros = { sistema: 'prompt', usuario: '<datos>…</datos>', esquema, nombreEsquema: 'prueba', timeoutMs: 30_000 };
const SALIDA = { ajuste_pct: 5, motivo: 'Subió la venta.' };

/** Forma real de un Message de Anthropic devuelto por messages.parse(). */
function mensajeAnthropic(parsed: unknown, stop_reason = 'end_turn') {
  return {
    id: 'msg_01',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: JSON.stringify(parsed), citations: null, parsed_output: parsed }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 812, output_tokens: 64, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    parsed_output: parsed,
  };
}

/** Forma real de una Response de OpenAI devuelta por responses.parse(). */
function respuestaOpenAI(parsed: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: 'resp_01',
    object: 'response',
    status: 'completed',
    model: 'modelo-openai',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(parsed), parsed }] }],
    output_parsed: parsed,
    usage: { input_tokens: 700, output_tokens: 40, total_tokens: 740 },
    ...extra,
  };
}

beforeEach(() => {
  sdk.anthropicParse.mockReset();
  sdk.openaiParse.mockReset();
});

describe('anthropic.ts (SDK simulado)', () => {
  const adaptador = () => crearAdaptadorAnthropic({ modelo: 'claude-haiku-5-5', apiKey: 'clave-ficticia' });

  it('devuelve la salida validada y los tokens; pide salida estructurada sin temperature', async () => {
    sdk.anthropicParse.mockResolvedValue(mensajeAnthropic(SALIDA));
    const r = await adaptador().generarJSON(parametros);
    expect(r).toEqual({ ok: true, datos: SALIDA, uso: { entrada: 812, salida: 64 } });

    const [peticion, opciones] = sdk.anthropicParse.mock.calls[0]!;
    expect(peticion).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'prompt',
      messages: [{ role: 'user', content: '<datos>…</datos>' }],
      output_config: { effort: 'low' },
    });
    expect(peticion.output_config.format).toBeDefined();
    expect(peticion).not.toHaveProperty('temperature');
    expect(opciones).toEqual({ timeout: 30_000, maxRetries: 0 });
  });

  it('stop_reason "refusal" → error "rechazo"; "max_tokens" → error "esquema"', async () => {
    sdk.anthropicParse.mockResolvedValueOnce(mensajeAnthropic(null, 'refusal'));
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'rechazo' } });
    sdk.anthropicParse.mockResolvedValueOnce(mensajeAnthropic(SALIDA, 'max_tokens'));
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'esquema' } });
  });

  it('una salida que no cumple el esquema → error "esquema"', async () => {
    sdk.anthropicParse.mockResolvedValue(mensajeAnthropic({ ajuste_pct: 'mucho' }));
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'esquema' } });
  });

  it('tiempo agotado → "tiempo"; error de la API → "proveedor"', async () => {
    sdk.anthropicParse.mockRejectedValueOnce(new sdk.APIConnectionTimeoutError());
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'tiempo' } });
    sdk.anthropicParse.mockRejectedValueOnce(new sdk.APIError(529, 'Overloaded'));
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'proveedor' } });
  });
});

describe('openai.ts (SDK simulado)', () => {
  const adaptador = () => crearAdaptadorOpenAI({ modelo: 'modelo-openai', apiKey: 'clave-ficticia' });

  it('devuelve la salida validada y los tokens', async () => {
    sdk.openaiParse.mockResolvedValue(respuestaOpenAI(SALIDA));
    expect(await adaptador().generarJSON(parametros)).toEqual({ ok: true, datos: SALIDA, uso: { entrada: 700, salida: 40 } });
    const [peticion] = sdk.openaiParse.mock.calls[0]!;
    expect(peticion).toMatchObject({ model: 'modelo-openai', instructions: 'prompt', input: '<datos>…</datos>' });
    expect(peticion.text.format).toBeDefined();
  });

  it('respuesta incompleta, rechazo o salida inválida → error tipado', async () => {
    sdk.openaiParse.mockResolvedValueOnce(respuestaOpenAI(SALIDA, { status: 'incomplete' }));
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'esquema' } });
    sdk.openaiParse.mockResolvedValueOnce(
      respuestaOpenAI(null, { output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No.' }] }] }),
    );
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'rechazo' } });
    sdk.openaiParse.mockResolvedValueOnce(respuestaOpenAI({ otra: 'cosa' }));
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'esquema' } });
  });

  it('tiempo agotado → "tiempo"', async () => {
    sdk.openaiParse.mockRejectedValueOnce(new sdk.APIConnectionTimeoutError());
    expect(await adaptador().generarJSON(parametros)).toMatchObject({ ok: false, error: { tipo: 'tiempo' } });
  });
});

describe('cliente.ts: selección por PROVEEDOR_IA (6.8)', () => {
  it('si falta PROVEEDOR_IA, MODELO_IA o la clave → "IA no configurada" (sin valor por defecto)', async () => {
    expect(leerConfigIA({})).toBeNull();
    expect(leerConfigIA({ PROVEEDOR_IA: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toBeNull();
    expect(leerConfigIA({ PROVEEDOR_IA: 'anthropic', MODELO_IA: 'claude-haiku-5-5' })).toBeNull();
    expect(leerConfigIA({ PROVEEDOR_IA: 'otro', MODELO_IA: 'm', ANTHROPIC_API_KEY: 'k' })).toBeNull();
    const adaptador = await obtenerAdaptador({});
    expect(await adaptador.generarJSON(parametros)).toEqual({
      ok: false,
      error: { tipo: 'no_configurada', detalle: MENSAJE_IA_NO_CONFIGURADA },
    });
  });

  it('elige la implementación según PROVEEDOR_IA y usa MODELO_IA tal cual', async () => {
    const a = await obtenerAdaptador({ PROVEEDOR_IA: 'anthropic', MODELO_IA: 'claude-haiku-5-5', ANTHROPIC_API_KEY: 'k' });
    expect([a.proveedor, a.modelo]).toEqual(['anthropic', 'claude-haiku-5-5']);
    const o = await obtenerAdaptador({ PROVEEDOR_IA: 'openai', MODELO_IA: 'modelo-openai', OPENAI_API_KEY: 'k' });
    expect([o.proveedor, o.modelo]).toEqual(['openai', 'modelo-openai']);
  });
});
