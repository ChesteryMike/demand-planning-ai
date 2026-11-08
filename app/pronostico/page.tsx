/**
 * Pronóstico (6.11). La línea base de 14 días se calcula aquí con código
 * (lib/pronostico/linea-base.ts). El ajuste de IA es opcional y se pide con
 * un botón: el Plan de reposición no lo usa en esta versión (6.7).
 */
import Link from 'next/link';
import { SelectorProducto } from '@/components/selector-producto';
import { VistaPronostico } from '@/components/vista-pronostico';
import { leerDatosNegocio } from '@/lib/datos';
import { hoyEnChile } from '@/lib/fechas';
import { negocioActivo } from '@/lib/negocio-activo';
import { calcularLineaBase } from '@/lib/pronostico/linea-base';

export const metadata = { title: 'Pronóstico · Demand Planning AI' };

export default async function Pronostico({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const { producto: elegido } = await searchParams;
  const negocio = await negocioActivo();
  const datos = await leerDatosNegocio(negocio.businessId);

  if (datos.productos.length === 0 || datos.ventas.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Pronóstico</h1>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p>Todavía no hay ventas para pronosticar. Importe su primer archivo en Ventas.</p>
          <Link href="/ventas" className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Ir a Ventas
          </Link>
        </div>
      </div>
    );
  }

  const conVentas = new Set(datos.ventas.map((v) => v.productoId));
  const producto =
    datos.productos.find((p) => p.id === elegido) ?? datos.productos.find((p) => conVentas.has(p.id)) ?? datos.productos[0]!;
  const lineaBase = calcularLineaBase(
    datos.ventas.filter((v) => v.productoId === producto.id),
    hoyEnChile(),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Pronóstico</h1>
      <SelectorProducto productos={datos.productos.map((p) => ({ id: p.id, nombre: p.nombre }))} actual={producto.id} />
      <p className="text-sm text-muted-foreground">
        Ventas de los últimos 28 días y lo que esperamos para los próximos 14, en {producto.unidad}.
      </p>
      {/* key: al cambiar de producto se descarta el ajuste de IA del producto anterior */}
      <VistaPronostico key={producto.id} productoId={producto.id} unidad={producto.unidad} lineaBase={lineaBase} />
    </div>
  );
}
