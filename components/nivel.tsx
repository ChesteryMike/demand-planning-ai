import type { NivelRiesgo } from '@/lib/planificacion';
import { cn } from '@/lib/utils';

export const TEXTO_NIVEL: Record<NivelRiesgo, string> = {
  quiebre: 'Quiebre',
  merma: 'Merma',
  sobrestock: 'Sobrestock',
  normal: 'Normal',
  sin_ventas: 'Sin ventas',
};

const COLOR_NIVEL: Record<NivelRiesgo, string> = {
  quiebre: 'bg-red-100 text-red-800 ring-red-300',
  merma: 'bg-amber-100 text-amber-900 ring-amber-300',
  sobrestock: 'bg-sky-100 text-sky-900 ring-sky-300',
  normal: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  sin_ventas: 'bg-zinc-100 text-zinc-700 ring-zinc-300',
};

/** Nivel de riesgo con color Y texto (nunca solo color, 6.12). */
export function Nivel({ nivel, className }: { nivel: NivelRiesgo; className?: string }) {
  return (
    <span
      data-nivel={nivel}
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', COLOR_NIVEL[nivel], className)}
    >
      {TEXTO_NIVEL[nivel]}
    </span>
  );
}

export function FaltanDatos() {
  return (
    <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-800 ring-1 ring-inset ring-orange-300">
      Faltan datos
    </span>
  );
}
