/**
 * Explicación del pronóstico en lenguaje de comerciante (6.11). Función pura.
 * Sin jerga estadística: nada de "σ", "desviación" ni "regresión".
 */
import { formatoCantidad } from '../formato';
import type { EscenarioDia, LineaBase } from './linea-base';

const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
/** Un día se menciona si vende al menos 15 % más (o menos) que un día promedio. */
const DIFERENCIA_NOTABLE = 0.15;
const TENDENCIA_NOTABLE = 0.05;

const entero = (n: number) => formatoCantidad(Math.round(n));

export function totales(pronostico: EscenarioDia[]) {
  return pronostico.reduce(
    (t, d) => ({ bajo: t.bajo + d.bajo, esperado: t.esperado + d.esperado, alto: t.alto + d.alto }),
    { bajo: 0, esperado: 0, alto: 0 },
  );
}

export function explicarPronostico(lineaBase: LineaBase, pronostico: EscenarioDia[], unidad: string): string[] {
  if (lineaBase.base === 0) {
    return ['No hay ventas en los últimos 28 días, así que todavía no podemos estimar cuánto venderá.'];
  }

  const frases: string[] = [];
  const t = totales(pronostico);
  const rango = Math.round(t.bajo) === Math.round(t.alto) ? '' : ` (entre ${entero(t.bajo)} y ${entero(t.alto)})`;
  frases.push(`En los próximos 14 días esperamos que venda cerca de ${entero(t.esperado)} ${unidad}${rango}.`);

  if (!lineaBase.historialCorto) {
    const maximo = Math.max(...lineaBase.factores);
    const minimo = Math.min(...lineaBase.factores);
    if (maximo >= 1 + DIFERENCIA_NOTABLE) {
      const dia = DIAS[lineaBase.factores.indexOf(maximo)];
      frases.push(`Los ${dia} suele vender más: cerca de un ${Math.round((maximo - 1) * 100)} % sobre un día normal.`);
    }
    if (minimo <= 1 - DIFERENCIA_NOTABLE) {
      const dia = DIAS[lineaBase.factores.indexOf(minimo)];
      frases.push(`Los ${dia} suele vender menos: cerca de un ${Math.round((1 - minimo) * 100)} % bajo un día normal.`);
    }
    if (lineaBase.tendencia >= TENDENCIA_NOTABLE) {
      frases.push(`En las últimas dos semanas vendió más que en las dos anteriores, por eso el pronóstico sube un ${Math.round(lineaBase.tendencia * 100)} %.`);
    } else if (lineaBase.tendencia <= -TENDENCIA_NOTABLE) {
      frases.push(`En las últimas dos semanas vendió menos que en las dos anteriores, por eso el pronóstico baja un ${Math.round(-lineaBase.tendencia * 100)} %.`);
    }
  }

  if (Math.round(t.bajo) !== Math.round(t.alto)) {
    frases.push('El rango muestra cuánto podría variar la venta según cómo han cambiado sus ventas día a día.');
  }
  if (lineaBase.advertencia) frases.push(lineaBase.advertencia);
  return frases;
}
