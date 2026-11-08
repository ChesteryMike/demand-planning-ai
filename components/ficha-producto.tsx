'use client';

/**
 * Ficha de edición de un producto (6.11). Al guardar, datos_incompletos pasa
 * a false. El stock no se edita: se registra un ajuste de inventario.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso } from '@/components/aviso';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { enviarJson } from '@/lib/cliente-api';
import type { ProductoFicha } from '@/lib/datos';
import type { FechaISO } from '@/lib/fechas';
import { formatoCantidad } from '@/lib/formato';
import { parsearCantidad, parsearCosto } from '@/lib/importar/parseo';

type Mensaje = { tipo: 'exito' | 'error'; texto: string } | null;

function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function entero(texto: string): number | null {
  return /^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null;
}

// ---------------------------------------------------------------------

function AjusteInventario({ producto, stockActual, hoy }: { producto: ProductoFicha; stockActual: number; hoy: FechaISO }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<'conteo' | 'merma' | 'otro'>('conteo');
  const [sentido, setSentido] = useState<'suma' | 'resta'>('suma');
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function registrar() {
    const numero = motivo === 'conteo' ? (valor.trim() === '0' ? { ok: true as const, valor: 0 } : parsearCantidad(valor)) : parsearCantidad(valor);
    if (!numero.ok) return setError('Escriba un número válido, por ejemplo 12 o 12,5.');
    // Conteo: se ingresa lo contado y el ajuste es la diferencia con el stock calculado.
    const cantidad =
      motivo === 'conteo' ? Math.round((numero.valor - stockActual) * 1000) / 1000 : motivo === 'merma' || sentido === 'resta' ? -numero.valor : numero.valor;
    if (cantidad === 0) return setError('El conteo coincide con el stock calculado: no hay nada que ajustar.');
    const r = await enviarJson('/api/ajustes', 'POST', { producto_id: producto.id, fecha, cantidad, motivo, nota: nota || null });
    if (!r.ok) return setError(r.mensaje);
    setAbierto(false);
    setValor('');
    setNota('');
    setError(null);
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline">Registrar ajuste de inventario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste de inventario</DialogTitle>
          <DialogDescription>
            Stock calculado hoy: {formatoCantidad(stockActual)} {producto.unidad}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Campo id="motivo-ajuste" etiqueta="Motivo">
            <Select value={motivo} onValueChange={(v) => setMotivo(v as typeof motivo)}>
              <SelectTrigger id="motivo-ajuste" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conteo" className="min-h-11">Conteo físico</SelectItem>
                <SelectItem value="merma" className="min-h-11">Merma (producto perdido o vencido)</SelectItem>
                <SelectItem value="otro" className="min-h-11">Otro</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          {motivo === 'otro' && (
            <Campo id="sentido-ajuste" etiqueta="El ajuste">
              <Select value={sentido} onValueChange={(v) => setSentido(v as typeof sentido)}>
                <SelectTrigger id="sentido-ajuste" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suma" className="min-h-11">Suma al stock</SelectItem>
                  <SelectItem value="resta" className="min-h-11">Resta del stock</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          )}
          <Campo id="valor-ajuste" etiqueta={motivo === 'conteo' ? 'Stock contado' : motivo === 'merma' ? 'Cantidad perdida' : 'Cantidad'}>
            <Input id="valor-ajuste" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <Campo id="fecha-ajuste" etiqueta="Fecha">
            <Input id="fecha-ajuste" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo id="nota-ajuste" etiqueta="Nota (opcional)">
            <Input id="nota-ajuste" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
        <DialogFooter>
          <Button onClick={registrar}>Registrar ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------

export function FichaProducto({
  producto,
  stockActual,
  advertencias,
  hoy,
}: {
  producto: ProductoFicha;
  stockActual: number;
  advertencias: string[];
  hoy: FechaISO;
}) {
  const router = useRouter();
  const [unidad, setUnidad] = useState(producto.unidad);
  const [categoria, setCategoria] = useState(producto.categoria ?? '');
  const [perecible, setPerecible] = useState(producto.perecible);
  const [vida, setVida] = useState(producto.diasVidaUtil === null ? '' : String(producto.diasVidaUtil));
  const [costo, setCosto] = useState(formatoCantidad(producto.costo));
  const [precio, setPrecio] = useState(formatoCantidad(producto.precio));
  const [entrega, setEntrega] = useState(String(producto.diasEntregaProveedor));
  const [colchon, setColchon] = useState(String(producto.diasColchon));
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const c = parsearCosto(costo);
    const p = parsearCosto(precio);
    const e2 = entero(entrega);
    const c2 = entero(colchon);
    const v = perecible ? entero(vida) : null;
    if (!c.ok || c.valor === null) return setMensaje({ tipo: 'error', texto: 'Escriba el costo como número, por ejemplo 890.' });
    if (!p.ok || p.valor === null) return setMensaje({ tipo: 'error', texto: 'Escriba el precio como número, por ejemplo 1.190.' });
    if (e2 === null || c2 === null) return setMensaje({ tipo: 'error', texto: 'Los días de entrega y de reserva deben ser números enteros (0 o más).' });
    if (perecible && (v === null || v < 1)) return setMensaje({ tipo: 'error', texto: 'Indique cuántos días dura el producto (1 o más).' });

    setEnviando(true);
    const r = await enviarJson('/api/productos', 'PATCH', {
      id: producto.id,
      unidad,
      categoria: categoria.trim() === '' ? null : categoria,
      perecible,
      dias_vida_util: perecible ? v : null,
      costo: c.valor,
      precio: p.valor,
      dias_entrega_proveedor: e2,
      dias_colchon: c2,
    });
    setEnviando(false);
    if (!r.ok) return setMensaje({ tipo: 'error', texto: r.mensaje });
    setMensaje({ tipo: 'exito', texto: 'Datos guardados.' });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Stock">
        <p>
          <span className="text-muted-foreground">Stock actual: </span>
          <span className="text-xl font-semibold">
            {formatoCantidad(stockActual)} {producto.unidad}
          </span>
        </p>
        {advertencias.map((a) => (
          <Aviso key={a} tipo="advertencia">
            {a}
          </Aviso>
        ))}
        <div>
          <AjusteInventario producto={producto} stockActual={stockActual} hoy={hoy} />
        </div>
      </section>

      <form onSubmit={guardar} className="flex flex-col gap-4 rounded-lg border p-4" aria-label="Datos del producto">
        <h2 className="font-semibold">Datos del producto</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="unidad" etiqueta="Unidad" ayuda="Por ejemplo: un, kg, lt.">
            <Input id="unidad" value={unidad} maxLength={20} onChange={(e) => setUnidad(e.target.value)} required />
          </Campo>
          <Campo id="categoria" etiqueta="Categoría">
            <Input id="categoria" value={categoria} maxLength={60} onChange={(e) => setCategoria(e.target.value)} />
          </Campo>
          <Campo id="costo" etiqueta="Costo unitario ($)">
            <Input id="costo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </Campo>
          <Campo id="precio" etiqueta="Precio de venta ($)">
            <Input id="precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </Campo>
          <Campo id="entrega" etiqueta="Días que demora el proveedor en entregar" ayuda="0 si lo produce usted el mismo día.">
            <Input id="entrega" inputMode="numeric" value={entrega} onChange={(e) => setEntrega(e.target.value)} />
          </Campo>
          <Campo id="colchon" etiqueta="Días de reserva que quiere tener" ayuda="Stock de seguridad, además de la entrega.">
            <Input id="colchon" inputMode="numeric" value={colchon} onChange={(e) => setColchon(e.target.value)} />
          </Campo>
        </div>
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox id="perecible" checked={perecible} onCheckedChange={(v) => setPerecible(v === true)} className="size-6" />
          <Label htmlFor="perecible">Es perecible (vence)</Label>
        </div>
        {perecible && (
          <Campo id="vida" etiqueta="¿Cuántos días dura en buen estado?">
            <Input id="vida" inputMode="numeric" value={vida} onChange={(e) => setVida(e.target.value)} />
          </Campo>
        )}
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <Button type="submit" disabled={enviando} className="self-start">
          Guardar datos
        </Button>
      </form>
    </div>
  );
}
