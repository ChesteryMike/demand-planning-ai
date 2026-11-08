import { describe, expect, it } from 'vitest';
import { sumarDias } from '@/lib/fechas';
import {
  construirPlan,
  planProducto,
  promedioDiario,
  type Movimiento,
  type NivelRiesgo,
  type PedidoPlan,
  type ProductoPlan,
} from '@/lib/planificacion';

const HOY = '2026-03-30';

/** Producto con los valores dados; el stock inicial se fija HOY, así las ventas previas son solo historial. */
function producto(id: string, datos: Partial<ProductoPlan> = {}): ProductoPlan {
  return {
    id,
    nombre: id,
    stockInicial: 0,
    fechaStockInicial: HOY,
    perecible: false,
    diasVidaUtil: null,
    diasEntregaProveedor: 2,
    diasColchon: 1,
    costo: 0,
    datosIncompletos: false,
    ...datos,
  };
}

/** `cantidad` unidades diarias en los `dias` días previos a `hoy`. */
function ventasDiarias(productoId: string, cantidad: number, dias = 28, hoy = HOY): Movimiento[] {
  return Array.from({ length: dias }, (_, i) => ({ productoId, fecha: sumarDias(hoy, -(i + 1)), cantidad }));
}

// ---------------------------------------------------------------------
describe('promedioDiario (6.1)', () => {
  it('hoy = 2026-03-30 y 20 unidades diarias en los 28 días previos → 20', () => {
    expect(promedioDiario(ventasDiarias('p', 20), 'p', HOY)).toBe(20);
  });

  it('primera venta el 2026-03-23 y 70 unidades en total → 10 (se divide por 7, no por 28)', () => {
    const ventas = ventasDiarias('p', 10, 7);
    expect(ventas.at(-1)?.fecha).toBe('2026-03-23');
    expect(promedioDiario(ventas, 'p', HOY)).toBe(10);
  });

  it('una venta el 2026-03-30 (hoy) no cuenta → 0', () => {
    const ventas: Movimiento[] = [{ productoId: 'p', fecha: HOY, cantidad: 50 }];
    expect(promedioDiario(ventas, 'p', HOY)).toBe(0);
  });

  it('no mezcla ventas de otros productos', () => {
    const ventas = [...ventasDiarias('p', 20), ...ventasDiarias('otro', 99)];
    expect(promedioDiario(ventas, 'p', HOY)).toBe(20);
  });
});

// ---------------------------------------------------------------------
interface CasoControl {
  id: string;
  perecible: boolean;
  promedio: number;
  E: number;
  C: number;
  vida: number | null;
  stock: number;
  enCamino: number;
  R: number;
  punto: number;
  cobertura: number | null;
  nivel: NivelRiesgo;
  pedir: number;
}

const CASOS: CasoControl[] = [
  { id: 'C1', perecible: false, promedio: 20, E: 2, C: 1, vida: null, stock: 50, enCamino: 0, R: 3, punto: 60, cobertura: 2.5, nivel: 'quiebre', pedir: 157 },
  { id: 'C2', perecible: false, promedio: 20, E: 2, C: 1, vida: null, stock: 50, enCamino: 100, R: 3, punto: 60, cobertura: 2.5, nivel: 'quiebre', pedir: 57 },
  { id: 'C3', perecible: true, promedio: 20, E: 2, C: 1, vida: 1, stock: 40, enCamino: 0, R: 3, punto: 60, cobertura: 2, nivel: 'quiebre', pedir: 20 },
  { id: 'C4', perecible: false, promedio: 20, E: 2, C: 1, vida: null, stock: 60, enCamino: 0, R: 3, punto: 60, cobertura: 3, nivel: 'normal', pedir: 147 },
  { id: 'C5', perecible: false, promedio: 20, E: 2, C: 1, vida: null, stock: 100, enCamino: 0, R: 3, punto: 60, cobertura: 5, nivel: 'normal', pedir: 107 },
  { id: 'C6', perecible: false, promedio: 20, E: 2, C: 1, vida: null, stock: 200, enCamino: 0, R: 3, punto: 60, cobertura: 10, nivel: 'sobrestock', pedir: 0 },
  { id: 'C7', perecible: true, promedio: 20, E: 2, C: 1, vida: 4, stock: 100, enCamino: 0, R: 3, punto: 60, cobertura: 5, nivel: 'merma', pedir: 0 },
  { id: 'C8', perecible: false, promedio: 0, E: 2, C: 1, vida: null, stock: 10, enCamino: 0, R: 3, punto: 0, cobertura: null, nivel: 'sin_ventas', pedir: 0 },
];

