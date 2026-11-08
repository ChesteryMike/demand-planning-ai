-- Conteos para comparar antes y después de una verificación que escribe datos (regla 6).
\pset footer off
select (select count(*) from public.negocios)      as negocios,
       (select count(*) from public.productos)     as productos,
       (select count(*) from public.ventas)        as ventas,
       (select count(*) from public.compras)       as compras,
       (select count(*) from public.importaciones) as importaciones,
       (select count(*) from public.productos where nombre like 'PRUEBA%') as productos_prueba;
