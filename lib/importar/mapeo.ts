/**
 * Mapeo de filas importadas (PROMPT_MAESTRO 6.4). Funciones puras.
 *
 * 1. detectarColumnas: Excel/CSV por sinónimos de encabezado (SIN IA).
 * 2. validarFilas: convierte fechas/cantidades/costos con parseo.ts y separa
 *    filas válidas de excluidas (cada exclusión con su motivo).
 * 3. cruzarNombres: asocia cada fila a un producto del catálogo o marca un
 *    producto nuevo. Por defecto los productos nuevos SE CREAN (regla 4).
 */
import { distance } from 'fastest-levenshtein';
import type { FechaISO } from '../fechas';
import {
  advertenciaCantidad,
  advertenciaCosto,
  advertenciaFecha,
  parsearCantidad,
  parsearCosto,
  parsearFecha,
  type ValorCelda,
} from './parseo';

export type TipoImportacion = 'venta' | 'compra';

/** minúsculas, sin tildes, espacios recortados y colapsados (igual que normalizar_nombre() en SQL). */
export function normalizarNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Nombre para mostrar y guardar: espacios recortados y colapsados, sin cambiar mayúsculas. */
export function limpiarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------
// 1. Detección de columnas
// ---------------------------------------------------------------------

const SINONIMOS = {
  fecha: ['fecha', 'dia'],
  producto: ['producto', 'articulo', 'descripcion', 'item'],
  cantidad: ['cantidad', 'cant', 'unidades', 'kg'],
  costo: ['costo', 'precio unitario'],
} as const;

export interface Columnas {
  fecha: number;
  producto: number;
  cantidad: number;
  /** Solo en compras; nula si el archivo no trae costo. */
  costo: number | null;
}

export type ResultadoColumnas = { ok: true; columnas: Columnas } | { ok: false; mensaje: string };

