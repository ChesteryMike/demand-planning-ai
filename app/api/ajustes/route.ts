/**
 * Ajustes de inventario (5.2): conteo físico, merma u otro.
 * Es la única forma de corregir el stock: nunca se edita como número.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MENSAJE_DATOS_INVALIDOS, esquemaFecha, esquemaId, iniciarEscritura, leerJson, respuestaError } from '@/lib/api';

const esquemaAjuste = z.object({
  producto_id: esquemaId,
  fecha: esquemaFecha,
  cantidad: z.number().min(-1_000_000_000).max(1_000_000_000).refine((n) => n !== 0),
  motivo: z.enum(['merma', 'conteo', 'otro']),
  nota: z.string().trim().max(300).nullable().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, 'api/ajustes');
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const entrada = esquemaAjuste.safeParse(await leerJson(request));
  if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

  const { data, error } = await db
    .from('ajustes_stock')
    .insert({ ...entrada.data, nota: entrada.data.nota || null, business_id: negocio.businessId })
    .select('id')
    .single();
  if (error) return respuestaError(400, 'El producto no existe en su lista.');
  return NextResponse.json({ id: data.id }, { status: 201 });
}
