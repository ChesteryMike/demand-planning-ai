/**
 * Pedidos (6.11):
 *   POST  { producto_id, cantidad }            "Marcar pedido realizado" → pedido en estado 'pedido'
 *   PATCH { id, accion: 'recibir', cantidad }  registra UNA compra (recibir_pedido es idempotente)
 *   PATCH { id, accion: 'cancelar' }           el pedido deja de contar como "en camino"
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_GENERAL,
  MENSAJE_NO_ENCONTRADO,
  esquemaId,
  iniciarEscritura,
  leerJson,
  respuestaError,
} from '@/lib/api';
import { hoyEnChile } from '@/lib/fechas';

const RUTA = 'api/pedidos';
const cantidad = z.number().positive().max(1_000_000_000);

const esquemaCrear = z.object({ producto_id: esquemaId, cantidad });
const esquemaAccion = z.discriminatedUnion('accion', [
  z.object({ id: esquemaId, accion: z.literal('recibir'), cantidad }),
  z.object({ id: esquemaId, accion: z.literal('cancelar') }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, RUTA);
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const entrada = esquemaCrear.safeParse(await leerJson(request));
  if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

  const { data, error } = await db
    .from('pedidos')
    .insert({
      business_id: negocio.businessId,
      producto_id: entrada.data.producto_id,
      cantidad: entrada.data.cantidad,
      estado: 'pedido',
      fecha_pedido: hoyEnChile(),
    })
    .select('id')
    .single();
  if (error) return respuestaError(400, 'El producto no existe en su lista.');
  return NextResponse.json({ id: data.id, mensaje: 'Pedido registrado: ahora cuenta como "en camino".' }, { status: 201 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, RUTA);
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const entrada = esquemaAccion.safeParse(await leerJson(request));
  if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

  if (entrada.data.accion === 'recibir') {
    const { data, error } = await db.rpc('recibir_pedido', {
      p_business_id: negocio.businessId,
      p_pedido_id: entrada.data.id,
      p_cantidad: entrada.data.cantidad,
      p_fecha: hoyEnChile(),
    });
    if (error) {
      if (error.message.includes('inexistente')) return respuestaError(404, 'No se encontró el pedido.');
      if (error.message.includes('cancelado')) return respuestaError(409, 'El pedido está cancelado.');
      return respuestaError(500, MENSAJE_ERROR_GENERAL);
    }
    const yaRecibido = (data as { ya_recibido?: boolean } | null)?.ya_recibido === true;
    return NextResponse.json({
      mensaje: yaRecibido ? 'Este pedido ya estaba recibido: no se registró otra compra.' : 'Pedido recibido: se registró la compra.',
      yaRecibido,
    });
  }

  const { data, error } = await db
    .from('pedidos')
    .update({ estado: 'cancelado' })
    .eq('id', entrada.data.id)
    .eq('business_id', negocio.businessId)
    .eq('estado', 'pedido')
    .select('id');
  if (error) return respuestaError(500, MENSAJE_ERROR_GENERAL);
  if (!data || data.length === 0) return respuestaError(404, MENSAJE_NO_ENCONTRADO);
  return NextResponse.json({ mensaje: 'Pedido cancelado.' });
}
