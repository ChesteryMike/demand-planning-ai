/**
 * Rutas de API (sección 7): se importa el handler y se llama con new Request(),
 * con dependencias simuladas por vi.mock. Sin base real y sin IA real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DependenciasAgente } from '@/lib/ia/limite';
import { crearAdaptadorFalso, crearRegistroFalso } from '../ia/adaptador-falso';

const estado = vi.hoisted(() => ({
  negocio: { businessId: 'negocio-del-servidor', esDemo: true },
  db: null as unknown,
  deps: null as unknown,
}));

vi.mock('@/lib/negocio-activo', () => ({ negocioActivo: async () => estado.negocio }));
vi.mock('@/lib/supabase-servidor', () => ({ clienteServidor: () => estado.db }));
vi.mock('@/lib/ia/dependencias', () => ({ dependenciasAgente: async () => estado.deps }));

interface Registro {
  inserts: { tabla: string; fila: Record<string, unknown> }[];
  updates: { tabla: string; cambios: Record<string, unknown> }[];
  filtros: { tabla: string; columna: string; valor: unknown }[];
  rpcs: { nombre: string; params: Record<string, unknown> }[];
}

/** Base falsa: un constructor de consultas encadenable que registra lo que se le pide. */
function crearDbFalsa(rpc: (nombre: string, params: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({ data: 1, error: null })) {
  const registro: Registro = { inserts: [], updates: [], filtros: [], rpcs: [] };
  const from = (tabla: string) => {
    const q: Record<string, unknown> = {};
    const encadenar = () => q;
    Object.assign(q, {
      select: encadenar,
      delete: encadenar,
      order: encadenar,
      range: encadenar,
      gte: encadenar,
      lte: encadenar,
      insert: (fila: Record<string, unknown>) => (registro.inserts.push({ tabla, fila }), q),
      update: (cambios: Record<string, unknown>) => (registro.updates.push({ tabla, cambios }), q),
      eq: (columna: string, valor: unknown) => (registro.filtros.push({ tabla, columna, valor }), q),
      single: async () => ({ data: { id: '55555555-5555-4555-8555-555555555555' }, error: null }),
      then: (ok: (v: unknown) => unknown, error: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabla === 'productos' ? [] : [{ id: 'x' }], error: null }).then(ok, error),
    });
    return q;
  };
  const db = {
    from,
    rpc: vi.fn(async (nombre: string, params: Record<string, unknown>) => {
      registro.rpcs.push({ nombre, params });
      return rpc(nombre, params);
    }),
  };
  return { db, registro };
}

