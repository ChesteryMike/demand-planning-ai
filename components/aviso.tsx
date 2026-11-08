import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const ESTILOS = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  exito: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  advertencia: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
};

export function Aviso({ tipo = 'info', children, className }: { tipo?: keyof typeof ESTILOS; children: ReactNode; className?: string }) {
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border p-3 text-sm', ESTILOS[tipo], className)}>
      {children}
    </div>
  );
}
