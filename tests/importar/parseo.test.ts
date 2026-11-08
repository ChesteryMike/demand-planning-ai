import { describe, expect, it } from 'vitest';
import {
  advertenciaCosto,
  advertenciaFecha,
  parsearCantidad,
  parsearCosto,
  parsearFecha,
} from '@/lib/importar/parseo';

describe('parsearFecha (6.3): formato chileno, día primero', () => {
  it.each([
    ['DD-MM-AAAA', '03-03-2026', '2026-03-03'],
    ['DD/MM/AAAA', '03/03/2026', '2026-03-03'],
    ['DD.MM.AAAA', '07.03.2026', '2026-03-07'],
    ['D/M/AA', '4/3/26', '2026-03-04'],
    ['AAAA-MM-DD', '2026-03-05', '2026-03-05'],
    ['"3 de marzo de 2026"', '3 de marzo de 2026', '2026-03-03'],
    ['"03-mar-26"', '03-mar-26', '2026-03-03'],
    ['mes con mayúsculas y tilde', '15 de Septiembre de 2026', '2026-09-15'],
    ['serie de Excel como texto', '46084', '2026-03-03'],
  ])('%s: «%s» → %s', (_formato, entrada, esperado) => {
    expect(parsearFecha(entrada)).toBe(esperado);
  });

  it('número de serie de Excel 46084 → 2026-03-03', () => {
    expect(parsearFecha(46084)).toBe('2026-03-03');
    expect(parsearFecha(46084.75)).toBe('2026-03-03'); // con hora
  });

  it('nunca asume mes-día: 04/03/2026 es 4 de marzo, y 12/25/2026 no es una fecha', () => {
    expect(parsearFecha('04/03/2026')).toBe('2026-03-04');
    expect(parsearFecha('12/25/2026')).toBeNull();
  });

  it.each([
    ['sin año', '05-03'],
    ['fecha inexistente', '31-02-2026'],
    ['texto no reconocible', 'ayer'],
    ['mes inventado', '3 de marzuelo de 2026'],
    ['vacía', ''],
  ])('rechaza %s: «%s»', (_caso, entrada) => {
    expect(parsearFecha(entrada)).toBeNull();
  });

  it('la advertencia de fecha usa el texto exacto', () => {
    expect(advertenciaFecha(3, '05-03')).toBe('Fila 3: no se pudo leer la fecha «05-03»');
  });
});

describe('parsearCantidad (6.3): punto de miles, coma decimal', () => {
  it.each([
    ['1.250', 1250],
    ['1,5', 1.5],
    ['1.250,5', 1250.5],
    ['12', 12],
    ['12,5 kg', 12.5],
    ['48un', 48],
    ['10 unidades', 10],
    ['3 unid', 3],
    ['3 U', 3],
    ['500 g', 500],
    ['2 lt', 2],
    ['1,5L', 1.5],
    ['250cc', 250],
    ['1.000.000', 1_000_000],
  ])('«%s» → %s', (entrada, esperado) => {
    expect(parsearCantidad(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it('un número que viene de Excel se usa tal cual', () => {
    expect(parsearCantidad(7.5)).toEqual({ ok: true, valor: 7.5 });
  });

  it.each([
    ['texto en palabras', 'doce', 'no_numerica'],
    ['negativo', '-5', 'no_positiva'],
    ['cero', '0', 'no_positiva'],
    ['vacía', '', 'vacia'],
    ['punto decimal (no es formato chileno)', '1.5', 'no_numerica'],
  ])('rechaza %s: «%s»', (_caso, entrada, motivo) => {
    expect(parsearCantidad(entrada)).toEqual({ ok: false, motivo });
  });
});

describe('parsearCosto (6.3, solo compras)', () => {
  it.each([
    ['$890', 890],
    ['$1.250 c/u', 1250],
    ['1.250,50', 1250.5],
    ['450', 450],
    ['$ 2.100', 2100],
  ])('«%s» → %s', (entrada, esperado) => {
    expect(parsearCosto(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it('vacío o nulo → null, sin error', () => {
    expect(parsearCosto('')).toEqual({ ok: true, valor: null });
    expect(parsearCosto(null)).toEqual({ ok: true, valor: null });
    expect(parsearCosto(undefined)).toEqual({ ok: true, valor: null });
  });

  it('no numérico → no se pudo leer (la fila NO se excluye; ver mapeo)', () => {
    expect(parsearCosto('gratis')).toEqual({ ok: false });
    expect(advertenciaCosto(4, 'gratis')).toBe('Fila 4: no se pudo leer el costo «gratis»');
  });
});
