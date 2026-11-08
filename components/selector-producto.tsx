'use client';

import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Selector de producto de la vista Pronóstico: cambia ?producto= en la URL. */
export function SelectorProducto({ productos, actual }: { productos: { id: string; nombre: string }[]; actual: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1.5 md:max-w-sm">
      <Label htmlFor="selector-producto">Producto</Label>
      <Select value={actual} onValueChange={(id) => router.push(`/pronostico?producto=${id}`)}>
        <SelectTrigger id="selector-producto" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {productos.map((p) => (
            <SelectItem key={p.id} value={p.id} className="min-h-11">
              {p.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
