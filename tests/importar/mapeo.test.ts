import { describe, expect, it } from 'vitest';
import {
  cruzarNombres,
  detectarColumnas,
  filasDesdeHoja,
  normalizarNombre,
  sonParecidos,
  validarFilas,
  type FilaCruda,
  type ProductoCatalogo,
} from '@/lib/importar/mapeo';

const CATALOGO: ProductoCatalogo[] = [
  { id: 'id-marraqueta', nombre: 'Marraqueta' },
  { id: 'id-hallulla', nombre: 'Hallulla' },
  { id: 'id-pan-amasado', nombre: 'Pan amasado' },
  { id: 'id-leche', nombre: 'Leche entera 1L' },
];

function fila(numero: number, fecha: string, producto: string, cantidad: string, costo: string | null = null): FilaCruda {
  return { numero, fechaOriginal: fecha, producto, cantidadOriginal: cantidad, costoOriginal: costo };
}

describe('normalizarNombre (6.4)', () => {
  it('minúsculas, sin tildes, espacios recortados y colapsados', () => {
    expect(normalizarNombre('  Pan   Amasado ')).toBe('pan amasado');
    expect(normalizarNombre('AZÚCAR  1kg')).toBe('azucar 1kg');
    expect(normalizarNombre('Leche entera 1L')).toBe('leche entera 1l');
  });
});

describe('detectarColumnas (6.4, sin IA)', () => {
  it('reconoce los sinónimos básicos', () => {
    expect(detectarColumnas(['Fecha', 'Producto', 'Cantidad'], 'venta')).toEqual({
      ok: true,
      columnas: { fecha: 0, producto: 1, cantidad: 2, costo: null },
    });
  });

  it('acepta día/artículo/cant y descripción/kg, en cualquier orden', () => {
    expect(detectarColumnas(['Artículo', 'Cant', 'Día'], 'venta')).toEqual({
      ok: true,
      columnas: { fecha: 2, producto: 0, cantidad: 1, costo: null },
    });
    expect(detectarColumnas(['Fecha venta', 'Descripción', 'Kg'], 'venta')).toMatchObject({
      ok: true,
      columnas: { fecha: 0, producto: 1, cantidad: 2 },
    });
  });

  it('en compras detecta costo o precio unitario', () => {
    expect(detectarColumnas(['Fecha', 'Item', 'Unidades', 'Precio unitario'], 'compra')).toEqual({
      ok: true,
      columnas: { fecha: 0, producto: 1, cantidad: 2, costo: 3 },
    });
    expect(detectarColumnas(['Fecha', 'Producto', 'Cantidad', 'Costo'], 'compra')).toMatchObject({
      ok: true,
      columnas: { costo: 3 },
    });
  });

  it('si falta una columna explica cuál, en lenguaje simple', () => {
    expect(detectarColumnas(['Producto', 'Monto'], 'venta')).toEqual({
      ok: false,
      mensaje:
        'No encontramos las columnas Fecha, Cantidad. Revise que la primera fila del archivo tenga encabezados como Fecha, Producto y Cantidad.',
    });
  });

  it('filasDesdeHoja numera desde la fila 2 y omite filas vacías', () => {
    const filas = filasDesdeHoja(
      [
        ['03-03-2026', 'Marraqueta', '45'],
        [null, null, null],
        ['04-03-2026', 'Hallulla', 30],
      ],
      { fecha: 0, producto: 1, cantidad: 2, costo: null },
    );
    expect(filas.map((f) => f.numero)).toEqual([2, 4]);
    expect(filas[1]!.cantidadOriginal).toBe(30);
  });
});

describe('validarFilas (6.3 + 6.4)', () => {
  it('texto de verificación de 6.5: 3 filas válidas y 2 excluidas con su advertencia', () => {
    const r = validarFilas(
      [
        fila(1, '03-03-2026', 'Marraqueta', '45'),
        fila(2, '4/3/26', 'marraqueta', '50'),
        fila(3, '05-03', 'Hallulla', '30'),
        fila(4, '06-03-2026', 'Leche entera 1L', 'doce'),
        fila(5, '07.03.2026', 'Hallulla', '1.250'),
      ],
      'venta',
    );
    expect(r.validas.map((v) => [v.fecha, v.producto, v.cantidad])).toEqual([
      ['2026-03-03', 'Marraqueta', 45],
      ['2026-03-04', 'marraqueta', 50],
      ['2026-03-07', 'Hallulla', 1250],
    ]);
    expect(r.excluidas.map((e) => e.motivo)).toEqual([
      'Fila 3: no se pudo leer la fecha «05-03»',
      'Fila 4: la cantidad «doce» no es un número',
    ]);
    // Las dos primeras se cruzan con el mismo producto.
    const cruce = cruzarNombres(r.validas, CATALOGO);
    expect(cruce.listas.slice(0, 2).map((f) => f.productoId)).toEqual(['id-marraqueta', 'id-marraqueta']);
    expect(cruce.productosNuevos).toEqual([]);
  });

  it('en compras, un costo ilegible deja el costo en null con advertencia y la fila NO se excluye', () => {
    const r = validarFilas([fila(2, '20-03-2026', 'Leche entera 1L', '48', 'gratis')], 'compra');
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0]!.costoUnitario).toBeNull();
    expect(r.excluidas).toEqual([]);
    expect(r.advertencias).toEqual(['Fila 2: no se pudo leer el costo «gratis»']);
  });

  it('en compras convierte "$890" y "$1.250 c/u"', () => {
    const r = validarFilas(
      [fila(2, '20-03-2026', 'Leche entera 1L', '48', '$890'), fila(3, '20-03-2026', 'Yogur natural', '24', '$1.250 c/u')],
      'compra',
    );
    expect(r.validas.map((v) => v.costoUnitario)).toEqual([890, 1250]);
  });

  it('una fila sin nombre de producto se excluye con su motivo', () => {
    const r = validarFilas([fila(7, '03-03-2026', '   ', '5')], 'venta');
    expect(r.excluidas).toEqual([{ numero: 7, motivo: 'Fila 7: falta el nombre del producto' }]);
  });
});

