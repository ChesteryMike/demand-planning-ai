'use client';

import { Button } from '@/components/ui/button';

/** Reemplaza la página de error en inglés de Next.js (6.11). Nunca muestra el error técnico. */
export default function ErrorVista({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-10" role="alert">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="text-muted-foreground">No pudimos cargar esta página. Intente de nuevo en unos segundos.</p>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </div>
  );
}
