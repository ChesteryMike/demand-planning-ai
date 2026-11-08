/**
 * Carga (en el servidor) los datos de Ventas o Compras y los entrega a la
 * vista interactiva. Las fechas de las importaciones se formatean aquí, en
 * hora de Chile.
 */
import { PaginaMovimientos } from '@/components/movimientos';
import { leerDatosNegocio, leerImportaciones } from '@/lib/datos';
import { hoyEnChile } from '@/lib/fechas';
import { formatoFechaHora } from '@/lib/formato';
import { negocioActivo } from '@/lib/negocio-activo';

export async function PaginaMovimientosServidor({ tipo }: { tipo: 'venta' | 'compra' }) {
  const negocio = await negocioActivo();
  const [datos, importaciones] = await Promise.all([leerDatosNegocio(negocio.businessId), leerImportaciones(negocio.businessId, tipo)]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{tipo === 'venta' ? 'Ventas' : 'Compras a proveedores'}</h1>
      <PaginaMovimientos
        tipo={tipo}
        filas={tipo === 'venta' ? datos.ventas : datos.compras}
        productos={datos.productos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        importaciones={importaciones.map((i) => ({
          id: i.id,
          nombreArchivo: i.nombreArchivo,
          creadaEnTexto: formatoFechaHora(i.creadaEn),
          filasActuales: i.filasActuales,
        }))}
        hoy={hoyEnChile()}
      />
    </div>
  );
}
