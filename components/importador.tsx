'use client';

/**
 * Importador (6.9 y 6.12).
 *   1. Leer el archivo (Excel/CSV sin IA) o el texto (PDF/Word/TXT/pegado → Normalizador).
 *   2. Vista previa: filas válidas, excluidas con su motivo, productos nuevos
 *      "Se crearán", avisos de nombres parecidos y de Coherencia.
 *   3. Un solo botón Guardar (fijo al pie) y, siempre visible junto a los
 *      productos nuevos, la opción "No crearlos".
 * Nunca queda una importación bloqueada sin un mensaje que explique por qué.
 */
import { FileUp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Aviso } from '@/components/aviso';
import { TablaOTarjetas } from '@/components/tabla-o-tarjetas';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { enviarJson, llamarApi } from '@/lib/cliente-api';
import { formatoCantidad, formatoFecha } from '@/lib/formato';
import type { ResultadoCoherencia } from '@/lib/importar/coherencia';
import type { EnlaceProducto } from '@/lib/importar/guardar';
import { normalizarNombre, type FilaExcluida, type FilaLista, type FilaValida, type ResultadoCruce } from '@/lib/importar/mapeo';
import { cn } from '@/lib/utils';

type Tipo = 'venta' | 'compra';

interface Lectura {
  validas: FilaValida[];
  excluidas: FilaExcluida[];
  advertencias: string[];
}

type RespuestaLeer = ({ modo: 'hoja' } & Lectura) | { modo: 'texto'; texto: string };
interface RespuestaGuardar {
  mensaje: string;
  productosCreados: EnlaceProducto[];
  noGuardadas: FilaExcluida[];
}

const MAX_FILAS_VISTA = 100;

