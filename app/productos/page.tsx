/**
 * Productos (6.11): nombre, stock, nivel y "Faltan datos" si corresponde.
 * Cada producto abre su ficha de edición.
 */
import Link from 'next/link';
import { FaltanDatos, Nivel } from '@/components/nivel';
import { TablaOTarjetas } from '@/components/tabla-o-tarjetas';
import { leerDatosNegocio } from '@/lib/datos';
import { hoyEnChile } from '@/lib/fechas';
import { formatoCantidad } from '@/lib/formato';
import { negocioActivo } from '@/lib/negocio-activo';
import { construirPlan } from '@/lib/planificacion';

export const metadata = { title: 'Productos · Demand Planning AI' };

export default async function Productos() {
  const negocio = await negocioActivo();
  const datos = await leerDatosNegocio(negocio.businessId);
  const plan = new Map(
    construirPlan(datos.productos, datos.ventas, datos.compras, datos.ajustes, datos.pedidos, hoyEnChile()).map((f) => [f.productoId, f]),
  );
  const filas = datos.productos.map((p) => ({ producto: p, fila: plan.get(p.id)! }));

  const enlace = (id: string, nombre: string) => (
    <Link href={`/productos/${id}`} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">
      {nombre}
    </Link>
  );
  const stock = (f: (typeof filas)[number]) => `${formatoCantidad(f.fila.stockActual)} ${f.producto.unidad}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Productos</h1>
      <p className="text-sm text-muted-foreground">{filas.length} productos</p>
      <TablaOTarjetas
        etiqueta="Lista de productos"
        filas={filas}
        clave={(f) => f.producto.id}
        vacio="Todavía no hay productos. Importe un archivo en Ventas o Compras para crearlos."
        columnas={[
          { titulo: 'Producto', celda: (f) => enlace(f.producto.id, f.producto.nombre) },
          { titulo: 'Categoría', celda: (f) => f.producto.categoria ?? '—' },
          { titulo: 'Stock', celda: stock, className: 'text-right' },
          { titulo: 'Nivel', celda: (f) => <Nivel nivel={f.fila.nivel} /> },
          { titulo: 'Datos', celda: (f) => (f.producto.datosIncompletos ? <FaltanDatos /> : 'Completos') },
        ]}
        tarjeta={(f) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 break-words">{enlace(f.producto.id, f.producto.nombre)}</div>
              <Nivel nivel={f.fila.nivel} className="mt-3 shrink-0" />
            </div>
            <p className="text-sm text-muted-foreground">Stock: {stock(f)}</p>
            {f.producto.datosIncompletos && (
              <div>
                <FaltanDatos />
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
