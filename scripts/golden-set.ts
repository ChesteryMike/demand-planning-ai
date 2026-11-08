/**
 * Golden set del Normalizador contra la IA REAL (PROMPT_MAESTRO 6.14).
 *
 *   npm run golden-set -- --version v1
 *   npm run golden-set -- --version v2
 *
 * · 7 casos × 3 repeticiones = 21 llamadas por versión, una tras otra.
 * · Pasa por lib/ia/limite.ts con business_id = DEMO_BUSINESS_ID y ruta
 *   'golden_set': las llamadas cuentan para el tope diario del demo.
 * · Solo contra la Supabase LOCAL (salvo --permitir-remoto).
 * · No se envía temperature: la API vigente la rechaza (se anota en el resultado).
 * · Salida cruda en golden_set/resultados/{version}-{AAAA-MM-DD}.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hoyEnChile } from '@/lib/fechas';
import { esquemaGoldenSet, metricasRepeticion, resumirRepeticiones } from '@/lib/golden-set/evaluar';
import { ejecutarCaso, type ResultadoCaso } from '@/lib/golden-set/ejecutar';
import { obtenerAdaptador } from '@/lib/ia/cliente';
import { crearRegistroUsoIa, leerTopes } from '@/lib/ia/limite';
import { leerCatalogo } from '@/lib/importar/catalogo';
import { DEMO_BUSINESS_ID } from '@/lib/negocio-demo';
import { clienteServidor } from '@/lib/supabase-servidor';

const REPETICIONES = 3;

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const version = argumento('--version');
  if (!version || !/^v\d+$/.test(version)) throw new Error('Indique la versión: --version v1 o --version v2');

  const url = process.env.SUPABASE_URL ?? '';
  if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes('--permitir-remoto')) {
    throw new Error(`SUPABASE_URL no es local (${url}). El golden set corre contra la Supabase local (6.14).`);
  }

  const golden = esquemaGoldenSet.parse(JSON.parse(await readFile(path.join(process.cwd(), 'golden_set', 'normalizador.json'), 'utf8')));
  const db = clienteServidor();
  const catalogo = await leerCatalogo(db, DEMO_BUSINESS_ID);
  const faltan = golden.catalogo_demo.filter((n) => !catalogo.some((p) => p.nombre === n));
  if (faltan.length > 0) throw new Error(`El catálogo demo no tiene: ${faltan.join(', ')}. Restaure la demo.`);

  const adaptador = await obtenerAdaptador();
  if (adaptador.proveedor === 'ninguno') throw new Error('IA no configurada: revise PROVEEDOR_IA, MODELO_IA y la clave en .env');
  const hoy = hoyEnChile();
  const registrarUso = crearRegistroUsoIa(db, { businessId: DEMO_BUSINESS_ID, ruta: 'golden_set', hoy, topes: leerTopes() });

  console.log(`Golden set · normalizador_${version} · ${adaptador.proveedor}/${adaptador.modelo} · ${golden.casos.length} casos × ${REPETICIONES}`);
  const repeticiones: ResultadoCaso[][] = [];
  for (let rep = 1; rep <= REPETICIONES; rep++) {
    const resultados: ResultadoCaso[] = [];
    for (const caso of golden.casos) {
      const r = await ejecutarCaso(caso, catalogo, { adaptador, registrarUso, versionPrompt: version });
      resultados.push(r);
      const e = r.evaluacion;
      console.log(
        `  rep ${rep} ${caso.id}: ${e.aprobado ? 'APROBADO ' : 'reprobado'} · correctas ${e.correctas} · perdidas ${e.perdidas} · inventadas ${e.inventadas}` +
          (e.condicionesFallidas.length ? ` · ${e.condicionesFallidas.join('; ')}` : ''),
      );
      if (r.errorIA?.tipo === 'tope') throw new Error('Se alcanzó el tope diario de IA: se detiene la medición.');
    }
    repeticiones.push(resultados);
  }

  const metricas = repeticiones.map((rs) =>
    metricasRepeticion(
      rs.map((r) => r.evaluacion),
      rs.flatMap((r) => (r.uso ? [r.uso] : [])),
    ),
  );
  const resumen = resumirRepeticiones(metricas);

  const salida = {
    version: `normalizador_${version}`,
    fecha: hoy,
    ejecutado_en: new Date().toISOString(),
    proveedor: adaptador.proveedor,
    modelo: adaptador.modelo,
    temperatura: 'no enviada: la API vigente de Anthropic rechaza temperature; se usa el comportamiento por defecto del modelo',
    repeticiones: REPETICIONES,
    resumen,
    metricas_por_repeticion: metricas,
    resultados: repeticiones.map((rs, i) => ({ repeticion: i + 1, casos: rs })),
  };
  const carpeta = path.join(process.cwd(), 'golden_set', 'resultados');
  await mkdir(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${version}-${hoy}.json`);
  await writeFile(archivo, `${JSON.stringify(salida, null, 2)}\n`);

  const f = (n: number) => n.toFixed(1).replace('.', ',');
  console.log(`\nResumen normalizador_${version} (promedio / peor de ${REPETICIONES} repeticiones):`);
  console.log(`  casos aprobados ........ ${f(resumen.promedio.aprobados)} / ${resumen.peor.aprobados} de ${golden.casos.length}`);
  console.log(`  filas correctas ........ ${f(resumen.promedio.correctas)} / ${resumen.peor.correctas}`);
  console.log(`  filas perdidas ......... ${f(resumen.promedio.perdidas)} / ${resumen.peor.perdidas}`);
  console.log(`  filas inventadas ....... ${f(resumen.promedio.inventadas)} / ${resumen.peor.inventadas}`);
  console.log(`  JSON válido 1.er intento ${f(resumen.promedio.jsonValidoPct)} % / ${f(resumen.peor.jsonValidoPct)} %`);
  console.log(`  tokens promedio ........ entrada ${Math.round(resumen.promedio.tokensEntrada)} · salida ${Math.round(resumen.promedio.tokensSalida)}`);
  console.log(`\nResultado crudo: ${path.relative(process.cwd(), archivo)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
