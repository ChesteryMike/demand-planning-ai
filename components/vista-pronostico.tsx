'use client';

/**
 * Vista Pronóstico (6.11 y 6.12): historial real de 28 días + escenarios
 * bajo/esperado/alto para 14 días, el ajuste de IA (si se aplicó, con su
 * motivo) y una explicación sin jerga estadística.
 * Colores validados (dataviz): ventas reales #2a78d6, pronóstico #eb6834.
 */
import { Loader2, Sparkles } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Aviso } from '@/components/aviso';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { enviarJson } from '@/lib/cliente-api';
import { formatoCantidad, formatoFecha, textoUnidades } from '@/lib/formato';
import type { ResultadoPronostico } from '@/lib/pronostico/agente';
import { explicarPronostico } from '@/lib/pronostico/explicacion';
import type { EscenarioDia, LineaBase } from '@/lib/pronostico/linea-base';

const configuracion = {
  real: { label: 'Ventas reales', color: '#2a78d6' },
  esperado: { label: 'Pronóstico', color: '#eb6834' },
  rango: { label: 'Rango probable', color: '#eb6834' },
} satisfies ChartConfig;

interface Punto {
  fecha: string;
  etiqueta: string;
  real?: number;
  esperado?: number;
  rango?: [number, number];
}

const redondo = (n: number) => Math.round(n);
const ddmm = (fecha: string) => `${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`;

function useEsCelular(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia('(max-width: 767px)');
      consulta.addEventListener('change', avisar);
      return () => consulta.removeEventListener('change', avisar);
    },
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false,
  );
}

function Tooltip({ active, payload, unidad }: { active?: boolean; payload?: { payload: Punto }[]; unidad: string }) {
  const punto = payload?.[0]?.payload;
  if (!active || !punto) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{formatoFecha(punto.fecha)}</p>
      {punto.real !== undefined && (
        <p>
          Ventas reales: {textoUnidades(redondo(punto.real), unidad)}
        </p>
      )}
      {punto.esperado !== undefined && (
        <p>
          Pronóstico: {textoUnidades(redondo(punto.esperado), unidad)}
        </p>
      )}
      {punto.rango && (
        <p className="text-muted-foreground">
          Entre {formatoCantidad(redondo(punto.rango[0]))} y {formatoCantidad(redondo(punto.rango[1]))}
        </p>
      )}
    </div>
  );
}

export function VistaPronostico({
  productoId,
  unidad,
  lineaBase,
}: {
  productoId: string;
  unidad: string;
  lineaBase: LineaBase;
}) {
  const esCelular = useEsCelular();
  const [resultado, setResultado] = useState<ResultadoPronostico | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pronostico: EscenarioDia[] = resultado?.pronostico ?? lineaBase.pronostico;
  const ajuste = resultado?.ajuste ?? null;

  const datos: Punto[] = [
    ...lineaBase.historial.map((d) => ({ fecha: d.fecha, etiqueta: ddmm(d.fecha), real: d.cantidad })),
    ...pronostico.map((d) => ({ fecha: d.fecha, etiqueta: ddmm(d.fecha), esperado: d.esperado, rango: [d.bajo, d.alto] as [number, number] })),
  ];
  const hoy = pronostico[0]?.fecha;

  async function revisarConIa() {
    setCargando(true);
    setError(null);
    const r = await enviarJson<ResultadoPronostico>('/api/agentes/pronostico', 'POST', { producto_id: productoId });
    setCargando(false);
    if (!r.ok) return setError(r.mensaje);
    setResultado(r.datos);
  }

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={configuracion} className="aspect-auto h-80 w-full" aria-label="Gráfico de ventas reales y pronóstico">
        <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            interval={esCelular ? 6 : 'preserveStartEnd'}
            minTickGap={esCelular ? 0 : 16}
          />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tickFormatter={(v: number) => formatoCantidad(v)} />
          <ChartTooltip content={<Tooltip unidad={unidad} />} />
          <ChartLegend verticalAlign={esCelular ? 'bottom' : 'top'} content={<ChartLegendContent />} />
          {hoy && <ReferenceLine x={ddmm(hoy)} stroke="var(--border)" label={{ value: 'Hoy', position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 12 }} />}
          <Area dataKey="rango" type="monotone" fill="var(--color-rango)" fillOpacity={0.12} stroke="none" isAnimationActive={false} />
          <Line dataKey="real" type="monotone" stroke="var(--color-real)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="esperado" type="monotone" stroke="var(--color-esperado)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>

      <section aria-label="Ajuste con IA" className="flex flex-col gap-2">
        {!resultado && (
          <Button variant="outline" onClick={revisarConIa} disabled={cargando} className="self-start">
            {cargando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {cargando ? 'Revisando con IA…' : 'Revisar con IA'}
          </Button>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {resultado?.aviso && <Aviso>{resultado.aviso}</Aviso>}
        {ajuste?.estado === 'aplicado' && (
          <Aviso tipo="exito">
            Ajuste de IA aplicado: {ajuste.pct > 0 ? '+' : ''}
            {formatoCantidad(ajuste.pct)} %. {ajuste.motivo}
          </Aviso>
        )}
        {ajuste?.estado === 'sospechoso' && <Aviso tipo="advertencia">{ajuste.mensaje}</Aviso>}
        {ajuste?.estado === 'sin_ajuste' && <Aviso>La IA no sugiere cambios. {ajuste.motivo}</Aviso>}
      </section>

      <section aria-label="Explicación" className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">¿Qué dice el pronóstico?</h2>
        <ul className="list-disc pl-5 text-sm">
          {explicarPronostico(lineaBase, pronostico, unidad).map((frase) => (
            <li key={frase}>{frase}</li>
          ))}
        </ul>
      </section>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="self-start">
            Ver el pronóstico día a día
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">Pronóstico de los próximos 14 días</caption>
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 font-medium">Fecha</th>
                <th className="py-2 text-right font-medium">Bajo</th>
                <th className="py-2 text-right font-medium">Esperado</th>
                <th className="py-2 text-right font-medium">Alto</th>
              </tr>
            </thead>
            <tbody>
              {pronostico.map((d) => (
                <tr key={d.fecha} className="border-b">
                  <td className="py-2">{formatoFecha(d.fecha)}</td>
                  <td className="py-2 text-right tabular-nums">{formatoCantidad(redondo(d.bajo))}</td>
                  <td className="py-2 text-right tabular-nums">{formatoCantidad(redondo(d.esperado))}</td>
                  <td className="py-2 text-right tabular-nums">{formatoCantidad(redondo(d.alto))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
