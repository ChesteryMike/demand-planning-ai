/**
 * Lecturas para las vistas (Server Components). Usan el cliente de solo
 * lectura: RLS decide qué filas se ven. Convierten las filas de la base
 * (snake_case) a los tipos de dominio de lib/ (camelCase).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FechaISO } from './fechas';
import type { PedidoPlan, ProductoPlan } from './planificacion';
import type { Movimiento } from './stock';
import { clienteLectura } from './supabase-lectura';

/** PostgREST devuelve como máximo 1000 filas por consulta: se pide por páginas. */
const TAMANO_PAGINA = 1000;

async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await consulta(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error('No se pudieron leer los datos');
    filas.push(...(data ?? []));
    if (!data || data.length < TAMANO_PAGINA) return filas;
  }
}

export interface Negocio {
  id: string;
  nombre: string;
  esDemo: boolean;
}

export interface ProductoFicha extends ProductoPlan {
  unidad: string;
  categoria: string | null;
  precio: number;
}

export type Origen = 'manual' | 'importacion' | 'pedido';

export interface MovimientoDetalle extends Movimiento {
  id: string;
  origen: Origen;
  importacionId: string | null;
  costoUnitario: number | null;
}

export interface Importacion {
  id: string;
  tipo: 'venta' | 'compra';
  nombreArchivo: string;
  creadaEn: string;
  /** Filas que siguen existiendo (pueden haberse borrado algunas una por una). */
  filasActuales: number;
}

export interface PedidoDetalle extends PedidoPlan {
  id: string;
  fechaPedido: FechaISO;
  fechaRecepcion: FechaISO | null;
}

export interface DatosNegocio {
  productos: ProductoFicha[];
  ventas: MovimientoDetalle[];
  compras: MovimientoDetalle[];
  ajustes: Movimiento[];
  pedidos: PedidoDetalle[];
}

interface FilaProducto {
  id: string;
  nombre: string;
  unidad: string;
  categoria: string | null;
  perecible: boolean;
  dias_vida_util: number | null;
  costo: number | string;
  precio: number | string;
  dias_entrega_proveedor: number;
  dias_colchon: number;
  stock_inicial: number | string;
  fecha_stock_inicial: string;
  datos_incompletos: boolean;
}

function aProducto(f: FilaProducto): ProductoFicha {
  return {
    id: f.id,
    nombre: f.nombre,
    unidad: f.unidad,
    categoria: f.categoria,
    perecible: f.perecible,
    diasVidaUtil: f.dias_vida_util,
    costo: Number(f.costo),
    precio: Number(f.precio),
    diasEntregaProveedor: f.dias_entrega_proveedor,
    diasColchon: f.dias_colchon,
    stockInicial: Number(f.stock_inicial),
    fechaStockInicial: f.fecha_stock_inicial,
    datosIncompletos: f.datos_incompletos,
  };
}

const COLUMNAS_PRODUCTO =
  'id, nombre, unidad, categoria, perecible, dias_vida_util, costo, precio, dias_entrega_proveedor, dias_colchon, stock_inicial, fecha_stock_inicial, datos_incompletos';

export async function leerNegocio(businessId: string, cliente?: SupabaseClient): Promise<Negocio | null> {
  const db = cliente ?? (await clienteLectura());
  const { data, error } = await db.from('negocios').select('id, nombre, es_demo').eq('id', businessId).maybeSingle();
  if (error) throw new Error('No se pudo leer el negocio');
  return data ? { id: data.id, nombre: data.nombre, esDemo: data.es_demo } : null;
}

export async function leerProducto(businessId: string, id: string): Promise<ProductoFicha | null> {
  const db = await clienteLectura();
  const { data, error } = await db
    .from('productos')
    .select(COLUMNAS_PRODUCTO)
    .eq('business_id', businessId)
    .eq('id', id)
    .maybeSingle<FilaProducto>();
  if (error) return null; // un id con formato inválido también cae aquí → 404
  return data ? aProducto(data) : null;
}

