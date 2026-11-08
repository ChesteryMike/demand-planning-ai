import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  MENSAJE_ERROR_GUARDAR,
  MENSAJE_SIN_FILAS,
  guardarImportacion,
  mensajeFinal,
  textoConfirmacionEliminar,
  type EntradaGuardar,
} from '@/lib/importar/guardar';

const NUEVO_ID = '22222222-2222-4222-8222-222222222222';
const IMPORTACION_ID = '33333333-3333-4333-8333-333333333333';

/** Cliente falso: solo implementa rpc(). Nunca toca una base real. */
function clienteFalso(respuesta: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(respuesta);
  return { cliente: { rpc } as unknown as SupabaseClient, rpc };
}

const entrada: EntradaGuardar = {
  businessId: 'negocio-del-servidor',
  tipo: 'compra',
  nombreArchivo: 'PRUEBA-F3.csv',
  fecha: '2026-03-30',
  filas: [
    { numero: 2, fecha: '2026-03-20', producto: 'Leche entera 1L', nombreNormalizado: 'leche entera 1l', cantidad: 48, costoUnitario: 890, productoId: 'id-leche' },
    { numero: 3, fecha: '2026-03-20', producto: 'Kéfir', nombreNormalizado: 'kefir', cantidad: 6, costoUnitario: null, productoId: null },
  ],
  productosNuevos: [{ nombre: 'Kéfir', nombreNormalizado: 'kefir', filas: 1 }],
};

describe('guardarImportacion (6.9)', () => {
  it('envía el business_id recibido del servidor y las filas; devuelve el mensaje y el enlace a la ficha', async () => {
    const { cliente, rpc } = clienteFalso({
      data: { importacion_id: IMPORTACION_ID, filas_guardadas: 2, productos_creados: [{ id: NUEVO_ID, nombre: 'Kéfir' }] },
      error: null,
    });
    const r = await guardarImportacion(cliente, entrada);

    expect(rpc).toHaveBeenCalledWith('guardar_importacion', {
      p_business_id: 'negocio-del-servidor',
      p_tipo: 'compra',
      p_nombre_archivo: 'PRUEBA-F3.csv',
      p_fecha: '2026-03-30',
      p_productos_nuevos: [{ nombre: 'Kéfir', nombre_normalizado: 'kefir' }],
      p_filas: [
        { producto_id: 'id-leche', nombre_normalizado: 'leche entera 1l', fecha: '2026-03-20', cantidad: 48, costo_unitario: 890 },
        { producto_id: null, nombre_normalizado: 'kefir', fecha: '2026-03-20', cantidad: 6, costo_unitario: null },
      ],
    });
    expect(r).toEqual({
      ok: true,
      importacionId: IMPORTACION_ID,
      filasGuardadas: 2,
      productosCreados: [{ id: NUEVO_ID, nombre: 'Kéfir', href: `/productos/${NUEVO_ID}` }],
      mensaje: 'Se guardaron 2 filas. Se creó 1 producto nuevo: completen sus datos.',
    });
  });

  it('en ventas no envía costo', async () => {
    const { cliente, rpc } = clienteFalso({
      data: { importacion_id: IMPORTACION_ID, filas_guardadas: 2, productos_creados: [] },
      error: null,
    });
    await guardarImportacion(cliente, { ...entrada, tipo: 'venta' });
    const filas = (rpc.mock.calls[0]![1] as { p_filas: { costo_unitario: unknown }[] }).p_filas;
    expect(filas.every((f) => f.costo_unitario === null)).toBe(true);
  });

  it('sin filas no llama a la base y explica por qué', async () => {
    const { cliente, rpc } = clienteFalso({ data: null, error: null });
    expect(await guardarImportacion(cliente, { ...entrada, filas: [] })).toEqual({ ok: false, mensaje: MENSAJE_SIN_FILAS });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('una fila sin producto que no está entre los nuevos no se envía', async () => {
    const { cliente, rpc } = clienteFalso({ data: null, error: null });
    const r = await guardarImportacion(cliente, { ...entrada, productosNuevos: [] });
    expect(r).toEqual({ ok: false, mensaje: MENSAJE_ERROR_GUARDAR });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('un error de la base o una respuesta con otra forma → mensaje claro, sin datos inventados', async () => {
    const conError = clienteFalso({ data: null, error: { message: 'violates foreign key constraint' } });
    expect(await guardarImportacion(conError.cliente, entrada)).toEqual({ ok: false, mensaje: MENSAJE_ERROR_GUARDAR });
    const rara = clienteFalso({ data: { algo: 1 }, error: null });
    expect(await guardarImportacion(rara.cliente, entrada)).toEqual({ ok: false, mensaje: MENSAJE_ERROR_GUARDAR });
  });
});

describe('mensajes (6.9)', () => {
  it('mensaje final con singular y plural', () => {
    expect(mensajeFinal(3, 1)).toBe('Se guardaron 3 filas. Se creó 1 producto nuevo: completen sus datos.');
    expect(mensajeFinal(10, 2)).toBe('Se guardaron 10 filas. Se crearon 2 productos nuevos: completen sus datos.');
    expect(mensajeFinal(1, 0)).toBe('Se guardó 1 fila.');
  });

  it('la confirmación de borrado indica las filas y aclara que los productos no se eliminan', () => {
    expect(textoConfirmacionEliminar(3)).toBe(
      'Se borrarán 3 filas. Los productos creados por esta importación no se eliminan.',
    );
  });
});
