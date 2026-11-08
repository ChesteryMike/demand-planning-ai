'use client';

import './globals.css';

/** Error en el propio layout raíz: también en español. */
export default function ErrorGlobal({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CL">
      <body className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold">Algo salió mal</h1>
        <p className="mt-2 text-muted-foreground">No pudimos cargar la aplicación. Intente de nuevo en unos segundos.</p>
        <button onClick={reset} className="mt-4 min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">
          Intentar de nuevo
        </button>
      </body>
    </html>
  );
}