function filaDeCaso(caso: CasoControl) {
  const p = producto(caso.id, {
    perecible: caso.perecible,
    diasVidaUtil: caso.vida,
    diasEntregaProveedor: caso.E,
    diasColchon: caso.C,
    stockInicial: caso.stock,
  });
  const ventas = caso.promedio > 0 ? ventasDiarias(caso.id, caso.promedio) : [];
  const pedidos: PedidoPlan[] =
    caso.enCamino > 0 ? [{ productoId: caso.id, cantidad: caso.enCamino, estado: 'pedido' }] : [];
  return planProducto(p, ventas, [], [], pedidos, HOY);
}

describe('Casos de control C1–C8 (6.1)', () => {
  it.each(CASOS)('$id: stock $stock, en camino $enCamino → $nivel, pedir $pedir', (caso) => {
    const fila = filaDeCaso(caso);
    expect(fila.promedioDiario).toBe(caso.promedio);
    expect(fila.diasReposicion).toBe(caso.R);
    expect(fila.puntoReorden).toBe(caso.punto);
    if (caso.cobertura === null) expect(fila.cobertura).toBeNull();
    else expect(fila.cobertura).toBeCloseTo(caso.cobertura, 10);
    expect(fila.enCamino).toBe(caso.enCamino);
    expect(fila.nivel).toBe(caso.nivel);
    expect(fila.pedir).toBe(caso.pedir);
  });

  it('C1 en detalle: demanda7dias = 140 y pedir = round(140 × 1,05 + 60 − 50 − 0) = 157', () => {
    const fila = filaDeCaso(CASOS[0]!);
    expect(fila.demanda7dias).toBe(140);
    expect(fila.pedir).toBe(157);
    expect(fila.cuandoPedir).toBe('Hoy');
  });

  it('C3: quiebre (no merma), tope por vida útil 20 × 1 = 20 y advertencia de vida útil', () => {
    const fila = filaDeCaso(CASOS[2]!);
    expect(fila.nivel).toBe('quiebre');
    expect(fila.pedir).toBe(20);
    expect(fila.advertencias).toContain(
      'Este producto dura 1 día y reponerlo toma 3 días: es probable que tenga quiebres o mermas aunque pida bien.',
    );
  });

  it('C4: cobertura exactamente igual a diasReposicion es normal (borde) y se pide hoy', () => {
    const fila = filaDeCaso(CASOS[3]!);
    expect(fila.nivel).toBe('normal');
    expect(fila.fechaPedido).toBe(HOY);
  });

  it('C5: normal con cobertura 5 y R 3 → pedir en hoy + 2 días', () => {
    const fila = filaDeCaso(CASOS[4]!);
    expect(fila.fechaPedido).toBe('2026-04-01');
    expect(fila.cuandoPedir).toBe('01-04-2026');
  });

  it('C6, C7 y C8: "No pedir por ahora"', () => {
    for (const caso of [CASOS[5]!, CASOS[6]!, CASOS[7]!]) {
      const fila = filaDeCaso(caso);
      expect(fila.fechaPedido).toBeNull();
      expect(fila.cuandoPedir).toBe('No pedir por ahora');
    }
  });

  it('C8: un producto sin ventas es sin_ventas, nunca quiebre', () => {
    const fila = filaDeCaso(CASOS[7]!);
    expect(fila.nivel).toBe('sin_ventas');
    expect(fila.motivo).toBe('No registra ventas en los últimos 28 días.');
  });
});

