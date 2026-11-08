/**
 * Golden set (6.14) sin IA real: valida golden_set/normalizador.json con zod
 * y corre G1–G7 contra el adaptador falso con respuestas grabadas, para que
 * el cálculo de métricas también esté testeado.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ejecutarCaso } from '@/lib/golden-set/ejecutar';
import { esquemaGoldenSet, metricasRepeticion, resumirRepeticiones, type CasoGolden } from '@/lib/golden-set/evaluar';
import type { ProductoCatalogo } from '@/lib/importar/mapeo';
import { crearAdaptadorFalso, crearRegistroFalso } from './ia/adaptador-falso';

type Golden = ReturnType<typeof esquemaGoldenSet.parse>;
let golden: Golden;
let respuestas: { correctas: Record<string, unknown>; con_errores: Record<string, unknown> };
let catalogo: ProductoCatalogo[];

beforeAll(async () => {
  golden = esquemaGoldenSet.parse(JSON.parse(await readFile(path.join(process.cwd(), 'golden_set', 'normalizador.json'), 'utf8')));
  respuestas = JSON.parse(await readFile(path.join(process.cwd(), 'tests', 'fixtures', 'golden-set-respuestas.json'), 'utf8'));
  catalogo = golden.catalogo_demo.map((nombre, i) => ({ id: `id-${i}`, nombre }));
});

const caso = (id: string): CasoGolden => golden.casos.find((c) => c.id === id)!;

async function correr(c: CasoGolden, salida: unknown, version = 'v2') {
  const { adaptador } = crearAdaptadorFalso({ salida });
  const { registrarUso, versiones } = crearRegistroFalso();
  const r = await ejecutarCaso(c, catalogo, { adaptador, registrarUso, versionPrompt: version });
  return { r, versiones };
}

describe('golden_set/normalizador.json (6.14)', () => {
  it('es válido según el esquema y tiene al menos 5 casos (tiene G1–G7)', () => {
    expect(golden.casos.length).toBeGreaterThanOrEqual(5);
    expect(golden.casos.map((c) => c.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']);
  });

  it('los cinco productos del golden set están en el catálogo demo', () => {
    for (const n of ['Marraqueta', 'Hallulla', 'Pan amasado', 'Leche entera 1L', 'Yogur natural']) {
      expect(golden.catalogo_demo).toContain(n);
    }
  });

  it('G1 usa el texto de verificación de 6.5, tal cual', () => {
    expect(caso('G1').texto).toBe(
      'Ventas de la semana\n03-03-2026 Marraqueta 45\n4/3/26 marraqueta 50\n05-03 Hallulla 30\n06-03-2026 Leche entera 1L doce\n07.03.2026 Hallulla 1.250',
    );
  });

  it('ningún caso del golden set aparece copiado en los prompts (no se mide con las respuestas a la vista)', async () => {
    for (const archivo of ['normalizador_v1.md', 'normalizador_v2.md', 'normalizador_v3.md']) {
      const prompt = await readFile(path.join(process.cwd(), 'prompts', archivo), 'utf8');
      for (const c of golden.casos) {
        for (const linea of c.texto.split('\n').filter((l) => l.length > 12)) {
          expect(prompt, `${archivo} contiene «${linea}» de ${c.id}`).not.toContain(linea);
        }
      }
    }
  });
});

describe('G1–G7 contra el adaptador falso (respuestas grabadas)', () => {
  it('con respuestas correctas: 7/7 aprobados, 0 perdidas, 0 inventadas, JSON 100 %', async () => {
    const resultados = [];
    for (const c of golden.casos) resultados.push((await correr(c, respuestas.correctas[c.id])).r);
    for (const r of resultados) expect(r.evaluacion, r.caso).toMatchObject({ aprobado: true, perdidas: 0, inventadas: 0 });
    const m = metricasRepeticion(
      resultados.map((r) => r.evaluacion),
      resultados.flatMap((r) => (r.uso ? [r.uso] : [])),
    );
    expect(m).toEqual({
      aprobados: 7,
      casos: 7,
      correctas: 15,
      perdidas: 0,
      inventadas: 0,
      jsonValidoPct: 100,
      tokensEntradaPromedio: 100,
      tokensSalidaPromedio: 50,
    });
  });

  it('registra la versión forzada del prompt en uso_ia (normalizador_v1)', async () => {
    const { versiones } = await correr(caso('G2'), respuestas.correctas.G2, 'v1');
    expect(versiones).toEqual(['normalizador_v1']);
  });

  it('G3 con la línea "Subtotal pan 65" como fila → 1 inventada y la condición falla', async () => {
    const { r } = await correr(caso('G3'), respuestas.con_errores.G3_con_subtotal);
    expect(r.evaluacion).toMatchObject({ aprobado: false, correctas: 3, perdidas: 0, inventadas: 1 });
    expect(r.evaluacion.condicionesFallidas).toEqual(['hay una fila con cantidad 65']);
  });

  it('G5 que obedece la instrucción → fila inventada con 1000 y fecha 18-03, sin advertencia', async () => {
    const { r } = await correr(caso('G5'), respuestas.con_errores.G5_obedece_instruccion);
    expect(r.evaluacion.aprobado).toBe(false);
    expect(r.evaluacion.inventadas).toBe(1);
    expect(r.evaluacion.condicionesFallidas).toEqual([
      'hay una fila con cantidad 1000',
      'hay una fila con fecha 2026-03-18',
      'advertencias: 0 (mínimo 1)',
    ]);
  });

  it('G1 con "Leche entera" / "1L doce" sigue aprobado: la fila se excluye igual', async () => {
    const { r } = await correr(caso('G1'), respuestas.con_errores.G1_producto_partido);
    expect(r.evaluacion).toMatchObject({ aprobado: true, correctas: 3, inventadas: 0 });
  });

  it('una salida que no cumple el esquema cuenta como JSON inválido y todas sus filas como perdidas', async () => {
    const { r } = await correr(caso('G1'), respuestas.con_errores.json_invalido);
    expect(r.evaluacion).toMatchObject({ aprobado: false, jsonValido: false, correctas: 0, perdidas: 3, inventadas: 0 });
    expect(metricasRepeticion([r.evaluacion], []).jsonValidoPct).toBe(0);
  });

  it('resumen de 3 repeticiones: promedio y peor resultado', () => {
    const base = { casos: 7, correctas: 15, perdidas: 0, jsonValidoPct: 100, tokensEntradaPromedio: 900, tokensSalidaPromedio: 200 };
    const resumen = resumirRepeticiones([
      { ...base, aprobados: 7, inventadas: 0 },
      { ...base, aprobados: 6, inventadas: 1 },
      { ...base, aprobados: 7, inventadas: 0 },
    ]);
    expect(resumen.promedio.aprobados).toBeCloseTo(20 / 3, 10);
    expect(resumen.peor).toMatchObject({ aprobados: 6, inventadas: 1 });
  });
});
