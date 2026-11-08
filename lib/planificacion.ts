/**
 * Planificación de reposición (PROMPT_MAESTRO 6.1). Funciones puras:
 * sin IA, sin base de datos y con `hoy` siempre como parámetro.
 *
 * Regla clave (regla 3): el riesgo de QUIEBRE depende de los días de
 * reposición (entrega del proveedor + colchón propio), NUNCA de la vida útil.
 */
import { diasEntre, rangoFechas, sumarDias, type FechaISO } from './fechas';
import { formatoFecha, formatoNumero, textoDias } from './formato';
import { calcularStock, type Movimiento, type ProductoStock } from './stock';

export type { Movimiento } from './stock';

export const DIAS_VENTANA = 28;
const FACTOR_SEGURIDAD = 1.05;
/** Tolerancia para comparar coberturas (3/1 puede dar 2,9999999999999996). */
const EPSILON = 1e-9;

export type NivelRiesgo = 'quiebre' | 'merma' | 'sobrestock' | 'normal' | 'sin_ventas';

export interface VentaDia {
  fecha: FechaISO;
  cantidad: number;
}

export interface ProductoPlan extends ProductoStock {
  nombre: string;
  perecible: boolean;
  /** Nulo si no es perecible. */
  diasVidaUtil: number | null;
  diasEntregaProveedor: number;
  diasColchon: number;
  costo: number;
  datosIncompletos: boolean;
}

export interface PedidoPlan {
  productoId: string;
  cantidad: number;
  estado: 'pedido' | 'recibido' | 'cancelado';
}

export interface FilaPlan {
  productoId: string;
  nombre: string;
  nivel: NivelRiesgo;
  promedioDiario: number;
  diasReposicion: number;
  puntoReorden: number;
  /** Stock según la fórmula de 5.2 (puede ser negativo, para mostrar el aviso). */
  stockActual: number;
  /** Nulo si no hay ventas (promedio 0). Se calcula con el stock acotado a 0. */
  cobertura: number | null;
  demanda7dias: number;
  enCamino: number;
  pedir: number;
  /** Fecha en que conviene pedir; nula si no hay que pedir por ahora. */
  fechaPedido: FechaISO | null;
  cuandoPedir: string;
  motivo: string;
  advertencias: string[];
  datosIncompletos: boolean;
  costo: number;
}

// ---------------------------------------------------------------------
// Ventana de 28 días y promedio diario
// ---------------------------------------------------------------------

export interface VentanaVentas {
  /** 28 días, de hoy − 28 a hoy − 1, en orden; los días sin venta valen 0. */
  serie: VentaDia[];
  /** Denominador: min(28, días desde la primera venta hasta hoy − 1, inclusive). */
  n: number;
  suma: number;
  primeraVenta: FechaISO | null;
}

/** Ventana de ventas de UN producto (las ventas de hoy o posteriores no cuentan). */
export function ventanaVentas(ventasProducto: VentaDia[], hoy: FechaISO): VentanaVentas {
  const desde = sumarDias(hoy, -DIAS_VENTANA);
  const hasta = sumarDias(hoy, -1);
  const porFecha = new Map<FechaISO, number>();
  let primeraVenta: FechaISO | null = null;

  for (const venta of ventasProducto) {
    if (venta.fecha > hasta) continue;
    if (primeraVenta === null || venta.fecha < primeraVenta) primeraVenta = venta.fecha;
    if (venta.fecha >= desde) {
      porFecha.set(venta.fecha, (porFecha.get(venta.fecha) ?? 0) + venta.cantidad);
    }
  }

  const serie = rangoFechas(desde, hasta).map((fecha) => ({ fecha, cantidad: porFecha.get(fecha) ?? 0 }));
  const suma = serie.reduce((total, dia) => total + dia.cantidad, 0);
  const n = primeraVenta === null ? 0 : Math.min(DIAS_VENTANA, diasEntre(primeraVenta, hasta) + 1);
  return { serie, n, suma, primeraVenta };
}

/** Promedio diario de los últimos 28 días (6.1). Sin ventas en la ventana → 0. */
export function promedioDiario(ventas: Movimiento[], productoId: string, hoy: FechaISO): number {
  const { suma, n } = ventanaVentas(
    ventas.filter((v) => v.productoId === productoId),
    hoy,
  );
  return n === 0 || suma === 0 ? 0 : suma / n;
}

// ---------------------------------------------------------------------
// Nivel de riesgo, cantidad y textos
// ---------------------------------------------------------------------

/** Evalúa las reglas en orden; gana la primera que se cumple (6.1). */
export function nivelDeRiesgo(
  promedio: number,
  cobertura: number | null,
  diasReposicion: number,
  perecible: boolean,
  diasVidaUtil: number | null,
): NivelRiesgo {
  if (promedio === 0 || cobertura === null) return 'sin_ventas';
  if (cobertura < diasReposicion - EPSILON) return 'quiebre';
  if (perecible && diasVidaUtil !== null && cobertura > diasVidaUtil + EPSILON) return 'merma';
  if (!perecible && cobertura > 3 * diasReposicion + EPSILON) return 'sobrestock';
  return 'normal';
}

function textoCobertura(cobertura: number): string {
  return `${formatoNumero(cobertura, 1)} días`;
}

