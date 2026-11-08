'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso } from '@/components/aviso';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { enviarJson } from '@/lib/cliente-api';

/** "Restaurar datos de ejemplo" (6.10). Solo se muestra cuando el negocio activo es el demo. */
export function BotonRestaurar() {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function restaurar() {
    setEnviando(true);
    const r = await enviarJson<{ mensaje: string }>('/api/demo/restaurar', 'POST');
    setEnviando(false);
    setMensaje(r.ok ? { tipo: 'exito', texto: r.datos.mensaje } : { tipo: 'error', texto: r.mensaje });
    if (r.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={enviando}>
            <RotateCcw aria-hidden="true" /> Restaurar datos de ejemplo
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar los datos de ejemplo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán los cambios hechos en la demostración y se cargarán de nuevo los 10 productos y 12 semanas de ventas de
              ejemplo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={restaurar}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
    </div>
  );
}
