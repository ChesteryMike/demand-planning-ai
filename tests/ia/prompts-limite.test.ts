import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { normalizarTexto } from '@/lib/importar/normalizador';
import {
  MENSAJE_TOPE_IA,
  TOPE_DIARIO_IA_GLOBAL_POR_DEFECTO,
  TOPE_DIARIO_IA_POR_DEFECTO,
  crearRegistroUsoIa,
  generarConTope,
  leerTopes,
} from '@/lib/ia/limite';
import { cargarPrompt, quitarEncabezado } from '@/lib/ia/prompts';
import { crearAdaptadorFalso } from './adaptador-falso';

describe('prompts.ts (6.8, 6.14)', () => {
  it('carga la versión indicada en versiones.json, sin el encabezado', async () => {
    const versiones = JSON.parse(await readFile(path.join(process.cwd(), 'prompts', 'versiones.json'), 'utf8'));
    const r = await cargarPrompt('normalizador');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.prompt.version).toBe(versiones.normalizador);
    expect(r.prompt.versionPrompt).toBe(`normalizador_${versiones.normalizador}`);
    expect(r.prompt.texto.startsWith('Eres el Normalizador')).toBe(true);
    expect(r.prompt.texto).not.toContain('<!--');
  });

  it('puede forzar otra versión (golden set: --version v1)', async () => {
    const r = await cargarPrompt('normalizador', { version: 'v1' });
    expect(r.ok && r.prompt.versionPrompt).toBe('normalizador_v1');
  });

  it('carga los tres agentes', async () => {
    for (const agente of ['normalizador', 'coherencia', 'pronostico'] as const) {
      expect((await cargarPrompt(agente)).ok).toBe(true);
    }
  });

  it('un archivo inexistente produce "IA no configurada" (sin prompt de respaldo)', async () => {
    const directorio = await mkdtemp(path.join(tmpdir(), 'prompts-'));
    await writeFile(path.join(directorio, 'versiones.json'), JSON.stringify({ normalizador: 'v9', coherencia: 'v1', pronostico: 'v1' }));
    const r = await cargarPrompt('normalizador', { directorio });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.tipo).toBe('no_configurada');
    expect(!r.ok && r.error.detalle).toMatch(/^IA no configurada/);
  });

  it('rechaza una versión que intente salir de /prompts', async () => {
    const r = await cargarPrompt('normalizador', { version: '../../.env' });
    expect(!r.ok && r.error.tipo).toBe('no_configurada');
  });

  it('cada archivo de /prompts empieza con el encabezado de 3 líneas: versión, fecha y cambios', async () => {
    const archivos = (await readdir(path.join(process.cwd(), 'prompts'))).filter((a) => a.endsWith('.md'));
    expect(archivos.sort()).toEqual(['coherencia_v1.md', 'normalizador_v1.md', 'normalizador_v2.md', 'normalizador_v3.md', 'pronostico_v1.md']);
    for (const archivo of archivos) {
      const lineas = (await readFile(path.join(process.cwd(), 'prompts', archivo), 'utf8')).split('\n');
      expect(lineas[0]).toBe(`<!-- versión: ${archivo.replace('.md', '')} -->`);
      expect(lineas[1]).toMatch(/^<!-- fecha: \d{4}-\d{2}-\d{2} -->$/);
      expect(lineas[2]).toMatch(/^<!-- cambios: .+ -->$/);
    }
    expect(quitarEncabezado('<!-- a -->\n<!-- b -->\n<!-- c -->\nTexto')).toBe('Texto');
  });

  it('ningún archivo de lib/ contiene un prompt de sistema escrito en el código (cadenas > 200 caracteres)', async () => {
    // Se usa el analizador de TypeScript para leer solo cadenas reales (no comentarios).
    const ts = await import('typescript');
    const archivos = await readdir(path.join(process.cwd(), 'lib'), { recursive: true });
    const largas: string[] = [];
    for (const archivo of archivos.filter((a) => a.endsWith('.ts'))) {
      const codigo = await readFile(path.join(process.cwd(), 'lib', archivo), 'utf8');
      const fuente = ts.createSourceFile(archivo, codigo, ts.ScriptTarget.Latest, true);
      const visitar = (nodo: import('typescript').Node): void => {
        let texto: string | null = null;
        if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) texto = nodo.text;
        if (ts.isTemplateExpression(nodo)) texto = nodo.head.text + nodo.templateSpans.map((s) => s.literal.text).join('');
        if (texto !== null && texto.length > 200) largas.push(`${archivo}: ${texto.slice(0, 60)}…`);
        ts.forEachChild(nodo, visitar);
      };
      visitar(fuente);
    }
    expect(largas).toEqual([]);
  });

  it('la versión usada llega a uso_ia: el normalizador registra "normalizador_v1" si se fuerza v1', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { permitido: true, motivo: null }, error: null });
    const registrarUso = crearRegistroUsoIa({ rpc } as unknown as SupabaseClient, {
      businessId: 'negocio-demo',
      ruta: 'normalizar',
      hoy: '2026-03-30',
      topes: { porNegocio: 200, global: 500 },
    });
    const { adaptador } = crearAdaptadorFalso({ salida: { filas: [], confianza: 'baja', advertencias: [], no_interpretable: true } });
    await normalizarTexto({ texto: 'Recordar llamar al proveedor', tipo: 'venta' }, { adaptador, registrarUso, versionPrompt: 'v1' });
    expect(rpc).toHaveBeenCalledWith('registrar_uso_ia', {
      p_business_id: 'negocio-demo',
      p_fecha: '2026-03-30',
      p_ruta: 'normalizar',
      p_version_prompt: 'normalizador_v1',
      p_tope_negocio: 200,
      p_tope_global: 500,
    });
  });
});

