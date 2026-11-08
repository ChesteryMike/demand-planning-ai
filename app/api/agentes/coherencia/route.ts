/**
 * Agente de Coherencia de Catálogo (6.6). Solo avisa: si falla, responde
 * 200 con estado "fallo" y la importación sigue normalmente.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MENSAJE_DATOS_INVALIDOS, iniciarEscritura, leerJson, respuestaError } from '@/lib/api';
import { hoyEnChile } from '@/lib/fechas';
import { dependenciasAgente } from '@/lib/ia/dependencias';
import { leerCatalogoConVentas } from '@/lib/importar/catalogo';
import { MENSAJE_FALLO_COHERENCIA, revisarCoherencia } from '@/lib/importar/coherencia';

const esquema = z.object({ nuevos: z.array(z.string().trim().min(1).max(200)).max(5000) });

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, 'api/agentes/coherencia');
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const entrada = esquema.safeParse(await leerJson(request));
  if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);

  try {
    const catalogo = await leerCatalogoConVentas(db, negocio.businessId, hoyEnChile());
    const deps = await dependenciasAgente(db, negocio.businessId, 'coherencia');
    return NextResponse.json(await revisarCoherencia({ catalogo, nuevos: entrada.data.nuevos }, deps));
  } catch {
    return NextResponse.json({ estado: 'fallo', mensaje: MENSAJE_FALLO_COHERENCIA });
  }
}
