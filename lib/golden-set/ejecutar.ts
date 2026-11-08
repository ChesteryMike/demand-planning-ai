/**
 * Ejecuta un caso del golden set con el MISMO flujo que la app:
 * normalizarTexto (prompt versionado + tope + adaptador) → parseo → cruce.
 * Envuelve el adaptador para medir tokens y guardar la salida cruda del modelo.
 */
import type { AdaptadorIA, ErrorIA, ParametrosIA, ResultadoIA, UsoTokens } from '../ia/cliente';
import type { DependenciasAgente } from '../ia/limite';
import type { ProductoCatalogo } from '../importar/mapeo';
import { normalizarTexto } from '../importar/normalizador';
import { evaluarCaso, filasComparables, type CasoGolden, type EvaluacionCaso, type Ejecucion } from './evaluar';

export interface ResultadoCaso {
  caso: string;
  evaluacion: EvaluacionCaso;
  ejecucion: Ejecucion;
  /** Lo que devolvió el modelo antes del parseo (null si falló). */
  salidaModelo: unknown;
  errorIA: ErrorIA | null;
  uso: UsoTokens | null;
  versionPrompt: string | null;
}

function medir(base: AdaptadorIA) {
  const registro: { salida: unknown; uso: UsoTokens | null; error: ErrorIA | null } = { salida: null, uso: null, error: null };
  const adaptador: AdaptadorIA = {
    proveedor: base.proveedor,
    modelo: base.modelo,
    async generarJSON<T>(parametros: ParametrosIA<T>): Promise<ResultadoIA<T>> {
      const r = await base.generarJSON(parametros);
      if (r.ok) {
        registro.salida = r.datos;
        registro.uso = r.uso;
      } else {
        registro.error = r.error;
      }
      return r;
    },
  };
  return { adaptador, registro };
}

export async function ejecutarCaso(caso: CasoGolden, catalogo: ProductoCatalogo[], deps: DependenciasAgente): Promise<ResultadoCaso> {
  const { adaptador, registro } = medir(deps.adaptador);
  const r = await normalizarTexto({ texto: caso.texto, tipo: caso.tipo }, { ...deps, adaptador });

  const ejecucion: Ejecucion = r.ok
    ? {
        ok: true,
        filas: filasComparables(r.validas, catalogo),
        excluidas: r.excluidas.length,
        advertencias: r.advertencias,
        noInterpretable: r.noInterpretable,
      }
    : { ok: false, error: registro.error ? `${registro.error.tipo}: ${registro.error.detalle}` : r.mensaje };

  return {
    caso: caso.id,
    evaluacion: evaluarCaso(caso, ejecucion),
    ejecucion,
    salidaModelo: registro.salida,
    errorIA: registro.error,
    uso: registro.uso,
    versionPrompt: r.ok ? r.versionPrompt : null,
  };
}
