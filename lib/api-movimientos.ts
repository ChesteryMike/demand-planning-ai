/**
 * Rutas de API de ventas y compras manuales (registrar, editar, eliminar).
 * Ventas y compras comparten la lógica; compras agrega el costo unitario.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_GENERAL,
  MENSAJE_NO_ENCONTRADO,
  esquemaFecha,
  esquemaId,
  iniciarEscritura,
  leerJson,
  respuestaError,
} from './api';

type Tabla = 'ventas' | 'compras';

const cantidad = z.number().positive().max(1_000_000_000);
const costo = z.number().min(0).max(1_000_000_000).nullable();

export function crearRutasMovimiento(tabla: Tabla) {
  const ruta = `api/${tabla}`;

  // z.object descarta campos desconocidos: un business_id del cuerpo se ignora.
  const esquemaCrear = z.object({
    producto_id: esquemaId,
    fecha: esquemaFecha,
    cantidad,
    costo_unitario: tabla === 'compras' ? costo.optional() : z.undefined().optional(),
  });
  const esquemaEditar = z.object({
    id: esquemaId,
    fecha: esquemaFecha.optional(),
    cantidad: cantidad.optional(),
    costo_unitario: tabla === 'compras' ? costo.optional() : z.undefined().optional(),
  });

  async function POST(request: Request): Promise<NextResponse> {
    const inicio = await iniciarEscritura(request, ruta);
    if (!inicio.ok) return inicio.respuesta;
    const { negocio, db } = inicio.contexto;

    const entrada = esquemaCrear.safeParse(await leerJson(request));
    if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

    const fila = {
      business_id: negocio.businessId,
      producto_id: entrada.data.producto_id,
      fecha: entrada.data.fecha,
      cantidad: entrada.data.cantidad,
      origen: 'manual' as const,
      ...(tabla === 'compras' ? { costo_unitario: entrada.data.costo_unitario ?? null } : {}),
    };
    const { data, error } = await db.from(tabla).insert(fila).select('id').single();
    // La FK (producto_id, business_id) rechaza un producto de otro negocio.
    if (error) return respuestaError(400, 'El producto no existe en su lista.');
    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  async function PATCH(request: Request): Promise<NextResponse> {
    const inicio = await iniciarEscritura(request, ruta);
    if (!inicio.ok) return inicio.respuesta;
    const { negocio, db } = inicio.contexto;

    const entrada = esquemaEditar.safeParse(await leerJson(request));
    if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);
    const { id, ...cambios } = entrada.data;
    const limpios = Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined));
    if (Object.keys(limpios).length === 0) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

    const { data, error } = await db.from(tabla).update(limpios).eq('id', id).eq('business_id', negocio.businessId).select('id');
    if (error) return respuestaError(500, MENSAJE_ERROR_GENERAL);
    if (!data || data.length === 0) return respuestaError(404, MENSAJE_NO_ENCONTRADO);
    return NextResponse.json({ id });
  }

  async function DELETE(request: Request): Promise<NextResponse> {
    const inicio = await iniciarEscritura(request, ruta);
    if (!inicio.ok) return inicio.respuesta;
    const { negocio, db } = inicio.contexto;

    const id = esquemaId.safeParse(new URL(request.url).searchParams.get('id'));
    if (!id.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

    const { data, error } = await db.from(tabla).delete().eq('id', id.data).eq('business_id', negocio.businessId).select('id');
    if (error) return respuestaError(500, MENSAJE_ERROR_GENERAL);
    if (!data || data.length === 0) return respuestaError(404, MENSAJE_NO_ENCONTRADO);
    return NextResponse.json({ id: id.data });
  }

  return { POST, PATCH, DELETE };
}
