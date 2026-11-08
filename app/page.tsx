/**
 * Panel (6.11): cuántos productos están en quiebre, merma y sobrestock, el
 * valor estimado de la compra sugerida y las alertas por urgencia.
 * Las cifras salen de lib/planificacion.ts (nunca de la IA).
 */
import Link from 'next/link';
import { BotonRestaurar } from '@/components/boton-restaurar';
import { EstadoVacio } from '@/components/estado-vacio';
import { FaltanDatos, Nivel } from '@/components/nivel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { leerDatosNegocio } from '@/lib/datos';
import { hoyEnChile } from '@/lib/fechas';
import { formatoCantidad, formatoPesos } from '@/lib/formato';
import { negocioActivo } from '@/lib/negocio-activo';
import { construirPlan, type FilaPlan } from '@/lib/planificacion';

function Resumen({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{valor}</CardTitle>
      </CardHeader>
      {detalle && <CardContent className="text-sm text-muted-foreground">{detalle}</CardContent>}
    </Card>
  );
}

function Alerta({ fila }: { fila: FilaPlan }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4" data-testid="alerta">
      <div className="flex flex-wrap items-center gap-2">
        <Nivel nivel={fila.nivel} />
        <Link href={`/productos/${fila.productoId}`} className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline">
          {fila.nombre}
        </Link>
        {fila.datosIncompletos && <FaltanDatos />}
      </div>
      <p className="text-sm">{fila.motivo}</p>
      {fila.pedir > 0 && (
        <p className="text-sm font-medium">
          Pedir {formatoCantidad(fila.pedir)} · {fila.cuandoPedir}
        </p>
      )}
      {fila.advertencias.map((a) => (
        <p key={a} className="text-sm text-amber-800">
          {a}
        </p>
      ))}
    </li>
  );
}

export default async function Panel() {
  const negocio = await negocioActivo();
  const datos = await leerDatosNegocio(negocio.businessId);
  const plan = construirPlan(datos.productos, datos.ventas, datos.compras, datos.ajustes, datos.pedidos, hoyEnChile());

  const contar = (nivel: FilaPlan['nivel']) => plan.filter((f) => f.nivel === nivel).length;
  const conPedido = plan.filter((f) => f.pedir > 0);
  const valorCompra = conPedido.filter((f) => f.costo > 0).reduce((total, f) => total + f.pedir * f.costo, 0);
  const sinCosto = conPedido.filter((f) => f.costo === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold">Panel</h1>
        {negocio.esDemo && <BotonRestaurar />}
      </div>

      {datos.ventas.length === 0 ? (
        <EstadoVacio />
      ) : (
        <>
          <section aria-label="Resumen" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Resumen titulo="En quiebre" valor={String(contar('quiebre'))} detalle="Productos que se acabarán antes de reponerlos." />
            <Resumen titulo="En riesgo de merma" valor={String(contar('merma'))} detalle="Productos que podrían vencer." />
            <Resumen titulo="Con sobrestock" valor={String(contar('sobrestock'))} detalle="Más del triple de lo necesario." />
            <Resumen
              titulo="Compra sugerida"
              valor={formatoPesos(valorCompra)}
              detalle={sinCosto > 0 ? `${sinCosto} ${sinCosto === 1 ? 'producto sin costo no está incluido' : 'productos sin costo no están incluidos'}.` : 'Valor estimado de lo que conviene pedir.'}
            />
          </section>

          <section aria-label="Alertas" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Alertas por urgencia</h2>
            <ul className="flex flex-col gap-3">
              {plan.map((f) => (
                <Alerta key={f.productoId} fila={f} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
