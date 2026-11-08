/**
 * Ficha de un producto (6.11). El stock se muestra pero no se edita: se
 * corrige con "Registrar ajuste de inventario" (5.2).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FichaProducto } from '@/components/ficha-producto';
import { FaltanDatos, Nivel } from '@/components/nivel';
import { leerDatosNegocio } from '@/lib/datos';
import { hoyEnChile } from '@/lib/fechas';
import { negocioActivo } from '@/lib/negocio-activo';
import { planProducto } from '@/lib/planificacion';

export const metadata = { title: 'Ficha de producto · Demand Planning AI' };

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const negocio = await negocioActivo();
  const datos = await leerDatosNegocio(negocio.businessId);
  const producto = datos.productos.find((p) => p.id === id);
  if (!producto) notFound();

  const hoy = hoyEnChile();
  const fila = planProducto(producto, datos.ventas, datos.compras, datos.ajustes, datos.pedidos, hoy);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/productos" className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4">
        ← Volver a Productos
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold break-words">{producto.nombre}</h1>
        <Nivel nivel={fila.nivel} />
        {producto.datosIncompletos && <FaltanDatos />}
      </div>
      <p className="text-sm">{fila.motivo}</p>
      <FichaProducto producto={producto} stockActual={fila.stockActual} advertencias={fila.advertencias} hoy={hoy} />
    </div>
  );
}
