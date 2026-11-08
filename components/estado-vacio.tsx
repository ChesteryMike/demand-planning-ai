import Link from 'next/link';

/** Estado vacío de Panel y Plan (6.11): nunca cifras en cero como si fueran reales. */
export function EstadoVacio() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p>Todavía no hay ventas. Importe su primer archivo en Ventas para ver qué reponer.</p>
      <Link href="/ventas" className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
        Ir a Ventas
      </Link>
    </div>
  );
}
