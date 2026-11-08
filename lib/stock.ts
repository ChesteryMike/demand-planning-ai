/**
 * Stock actual derivado de movimientos (PROMPT_MAESTRO 5.2). Función pura.
 *
 *   stockActual = stock_inicial
 *               + Σ compras con fecha ≥ fecha_stock_inicial
 *               − Σ ventas  con fecha ≥ fecha_stock_inicial
 *               + Σ ajustes con fecha ≥ fecha_stock_inicial
 *
 * El stock nunca se guarda: borrar una compra o una importación lo recalcula.
 * Las ventas anteriores a fecha_stock_inicial son historial y no descuentan.
 */
import type { FechaISO } from './fechas';

export const AVISO_STOCK_NEGATIVO =
  'El stock calculado es negativo; registre un conteo de inventario';

/** Un movimiento de un producto: venta, compra o ajuste (este último puede ser negativo). */
export interface Movimiento {
  productoId: string;
  fecha: FechaISO;
  cantidad: number;
}

export interface ProductoStock {
  id: string;
  stockInicial: number;
  fechaStockInicial: FechaISO;
}

export interface ResultadoStock {
  /** Stock tal como sale de la fórmula (puede ser negativo). */
  stockCalculado: number;
  /** Stock que usan los cálculos de planificación: nunca menor que 0. */
  stockParaPlanificar: number;
  negativo: boolean;
  aviso: string | null;
}

/** Redondea a 3 decimales (la precisión de numeric(12,3)) para evitar 0,1 + 0,2 = 0,30000000000000004. */
export function redondear3(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

function sumaDesde(movimientos: Movimiento[], productoId: string, desde: FechaISO): number {
  let suma = 0;
  for (const m of movimientos) {
    if (m.productoId === productoId && m.fecha >= desde) suma += m.cantidad;
  }
  return suma;
}

export function calcularStock(
  producto: ProductoStock,
  compras: Movimiento[],
  ventas: Movimiento[],
  ajustes: Movimiento[],
): ResultadoStock {
  const desde = producto.fechaStockInicial;
  const stockCalculado = redondear3(
    producto.stockInicial +
      sumaDesde(compras, producto.id, desde) -
      sumaDesde(ventas, producto.id, desde) +
      sumaDesde(ajustes, producto.id, desde),
  );
  const negativo = stockCalculado < 0;
  return {
    stockCalculado,
    stockParaPlanificar: negativo ? 0 : stockCalculado,
    negativo,
    aviso: negativo ? AVISO_STOCK_NEGATIVO : null,
  };
}