function peticion(url: string, metodo: string, cuerpo?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '200.1.2.3' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

const PRODUCTO = '66666666-6666-4666-8666-666666666666';

beforeEach(() => {
  process.env.SAL_IP = 'sal-de-prueba';
  estado.negocio = { businessId: 'negocio-del-servidor', esDemo: true };
});

describe('Escrituras: el business_id lo fija el servidor', () => {
  it('POST /api/ventas ignora un business_id enviado por el cliente', async () => {
    const { db, registro } = crearDbFalsa();
    estado.db = db;
    const { POST } = await import('@/app/api/ventas/route');
    const r = await POST(peticion('/api/ventas', 'POST', { business_id: 'negocio-ajeno', producto_id: PRODUCTO, fecha: '2026-03-30', cantidad: 12.5 }));
    expect(r.status).toBe(201);
    expect(registro.inserts).toEqual([
      {
        tabla: 'ventas',
        fila: { business_id: 'negocio-del-servidor', producto_id: PRODUCTO, fecha: '2026-03-30', cantidad: 12.5, origen: 'manual' },
      },
    ]);
  });

  it('PATCH /api/compras filtra por el negocio activo, no por el del cuerpo', async () => {
    const { db, registro } = crearDbFalsa();
    estado.db = db;
    const { PATCH } = await import('@/app/api/compras/route');
    const r = await PATCH(peticion('/api/compras', 'PATCH', { id: PRODUCTO, business_id: 'negocio-ajeno', cantidad: 3 }));
    expect(r.status).toBe(200);
    expect(registro.updates).toEqual([{ tabla: 'compras', cambios: { cantidad: 3 } }]);
    expect(registro.filtros).toContainEqual({ tabla: 'compras', columna: 'business_id', valor: 'negocio-del-servidor' });
    expect(registro.filtros.some((f) => f.valor === 'negocio-ajeno')).toBe(false);
  });

  it('POST /api/importaciones (guardar) envía el business_id del servidor a guardar_importacion()', async () => {
    const { db, registro } = crearDbFalsa((nombre) =>
      nombre === 'guardar_importacion'
        ? { data: { importacion_id: '77777777-7777-4777-8777-777777777777', filas_guardadas: 1, productos_creados: [] }, error: null }
        : { data: 1, error: null },
    );
    estado.db = db;
    const { POST } = await import('@/app/api/importaciones/route');
    const r = await POST(
      peticion('/api/importaciones', 'POST', {
        accion: 'guardar',
        business_id: 'negocio-ajeno',
        tipo: 'venta',
        nombreArchivo: 'PRUEBA.csv',
        validas: [{ numero: 2, fecha: '2026-03-03', producto: 'Kéfir', cantidad: 4, costoUnitario: null }],
      }),
    );
    expect(r.status).toBe(201);
    const guardar = registro.rpcs.find((x) => x.nombre === 'guardar_importacion');
    expect(guardar?.params.p_business_id).toBe('negocio-del-servidor');
  });

  it('datos inválidos → 400 con mensaje en español', async () => {
    estado.db = crearDbFalsa().db;
    const { POST } = await import('@/app/api/ventas/route');
    const r = await POST(peticion('/api/ventas', 'POST', { producto_id: PRODUCTO, fecha: '31-02-2026', cantidad: -1 }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Revise los datos ingresados.' });
  });
});

describe('Límite por IP en las rutas', () => {
  it('la llamada 61 (registrar_llamada_ip devuelve 61) responde 429 con el mensaje', async () => {
    estado.db = crearDbFalsa(() => ({ data: 61, error: null })).db;
    const { POST } = await import('@/app/api/ventas/route');
    const r = await POST(peticion('/api/ventas', 'POST', { producto_id: PRODUCTO, fecha: '2026-03-30', cantidad: 1 }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'Hizo demasiadas operaciones seguidas. Espere unos minutos e intente de nuevo.' });
  });
});

describe('POST /api/agentes/normalizar', () => {
  it('texto de menos de 10 caracteres → rechazo sin llamar al adaptador', async () => {
    estado.db = crearDbFalsa().db;
    const { adaptador, llamadas } = crearAdaptadorFalso({ salida: {} });
    const { registrarUso } = crearRegistroFalso();
    estado.deps = { adaptador, registrarUso } satisfies DependenciasAgente;
    const { POST } = await import('@/app/api/agentes/normalizar/route');
    const r = await POST(peticion('/api/agentes/normalizar', 'POST', { texto: 'hola', tipo: 'venta' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/muy corto/);
    expect(llamadas).toHaveLength(0);
  });

  it('el tope diario devuelve el mensaje correcto', async () => {
    estado.db = crearDbFalsa().db;
    const { adaptador, llamadas } = crearAdaptadorFalso({ salida: {} });
    const { registrarUso } = crearRegistroFalso({ permitido: false, motivo: 'negocio' });
    estado.deps = { adaptador, registrarUso } satisfies DependenciasAgente;
    const { POST } = await import('@/app/api/agentes/normalizar/route');
    const r = await POST(peticion('/api/agentes/normalizar', 'POST', { texto: '03-03-2026 Marraqueta 45', tipo: 'venta' }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'Se alcanzó el límite diario de consultas a la IA de esta demostración. Intente mañana.' });
    expect(llamadas).toHaveLength(0);
  });
});

describe('/api/pedidos', () => {
  it('POST crea el pedido en el negocio del servidor, en estado "pedido"', async () => {
    const { db, registro } = crearDbFalsa();
    estado.db = db;
    const { POST } = await import('@/app/api/pedidos/route');
    const r = await POST(peticion('/api/pedidos', 'POST', { producto_id: PRODUCTO, cantidad: 157, business_id: 'negocio-ajeno', estado: 'recibido' }));
    expect(r.status).toBe(201);
    expect(registro.inserts[0]).toMatchObject({
      tabla: 'pedidos',
      fila: { business_id: 'negocio-del-servidor', producto_id: PRODUCTO, cantidad: 157, estado: 'pedido' },
    });
  });

  it('PATCH recibir llama a recibir_pedido() con el negocio del servidor; si ya estaba recibido no crea otra compra', async () => {
    const { db, registro } = crearDbFalsa((nombre) =>
      nombre === 'recibir_pedido' ? { data: { compra_id: 'c1', ya_recibido: true }, error: null } : { data: 1, error: null },
    );
    estado.db = db;
    const { PATCH } = await import('@/app/api/pedidos/route');
    const r = await PATCH(peticion('/api/pedidos', 'PATCH', { id: PRODUCTO, accion: 'recibir', cantidad: 157, business_id: 'negocio-ajeno' }));
    expect(r.status).toBe(200);
    expect((await r.json()).mensaje).toBe('Este pedido ya estaba recibido: no se registró otra compra.');
    const llamada = registro.rpcs.find((x) => x.nombre === 'recibir_pedido');
    expect(llamada?.params).toMatchObject({ p_business_id: 'negocio-del-servidor', p_pedido_id: PRODUCTO, p_cantidad: 157 });
  });
});

describe('POST /api/demo/restaurar', () => {
  it('con un negocio que no es el demo no hace nada (403)', async () => {
    const { db, registro } = crearDbFalsa();
    estado.db = db;
    estado.negocio = { businessId: 'negocio-de-usuario', esDemo: false };
    const { POST } = await import('@/app/api/demo/restaurar/route');
    const r = await POST(peticion('/api/demo/restaurar', 'POST'));
    expect(r.status).toBe(403);
    expect(registro.rpcs.map((x) => x.nombre)).not.toContain('restaurar_demo');
  });

  it('en el demo llama a restaurar_demo()', async () => {
    const { db, registro } = crearDbFalsa();
    estado.db = db;
    const { POST } = await import('@/app/api/demo/restaurar/route');
    const r = await POST(peticion('/api/demo/restaurar', 'POST'));
    expect(r.status).toBe(200);
    expect(registro.rpcs.map((x) => x.nombre)).toContain('restaurar_demo');
  });
});
