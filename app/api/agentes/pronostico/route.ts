/**
 * Agente de Pronóstico (6.7). La línea base se calcula aquí con código
 * (6.2); el modelo solo sugiere un ajuste acotado que el código valida.
 * Límite por IP (20 cada 10 min) y tope diario. Si la IA falla, responde
 * 200 con la línea base y el aviso: no bloquea la vista.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MENSAJE_DATOS_INVALIDOS, MENSAJE_ERROR_GENERAL, esquemaId, iniciarEscritura, leerJson, respuestaError } from '@/lib/api';
import { hoyEnChile, sumarDias } from '@/lib/fechas';
import { dependenciasAgente } from '@/lib/ia/dependencias';
import { pronosticarConAgente } from '@/lib/pronostico/agente';
import { calcularLineaBase } from '@/lib/pronostico/linea-base';

const esquema = z.object({ producto_id: esquemaId });

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = await iniciarEscritura(request, 'api/agentes/pronostico');
  if (!inicio.ok) return inicio.respuesta;
  const { negocio, db } = inicio.contexto;

  const entrada = esquema.safeParse(await leerJson(request));
  if (!entrada.success) return respuestaError(400, MENSAJE_DATOS_INVALIDOS);
  const productoId = entrada.data.producto_id;
  const hoy = hoyEnChile();

  const [producto, ventas, primera] = await Promise.all([
    db.from('productos').select('nombre, unidad, perecible').eq('business_id', negocio.businessId).eq('id', productoId).maybeSingle(),
    db
      .from('ventas')
      .select('fecha, cantidad')
      .eq('business_id', negocio.businessId)
      .eq('producto_id', productoId)
      .gte('fecha', sumarDias(hoy, -28))
      .lte('fecha', sumarDias(hoy, -1)),
    // La fecha de la primera venta define el denominador n (6.1), aunque sea anterior a la ventana.
    db.from('ventas').select('fecha').eq('business_id', negocio.businessId).eq('producto_id', productoId).order('fecha').limit(1),
  ]);
  if (producto.error || ventas.error || primera.error) return respuestaError(500, MENSAJE_ERROR_GENERAL);
  if (!producto.data) return respuestaError(404, 'No se encontró el producto.');

  const filas = (ventas.data ?? []).map((v) => ({ fecha: v.fecha as string, cantidad: Number(v.cantidad) }));
  const fechaPrimera = primera.data?.[0]?.fecha as string | undefined;
  // Cantidad 0 fuera de la ventana: solo marca la primera venta, no suma.
  if (fechaPrimera && fechaPrimera < sumarDias(hoy, -28)) filas.push({ fecha: fechaPrimera, cantidad: 0 });

  const lineaBase = calcularLineaBase(filas, hoy);
  const resultado = await pronosticarConAgente(
    { producto: { nombre: producto.data.nombre, unidad: producto.data.unidad, perecible: producto.data.perecible }, lineaBase },
    await dependenciasAgente(db, negocio.businessId, 'pronostico'),
  );
  return NextResponse.json(resultado);
}
