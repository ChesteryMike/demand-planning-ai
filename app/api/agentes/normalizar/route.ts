/**
 * Agente Normalizador (6.5). La clave del proveedor nunca llega al navegador:
 * la llamada se hace aquí. Aplica el límite por IP (20 cada 10 min) Y el tope diario.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MENSAJE_DATOS_INVALIDOS, iniciarEscritura, leerJson, respuestaError } from '@/lib/api';
import { dependenciasAgente } from '@/lib/ia/dependencias';
import { MENSAJE_TOPE_IA } from '@/lib/ia/limite';
import { MENSAJE_TEXTO_CORTO, normalizarTexto } from '@/lib/importar/normalizador';

const esquema = z.object({
  texto: z.string().max(2_000_000),
  tipo: z.enum(['venta', 'compra']),
});

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, 'api/agentes/normalizar');
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const entrada = esquema.safeParse(await leerJson(request));
  if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

  const resultado = await normalizarTexto(entrada.data, await dependenciasAgente(db, negocio.businessId, 'normalizar'));
  if (!resultado.ok) {
    const status = resultado.mensaje === MENSAJE_TEXTO_CORTO ? 400 : resultado.mensaje === MENSAJE_TOPE_IA ? 429 : 503;
    return respuestaError(status, resultado.mensaje);
  }
  return NextResponse.json(resultado);
}
