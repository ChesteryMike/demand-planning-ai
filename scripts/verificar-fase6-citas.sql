-- Fase 6 (b): ¿cada fecha citada por el Agente de Pronóstico existe en el
-- historial de Marraqueta (ventana de 28 días)? Uso: psql -v fechas="'AAAA-MM-DD','AAAA-MM-DD'"
\pset footer off
\set demo '\'00000000-0000-4000-8000-000000000001\''
with citadas(fecha) as (select unnest(array[:fechas]::date[])),
     hoy as (select (now() at time zone 'America/Santiago')::date as d)
select c.fecha as fecha_citada,
       c.fecha between hoy.d - 28 and hoy.d - 1 as dentro_de_la_ventana,
       coalesce((select sum(v.cantidad) from public.ventas v join public.productos p on p.id = v.producto_id
                  where p.business_id = :demo and p.nombre = 'Marraqueta' and v.fecha = c.fecha), 0) as venta_ese_dia
  from citadas c, hoy order by c.fecha;

\echo '-- uso de IA registrado (ruta y versión del prompt)'
select ruta, version_prompt, sum(llamadas) as llamadas from public.uso_ia group by 1, 2 order by 1, 2;
