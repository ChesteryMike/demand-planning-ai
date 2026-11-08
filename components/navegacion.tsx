'use client';

/**
 * Navegación (6.12): en lg y más, barra con los seis enlaces; bajo lg, botón
 * "Menú" que abre un panel lateral con los mismos enlaces. El nombre del
 * negocio y la etiqueta "Demostración" se ven en ambos tamaños.
 */
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export const ENLACES = [
  { href: '/', texto: 'Panel' },
  { href: '/ventas', texto: 'Ventas' },
  { href: '/productos', texto: 'Productos' },
  { href: '/compras', texto: 'Compras' },
  { href: '/pronostico', texto: 'Pronóstico' },
  { href: '/plan', texto: 'Plan de reposición' },
] as const;

function activo(ruta: string, href: string): boolean {
  return href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
}

export function Navegacion({ nombreNegocio, esDemo }: { nombreNegocio: string; esDemo: boolean }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className="flex min-h-11 min-w-0 items-center font-semibold">
            <span className="truncate">{nombreNegocio}</span>
          </Link>
          {esDemo && (
            <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-300">
              Demostración
            </span>
          )}
        </div>

        <nav aria-label="Navegación principal" data-testid="barra-enlaces" className="hidden lg:flex lg:items-center lg:gap-1">
          {ENLACES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              aria-current={activo(ruta, e.href) ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                activo(ruta, e.href) && 'bg-muted text-foreground',
              )}
            >
              {e.texto}
            </Link>
          ))}
        </nav>

        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger asChild>
            <Button variant="outline" className="lg:hidden" data-testid="boton-menu">
              <Menu aria-hidden="true" />
              Menú
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>{nombreNegocio}</SheetTitle>
              <SheetDescription>{esDemo ? 'Demostración' : 'Su negocio'}</SheetDescription>
            </SheetHeader>
            <nav aria-label="Menú" className="flex flex-col gap-1 px-4">
              {ENLACES.map((e) => (
                <Link
                  key={e.href}
                  href={e.href}
                  onClick={() => setAbierto(false)}
                  aria-current={activo(ruta, e.href) ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-md px-3 font-medium hover:bg-muted',
                    activo(ruta, e.href) && 'bg-muted',
                  )}
                >
                  {e.texto}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
