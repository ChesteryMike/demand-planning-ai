import { describe, expect, it } from 'vitest';
import { diaSemana, diasEntre, hoyEnChile, rangoFechas, sumarDias } from '@/lib/fechas';
import { formatoCantidad, formatoFecha, formatoNumero, formatoPesos, nombreUnidad, textoDias, textoUnidades } from '@/lib/formato';

describe('fechas (5.3)', () => {
  it('hoyEnChile: a las 02:00 UTC del 31-03 en Chile todavía es 30-03 (verano, UTC−3)', () => {
    expect(hoyEnChile(new Date('2026-03-31T02:00:00Z'))).toBe('2026-03-30');
  });

  it('hoyEnChile: a las 03:30 UTC del 01-07 en Chile todavía es 30-06 (invierno, UTC−4)', () => {
    expect(hoyEnChile(new Date('2026-07-01T03:30:00Z'))).toBe('2026-06-30');
  });

  it('diaSemana desde el texto: 2026-03-30 es lunes (1) y 2026-04-04 es sábado (6)', () => {
    expect(diaSemana('2026-03-30')).toBe(1);
    expect(diaSemana('2026-04-04')).toBe(6);
    expect(diaSemana('2026-03-29')).toBe(0);
  });

  it('sumarDias cruza meses y años; diasEntre y rangoFechas son inclusivos', () => {
    expect(sumarDias('2026-03-30', -28)).toBe('2026-03-02');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(diasEntre('2026-03-23', '2026-03-29')).toBe(6);
    expect(rangoFechas('2026-03-23', '2026-03-29')).toHaveLength(7);
    expect(rangoFechas('2026-03-29', '2026-03-23')).toEqual([]);
  });

  it('rechaza fechas inexistentes o con otro formato', () => {
    expect(() => diaSemana('2026-02-31')).toThrow();
    expect(() => diaSemana('30-03-2026')).toThrow();
  });
});

describe('formato (6.11)', () => {
  it('124500 → "$124.500"', () => {
    expect(formatoPesos(124500)).toBe('$124.500');
  });

  it('2.5 → "2,5"', () => {
    expect(formatoNumero(2.5, 1)).toBe('2,5');
    expect(formatoCantidad(2.5)).toBe('2,5');
  });

  it('otros montos y cantidades chilenas', () => {
    expect(formatoPesos(0)).toBe('$0');
    expect(formatoPesos(-1500)).toBe('-$1.500');
    expect(formatoPesos(890.6)).toBe('$891');
    expect(formatoNumero(1250.5, 1)).toBe('1.250,5');
    expect(formatoNumero(3, 1)).toBe('3,0');
    expect(formatoCantidad(1250)).toBe('1.250');
    expect(formatoCantidad(12.125)).toBe('12,125');
    expect(formatoCantidad(1234567.5)).toBe('1.234.567,5');
  });

  it('unidades escritas para leerse en una frase: "un" → "unidades", singular y plural', () => {
    expect(nombreUnidad('un')).toBe('unidades');
    expect(nombreUnidad('UN', false)).toBe('unidad');
    expect(nombreUnidad('lt')).toBe('litros');
    expect(nombreUnidad('kg')).toBe('kg');
    expect(nombreUnidad('docena')).toBe('docena'); // desconocida: se deja igual
    expect(textoUnidades(76, 'un')).toBe('76 unidades');
    expect(textoUnidades(1, 'un')).toBe('1 unidad');
    expect(textoUnidades(12.5, 'kg')).toBe('12,5 kg');
  });

  it('fechas DD-MM-AAAA y días en singular o plural', () => {
    expect(formatoFecha('2026-04-01')).toBe('01-04-2026');
    expect(textoDias(1)).toBe('1 día');
    expect(textoDias(0)).toBe('0 días');
    expect(textoDias(3)).toBe('3 días');
  });
});
