import { describe, expect, it } from 'vitest';
import {
  IP_DESCONOCIDA,
  MENSAJE_LIMITE_IP,
  grupoDeRuta,
  hashIp,
  ipDelCliente,
  leerOrigenIp,
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

// ---------------------------------------------------------------------
// Origen de la IP detrás de Render (medido en https://demand-planning-ai.onrender.com el 11-11-2026).
// Petición normal:   x-forwarded-for = "<cliente>, <Cloudflare>, <interna de Render>"
// Con cabecera falsa: x-forwarded-for = "<falsa>,<cliente>, <Cloudflare>, <interna de Render>"
// cf-connecting-ip la fija Cloudflare (una falsificada recibe 403 antes de llegar a la app).
// ---------------------------------------------------------------------
describe('origen de la IP del cliente (IP_CLIENTE_ORIGEN)', () => {
  const normal = new Headers({
    'x-forwarded-for': '190.8.127.89, 104.23.209.174, 10.26.210.129',
    'cf-connecting-ip': '190.8.127.89',
  });
  const falsificada = new Headers({
    'x-forwarded-for': '203.0.113.77,190.8.127.89, 172.68.112.212, 10.26.210.129',
    'cf-connecting-ip': '190.8.127.89',
  });

  it('por defecto (primer valor) el cliente puede falsificar su IP: así se esquivaba el límite', () => {
    expect(ipDelCliente(normal, leerOrigenIp(undefined))).toBe('190.8.127.89');
    expect(ipDelCliente(falsificada, leerOrigenIp(undefined))).toBe('203.0.113.77');
  });

  it('cabecera:cf-connecting-ip devuelve la IP real aunque se falsifique x-forwarded-for', () => {
    const origen = leerOrigenIp('cabecera:cf-connecting-ip');
    expect(ipDelCliente(normal, origen)).toBe('190.8.127.89');
    expect(ipDelCliente(falsificada, origen)).toBe('190.8.127.89');
  });

  it('xff-desde-final:3 devuelve la IP real con 3 o con 4 valores en la cadena', () => {
    const origen = leerOrigenIp('xff-desde-final:3');
    expect(ipDelCliente(normal, origen)).toBe('190.8.127.89');
    expect(ipDelCliente(falsificada, origen)).toBe('190.8.127.89');
  });

  it('si falta la cabecera, o trae basura, la IP es "desconocida" y no se cae a x-forwarded-for', () => {
    const origen = leerOrigenIp('cabecera:cf-connecting-ip');
    expect(ipDelCliente(new Headers({ 'x-forwarded-for': '203.0.113.77' }), origen)).toBe(IP_DESCONOCIDA);
    expect(ipDelCliente(new Headers({ 'cf-connecting-ip': 'no-es-una-ip!' }), origen)).toBe(IP_DESCONOCIDA);
    expect(ipDelCliente(new Headers({ 'x-forwarded-for': 'a, b' }), leerOrigenIp('xff-desde-final:3'))).toBe(IP_DESCONOCIDA);
  });

  it('una configuración inválida (p. ej. un error de tipeo) no vuelve al modo falsificable', () => {
    expect(leerOrigenIp('cabecera:cf connecting')).toEqual({ tipo: 'invalido' });
    expect(leerOrigenIp('xff-desde-final:0')).toEqual({ tipo: 'invalido' });
    expect(leerOrigenIp('cualquier-cosa')).toEqual({ tipo: 'invalido' });
    expect(ipDelCliente(falsificada, leerOrigenIp('cualquier-cosa'))).toBe(IP_DESCONOCIDA);
  });

  it('ataque del diagnóstico: con una x-forwarded-for distinta en cada llamada, la 61 sigue dando 429 si se usa cf-connecting-ip', async () => {
    const { almacen } = almacenEnMemoria();
    const resultados = [];
    for (let i = 1; i <= 61; i++) {
      const peticionFalsa = new Request('http://localhost/api/ventas', {
        method: 'POST',
        headers: { 'x-forwarded-for': `203.0.113.${i},190.8.127.89, 172.68.112.212, 10.26.210.129`, 'cf-connecting-ip': '190.8.127.89' },
      });
      resultados.push(await verificarLimiteIp(peticionFalsa, 'api/ventas', { almacen, sal: SAL, ahora: AHORA, origenIp: 'cabecera:cf-connecting-ip' }));
    }
    expect(resultados.filter((r) => r.ok)).toHaveLength(60);
    expect(resultados[60]).toMatchObject({ ok: false, status: 429 });
  });

  it('sin la configuración, esa misma secuencia esquiva el límite (61 llamadas, todas pasan)', async () => {
    const { almacen } = almacenEnMemoria();
    let pasaron = 0;
    for (let i = 1; i <= 61; i++) {
      const peticionFalsa = new Request('http://localhost/api/ventas', {
        method: 'POST',
        headers: { 'x-forwarded-for': `203.0.113.${i},190.8.127.89, 172.68.112.212, 10.26.210.129` },
      });
      const r = await verificarLimiteIp(peticionFalsa, 'api/ventas', { almacen, sal: SAL, ahora: AHORA, origenIp: '' });
      if (r.ok) pasaron++;
    }
    expect(pasaron).toBe(61);
  });
});