describe('limite.ts (6.8)', () => {
  it('topes por defecto: 200 por negocio y 500 global; se pueden cambiar por variables', () => {
    expect(leerTopes({})).toEqual({ porNegocio: TOPE_DIARIO_IA_POR_DEFECTO, global: TOPE_DIARIO_IA_GLOBAL_POR_DEFECTO });
    expect(leerTopes({ TOPE_DIARIO_IA: '50', TOPE_DIARIO_IA_GLOBAL: '120' })).toEqual({ porNegocio: 50, global: 120 });
    expect(leerTopes({ TOPE_DIARIO_IA: 'muchos', TOPE_DIARIO_IA_GLOBAL: '-3' })).toEqual({ porNegocio: 200, global: 500 });
  });

  it('al superar TOPE_DIARIO_IA_GLOBAL responde el mensaje aunque el negocio no haya llegado a su tope', async () => {
    // La función SQL responde que el negocio lleva 3 de 200, pero el total del día ya llegó a 500.
    const rpc = vi.fn().mockResolvedValue({
      data: { permitido: false, motivo: 'global', uso_negocio: 3, uso_global: 500 },
      error: null,
    });
    const registrarUso = crearRegistroUsoIa({ rpc } as unknown as SupabaseClient, {
      businessId: 'negocio-nuevo',
      ruta: 'normalizar',
      hoy: '2026-03-30',
      topes: leerTopes({}),
    });
    const { adaptador, llamadas } = crearAdaptadorFalso({ salida: {} });
    const r = await normalizarTexto({ texto: '03-03-2026 Marraqueta 45', tipo: 'venta' }, { adaptador, registrarUso });
    expect(r).toEqual({ ok: false, mensaje: MENSAJE_TOPE_IA, llamoIa: false });
    expect(llamadas).toHaveLength(0);
  });

  it('si no se puede registrar el uso (error de base), no se llama a la IA', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'sin conexión' } });
    const registrarUso = crearRegistroUsoIa({ rpc } as unknown as SupabaseClient, {
      businessId: 'x',
      ruta: 'normalizar',
      hoy: '2026-03-30',
      topes: leerTopes({}),
    });
    expect(await registrarUso('normalizador_v2')).toEqual({ permitido: false, motivo: 'error' });
  });

  it('sin IA configurada no se registra uso ni se carga el prompt', async () => {
    const registrarUso = vi.fn();
    const cargar = vi.fn();
    const { adaptadorNoConfigurado } = await import('@/lib/ia/cliente');
    const r = await generarConTope(
      'normalizador',
      { adaptador: adaptadorNoConfigurado, registrarUso, cargarPrompt: cargar },
      { usuario: 'x', esquema: (await import('zod')).z.object({}), nombreEsquema: 'x', timeoutMs: 1000 },
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.tipo).toBe('no_configurada');
    expect(registrarUso).not.toHaveBeenCalled();
    expect(cargar).not.toHaveBeenCalled();
  });
});