function movimientos(tabla: 'ventas' | 'compras', db: SupabaseClient, businessId: string) {
  const columnas =
    tabla === 'compras'
      ? 'id, producto_id, fecha, cantidad, origen, importacion_id, costo_unitario'
      : 'id, producto_id, fecha, cantidad, origen, importacion_id';
  // La lista de columnas depende de la tabla: se declara el tipo de fila a mano.
  type Fila = Record<string, unknown>;
  return todas<Fila>(
    (desde, hasta) =>
      db
        .from(tabla)
        .select(columnas)
        .eq('business_id', businessId)
        .order('fecha', { ascending: false })
        .order('id')
        .range(desde, hasta) as unknown as PromiseLike<{ data: Fila[] | null; error: unknown }>,
  ).then((filas) =>
    filas.map(
      (f): MovimientoDetalle => ({
        id: String(f.id),
        productoId: String(f.producto_id),
        fecha: String(f.fecha),
        cantidad: Number(f.cantidad),
        origen: f.origen as Origen,
        importacionId: (f.importacion_id as string | null) ?? null,
        costoUnitario: f.costo_unitario === null || f.costo_unitario === undefined ? null : Number(f.costo_unitario),
      }),
    ),
  );
}

/** Todo lo que necesita el Plan, el Panel y el stock. */
export async function leerDatosNegocio(businessId: string): Promise<DatosNegocio> {
  const db = await clienteLectura();
  const [productos, ventas, compras, ajustes, pedidos] = await Promise.all([
    todas<FilaProducto>((d, h) => db.from('productos').select(COLUMNAS_PRODUCTO).eq('business_id', businessId).order('nombre').range(d, h)),
    movimientos('ventas', db, businessId),
    movimientos('compras', db, businessId),
    todas<{ producto_id: string; fecha: string; cantidad: number | string }>((d, h) =>
      db.from('ajustes_stock').select('producto_id, fecha, cantidad').eq('business_id', businessId).order('id').range(d, h),
    ),
    todas<{ id: string; producto_id: string; cantidad: number | string; estado: PedidoPlan['estado']; fecha_pedido: string; fecha_recepcion: string | null }>(
      (d, h) =>
        db
          .from('pedidos')
          .select('id, producto_id, cantidad, estado, fecha_pedido, fecha_recepcion')
          .eq('business_id', businessId)
          .order('fecha_pedido', { ascending: false })
          .range(d, h),
    ),
  ]);
  return {
    productos: productos.map(aProducto),
    ventas,
    compras,
    ajustes: ajustes.map((a) => ({ productoId: a.producto_id, fecha: a.fecha, cantidad: Number(a.cantidad) })),
    pedidos: pedidos.map((p) => ({
      id: p.id,
      productoId: p.producto_id,
      cantidad: Number(p.cantidad),
      estado: p.estado,
      fechaPedido: p.fecha_pedido,
      fechaRecepcion: p.fecha_recepcion,
    })),
  };
}

export async function leerImportaciones(businessId: string, tipo: 'venta' | 'compra'): Promise<Importacion[]> {
  const db = await clienteLectura();
  const tabla = tipo === 'venta' ? 'ventas' : 'compras';
  const { data, error } = await db
    .from('importaciones')
    .select(`id, tipo, nombre_archivo, creada_en, ${tabla}(count)`)
    .eq('business_id', businessId)
    .eq('tipo', tipo)
    .order('creada_en', { ascending: false });
  if (error) throw new Error('No se pudieron leer las importaciones');
  return (data ?? []).map((f) => {
    const conteo = (f as Record<string, unknown>)[tabla] as { count: number }[] | undefined;
    return {
      id: f.id,
      tipo: f.tipo,
      nombreArchivo: f.nombre_archivo,
      creadaEn: f.creada_en,
      filasActuales: conteo?.[0]?.count ?? 0,
    };
  });
}
