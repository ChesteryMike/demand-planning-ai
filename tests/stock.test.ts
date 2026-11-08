import { describe, expect, it } from 'vitest';
import { sumarDias } from '@/lib/fechas';
import { planProducto, type ProductoPlan } from '@/lib/planificacion';
import { AVISO_STOCK_NEGATIVO, calcularStock, type Movimiento } from '@/lib/stock';

const producto = { id: 'p', stockInicial: 100, fechaStockInicial: '2026-03-01' };

describe('calcularStock (5.2)', () => {
  it('suma compras y ajustes y resta ventas desde fecha_stock_inicial: 100 + 50 − 30 − 5 + 2 = 117', () => {
    const compras: Movimiento[] = [{ productoId: 'p', fecha: '2026-03-05', cantidad: 50 }];
    const ventas: Movimiento[] = [{ productoId: 'p', fecha: '2026-03-10', cantidad: 30 }];
    const ajustes: Movimiento[] = [
      { productoId: 'p', fecha: '2026-03-12', cantidad: -5 },
      { productoId: 'p', fecha: '2026-03-13', cantidad: 2 },
    ];
    const r = calcularStock(producto, compras, ventas, ajustes);
    expect(r.stockCalculado).toBe(117);
    expect(r.negativo).toBe(false);
    expect(r.aviso).toBeNull();
  });

  it('las ventas anteriores a fecha_stock_inicial no descuentan (las del mismo día sí)', () => {
    const ventas: Movimiento[] = [
      { productoId: 'p', fecha: '2026-02-28', cantidad: 40 },
      { productoId: 'p', fecha: '2026-03-01', cantidad: 10 },
    ];
    expect(calcularStock(producto, [], ventas, []).stockCalculado).toBe(90);
  });

  it('una compra suma exactamente una vez y los movimientos de otros productos no afectan', () => {
    const compras: Movimiento[] = [
      { productoId: 'p', fecha: '2026-03-02', cantidad: 25 },
      { productoId: 'otro', fecha: '2026-03-02', cantidad: 999 },
    ];
    expect(calcularStock(producto, compras, [], []).stockCalculado).toBe(125);
  });

  it('evita errores de punto flotante con decimales (0,1 + 0,2)', () => {
    const p = { id: 'p', stockInicial: 0, fechaStockInicial: '2026-03-01' };
    const compras: Movimiento[] = [
      { productoId: 'p', fecha: '2026-03-02', cantidad: 0.1 },
      { productoId: 'p', fecha: '2026-03-03', cantidad: 0.2 },
    ];
    expect(calcularStock(p, compras, [], []).stockCalculado).toBe(0.3);
  });

  it('un stock negativo genera el aviso y se planifica con 0', () => {
    const r = calcularStock({ ...producto, stockInicial: 10 }, [], [{ productoId: 'p', fecha: '2026-03-02', cantidad: 15 }], []);
    expect(r.stockCalculado).toBe(-5);
    expect(r.negativo).toBe(true);
    expect(r.stockParaPlanificar).toBe(0);
    expect(r.aviso).toBe(AVISO_STOCK_NEGATIVO);
  });

  it('en el plan, un stock negativo (−60) se muestra con aviso y se planifica como 0', () => {
    const hoy = '2026-03-30';
    const p: ProductoPlan = {
      id: 'p',
      nombre: 'Producto',
      stockInicial: 500,
      fechaStockInicial: sumarDias(hoy, -28),
      perecible: false,
      diasVidaUtil: null,
      diasEntregaProveedor: 2,
      diasColchon: 1,
      costo: 0,
      datosIncompletos: false,
    };
    const ventas = Array.from({ length: 28 }, (_, i) => ({ productoId: 'p', fecha: sumarDias(hoy, -(i + 1)), cantidad: 20 }));
    const fila = planProducto(p, ventas, [], [], [], hoy);
    expect(fila.stockActual).toBe(-60);
    expect(fila.cobertura).toBe(0);
    expect(fila.nivel).toBe('quiebre');
    // round(140 × 1,05 + 60 − 0 − 0) = 207: se planifica con stock 0, no con −60.
    expect(fila.pedir).toBe(207);
    expect(fila.advertencias).toContain(AVISO_STOCK_NEGATIVO);
  });
});
