'use client';

/**
 * Ventas y Compras (6.11): pestaña Ingreso (importador y registro manual) y
 * pestaña Visualización (tabla editable con filtros y vista de importaciones).
 */
import { Filter, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Aviso } from '@/components/aviso';
import { Importador } from '@/components/importador';
import { TablaOTarjetas } from '@/components/tabla-o-tarjetas';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { enviarJson } from '@/lib/cliente-api';
import type { MovimientoDetalle, Origen } from '@/lib/datos';
import type { FechaISO } from '@/lib/fechas';
import { formatoCantidad, formatoFecha, formatoPesos } from '@/lib/formato';
import { textoConfirmacionEliminar } from '@/lib/importar/textos';
import { parsearCantidad, parsearCosto } from '@/lib/importar/parseo';
import { cn } from '@/lib/utils';

type Tipo = 'venta' | 'compra';

export interface ProductoOpcion {
  id: string;
  nombre: string;
}

export interface ImportacionVista {
  id: string;
  nombreArchivo: string;
  creadaEnTexto: string;
  filasActuales: number;
}

const TEXTO_ORIGEN: Record<Origen, string> = { manual: 'Manual', importacion: 'Importación', pedido: 'Pedido' };
const MAX_FILAS_VISIBLES = 200;
const TODOS = 'todos';

function tabla(tipo: Tipo) {
  return tipo === 'venta' ? 'ventas' : 'compras';
}

// ---------------------------------------------------------------------
// Registro manual
// ---------------------------------------------------------------------

