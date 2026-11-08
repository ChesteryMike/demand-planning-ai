import { describe, expect, it } from 'vitest';
import {
  MENSAJE_LIMITE_IP,
  grupoDeRuta,
  hashIp,
  ipDelCliente,
  verificarLimiteIp,
  type AlmacenLimiteIp,
} from '@/lib/limite-ip';

const SAL = 'sal-de-prueba';
const AHORA = new Date('2026-03-30T15:01:00Z');

/** Almacén en memoria con la misma semántica que registrar_llamada_ip(). */
function almacenEnMemoria() {
  const filas = new Map<string, number>();
  const almacen: AlmacenLimiteIp = {
    async incrementar(ipHash, ruta, ventanaInicio) {
      const clave = `${ipHash}|${ruta}|${ventanaInicio.toISOString()}`;
      const total = (filas.get(clave) ?? 0) + 1;
      filas.set(clave, total);
      return total;
    },
  };
  return { almacen, filas };
}

function peticion(ip: string, cabecera = 'x-forwarded-for'): Request {
  return new Request('http://localhost/api/ventas', { method: 'POST', headers: { [cabecera]: ip } });
}

describe('limite-ip.ts (6.10)', () => {
  it('la llamada 61 de la misma IP en 10 minutos a una ruta de escritura devuelve 429 con el mensaje', async () => {
    const { almacen } = almacenEnMemoria();
    for (let i = 1; i <= 60; i++) {
      expect(await verificarLimiteIp(peticion('200.1.2.3'), 'api/ventas', { almacen, sal: SAL, ahora: AHORA })).toEqual({ ok: true });
    }
    expect(await verificarLimiteIp(peticion('200.1.2.3'), 'api/ventas', { almacen, sal: SAL, ahora: AHORA })).toEqual({
      ok: false,
      status: 429,
      mensaje: MENSAJE_LIMITE_IP,
    });
  });

  it('una IP distinta no se ve afectada', async () => {
    const { almacen } = almacenEnMemoria();
    for (let i = 0; i < 61; i++) await verificarLimiteIp(peticion('200.1.2.3'), 'api/ventas', { almacen, sal: SAL, ahora: AHORA });
    expect(await verificarLimiteIp(peticion('190.9.8.7'), 'api/ventas', { almacen, sal: SAL, ahora: AHORA })).toEqual({ ok: true });
  });

  it('la tabla guarda el hash, nunca la IP', async () => {
    const { almacen, filas } = almacenEnMemoria();
    await verificarLimiteIp(peticion('200.1.2.3'), 'api/ventas', { almacen, sal: SAL, ahora: AHORA });
    const [clave] = [...filas.keys()];
    const [ipHash] = clave!.split('|');
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(clave).not.toContain('200.1.2.3');
    expect(ipHash).toBe(hashIp('200.1.2.3', SAL));
    expect(hashIp('200.1.2.3', 'otra-sal')).not.toBe(ipHash);
  });

  it('en una ventana nueva (10 minutos después) el conteo parte de cero', async () => {
    const { almacen } = almacenEnMemoria();
    for (let i = 0; i < 61; i++) await verificarLimiteIp(peticion('200.1.2.3'), 'api/ventas', { almacen, sal: SAL, ahora: AHORA });
    const despues = new Date(AHORA.getTime() + 10 * 60_000);
    expect(await verificarLimiteIp(peticion('200.1.2.3'), 'api/ventas', { almacen, sal: SAL, ahora: despues })).toEqual({ ok: true });
  });

  it('"Restaurar datos de ejemplo": 3 por hora; la cuarta devuelve 429', async () => {
    const { almacen } = almacenEnMemoria();
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await verificarLimiteIp(peticion('200.1.2.3'), 'api/demo/restaurar', { almacen, sal: SAL, ahora: AHORA }));
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
  });

  it('rutas de IA: 20 cada 10 minutos', async () => {
    const { almacen } = almacenEnMemoria();
    const r = [];
    for (let i = 0; i < 21; i++) r.push(await verificarLimiteIp(peticion('200.1.2.3'), 'api/agentes/normalizar', { almacen, sal: SAL, ahora: AHORA }));
    expect(r.filter((x) => x.ok)).toHaveLength(20);
  });

  it('grupos de ruta', () => {
    expect(grupoDeRuta('api/agentes/pronostico')).toBe('ia');
    expect(grupoDeRuta('/api/demo/restaurar')).toBe('restaurar');
    expect(grupoDeRuta('api/cuenta/registro')).toBe('registro');
    expect(grupoDeRuta('api/importaciones')).toBe('escritura');
  });

  it('IP: primer valor de x-forwarded-for; si no, x-real-ip', () => {
    expect(ipDelCliente(new Headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1' }))).toBe('200.1.2.3');
    expect(ipDelCliente(new Headers({ 'x-real-ip': '190.9.8.7' }))).toBe('190.9.8.7');
  });

  it('sin SAL_IP o si la base falla, no deja pasar (503)', async () => {
    const { almacen } = almacenEnMemoria();
    expect((await verificarLimiteIp(peticion('1.1.1.1'), 'api/ventas', { almacen, sal: undefined })).ok).toBe(false);
    const roto: AlmacenLimiteIp = { incrementar: async () => { throw new Error('sin conexión'); } };
    expect(await verificarLimiteIp(peticion('1.1.1.1'), 'api/ventas', { almacen: roto, sal: SAL })).toMatchObject({ ok: false, status: 503 });
  });
});
