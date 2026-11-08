/**
 * Tabla en md y más; bajo md, una tarjeta por fila (6.12). Así una tabla
 * nunca obliga a desplazar la página completa a 375 px.
 */
import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface Columna<T> {
  titulo: string;
  celda: (fila: T) => ReactNode;
  className?: string;
}

export function TablaOTarjetas<T>({
  filas,
  columnas,
  clave,
  tarjeta,
  vacio,
  etiqueta,
}: {
  filas: T[];
  columnas: Columna<T>[];
  clave: (fila: T) => string;
  /** Contenido de la tarjeta en celular. */
  tarjeta: (fila: T) => ReactNode;
  vacio?: ReactNode;
  etiqueta?: string;
}) {
  if (filas.length === 0) return <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{vacio ?? 'No hay datos.'}</div>;

  return (
    <>
      <div className="hidden md:block">
        <Table aria-label={etiqueta}>
          <TableHeader>
            <TableRow>
              {columnas.map((c) => (
                <TableHead key={c.titulo} className={c.className}>
                  {c.titulo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={clave(f)}>
                {columnas.map((c) => (
                  <TableCell key={c.titulo} className={cn('whitespace-normal', c.className)}>
                    {c.celda(f)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={etiqueta}>
        {filas.map((f) => (
          <li key={clave(f)} data-testid="tarjeta" className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
            {tarjeta(f)}
          </li>
        ))}
      </ul>
    </>
  );
}