/** ¿El encabezado contiene el sinónimo como palabra(s) completa(s)? "Fecha venta" → fecha. */
function calza(encabezado: string, sinonimo: string): boolean {
  const palabras = ` ${normalizarNombre(encabezado).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  return palabras.includes(` ${sinonimo} `);
}

export function detectarColumnas(encabezados: ValorCelda[], tipo: TipoImportacion): ResultadoColumnas {
  const textos = encabezados.map((e) => (e === null || e === undefined ? '' : String(e)));
  const usadas = new Set<number>();
  const buscar = (sinonimos: readonly string[]): number | null => {
    for (const sinonimo of sinonimos) {
      const indice = textos.findIndex((t, i) => !usadas.has(i) && calza(t, sinonimo));
      if (indice >= 0) {
        usadas.add(indice);
        return indice;
      }
    }
    return null;
  };

  const fecha = buscar(SINONIMOS.fecha);
  const producto = buscar(SINONIMOS.producto);
  const cantidad = buscar(SINONIMOS.cantidad);
  const costo = tipo === 'compra' ? buscar(SINONIMOS.costo) : null;

  const faltan = [
    fecha === null ? 'Fecha' : null,
    producto === null ? 'Producto' : null,
    cantidad === null ? 'Cantidad' : null,
  ].filter((f): f is string => f !== null);

  if (fecha === null || producto === null || cantidad === null) {
    return {
      ok: false,
      mensaje: `No encontramos ${faltan.length === 1 ? 'la columna' : 'las columnas'} ${faltan.join(', ')}. Revise que la primera fila del archivo tenga encabezados como Fecha, Producto y Cantidad.`,
    };
  }
  return { ok: true, columnas: { fecha, producto, cantidad, costo } };
}

/** Convierte las filas de una hoja (sin el encabezado) en filas crudas. La fila 1 es el encabezado. */
export function filasDesdeHoja(filas: ValorCelda[][], columnas: Columnas): FilaCruda[] {
  return filas
    .map((fila, i) => ({
      numero: i + 2,
      fechaOriginal: fila[columnas.fecha] ?? null,
      producto: fila[columnas.producto] === null || fila[columnas.producto] === undefined ? '' : String(fila[columnas.producto]),
      cantidadOriginal: fila[columnas.cantidad] ?? null,
      costoOriginal: columnas.costo === null ? null : (fila[columnas.costo] ?? null),
    }))
    // Las filas totalmente vacías del final de una planilla no son errores.
    .filter((f) => !(f.producto.trim() === '' && vacio(f.fechaOriginal) && vacio(f.cantidadOriginal)));
}

function vacio(valor: ValorCelda): boolean {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

// ---------------------------------------------------------------------
// 2. Validación de filas
// ---------------------------------------------------------------------

/** Fila tal como viene de la hoja o del Normalizador (valores sin convertir). */
export interface FilaCruda {
  /** Número para los mensajes ("Fila 3: …"). */
  numero: number;
  fechaOriginal: ValorCelda;
  producto: string;
  cantidadOriginal: ValorCelda;
  costoOriginal: ValorCelda;
}

export interface FilaValida {
  numero: number;
  fecha: FechaISO;
  /** Nombre limpio, tal como lo escribió el usuario. */
  producto: string;
  nombreNormalizado: string;
  cantidad: number;
  costoUnitario: number | null;
}

export interface FilaExcluida {
  numero: number;
  motivo: string;
}

export interface ResultadoValidacion {
  validas: FilaValida[];
  excluidas: FilaExcluida[];
  /** Avisos que no excluyen la fila (p. ej. un costo ilegible). */
  advertencias: string[];
}

export function validarFilas(filas: FilaCruda[], tipo: TipoImportacion): ResultadoValidacion {
  const resultado: ResultadoValidacion = { validas: [], excluidas: [], advertencias: [] };

  for (const fila of filas) {
    const nombre = limpiarNombre(fila.producto);
    if (nombre === '') {
      resultado.excluidas.push({ numero: fila.numero, motivo: `Fila ${fila.numero}: falta el nombre del producto` });
      continue;
    }
    const fecha = parsearFecha(fila.fechaOriginal);
    if (fecha === null) {
      resultado.excluidas.push({ numero: fila.numero, motivo: advertenciaFecha(fila.numero, fila.fechaOriginal) });
      continue;
    }
    const cantidad = parsearCantidad(fila.cantidadOriginal);
    if (!cantidad.ok) {
      resultado.excluidas.push({
        numero: fila.numero,
        motivo: advertenciaCantidad(fila.numero, fila.cantidadOriginal, cantidad.motivo),
      });
      continue;
    }
    let costoUnitario: number | null = null;
    if (tipo === 'compra') {
      const costo = parsearCosto(fila.costoOriginal);
      if (costo.ok) costoUnitario = costo.valor;
      else resultado.advertencias.push(advertenciaCosto(fila.numero, fila.costoOriginal));
    }
    resultado.validas.push({
      numero: fila.numero,
      fecha,
      producto: nombre,
      nombreNormalizado: normalizarNombre(nombre),
      cantidad: cantidad.valor,
      costoUnitario,
    });
  }
  return resultado;
}

// ---------------------------------------------------------------------
// 3. Cruce de nombres con el catálogo
// ---------------------------------------------------------------------

export interface ProductoCatalogo {
  id: string;
  nombre: string;
}

export interface FilaLista extends FilaValida {
  /** Producto existente; nulo si la fila es de un producto nuevo. */
  productoId: string | null;
}

export interface ProductoNuevo {
  nombre: string;
  nombreNormalizado: string;
  filas: number;
}

export interface AvisoParecido {
  /** Nombre normalizado del producto nuevo. */
  nombreNormalizado: string;
  nombre: string;
  parecidoA: ProductoCatalogo;
  mensaje: string;
}

export interface OpcionesCruce {
  /** true (por defecto): los productos nuevos se crean. false: "No crearlos". */
  crearProductosNuevos?: boolean;
  /** Asociaciones elegidas por el usuario: nombre normalizado nuevo → id de producto existente. */
  asociaciones?: Record<string, string>;
}

export interface ResultadoCruce {
  /** Filas listas para guardarse. */
  listas: FilaLista[];
  /** Filas que no se guardarán, con su problema (solo con "No crearlos"). */
  conProblema: FilaExcluida[];
  /** Productos que se crearán ("Se crearán"); vacío con "No crearlos". */
  productosNuevos: ProductoNuevo[];
  /** Productos que no existen en la lista (se crearían si se activa la opción). */
  productosNoEncontrados: ProductoNuevo[];
  avisosParecidos: AvisoParecido[];
}

export const MAX_DISTANCIA_PARECIDO = 2;

/** ¿Son nombres parecidos? Levenshtein ≤ 2 o uno contiene al otro (ya normalizados y distintos). */
export function sonParecidos(a: string, b: string): boolean {
  if (a === b || a === '' || b === '') return false;
  return distance(a, b) <= MAX_DISTANCIA_PARECIDO || a.includes(b) || b.includes(a);
}

export function mensajeParecido(nombreExistente: string): string {
  return `¿Es el mismo producto que «${nombreExistente}»?`;
}

export function mensajeNoExiste(nombre: string): string {
  return `El producto «${nombre}» no existe en su lista`;
}

export function cruzarNombres(
  filas: FilaValida[],
  catalogo: ProductoCatalogo[],
  opciones: OpcionesCruce = {},
): ResultadoCruce {
  const crear = opciones.crearProductosNuevos ?? true;
  const asociaciones = opciones.asociaciones ?? {};
  const catalogoIds = new Set(catalogo.map((p) => p.id));
  const porNombre = new Map(catalogo.map((p) => [normalizarNombre(p.nombre), p]));

  const resultado: ResultadoCruce = {
    listas: [],
    conProblema: [],
    productosNuevos: [],
    productosNoEncontrados: [],
    avisosParecidos: [],
  };
  const nuevos = new Map<string, ProductoNuevo>();

  for (const fila of filas) {
    const existente = porNombre.get(fila.nombreNormalizado);
    const asociado = asociaciones[fila.nombreNormalizado];
    const productoId = existente?.id ?? (asociado && catalogoIds.has(asociado) ? asociado : null);

    if (productoId !== null) {
      resultado.listas.push({ ...fila, productoId });
      continue;
    }

    const nuevo = nuevos.get(fila.nombreNormalizado);
    if (nuevo) nuevo.filas += 1;
    else nuevos.set(fila.nombreNormalizado, { nombre: fila.producto, nombreNormalizado: fila.nombreNormalizado, filas: 1 });

    if (crear) resultado.listas.push({ ...fila, productoId: null });
    else resultado.conProblema.push({ numero: fila.numero, motivo: mensajeNoExiste(fila.producto) });
  }

  for (const nuevo of nuevos.values()) {
    (crear ? resultado.productosNuevos : resultado.productosNoEncontrados).push(nuevo);
    for (const producto of catalogo) {
      if (sonParecidos(nuevo.nombreNormalizado, normalizarNombre(producto.nombre))) {
        resultado.avisosParecidos.push({
          nombreNormalizado: nuevo.nombreNormalizado,
          nombre: nuevo.nombre,
          parecidoA: producto,
          mensaje: mensajeParecido(producto.nombre),
        });
      }
    }
  }
  return resultado;
}
