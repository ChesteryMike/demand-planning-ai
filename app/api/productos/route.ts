/**
 * Ficha de producto (6.11): edita los datos de planificación. El stock NO se
 * edita aquí (se corrige con un ajuste de inventario, 5.2). Al guardar la
 * ficha, datos_incompletos pasa a false.
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

const dias = z.number().int().min(0).max(365);
const monto = z.number().min(0).max(1_000_000_000);

const esquemaFicha = z
  .object({
    id: esquemaId,
    unidad: z.string().trim().min(1).max(20),
    categoria: z.string().trim().max(60).nullable(),
    perecible: z.boolean(),
    dias_vida_util: z.number().int().min(1).max(3650).nullable(),
    costo: monto,
    precio: monto,
    dias_entrega_proveedor: dias,
    dias_colchon: dias,
  })
  .refine((f) => (f.perecible ? f.dias_vida_util !== null : f.dias_vida_util === null), {
    message: 'Un producto perecible necesita su vida útil; uno no perecible no la lleva.',
  });

export async function PATCH(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, 'api/productos');
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const entrada = esquemaFicha.safeParse(await leerJson(request));
  if (!entrada.success) {
    const mensajeVida = entrada.error.issues.find((i) => i.code === 'custom')?.message;
    return respuestaError(400, mensajeVida ?? MENSAJE_DATOS_INVALIDOS);
  }
  const { id, categoria, ...ficha } = entrada.data;

  const { data, error } = await db
    .from('productos')
    .update({ ...ficha, categoria: categoria === '' ? null : categoria, datos_incompletos: false })
    .eq('id', id)
    .eq('business_id', negocio.businessId)
    .select('id');
  if (error) return respuestaError(500, MENSAJE_ERROR_GENERAL);
  if (!data || data.length === 0) return respuestaError(404, MENSAJE_NO_ENCONTRADO);
  return NextResponse.json({ id });
}