// ---------------------------------------------------------------------
describe('Caso de vida útil A/B (criterio de aceptación 3)', () => {
  function planAB(vidaA: number, vidaB: number) {
    const comun = { perecible: true, diasEntregaProveedor: 2, diasColchon: 1 };
    const productos = [
      producto('B', { ...comun, stockInicial: 20, diasVidaUtil: vidaB }),
      producto('A', { ...comun, stockInicial: 10, diasVidaUtil: vidaA }),
    ];
    const ventas = [...ventasDiarias('A', 10), ...ventasDiarias('B', 10)];
    return construirPlan(productos, ventas, [], [], [], HOY);
  }

  it('A (cobertura 1, vida 30) y B (cobertura 2, vida 1): ambos quiebre y A va antes que B', () => {
    const plan = planAB(30, 1);
    expect(plan.map((f) => f.productoId)).toEqual(['A', 'B']);
    expect(plan.map((f) => f.nivel)).toEqual(['quiebre', 'quiebre']);
    expect(plan[0]!.cobertura).toBeCloseTo(1, 10);
    expect(plan[1]!.cobertura).toBeCloseTo(2, 10);
  });

  it('cambiar la vida útil de A a 1 o la de B a 30 no cambia ningún nivel', () => {
    for (const [vidaA, vidaB] of [[1, 1], [30, 30], [1, 30]] as const) {
      const plan = planAB(vidaA, vidaB);
      expect(plan.map((f) => f.nivel)).toEqual(['quiebre', 'quiebre']);
      expect(plan[0]!.productoId).toBe('A');
    }
  });
});

// ---------------------------------------------------------------------
describe('Texto del motivo (7)', () => {
  it('C1: dice "demora 2 días", "1 día de reserva" y "3 días en total", y no "demora 3 días"', () => {
    const motivo = filaDeCaso(CASOS[0]!).motivo;
    expect(motivo).toBe(
      'Su proveedor demora 2 días en entregar y usted quiere 1 día de reserva, así que necesita cubrir 3 días en total. Hoy le alcanza para 2,5 días.',
    );
    expect(motivo).toContain('demora 2 días');
    expect(motivo).toContain('1 día de reserva');
    expect(motivo).toContain('3 días en total');
    expect(motivo).not.toContain('demora 3 días');
  });

  it('con E = 0 usa la variante "el mismo día"', () => {
    const fila = planProducto(
      producto('pan', { diasEntregaProveedor: 0, diasColchon: 1, stockInicial: 10 }),
      ventasDiarias('pan', 20),
      [],
      [],
      [],
      HOY,
    );
    expect(fila.nivel).toBe('quiebre');
    expect(fila.motivo).toBe(
      'Usted repone este producto el mismo día y quiere 1 día de reserva, así que necesita cubrir 1 día en total. Hoy le alcanza para 0,5 días.',
    );
  });

  it('merma, sobrestock y normal usan sus textos exactos', () => {
    expect(filaDeCaso(CASOS[6]!).motivo).toBe(
      'Tiene stock para 5,0 días, pero el producto dura 4 días. Parte podría vencer.',
    );
    expect(filaDeCaso(CASOS[5]!).motivo).toBe(
      'Tiene stock para 10,0 días, más del triple de lo que necesita cubrir (3 días).',
    );
    expect(filaDeCaso(CASOS[4]!).motivo).toBe('Tiene stock para 5,0 días; necesita cubrir 3 días.');
  });
});

// ---------------------------------------------------------------------
describe('Orden de urgencia (6.1)', () => {
  it('quiebre por cobertura ascendente → merma → sobrestock → normal → sin_ventas', () => {
    const datos: Record<string, Partial<ProductoPlan>> = {
      normal: { stockInicial: 100 },
      sinVentas: { stockInicial: 10 },
      quiebre2: { stockInicial: 40 },
      sobrestock: { stockInicial: 200 },
      merma: { stockInicial: 100, perecible: true, diasVidaUtil: 4 },
      quiebre1: { stockInicial: 20 },
    };
    const productos = Object.entries(datos).map(([id, d]) => producto(id, d));
    const ventas = productos.filter((p) => p.id !== 'sinVentas').flatMap((p) => ventasDiarias(p.id, 20));
    const plan = construirPlan(productos, ventas, [], [], [], HOY);
    expect(plan.map((f) => f.productoId)).toEqual(['quiebre1', 'quiebre2', 'merma', 'sobrestock', 'normal', 'sinVentas']);
  });
});
