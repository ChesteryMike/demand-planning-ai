import { describe, expect, it } from 'vitest';
import { diaSemana, rangoFechas, sumarDias } from '@/lib/fechas';
import {
  ADVERTENCIA_HISTORIAL_CORTO,
  calcularLineaBase,
  calcularTendencia,
} from '@/lib/pronostico/linea-base';

const HOY = '2026-03-30'; // lunes

describe('Caso de control de línea base (6.2)', () => {
  // Ventana del 2026-03-02 (lunes) al 2026-03-29 (domingo).
  // Cada semana: lunes a viernes 10, sábado 30, domingo 20 (100 por semana).
  const ventas = rangoFechas('2026-03-02', '2026-03-29').map((fecha) => {
    const d = diaSemana(fecha);
    return { fecha, cantidad: d === 6 ? 30 : d === 0 ? 20 : 10 };
  });
  const lb = calcularLineaBase(ventas, HOY);

  it('la ventana va del lunes 2026-03-02 al domingo 2026-03-29 y suma 400', () => {
    expect(diaSemana(HOY)).toBe(1);
    expect(lb.historial[0]!.fecha).toBe('2026-03-02');
    expect(lb.historial.at(-1)!.fecha).toBe('2026-03-29');
    expect(lb.historial.reduce((a, v) => a + v.cantidad, 0)).toBe(400);
  });

  it('base ≈ 14,2857', () => {
    expect(lb.base).toBeCloseTo(14.2857, 4);
  });

  it('factor lunes = 0,7, sábado = 2,1 y domingo = 1,4', () => {
    expect(lb.factores[1]).toBeCloseTo(0.7, 10);
    expect(lb.factores[6]).toBeCloseTo(2.1, 10);
    expect(lb.factores[0]).toBeCloseTo(1.4, 10);
  });

  it('tendencia = 0 y σ = 0', () => {
    expect(lb.tendencia).toBe(0);
    expect(lb.sigma).toBe(0);
    expect(lb.fechasAtipicas).toEqual([]);
  });

  it('esperado(2026-03-30) = 10 y esperado(2026-04-04) = 30', () => {
    const porFecha = new Map(lb.pronostico.map((d) => [d.fecha, d]));
    expect(porFecha.get('2026-03-30')!.esperado).toBeCloseTo(10, 10);
    expect(porFecha.get('2026-04-04')!.esperado).toBeCloseTo(30, 10);
  });

  it('horizonte de 14 días (hoy a hoy + 13) que suma 200, con bajo = esperado = alto', () => {
    expect(lb.pronostico).toHaveLength(14);
    expect(lb.pronostico[0]!.fecha).toBe(HOY);
    expect(lb.pronostico.at(-1)!.fecha).toBe(sumarDias(HOY, 13));
    expect(lb.pronostico.reduce((a, d) => a + d.esperado, 0)).toBeCloseTo(200, 10);
    for (const d of lb.pronostico) {
      expect(d.bajo).toBe(d.esperado);
      expect(d.alto).toBe(d.esperado);
    }
    expect(lb.advertencia).toBeNull();
  });
});

describe('Tendencia (6.2)', () => {
  it('220 contra 200 → 0,10', () => {
    expect(calcularTendencia(220, 200)).toBeCloseTo(0.1, 10);
  });
  it('300 contra 200 → 0,20 (acotada)', () => {
    expect(calcularTendencia(300, 200)).toBe(0.2);
  });
  it('150 contra 0 → 0', () => {
    expect(calcularTendencia(150, 0)).toBe(0);
  });
  it('100 contra 200 → −0,20 (acotada por abajo)', () => {
    expect(calcularTendencia(100, 200)).toBe(-0.2);
  });
  it('se aplica como multiplicador constante (1 + tendencia), sin compuesto', () => {
    // 14 días a 10 y luego 14 días a 11 → tendencia 0,10; todos los días del horizonte iguales.
    const ventas = rangoFechas('2026-03-02', '2026-03-29').map((fecha, i) => ({ fecha, cantidad: i < 14 ? 10 : 11 }));
    const lb = calcularLineaBase(ventas, HOY);
    expect(lb.tendencia).toBeCloseTo(0.1, 10);
    const lunes = lb.pronostico.filter((d) => diaSemana(d.fecha) === 1);
    expect(lunes[0]!.esperado).toBeCloseTo(lunes[1]!.esperado, 10);
  });
});

describe('Historial corto (6.2, n < 28)', () => {
  it('7 días de historial: factores = 1, tendencia = 0 y advertencia', () => {
    const ventas = rangoFechas('2026-03-23', '2026-03-29').map((fecha) => ({
      fecha,
      cantidad: diaSemana(fecha) === 6 ? 40 : 5,
    }));
    const lb = calcularLineaBase(ventas, HOY);
    expect(lb.n).toBe(7);
    expect(lb.historialCorto).toBe(true);
    expect(lb.factores).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(lb.tendencia).toBe(0);
    expect(lb.advertencia).toBe(ADVERTENCIA_HISTORIAL_CORTO);
    expect(lb.base).toBeCloseTo(70 / 7, 10);
    // Sin factores, todos los días esperan la base.
    for (const d of lb.pronostico) expect(d.esperado).toBeCloseTo(10, 10);
  });

  it('sin ventas: base 0, pronóstico en 0 y advertencia', () => {
    const lb = calcularLineaBase([], HOY);
    expect(lb.base).toBe(0);
    expect(lb.advertencia).toBe(ADVERTENCIA_HISTORIAL_CORTO);
    expect(lb.pronostico.every((d) => d.bajo === 0 && d.esperado === 0 && d.alto === 0)).toBe(true);
  });
});

describe('Fechas atípicas para el Agente de Pronóstico (6.7)', () => {
  it('detecta el único día con |venta − base × factor| > 2σ', () => {
    const ventas = rangoFechas('2026-03-02', '2026-03-29').map((fecha) => ({
      fecha,
      cantidad: fecha === '2026-03-18' ? 100 : 10,
    }));
    const lb = calcularLineaBase(ventas, HOY);
    expect(lb.sigma).toBeGreaterThan(0);
    expect(lb.fechasAtipicas).toEqual(['2026-03-18']);
    for (const d of lb.pronostico) {
      expect(d.bajo).toBeGreaterThanOrEqual(0);
      expect(d.alto).toBeGreaterThan(d.esperado);
    }
  });
});
