'use client';

/**
 * "Marcar pedido realizado" crea un pedido; "Recibir" pide confirmar la
 * cantidad recibida (por defecto, la pedida) y registra UNA compra (6.11).
 * El botón se desactiva mientras se envía y el servidor es idempotente.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso } from '@/components/aviso';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { enviarJson } from '@/lib/cliente-api';
import { formatoCantidad, formatoFecha } from '@/lib/formato';
import { parsearCantidad } from '@/lib/importar/parseo';

export interface PedidoPendiente {
  id: string;
  cantidad: number;
  fechaPedido: string;
}

function DialogoCantidad({
  boton,
  titulo,
  descripcion,
  etiqueta,
  inicial,
  confirmar,
  alConfirmar,
  variante = 'default',
}: {
  boton: string;
  titulo: string;
  descripcion: string;
  etiqueta: string;
  inicial: number;
  confirmar: string;
  alConfirmar: (cantidad: number) => Promise<string | null>;
  variante?: 'default' | 'outline';
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(formatoCantidad(inicial));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    const cantidad = parsearCantidad(valor);
    if (!cantidad.ok) return setError('Escriba una cantidad mayor que cero, por ejemplo 12 o 12,5.');
    setEnviando(true);
    const problema = await alConfirmar(cantidad.valor);
    setEnviando(false);
    if (problema) return setError(problema);
    setAbierto(false);
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) {
          setValor(formatoCantidad(inicial));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variante}>{boton}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cantidad-${titulo}`}>{etiqueta}</Label>
          <Input id={`cantidad-${titulo}`} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <DialogFooter>
          <Button onClick={enviar} disabled={enviando}>
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccionesPedido({
  productoId,
  nombre,
  unidad,
  pedir,
  pendientes,
}: {
  productoId: string;
  nombre: string;
  unidad: string;
  pedir: number;
  pendientes: PedidoPendiente[];
}) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {pedir > 0 && (
          <DialogoCantidad
            boton="Marcar pedido realizado"
            titulo={`Pedido de ${nombre}`}
            descripcion="Registre la cantidad que pidió al proveedor. Contará como «en camino» hasta que la reciba."
            etiqueta={`Cantidad pedida (${unidad})`}
            inicial={pedir}
            confirmar="Registrar pedido"
            alConfirmar={async (cantidad) => {
              const r = await enviarJson<{ mensaje: string }>('/api/pedidos', 'POST', { producto_id: productoId, cantidad });
              if (!r.ok) return r.mensaje;
              setMensaje(r.datos.mensaje);
              router.refresh();
              return null;
            }}
          />
        )}
        {pendientes.map((p) => (
          <DialogoCantidad
            key={p.id}
            variante="outline"
            boton={`Recibir ${formatoCantidad(p.cantidad)}`}
            titulo={`Recibir ${nombre}`}
            descripcion={`Pedido del ${formatoFecha(p.fechaPedido)} por ${formatoCantidad(p.cantidad)} ${unidad}. Confirme cuánto llegó.`}
            etiqueta={`Cantidad recibida (${unidad})`}
            inicial={p.cantidad}
            confirmar="Confirmar recepción"
            alConfirmar={async (cantidad) => {
              const r = await enviarJson<{ mensaje: string }>('/api/pedidos', 'PATCH', { id: p.id, accion: 'recibir', cantidad });
              if (!r.ok) return r.mensaje;
              setMensaje(r.datos.mensaje);
              router.refresh();
              return null;
            }}
          />
        ))}
      </div>
      {mensaje && <p className="text-sm text-emerald-800" role="status">{mensaje}</p>}
    </div>
  );
}