export function Importador({ tipo }: { tipo: Tipo }) {
  const router = useRouter();
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<RespuestaGuardar | null>(null);

  const [nombreArchivo, setNombreArchivo] = useState('');
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [cruce, setCruce] = useState<ResultadoCruce | null>(null);
  const [crear, setCrear] = useState(true);
  const [asociaciones, setAsociaciones] = useState<Record<string, string>>({});
  const [coherencia, setCoherencia] = useState<ResultadoCoherencia | 'revisando' | null>(null);
  const [descartadas, setDescartadas] = useState<Set<number>>(new Set());

  const palabra = tipo === 'venta' ? 'ventas' : 'compras';

  function reiniciar() {
    setLectura(null);
    setCruce(null);
    setCrear(true);
    setAsociaciones({});
    setCoherencia(null);
    setDescartadas(new Set());
  }

  async function cruzar(validas: FilaValida[], crearNuevos: boolean, asoc: Record<string, string>) {
    const r = await enviarJson<ResultadoCruce>('/api/importaciones', 'POST', {
      accion: 'cruzar',
      tipo,
      validas,
      crearProductosNuevos: crearNuevos,
      asociaciones: asoc,
    });
    if (!r.ok) {
      setError(r.mensaje);
      return null;
    }
    setCruce(r.datos);
    return r.datos;
  }

  async function revisarCoherencia(resultado: ResultadoCruce) {
    const nuevos = [...resultado.productosNuevos, ...resultado.productosNoEncontrados].map((p) => p.nombre);
    if (nuevos.length === 0) return setCoherencia(null);
    setCoherencia('revisando');
    const r = await enviarJson<ResultadoCoherencia>('/api/agentes/coherencia', 'POST', { nuevos });
    setCoherencia(r.ok ? r.datos : { estado: 'fallo', mensaje: 'No se pudo revisar la coherencia del catálogo.' });
  }

  async function mostrarVistaPrevia(datos: Lectura, nombre: string) {
    reiniciar();
    setNombreArchivo(nombre);
    setLectura(datos);
    const resultado = await cruzar(datos.validas, true, {});
    if (resultado) void revisarCoherencia(resultado);
  }

  async function normalizar(textoLeido: string, nombre: string) {
    setOcupado('Leyendo el texto con IA…');
    const r = await enviarJson<Lectura>('/api/agentes/normalizar', 'POST', { texto: textoLeido, tipo });
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    await mostrarVistaPrevia(r.datos, nombre);
  }

  async function leerArchivo(archivo: File) {
    setError(null);
    setExito(null);
    setOcupado('Leyendo el archivo…');
    try {
      const formulario = new FormData();
      formulario.set('accion', 'leer');
      formulario.set('tipo', tipo);
      formulario.set('archivo', archivo);
      const r = await llamarApi<RespuestaLeer>('/api/importaciones', { method: 'POST', body: formulario });
      if (!r.ok) return setError(r.mensaje);
      if (r.datos.modo === 'texto') await normalizar(r.datos.texto, archivo.name);
      else await mostrarVistaPrevia(r.datos, archivo.name);
    } finally {
      setOcupado(null);
      if (entradaArchivo.current) entradaArchivo.current.value = '';
    }
  }

  async function leerTexto() {
    setError(null);
    setExito(null);
    try {
      await normalizar(texto, `Texto pegado (${formatoFecha(new Date().toISOString().slice(0, 10))})`);
    } finally {
      setOcupado(null);
    }
  }

  async function cambiarCrear(valor: boolean) {
    if (!lectura) return;
    setCrear(valor);
    setOcupado('Actualizando la vista previa…');
    await cruzar(lectura.validas, valor, asociaciones);
    setOcupado(null);
  }

  async function asociar(nombreNormalizado: string, productoId: string) {
    if (!lectura) return;
    const nuevas = { ...asociaciones, [nombreNormalizado]: productoId };
    setAsociaciones(nuevas);
    setOcupado('Actualizando la vista previa…');
    await cruzar(lectura.validas, crear, nuevas);
    setOcupado(null);
  }

  function alternarDescarte(numeros: number[], descartar: boolean) {
    setDescartadas((previas) => {
      const siguiente = new Set(previas);
      for (const n of numeros) {
        if (descartar) siguiente.add(n);
        else siguiente.delete(n);
      }
      return siguiente;
    });
  }

  async function guardar() {
    if (!lectura) return;
    setError(null);
    setOcupado('Guardando…');
    const r = await enviarJson<RespuestaGuardar>('/api/importaciones', 'POST', {
      accion: 'guardar',
      tipo,
      nombreArchivo,
      validas: lectura.validas,
      crearProductosNuevos: crear,
      asociaciones,
      descartadas: [...descartadas],
    });
    setOcupado(null);
    if (!r.ok) return setError(r.mensaje);
    setExito(r.datos);
    setTexto('');
    reiniciar();
    router.refresh();
  }

  const listas: FilaLista[] = cruce?.listas.filter((f) => !descartadas.has(f.numero)) ?? [];
  const ajenos = coherencia && coherencia !== 'revisando' && coherencia.estado === 'revisada' ? coherencia.productosAjenos : [];
  const productosNuevos = cruce ? (crear ? cruce.productosNuevos : cruce.productosNoEncontrados) : [];

  return (
    <section aria-label={`Importar ${palabra}`} className={cn('flex flex-col gap-4', lectura && 'pb-24')}>
      {exito && (
        <Aviso tipo="exito">
          <p className="font-medium">{exito.mensaje}</p>
          {exito.productosCreados.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {exito.productosCreados.map((p) => (
                <li key={p.id}>
                  <Link href={p.href} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                    Completar datos de «{p.nombre}»
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {exito.noGuardadas.length > 0 && (
            <p className="mt-2">No se guardaron {exito.noGuardadas.length} filas de productos que no existen en su lista.</p>
          )}
        </Aviso>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {!lectura && (
        <div className="grid gap-4 md:grid-cols-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              const archivo = e.dataTransfer.files[0];
              if (archivo) void leerArchivo(archivo);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center',
              arrastrando && 'border-primary bg-muted',
            )}
          >
            <FileUp className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Excel, CSV, PDF, Word o TXT. <span className="hidden md:inline">Arrástrelo aquí o elíjalo.</span>
            </p>
            <input
              ref={entradaArchivo}
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.pdf,.docx"
              className="sr-only"
              id={`archivo-${tipo}`}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void leerArchivo(archivo);
              }}
            />
            <Button type="button" onClick={() => entradaArchivo.current?.click()} disabled={ocupado !== null}>
              Elegir archivo
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`texto-${tipo}`}>O pegue el texto (por ejemplo, desde WhatsApp)</Label>
            <Textarea
              id={`texto-${tipo}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder="03-03-2026 Marraqueta 45"
            />
            <Button type="button" variant="outline" onClick={leerTexto} disabled={ocupado !== null || texto.trim() === ''}>
              Leer texto
            </Button>
          </div>
        </div>
      )}

      {ocupado && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {ocupado}
        </p>
      )}

      {lectura && cruce && (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">Vista previa: {nombreArchivo}</h3>

          {lectura.advertencias.length > 0 && (
            <Aviso tipo="advertencia">
              <ul className="list-disc pl-5">
                {lectura.advertencias.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Aviso>
          )}

          {productosNuevos.length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="font-medium">
                {crear ? 'Productos nuevos: se crearán' : 'Productos que no existen en su lista: no se crearán'}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {productosNuevos.map((p) => (
                  <li key={p.nombreNormalizado} className="rounded-full bg-muted px-3 py-1 text-sm">
                    {p.nombre} ({p.filas} {p.filas === 1 ? 'fila' : 'filas'}){crear ? ' · Se crearán' : ''}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex min-h-11 items-center gap-3">
                <Checkbox
                  id={`no-crear-${tipo}`}
                  checked={!crear}
                  onCheckedChange={(v) => void cambiarCrear(v !== true)}
                  className="size-6"
                />
                <Label htmlFor={`no-crear-${tipo}`}>No crearlos (sus filas no se guardarán)</Label>
              </div>
            </div>
          )}

          {cruce.avisosParecidos.map((a) => (
            <Aviso key={`${a.nombreNormalizado}-${a.parecidoA.id}`} tipo="advertencia" className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <span>
                «{a.nombre}»: {a.mensaje}
              </span>
              <Button size="sm" variant="outline" onClick={() => void asociar(a.nombreNormalizado, a.parecidoA.id)}>
                Sí, es «{a.parecidoA.nombre}»
              </Button>
            </Aviso>
          ))}

          {coherencia === 'revisando' && <p className="text-sm text-muted-foreground">Revisando si los productos nuevos encajan con su catálogo…</p>}
          {coherencia && coherencia !== 'revisando' && coherencia.estado === 'fallo' && <Aviso>{coherencia.mensaje}</Aviso>}
          {coherencia && coherencia !== 'revisando' && coherencia.estado === 'revisada' && coherencia.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}
          {ajenos.map((p) => {
            const numeros = (cruce.listas ?? []).filter((f) => f.nombreNormalizado === normalizarNombre(p.nombre)).map((f) => f.numero);
            const descartado = numeros.length > 0 && numeros.every((n) => descartadas.has(n));
            return (
              <Aviso key={p.nombre} tipo="advertencia" className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <span>
                  ¿«{p.nombre}» es de su negocio? {p.motivo}
                </span>
                {numeros.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => alternarDescarte(numeros, !descartado)}>
                    {descartado ? 'Volver a incluir sus filas' : 'Descartar sus filas'}
                  </Button>
                )}
              </Aviso>
            );
          })}

          <div>
            <h4 className="mb-2 font-medium">
              Filas que se guardarán: {listas.length}
              {listas.length > MAX_FILAS_VISTA && ` (se muestran las primeras ${MAX_FILAS_VISTA})`}
            </h4>
            <TablaOTarjetas
              etiqueta="Filas que se guardarán"
              filas={listas.slice(0, MAX_FILAS_VISTA)}
              clave={(f) => String(f.numero)}
              vacio="Ninguna fila se guardará. Revise los motivos de abajo."
              columnas={[
                { titulo: 'Fecha', celda: (f) => formatoFecha(f.fecha) },
                { titulo: 'Producto', celda: (f) => <>{f.producto}{f.productoId === null && <span className="ml-2 text-xs text-muted-foreground">(nuevo)</span>}</> },
                { titulo: 'Cantidad', celda: (f) => formatoCantidad(f.cantidad), className: 'text-right' },
                ...(tipo === 'compra' ? [{ titulo: 'Costo', celda: (f: FilaLista) => (f.costoUnitario === null ? '—' : `$${formatoCantidad(f.costoUnitario)}`), className: 'text-right' }] : []),
              ]}
              tarjeta={(f) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{f.producto}{f.productoId === null && <span className="ml-2 text-xs text-muted-foreground">(nuevo)</span>}</p>
                    <p className="text-sm text-muted-foreground">{formatoFecha(f.fecha)}</p>
                  </div>
                  <p className="shrink-0 font-semibold">{formatoCantidad(f.cantidad)}</p>
                </div>
              )}
            />
          </div>

          {(lectura.excluidas.length > 0 || cruce.conProblema.length > 0) && (
            <div>
              <h4 className="mb-2 font-medium">Filas que no se guardarán: {lectura.excluidas.length + cruce.conProblema.length}</h4>
              <ul className="flex flex-col gap-1 text-sm">
                {[...lectura.excluidas, ...cruce.conProblema].map((e) => (
                  <li key={`${e.numero}-${e.motivo}`} className="rounded-md bg-red-50 px-3 py-2 text-red-900">
                    {e.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-end gap-2">
              <Button variant="outline" onClick={reiniciar} disabled={ocupado !== null}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={ocupado !== null || listas.length === 0}>
                Guardar {listas.length} {listas.length === 1 ? 'fila' : 'filas'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
