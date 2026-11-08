-- =====================================================================
-- Verificación de la Fase 1 (PROMPT_MAESTRO, sección 10).
-- Se ejecuta contra la Supabase LOCAL, después de `supabase db reset`.
-- Las escrituras de prueba usan el prefijo PRUEBA- y se revierten.
-- =====================================================================
\pset footer off
\set demo '\'00000000-0000-4000-8000-000000000001\''

\echo '== (a) RLS activo en todas las tablas de public'
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;

\echo '== (b) Productos del negocio demo (esperado: 10) y los cinco del golden set (esperado: 5)'
select count(*) as productos_demo from public.productos where business_id = :demo;
select nombre from public.productos
 where business_id = :demo
   and nombre in ('Marraqueta', 'Hallulla', 'Pan amasado', 'Leche entera 1L', 'Yogur natural')
 order by nombre;

\echo '== (c) Como anon, un INSERT en ventas debe FALLAR'
begin;
set local role anon;
insert into public.ventas (business_id, producto_id, fecha, cantidad, origen)
select business_id, id, current_date, 1, 'manual' from public.productos limit 1;
rollback;

\echo '== (d) Negocio PRUEBA-F1 invisible para anon; luego se borra'
\echo '-- conteos ANTES'
select (select count(*) from public.negocios) as negocios,
       (select count(*) from public.productos) as productos;
begin;
set local role service_role;
insert into public.negocios (id, nombre) values ('11111111-1111-4111-8111-111111111111', 'PRUEBA-F1');
insert into public.productos (business_id, nombre, nombre_normalizado, fecha_stock_inicial)
values ('11111111-1111-4111-8111-111111111111', 'PRUEBA-F1 producto', 'prueba-f1 producto', current_date);
commit;
\echo '-- como service_role (esperado: 1 negocio, 1 producto)'
select (select count(*) from public.negocios  where nombre = 'PRUEBA-F1') as negocios_prueba,
       (select count(*) from public.productos where business_id = '11111111-1111-4111-8111-111111111111') as productos_prueba;
begin;
set local role anon;
\echo '-- como anon (esperado: 0 y 0)'
select (select count(*) from public.negocios  where nombre = 'PRUEBA-F1') as negocios_prueba,
       (select count(*) from public.productos where business_id = '11111111-1111-4111-8111-111111111111') as productos_prueba;
rollback;
begin;
set local role service_role;
delete from public.negocios where id = '11111111-1111-4111-8111-111111111111';
commit;
\echo '-- conteos DESPUÉS (deben ser iguales a los de ANTES)'
select (select count(*) from public.negocios) as negocios,
       (select count(*) from public.productos) as productos;

\echo '== (e) Negocios demo (esperado: 1)'
select count(*) as negocios_demo from public.negocios where es_demo;

\echo '== (f) Como anon, limite_ip no muestra filas (esperado: 0, aunque exista una fila PRUEBA-F1)'
begin;
set local role service_role;
insert into public.limite_ip (ip_hash, ruta, ventana_inicio, llamadas)
values (repeat('a', 64), 'PRUEBA-F1', now(), 1);
set local role anon;
select count(*) as filas_visibles_anon from public.limite_ip;
rollback;
select count(*) as filas_limite_ip_tras_revertir from public.limite_ip where ruta = 'PRUEBA-F1';

\echo '== Extra: diseño del demo (stock y cobertura calculados como en 5.2 y 6.1)'
with base as (
  select p.nombre, p.perecible, p.dias_vida_util as vida,
         p.dias_entrega_proveedor + p.dias_colchon as r,
         p.stock_inicial
           + coalesce((select sum(c.cantidad) from public.compras c where c.producto_id = p.id and c.fecha >= p.fecha_stock_inicial), 0)
           - coalesce((select sum(v.cantidad) from public.ventas  v where v.producto_id = p.id and v.fecha >= p.fecha_stock_inicial), 0)
           as stock,
         coalesce((select sum(v.cantidad) from public.ventas v
                    where v.producto_id = p.id
                      and v.fecha between (now() at time zone 'America/Santiago')::date - 28
                                      and (now() at time zone 'America/Santiago')::date - 1), 0) / 28.0 as promedio
    from public.productos p where p.business_id = :demo
)
select nombre, r, vida, round(promedio, 2) as promedio, stock,
       case when promedio = 0 then null else round(stock / promedio, 2) end as cobertura,
       case
         when promedio = 0 then 'sin_ventas'
         when stock / promedio < r then 'quiebre'
         when perecible and stock / promedio > vida then 'merma'
         when not perecible and stock / promedio > 3 * r then 'sobrestock'
         else 'normal'
       end as nivel_esperado
  from base order by nombre;