/** Texto del motivo, exacto según la tabla de 6.1. */
export function textoMotivo(
  nivel: NivelRiesgo,
  datos: { cobertura: number | null; diasEntrega: number; diasColchon: number; diasReposicion: number; diasVidaUtil: number | null },
): string {
  const { cobertura, diasEntrega: E, diasColchon: C, diasReposicion: R, diasVidaUtil: V } = datos;
  const cob = cobertura === null ? '' : textoCobertura(cobertura);

  switch (nivel) {
    case 'quiebre': {
      const inicio =
        E === 0
          ? `Usted repone este producto el mismo día y quiere ${textoDias(C)} de reserva`
          : `Su proveedor demora ${textoDias(E)} en entregar y usted quiere ${textoDias(C)} de reserva`;
      return `${inicio}, así que necesita cubrir ${textoDias(R)} en total. Hoy le alcanza para ${cob}.`;
    }
    case 'merma':
      return `Tiene stock para ${cob}, pero el producto dura ${textoDias(V ?? 0)}. Parte podría vencer.`;
    case 'sobrestock':
      return `Tiene stock para ${cob}, más del triple de lo que necesita cubrir (${textoDias(R)}).`;
    case 'sin_ventas':
      return 'No registra ventas en los últimos 28 días.';
    case 'normal':
      return `Tiene stock para ${cob}; necesita cubrir ${textoDias(R)}.`;
  }
}

export function advertenciaVidaUtil(diasVidaUtil: number, diasReposicion: number): string {
  return `Este producto dura ${textoDias(diasVidaUtil)} y reponerlo toma ${textoDias(diasReposicion)}: es probable que tenga quiebres o mermas aunque pida bien.`;
}

// ---------------------------------------------------------------------
// Plan completo
// ---------------------------------------------------------------------

const ORDEN_NIVEL: Record<NivelRiesgo, number> = {
  quiebre: 0,
  merma: 1,
  sobrestock: 2,
  normal: 3,
  sin_ventas: 4,
};

/** Orden de urgencia: quiebre (cobertura ascendente) → merma → sobrestock → normal → sin_ventas. */
export function ordenarPorUrgencia(filas: FilaPlan[]): FilaPlan[] {
  return [...filas].sort((a, b) => {
    const porNivel = ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel];
    if (porNivel !== 0) return porNivel;
    if (a.nivel === 'quiebre') {
      const porCobertura = (a.cobertura ?? 0) - (b.cobertura ?? 0);
      if (porCobertura !== 0) return porCobertura;
    }
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

export function planProducto(
  producto: ProductoPlan,
  ventas: Movimiento[],
  compras: Movimiento[],
  ajustes: Movimiento[],
  pedidos: PedidoPlan[],
  hoy: FechaISO,
): FilaPlan {
  const promedio = promedioDiario(ventas, producto.id, hoy);
  const stock = calcularStock(producto, compras, ventas, ajustes);
  const stockPlan = stock.stockParaPlanificar;

  const diasReposicion = producto.diasEntregaProveedor + producto.diasColchon;
  const puntoReorden = promedio * diasReposicion;
  const cobertura = promedio === 0 ? null : stockPlan / promedio;
  const demanda7dias = promedio * 7;
  const enCamino = pedidos
    .filter((p) => p.productoId === producto.id && p.estado === 'pedido')
    .reduce((total, p) => total + p.cantidad, 0);
  const pedirBase = Math.max(0, Math.round(demanda7dias * FACTOR_SEGURIDAD + puntoReorden - stockPlan - enCamino));

  const vida = producto.perecible ? producto.diasVidaUtil : null;
  const nivel = nivelDeRiesgo(promedio, cobertura, diasReposicion, producto.perecible, vida);

  let pedir = nivel === 'quiebre' || nivel === 'normal' ? pedirBase : 0;
  // No pedir más de lo que se alcanza a vender antes de que venza.
  if (vida !== null) pedir = Math.min(pedir, Math.round(promedio * vida));

  const advertencias: string[] = [];
  if (stock.aviso) advertencias.push(stock.aviso);
  if (vida !== null && vida < diasReposicion) advertencias.push(advertenciaVidaUtil(vida, diasReposicion));

  let fechaPedido: FechaISO | null = null;
  if (nivel === 'quiebre') fechaPedido = hoy;
  if (nivel === 'normal' && cobertura !== null) {
    fechaPedido = sumarDias(hoy, Math.max(0, Math.floor(cobertura - diasReposicion + EPSILON)));
  }
  const cuandoPedir =
    fechaPedido === null ? 'No pedir por ahora' : fechaPedido === hoy ? 'Hoy' : formatoFecha(fechaPedido);

  return {
    productoId: producto.id,
    nombre: producto.nombre,
    nivel,
    promedioDiario: promedio,
    diasReposicion,
    puntoReorden,
    stockActual: stock.stockCalculado,
    cobertura,
    demanda7dias,
    enCamino,
    pedir,
    fechaPedido,
    cuandoPedir,
    motivo: textoMotivo(nivel, {
      cobertura,
      diasEntrega: producto.diasEntregaProveedor,
      diasColchon: producto.diasColchon,
      diasReposicion,
      diasVidaUtil: vida,
    }),
    advertencias,
    datosIncompletos: producto.datosIncompletos,
    costo: producto.costo,
  };
}

/** Plan de reposición de todos los productos, ordenado por urgencia (6.1). */
export function construirPlan(
  productos: ProductoPlan[],
  ventas: Movimiento[],
  compras: Movimiento[],
  ajustes: Movimiento[],
  pedidos: PedidoPlan[],
  hoy: FechaISO,
): FilaPlan[] {
  return ordenarPorUrgencia(
    productos.map((producto) => planProducto(producto, ventas, compras, ajustes, pedidos, hoy)),
  );
}