function RegistroManual({ tipo, productos, hoy }: { tipo: Tipo; productos: ProductoOpcion[]; hoy: FechaISO }) {
  const router = useRouter();
  const [productoId, setProductoId] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    const cant = parsearCantidad(cantidad);
    const cost = parsearCosto(costo);
    if (!productoId) return setMensaje({ tipo: 'error', texto: 'Elija un producto.' });
    if (!cant.ok) return setMensaje({ tipo: 'error', texto: 'Escriba una cantidad mayor que cero, por ejemplo 12 o 12,5.' });
    if (tipo === 'compra' && !cost.ok) return setMensaje({ tipo: 'error', texto: 'El costo no es un número. Déjelo vacío si no lo sabe.' });
    setEnviando(true);
    const r = await enviarJson(`/api/${tabla(tipo)}`, 'POST', {
      producto_id: productoId,
      fecha,
      cantidad: cant.valor,
      ...(tipo === 'compra' ? { costo_unitario: cost.ok ? cost.valor : null } : {}),
    });
    setEnviando(false);
    if (!r.ok) return setMensaje({ tipo: 'error', texto: r.mensaje });
    setMensaje({ tipo: 'exito', texto: tipo === 'venta' ? 'Venta registrada.' : 'Compra registrada.' });
    setCantidad('');
    setCosto('');
    router.refresh();
  }

  return (
    <form onSubmit={registrar} className="flex flex-col gap-3 rounded-lg border p-4" aria-label={`Registrar ${tipo} manual`}>
      <h3 className="font-semibold">Registrar una {tipo} a mano</h3>
      {productos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay productos. Importe un archivo para crearlos.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor={`producto-${tipo}`}>Producto</Label>
            <Select value={productoId} onValueChange={setProductoId}>
              <SelectTrigger id={`producto-${tipo}`} className="w-full">
                <SelectValue placeholder="Elija un producto" />
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`fecha-${tipo}`}>Fecha</Label>
            <Input id={`fecha-${tipo}`} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cantidad-${tipo}`}>Cantidad</Label>
            <Input id={`cantidad-${tipo}`} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="12,5" required />
          </div>
          {tipo === 'compra' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="costo-compra">Costo unitario (opcional)</Label>
              <Input id="costo-compra" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$890" />
            </div>
          )}
        </div>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {productos.length > 0 && (
        <Button type="submit" disabled={enviando} className="self-start">
          Registrar
        </Button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------
// Edición y borrado de una fila
// ---------------------------------------------------------------------

function EditarMovimiento({ tipo, fila, nombre, hoy }: { tipo: Tipo; fila: MovimientoDetalle; nombre: string; hoy: FechaISO }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(fila.fecha);
  const [cantidad, setCantidad] = useState(formatoCantidad(fila.cantidad));
  const [costo, setCosto] = useState(fila.costoUnitario === null ? '' : formatoCantidad(fila.costoUnitario));
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const cant = parsearCantidad(cantidad);
    const cost = parsearCosto(costo);
    if (!cant.ok) return setError('Escriba una cantidad mayor que cero.');
    if (tipo === 'compra' && !cost.ok) return setError('El costo no es un número.');
    const r = await enviarJson(`/api/${tabla(tipo)}`, 'PATCH', {
      id: fila.id,
      fecha,
      cantidad: cant.valor,
      ...(tipo === 'compra' ? { costo_unitario: cost.ok ? cost.valor : null } : {}),
    });
    if (!r.ok) return setError(r.mensaje);
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="icon" aria-label={`Editar ${tipo} de ${nombre}`} onClick={() => setAbierto(true)}>
        <Pencil aria-hidden="true" />
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {tipo}</DialogTitle>
            <DialogDescription>{nombre}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`editar-fecha-${fila.id}`}>Fecha</Label>
              <Input id={`editar-fecha-${fila.id}`} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`editar-cantidad-${fila.id}`}>Cantidad</Label>
              <Input id={`editar-cantidad-${fila.id}`} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
            {tipo === 'compra' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`editar-costo-${fila.id}`}>Costo unitario</Label>
                <Input id={`editar-costo-${fila.id}`} inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
              </div>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
          </div>
          <DialogFooter>
            <Button onClick={guardar}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EliminarMovimiento({ tipo, fila, nombre }: { tipo: Tipo; fila: MovimientoDetalle; nombre: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    const r = await enviarJson(`/api/${tabla(tipo)}?id=${fila.id}`, 'DELETE');
    if (!r.ok) return setError(r.mensaje);
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label={`Eliminar ${tipo} de ${nombre}`}>
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar esta {tipo}?</AlertDialogTitle>
          <AlertDialogDescription>
            {nombre}: {formatoCantidad(fila.cantidad)} el {formatoFecha(fila.fecha)}. El stock se recalcula solo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={eliminar}>Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------
// Visualización con filtros
// ---------------------------------------------------------------------

function Visualizacion({
  tipo,
  filas,
  productos,
  hoy,
}: {
  tipo: Tipo;
  filas: MovimientoDetalle[];
  productos: ProductoOpcion[];
  hoy: FechaISO;
}) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [producto, setProducto] = useState(TODOS);
  const [origen, setOrigen] = useState(TODOS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const nombres = useMemo(() => new Map(productos.map((p) => [p.id, p.nombre])), [productos]);

  const filtradas = filas.filter(
    (f) =>
      (desde === '' || f.fecha >= desde) &&
      (hasta === '' || f.fecha <= hasta) &&
      (producto === TODOS || f.productoId === producto) &&
      (origen === TODOS || f.origen === origen),
  );
  const visibles = filtradas.slice(0, MAX_FILAS_VISIBLES);
  const nombre = (f: MovimientoDetalle) => nombres.get(f.productoId) ?? 'Producto';
  const acciones = (f: MovimientoDetalle) => (
    <div className="flex gap-2">
      <EditarMovimiento tipo={tipo} fila={f} nombre={nombre(f)} hoy={hoy} />
      <EliminarMovimiento tipo={tipo} fila={f} nombre={nombre(f)} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" className="self-start md:hidden" onClick={() => setFiltrosAbiertos((v) => !v)} aria-expanded={filtrosAbiertos}>
        <Filter aria-hidden="true" /> Filtros
      </Button>
      <div className={cn('grid gap-3 md:grid md:grid-cols-4', filtrosAbiertos ? 'grid' : 'hidden')}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`desde-${tipo}`}>Desde</Label>
          <Input id={`desde-${tipo}`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`hasta-${tipo}`}>Hasta</Label>
          <Input id={`hasta-${tipo}`} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`filtro-producto-${tipo}`}>Producto</Label>
          <Select value={producto} onValueChange={setProducto}>
            <SelectTrigger id={`filtro-producto-${tipo}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS} className="min-h-11">Todos</SelectItem>
              {productos.map((p) => (
                <SelectItem key={p.id} value={p.id} className="min-h-11">
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`filtro-origen-${tipo}`}>Origen</Label>
          <Select value={origen} onValueChange={setOrigen}>
            <SelectTrigger id={`filtro-origen-${tipo}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS} className="min-h-11">Todos</SelectItem>
              {(Object.keys(TEXTO_ORIGEN) as Origen[]).map((o) => (
                <SelectItem key={o} value={o} className="min-h-11">
                  {TEXTO_ORIGEN[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtradas.length === visibles.length
          ? `${filtradas.length} ${filtradas.length === 1 ? 'fila' : 'filas'}`
          : `Se muestran las ${visibles.length} más recientes de ${filtradas.length}. Use los filtros para ver otras.`}
      </p>

      <TablaOTarjetas
        etiqueta={`Lista de ${tabla(tipo)}`}
        filas={visibles}
        clave={(f) => f.id}
        vacio={filas.length === 0 ? `Todavía no hay ${tabla(tipo)}.` : 'Ninguna fila coincide con los filtros.'}
        columnas={[
          { titulo: 'Fecha', celda: (f) => formatoFecha(f.fecha) },
          { titulo: 'Producto', celda: nombre },
          { titulo: 'Cantidad', celda: (f) => formatoCantidad(f.cantidad), className: 'text-right' },
          ...(tipo === 'compra'
            ? [{ titulo: 'Costo', celda: (f: MovimientoDetalle) => (f.costoUnitario === null ? '—' : formatoPesos(f.costoUnitario)), className: 'text-right' }]
            : []),
          { titulo: 'Origen', celda: (f) => TEXTO_ORIGEN[f.origen] },
          { titulo: 'Acciones', celda: acciones },
        ]}
        tarjeta={(f) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{nombre(f)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatoFecha(f.fecha)} · {TEXTO_ORIGEN[f.origen]}
                </p>
              </div>
              <p className="shrink-0 text-lg font-semibold">{formatoCantidad(f.cantidad)}</p>
            </div>
            {acciones(f)}
          </div>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Importaciones agrupadas
// ---------------------------------------------------------------------

function EliminarImportacion({ importacion }: { importacion: ImportacionVista }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    const r = await enviarJson(`/api/importaciones?id=${importacion.id}`, 'DELETE');
    if (!r.ok) return setError(r.mensaje);
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 aria-hidden="true" /> Eliminar importación
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar «{importacion.nombreArchivo}»?</AlertDialogTitle>
          <AlertDialogDescription>{textoConfirmacionEliminar(importacion.filasActuales)}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={eliminar}>Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ListaImportaciones({ tipo, importaciones }: { tipo: Tipo; importaciones: ImportacionVista[] }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Importaciones">
      <h3 className="font-semibold">Importaciones</h3>
      <TablaOTarjetas
        etiqueta="Importaciones"
        filas={importaciones}
        clave={(i) => i.id}
        vacio={`Todavía no hay importaciones de ${tabla(tipo)}.`}
        columnas={[
          { titulo: 'Archivo', celda: (i) => <span className="break-all">{i.nombreArchivo}</span> },
          { titulo: 'Fecha', celda: (i) => i.creadaEnTexto },
          { titulo: 'Tipo', celda: () => (tipo === 'venta' ? 'Ventas' : 'Compras') },
          { titulo: 'Filas', celda: (i) => i.filasActuales, className: 'text-right' },
          { titulo: 'Acciones', celda: (i) => <EliminarImportacion importacion={i} /> },
        ]}
        tarjeta={(i) => (
          <div className="flex flex-col gap-2">
            <p className="font-medium break-all">{i.nombreArchivo}</p>
            <p className="text-sm text-muted-foreground">
              {i.creadaEnTexto} · {tipo === 'venta' ? 'Ventas' : 'Compras'} · {i.filasActuales} {i.filasActuales === 1 ? 'fila' : 'filas'}
            </p>
            <EliminarImportacion importacion={i} />
          </div>
        )}
      />
    </section>
  );
}

// ---------------------------------------------------------------------

export function PaginaMovimientos({
  tipo,
  filas,
  productos,
  importaciones,
  hoy,
}: {
  tipo: Tipo;
  filas: MovimientoDetalle[];
  productos: ProductoOpcion[];
  importaciones: ImportacionVista[];
  hoy: FechaISO;
}) {
  return (
    <Tabs defaultValue="ingreso" className="flex flex-col gap-4">
      <TabsList className="w-full md:w-fit">
        <TabsTrigger value="ingreso" className="min-h-10 flex-1 md:flex-none">
          Ingreso
        </TabsTrigger>
        <TabsTrigger value="visualizacion" className="min-h-10 flex-1 md:flex-none">
          Visualización
        </TabsTrigger>
      </TabsList>
      <TabsContent value="ingreso" className="flex flex-col gap-6">
        <Importador tipo={tipo} />
        <RegistroManual tipo={tipo} productos={productos} hoy={hoy} />
      </TabsContent>
      <TabsContent value="visualizacion" className="flex flex-col gap-6">
        <Visualizacion tipo={tipo} filas={filas} productos={productos} hoy={hoy} />
        <ListaImportaciones tipo={tipo} importaciones={importaciones} />
      </TabsContent>
    </Tabs>
  );
}
