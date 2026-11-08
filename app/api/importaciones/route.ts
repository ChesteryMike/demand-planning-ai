/**
 * Importaciones (6.9). Pasos del importador:
 *   POST multipart  accion=leer     archivo → hoja (mapeo determinista, sin IA) o texto (→ Normalizador)
 *   POST JSON       accion=cruzar   filas válidas → cruce con el catálogo (vista previa)
 *   POST JSON       accion=guardar  filas válidas → se vuelven a cruzar EN EL SERVIDOR y se guardan
 *   DELETE ?id=                     elimina la importación completa (sus filas caen por cascada)
 * El navegador nunca envía ids de producto confiables: el cruce se repite al guardar.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_GENERAL,
  esquemaFecha,
  esquemaId,
  iniciarEscritura,
  leerJson,
  respuestaError,
} from '@/lib/api';
import { hoyEnChile } from '@/lib/fechas';
import { leerCatalogo } from '@/lib/importar/catalogo';
import { eliminarImportacion, guardarImportacion } from '@/lib/importar/guardar';
import { leerArchivo } from '@/lib/importar/lector';
import {
  cruzarNombres,
  detectarColumnas,
  filasDesdeHoja,
  limpiarNombre,
  normalizarNombre,
  validarFilas,
  type FilaValida,
} from '@/lib/importar/mapeo';

const RUTA = 'api/importaciones';
const MAX_FILAS = 5000;

const esquemaTipo = z.enum(['venta', 'compra']);

/** Filas válidas que devuelve el navegador. El nombre normalizado se recalcula aquí. */
const esquemaFilas = z
  .array(
    z.object({
      numero: z.number().int().min(0),
      fecha: esquemaFecha,
      producto: z.string().trim().min(1).max(200),
      cantidad: z.number().positive().max(1_000_000_000),
      costoUnitario: z.number().min(0).max(1_000_000_000).nullable(),
    }),
  )
  .max(MAX_FILAS);

const esquemaOpciones = {
  tipo: esquemaTipo,
  validas: esquemaFilas,
  crearProductosNuevos: z.boolean().default(true),
  asociaciones: z.record(z.string(), esquemaId).default({}),
};

const esquemaCruzar = z.object({ accion: z.literal('cruzar'), ...esquemaOpciones });
const esquemaGuardar = z.object({
  accion: z.literal('guardar'),
  ...esquemaOpciones,
  nombreArchivo: z.string().trim().min(1).max(200),
  /** Números de fila que el usuario descartó (p. ej. por el aviso de Coherencia). */
  descartadas: z.array(z.number().int()).default([]),
});

function aFilasValidas(filas: z.infer<typeof esquemaFilas>, tipo: 'venta' | 'compra'): FilaValida[] {
  return filas.map((f) => {
    const producto = limpiarNombre(f.producto);
    return {
      numero: f.numero,
      fecha: f.fecha,
      producto,
      nombreNormalizado: normalizarNombre(producto),
      cantidad: f.cantidad,
      costoUnitario: tipo === 'compra' ? f.costoUnitario : null,
    };
  });
}

async function leer(request: Request): Promise<NextResponse> {
  const formulario = await request.formData().catch(() => null);
  const archivo = formulario?.get('archivo');
  const tipo = esquemaTipo.safeParse(formulario?.get('tipo'));
  if (!(archivo instanceof File) || !tipo.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

  const lectura = await leerArchivo(archivo.name, new Uint8Array(await archivo.arrayBuffer()));
  if (!lectura.ok) return respuestaError(400, lectura.mensaje);

  if (lectura.contenido.tipo === 'texto') {
    return NextResponse.json({ modo: 'texto', texto: lectura.contenido.texto });
  }
  const [encabezados = [], ...filas] = lectura.contenido.filas;
  const columnas = detectarColumnas(encabezados, tipo.data);
  if (!columnas.ok) return respuestaError(400, columnas.mensaje);
  if (filas.length > MAX_FILAS) return respuestaError(400, `El archivo tiene más de ${MAX_FILAS} filas. Divídalo en partes.`);

  const resultado = validarFilas(filasDesdeHoja(filas, columnas.columnas), tipo.data);
  return NextResponse.json({ modo: 'hoja', ...resultado });
}

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, RUTA);
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) return leer(request);

  const cuerpo = await leerJson(request);
  const accion = (cuerpo as { accion?: unknown } | null)?.accion;

  try {
    if (accion === 'cruzar') {
      const entrada = esquemaCruzar.safeParse(cuerpo);
      if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);
      const { tipo, validas, crearProductosNuevos, asociaciones } = entrada.data;
      const catalogo = await leerCatalogo(db, negocio.businessId);
      return NextResponse.json(cruzarNombres(aFilasValidas(validas, tipo), catalogo, { crearProductosNuevos, asociaciones }));
    }

    if (accion === 'guardar') {
      const entrada = esquemaGuardar.safeParse(cuerpo);
      if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);
      const { tipo, validas, crearProductosNuevos, asociaciones, descartadas, nombreArchivo } = entrada.data;
      const descarte = new Set(descartadas);
      const filas = aFilasValidas(validas, tipo).filter((f) => !descarte.has(f.numero));
      const catalogo = await leerCatalogo(db, negocio.businessId);
      const cruce = cruzarNombres(filas, catalogo, { crearProductosNuevos, asociaciones });
      const resultado = await guardarImportacion(db, {
        businessId: negocio.businessId,
        tipo,
        nombreArchivo,
        fecha: hoyEnChile(),
        filas: cruce.listas,
        productosNuevos: cruce.productosNuevos,
      });
      if (!resultado.ok) return respuestaError(400, resultado.mensaje);
      return NextResponse.json({ ...resultado, noGuardadas: cruce.conProblema }, { status: 201 });
    }
  } catch {
    return respuestaError(500, MENSAJE_ERROR_GENERAL);
  }
  return respuestaError(400, MENSAJE_DATOS_INVALIDOS);
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, RUTA);
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const id = esquemaId.safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

  const resultado = await eliminarImportacion(db, negocio.businessId, id.data);
  if (!resultado.ok) return respuestaError(500, resultado.mensaje);
  if (!resultado.eliminada) return respuestaError(404, 'No se encontró la importación.');
  return NextResponse.json({ mensaje: 'Se eliminó la importación.' });
}
