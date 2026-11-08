import { describe, expect, it } from 'vitest';
import { diaSemana, rangoFechas } from '@/lib/fechas';
import { explicarPronostico, totales } from '@/lib/pronostico/explicacion';
import { calcularLineaBase } from '@/lib/pronostico/linea-base';

const HOY = '2026-03-30';
const JERGA = /σ|sigma|desviaci|regresi|estad[íi]stic/i;

describe('Explicación del pronóstico (6.11)', () => {
  it('caso de control de 6.2: total 200, sábados +110 %, sin jerga estadística', () => {
    const ventas = rangoFechas('2026-03-02', '2026-03-29').map((fecha) => {
      const d = diaSemana(fecha);
      return { fecha, cantidad: d === 6 ? 30 : d === 0 ? 20 : 10 };
    });
    const lb = calcularLineaBase(ventas, HOY);
    expect(Math.round(totales(lb.pronostico).esperado)).toBe(200);
    const frases = explicarPronostico(lb, lb.pronostico, 'un');
    expect(frases[0]).toBe('En los próximos 14 días esperamos que venda cerca de 200 un.');
    expect(frases).toContain('Los sábados suele vender más: cerca de un 110 % sobre un día normal.');
    expect(frases).toContain('Los lunes suele vender menos: cerca de un 30 % bajo un día normal.');
    expect(frases.join(' ')).not.toMatch(JERGA);
  });

  it('con variación muestra el rango y la tendencia, sin jerga', () => {
    const ventas = rangoFechas('2026-03-02', '2026-03-29').map((fecha, i) => ({ fecha, cantidad: (i < 14 ? 10 : 12) + (i % 3) }));
    const lb = calcularLineaBase(ventas, HOY);
    const texto = explicarPronostico(lb, lb.pronostico, 'kg').join(' ');
    expect(texto).toMatch(/\(entre \d+ y \d+\)/);
    expect(texto).toContain('por eso el pronóstico sube');
    expect(texto).not.toMatch(JERGA);
  });

  it('sin ventas no inventa cifras', () => {
    const lb = calcularLineaBase([], HOY);
    expect(explicarPronostico(lb, lb.pronostico, 'un')).toEqual([
      'No hay ventas en los últimos 28 días, así que todavía no podemos estimar cuánto venderá.',
    ]);
  });

  it('con poco historial agrega la advertencia', () => {
    const lb = calcularLineaBase(rangoFechas('2026-03-25', '2026-03-29').map((fecha) => ({ fecha, cantidad: 5 })), HOY);
    expect(explicarPronostico(lb, lb.pronostico, 'un')).toContain('Hay poco historial; el pronóstico es aproximado.');
  });
});
