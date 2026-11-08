/**
 * Plan de reposición (6.1 y 6.11): demanda de 7 días, stock, cobertura, en
 * camino, cuánto y cuándo pedir, nivel y motivo. Todas las cifras salen de
 * construirPlan (código determinista); el ajuste de IA no se usa aquí (6.7).
 */
import Link from 'next/link';
import { AccionesPedido } from '@/components/acciones-pedido';
import { DetallePlan } from '@/components/detalle-plan';
import { EstadoVacio } from '@/components/estado-vacio';
import { FaltanDatos, Nivel } from '@/components/nivel';
import { TablaOTarjetas } from '@/components/tabla-o-tarjetas';
import { leerDatosNegocio } from '@/lib/datos';
import { hoyEnChile } from '@/lib/fechas';
import { formatoCantidad, formatoNumero } from '@/lib/formato';
import { negocioActivo } from '@/lib/negocio-activo';
import { construirPlan, type FilaPlan } from '@/lib/planificacion';

export const metadata = { title: 'Plan de reposición · Demand Planning AI' };

const cantidad = (n: number) => formatoCantidad(Math.round(n * 10) / 10);
const cobertura = (f: FilaPlan) => (f.cobertura === null ? '—' : `${formatoNumero(f.cobertura, 1)} días`);

export default async function Plan() {
  const negocio = await negocioActivo();
  const datos = await leerDatosNegocio(negocio.businessId);
  const plan = construirPlan(datos.productos, datos.ventas, datos.compras, datos.ajustes, datos.pedidos, hoyEnChile());
  const unidades = new Map(datos.productos.map((p) => [p.id, p.unidad]));
  const pendientes = (productoId: string) =>
    datos.pedidos
      .filter((p) => p.productoId === productoId && p.estado === 'pedido')
      .map((p) => ({ id: p.id, cantidad: p.cantidad, fechaPedido: p.fechaPedido }));

  const nombre = (f: FilaPlan) => (
    <div className="flex flex-col items-start gap-1">
      <Link href={`/productos/${f.productoId}`} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">
        {f.nombre}
      </Link>
      {f.datosIncompletos && <FaltanDatos />}
    </div>
  );
  const acciones = (f: FilaPlan) => (
    <AccionesPedido productoId={f.productoId} nombre={f.nombre} unidad={unidades.get(f.productoId) ?? 'un'} pedir={f.pedir} pendientes={pendientes(f.productoId)} />
  );
  const advertencias = (f: FilaPlan) =>
    f.advertencias.map((a) => (
      <p key={a} className="text-xs text-amber-800">
        {a}
      </p>
    ));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Plan de reposición</h1>
      {datos.ventas.length === 0 ? (
        <EstadoVacio />
      ) : (
        <TablaOTarjetas
          etiqueta="Plan de reposición"
          filas={plan}
          clave={(f) => f.productoId}
          columnas={[
            { titulo: 'Producto', celda: nombre },
            { titulo: 'Nivel', celda: (f) => <Nivel nivel={f.nivel} /> },
            { titulo: 'Demanda 7 días', celda: (f) => cantidad(f.demanda7dias), className: 'text-right' },
            { titulo: 'Stock', celda: (f) => cantidad(f.stockActual), className: 'text-right' },
            { titulo: 'Cobertura', celda: cobertura, className: 'text-right' },
            { titulo: 'En camino', celda: (f) => cantidad(f.enCamino), className: 'text-right' },
            { titulo: 'Pedir', celda: (f) => <span className="font-semibold">{formatoCantidad(f.pedir)}</span>, className: 'text-right' },
            { titulo: 'Cuándo', celda: (f) => f.cuandoPedir },
            { titulo: 'Motivo', celda: (f) => <div className="flex min-w-56 flex-col gap-1"><p>{f.motivo}</p>{advertencias(f)}</div> },
            { titulo: 'Acciones', celda: acciones },
          ]}
          tarjeta={(f) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 break-words">{nombre(f)}</div>
                <Nivel nivel={f.nivel} className="mt-3 shrink-0" />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Pedir</dt>
                  <dd className="text-lg font-semibold">{formatoCantidad(f.pedir)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cuándo</dt>
                  <dd className="text-lg font-semibold">{f.cuandoPedir}</dd>
                </div>
              </dl>
              <p className="text-sm">{f.motivo}</p>
              {advertencias(f)}
              <DetallePlan>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Demanda 7 días</dt>
                    <dd>{cantidad(f.demanda7dias)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stock</dt>
                    <dd>{cantidad(f.stockActual)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cobertura</dt>
                    <dd>{cobertura(f)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">En camino</dt>
                    <dd>{cantidad(f.enCamino)}</dd>
                  </div>
                </dl>
              </DetallePlan>
              {acciones(f)}
            </div>
          )}
        />
      )}
    </div>
  );
}
