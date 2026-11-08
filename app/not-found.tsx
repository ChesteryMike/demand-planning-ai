import Link from 'next/link';

export const metadata = { title: 'Página no encontrada · Demand Planning AI' };

/** Reemplaza la página 404 en inglés de Next.js (6.11). */
export default function NoEncontrada() {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <h1 className="text-2xl font-bold">No encontramos esta página</h1>
      <p className="text-muted-foreground">Puede que el enlace esté mal escrito o que el producto ya no exista.</p>
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
        Volver al Panel
      </Link>
    </div>
  );
}
