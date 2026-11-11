/**
 * RUTA TEMPORAL DE DIAGNÓSTICO: se elimina en el pull request siguiente.
 *
 * Detrás de Render (y de Cloudflare) no está documentado qué cabecera trae la
 * IP real del cliente ni si el primer valor de x-forwarded-for se puede
 * falsificar. Esta ruta devuelve SOLO las cabeceras de red de la propia
 * petición, con una lista cerrada: no incluye cookies, autorización ni datos
 * del negocio, y no toca la base de datos.
 */
import { NextResponse } from 'next/server';
import { ipDelCliente } from '@/lib/limite-ip';

export const dynamic = 'force-dynamic';

const CABECERAS = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'forwarded', 'x-forwarded-proto', 'via'];

export async function GET(request: Request): Promise<NextResponse> {
  const cabeceras: Record<string, string | null> = {};
  for (const nombre of CABECERAS) cabeceras[nombre] = request.headers.get(nombre);
  return NextResponse.json({ cabeceras, ipQueUsaHoyLaApp: ipDelCliente(request.headers) });
}
