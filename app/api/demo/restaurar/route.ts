/**
 * "Restaurar datos de ejemplo" (6.10). Solo existe para el negocio demo:
 * restaurar_demo() nunca toca un negocio de usuario. Límite: 3 por IP y hora.
 */
import { NextResponse } from 'next/server';
import { MENSAJE_ERROR_GENERAL, iniciarEscritura, respuestaError } from '@/lib/api';

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, 'api/demo/restaurar');
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  if (!negocio.esDemo) return respuestaError(403, 'Esta acción solo está disponible en la demostración.');

  const { error } = await db.rpc('restaurar_demo');
  if (error) return respuestaError(500, MENSAJE_ERROR_GENERAL);
  return NextResponse.json({ mensaje: 'Se restauraron los datos de ejemplo.' });
}
