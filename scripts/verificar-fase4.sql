-- =====================================================================
-- Verificación de los contadores atómicos (Fase 4) contra la Supabase LOCAL.
-- Usa la fecha ficticia 2000-01-01 y negocios PRUEBA-F4; todo se revierte.
-- =====================================================================
\pset footer off
\set demo '\'00000000-0000-4000-8000-000000000001\''
\set otro '\'44444444-4444-4444-8444-444444444444\''

\echo '-- conteos ANTES'
select (select count(*) from public.uso_ia) as uso_ia, (select count(*) from public.limite_ip) as limite_ip,
       (select count(*) from public.negocios) as negocios;

set role service_role;
insert into public.negocios (id, nombre) values (:otro, 'PRUEBA-F4');

\echo '== 1. Tope por negocio = 2: la 3.ª llamada del demo se rechaza con motivo "negocio" y no suma'
select public.registrar_uso_ia(:demo, '2000-01-01', 'PRUEBA-F4', 'normalizador_v2', 2, 100) ->> 'permitido' as llamada_1;
select public.registrar_uso_ia(:demo, '2000-01-01', 'PRUEBA-F4', 'normalizador_v1', 2, 100) ->> 'permitido' as llamada_2;
select public.registrar_uso_ia(:demo, '2000-01-01', 'PRUEBA-F4', 'normalizador_v2', 2, 100) as llamada_3;
\echo '-- la versión del prompt queda registrada por separado'
select ruta, version_prompt, llamadas from public.uso_ia where fecha = '2000-01-01' order by version_prompt;

\echo '== 2. Tope GLOBAL = 2 (ya hay 2 llamadas del demo): el otro negocio, con 0 llamadas, recibe motivo "global"'
select public.registrar_uso_ia(:otro, '2000-01-01', 'PRUEBA-F4', 'normalizador_v2', 200, 2) as negocio_sin_uso;

\echo '== 3. registrar_llamada_ip: devuelve 1, 2, 3 en la misma ventana; otra ventana parte en 1'
select public.registrar_llamada_ip(repeat('b', 64), 'PRUEBA-F4', '2000-01-01 10:00+00') as c1;
select public.registrar_llamada_ip(repeat('b', 64), 'PRUEBA-F4', '2000-01-01 10:00+00') as c2;
select public.registrar_llamada_ip(repeat('b', 64), 'PRUEBA-F4', '2000-01-01 10:00+00') as c3;
select public.registrar_llamada_ip(repeat('b', 64), 'PRUEBA-F4', '2000-01-01 10:10+00') as otra_ventana;
\echo '-- una IP en claro no cabe en la tabla (solo hash de 64 hex)'
select public.registrar_llamada_ip('200.1.2.3', 'PRUEBA-F4', '2000-01-01 10:00+00');

\echo '== 4. anon no puede llamar a ninguna de las dos'
reset role;
set role anon;
select public.registrar_uso_ia(:demo, '2000-01-01', 'x', 'x', 1, 1);
select public.registrar_llamada_ip(repeat('c', 64), 'x', now());
reset role;

\echo '-- limpieza PRUEBA-F4'
delete from public.uso_ia where ruta = 'PRUEBA-F4';
delete from public.limite_ip where ruta = 'PRUEBA-F4';
delete from public.negocios where id = :otro;

\echo '-- conteos DESPUÉS (deben ser iguales a los de ANTES)'
select (select count(*) from public.uso_ia) as uso_ia, (select count(*) from public.limite_ip) as limite_ip,
       (select count(*) from public.negocios) as negocios;