describe('cruzarNombres (6.4)', () => {
  const validas = (nombres: string[]) =>
    validarFilas(nombres.map((n, i) => fila(i + 1, '03-03-2026', n, '5')), 'venta').validas;

  it('con el valor por defecto, un producto nuevo queda listo para guardarse ("Se crearán")', () => {
    const r = cruzarNombres(validas(['Queque de naranja']), CATALOGO);
    expect(r.listas).toHaveLength(1);
    expect(r.listas[0]!.productoId).toBeNull();
    expect(r.conProblema).toEqual([]);
    expect(r.productosNuevos).toEqual([{ nombre: 'Queque de naranja', nombreNormalizado: 'queque de naranja', filas: 1 }]);
  });

  it('con "No crearlos", esa fila queda con el problema', () => {
    const r = cruzarNombres(validas(['Queque de naranja']), CATALOGO, { crearProductosNuevos: false });
    expect(r.listas).toEqual([]);
    expect(r.productosNuevos).toEqual([]);
    expect(r.conProblema).toEqual([{ numero: 1, motivo: 'El producto «Queque de naranja» no existe en su lista' }]);
    expect(r.productosNoEncontrados.map((p) => p.nombre)).toEqual(['Queque de naranja']);
  });

  it('"Pan Amasado " y "pan amasado" se cruzan con el mismo producto', () => {
    const r = cruzarNombres(validas(['Pan Amasado ', 'pan amasado']), CATALOGO);
    expect(r.listas.map((f) => f.productoId)).toEqual(['id-pan-amasado', 'id-pan-amasado']);
    expect(r.productosNuevos).toEqual([]);
  });

  it('"Marraqueta" y "Maraqueta" generan el aviso de parecido', () => {
    const r = cruzarNombres(validas(['Maraqueta']), CATALOGO);
    expect(r.avisosParecidos).toHaveLength(1);
    expect(r.avisosParecidos[0]!.mensaje).toBe('¿Es el mismo producto que «Marraqueta»?');
    expect(r.avisosParecidos[0]!.parecidoA.id).toBe('id-marraqueta');
    // Mientras no se asocie, sigue siendo un producto nuevo que se crearía.
    expect(r.productosNuevos.map((p) => p.nombre)).toEqual(['Maraqueta']);
  });

  it('al asociar "Maraqueta" con Marraqueta, la fila usa el producto existente y no se crea otro', () => {
    const r = cruzarNombres(validas(['Maraqueta']), CATALOGO, { asociaciones: { maraqueta: 'id-marraqueta' } });
    expect(r.listas[0]!.productoId).toBe('id-marraqueta');
    expect(r.productosNuevos).toEqual([]);
    expect(r.avisosParecidos).toEqual([]);
  });

  it('una asociación a un id que no está en el catálogo se ignora', () => {
    const r = cruzarNombres(validas(['Maraqueta']), CATALOGO, { asociaciones: { maraqueta: 'id-de-otro-negocio' } });
    expect(r.listas[0]!.productoId).toBeNull();
  });

  it('varias filas del mismo producto nuevo cuentan como un solo producto', () => {
    const r = cruzarNombres(validas(['Berlín', 'berlin', ' BERLÍN ']), CATALOGO);
    expect(r.productosNuevos).toEqual([{ nombre: 'Berlín', nombreNormalizado: 'berlin', filas: 3 }]);
    expect(r.listas).toHaveLength(3);
  });

  it('sonParecidos: Levenshtein ≤ 2 o uno contiene al otro', () => {
    expect(sonParecidos('maraqueta', 'marraqueta')).toBe(true);
    expect(sonParecidos('leche', 'leche entera 1l')).toBe(true);
    expect(sonParecidos('hallulla', 'marraqueta')).toBe(false);
    expect(sonParecidos('hallulla', 'hallulla')).toBe(false);
  });
});
