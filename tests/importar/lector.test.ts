import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  MENSAJE_ARCHIVO_GRANDE,
  MENSAJE_FORMATO_NO_SOPORTADO,
  TAMANO_MAXIMO_BYTES,
  detectarSeparador,
  leerArchivo,
  parsearCsv,
} from '@/lib/importar/lector';

const bytes = (texto: string) => new TextEncoder().encode(texto);

describe('parsearCsv', () => {
  it('detecta ; como separador y conserva "1.250" como texto (no lo convierte en 1,25)', () => {
    expect(parsearCsv('Fecha;Producto;Cantidad\n07-03-2026;Hallulla;1.250\n')).toEqual([
      ['Fecha', 'Producto', 'Cantidad'],
      ['07-03-2026', 'Hallulla', '1.250'],
    ]);
  });

  it('respeta comillas, comillas escapadas, comas decimales entre comillas y fin de línea Windows', () => {
    const csv = 'Fecha,Producto,Cantidad\r\n03-03-2026,"Pan ""especial"", grande","12,5"\r\n';
    expect(parsearCsv(csv)).toEqual([
      ['Fecha', 'Producto', 'Cantidad'],
      ['03-03-2026', 'Pan "especial", grande', '12,5'],
    ]);
  });

  it('elige el separador más frecuente fuera de comillas', () => {
    expect(detectarSeparador('Fecha\tProducto\tCantidad')).toBe('\t');
    expect(detectarSeparador('"a;b",c,d')).toBe(',');
  });

  it('omite líneas vacías y quita el BOM', () => {
    expect(parsearCsv('﻿Fecha;Producto\n\n03-03-2026;Pan\n')).toEqual([
      ['Fecha', 'Producto'],
      ['03-03-2026', 'Pan'],
    ]);
  });
});

describe('leerArchivo', () => {
  it('CSV → hoja', async () => {
    const r = await leerArchivo('ventas.CSV', bytes('Fecha;Producto;Cantidad\n03-03-2026;Marraqueta;45'));
    expect(r).toEqual({
      ok: true,
      contenido: { tipo: 'hoja', filas: [['Fecha', 'Producto', 'Cantidad'], ['03-03-2026', 'Marraqueta', '45']] },
    });
  });

  it('Excel → hoja, con las fechas como número de serie', async () => {
    const hoja = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'Producto', 'Cantidad'],
      [46084, 'Marraqueta', 45],
      ['04-03-2026', 'Hallulla', '1.250'],
    ]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Ventas');
    const archivo = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const r = await leerArchivo('ventas.xlsx', new Uint8Array(archivo));
    expect(r).toEqual({
      ok: true,
      contenido: {
        tipo: 'hoja',
        filas: [
          ['Fecha', 'Producto', 'Cantidad'],
          [46084, 'Marraqueta', 45],
          ['04-03-2026', 'Hallulla', '1.250'],
        ],
      },
    });
  });

  it('TXT → texto para el Normalizador', async () => {
    const r = await leerArchivo('whatsapp.txt', bytes('03-03-2026 Marraqueta 45'));
    expect(r).toEqual({ ok: true, contenido: { tipo: 'texto', texto: '03-03-2026 Marraqueta 45' } });
  });

  it('TXT en Windows-1252 (tildes de Excel en español) se decodifica bien', async () => {
    const r = await leerArchivo('ventas.txt', new Uint8Array([0x41, 0x7a, 0xfa, 0x63, 0x61, 0x72])); // "Azúcar"
    expect(r).toEqual({ ok: true, contenido: { tipo: 'texto', texto: 'Azúcar' } });
  });

  it('un formato no soportado se rechaza con un mensaje claro', async () => {
    expect(await leerArchivo('foto.png', bytes('x'))).toEqual({ ok: false, mensaje: MENSAJE_FORMATO_NO_SOPORTADO });
  });

  it('un archivo de más de 5 MB se rechaza', async () => {
    expect(await leerArchivo('grande.csv', new Uint8Array(TAMANO_MAXIMO_BYTES + 1))).toEqual({
      ok: false,
      mensaje: MENSAJE_ARCHIVO_GRANDE,
    });
  });

  it('un PDF dañado no rompe la importación: devuelve un mensaje', async () => {
    const r = await leerArchivo('factura.pdf', bytes('esto no es un pdf'));
    expect(r.ok).toBe(false);
  });
});
