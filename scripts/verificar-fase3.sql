-- =====================================================================
-- Verificación de guardar_importacion() (Fase 3) contra la Supabase LOCAL.
-- Escribe datos PRUEBA-F3 y los revierte; compara conteos antes y después.
-- =====================================================================
\pset footer off
\set demo '\'00000000-0000-4000-8000-000000000001\''

\echo '-- conteos ANTES'
select (select count(*) from public.productos)     as productos,
       (select count(*) from public.ventas)        as ventas,
       (select count(*) from public.compras)       as compras,
       (select count(*) from public.importaciones) as importaciones;

\echo '== 1. Importación PRUEBA-F3: 2 filas de Marraqueta (existente) + 1 de un producto nuevo'
set role service_role;
select public.guardar_importacion(
  :demo, 'venta', 'PRUEBA-F3.csv', '2026-11-08',
  '[{"nombre": "PRUEBA-F3 Queque", "nombre_normalizado": "prueba-f3 queque"}]',
  jsonb_build_array(
    jsonb_build_object('producto_id', (select id from public.productos where business_id = :demo and nombre = 'Marraqueta'),
                       'nombre_normalizado', 'marraqueta', 'fecha', '2026-03-03', 'cantidad', 45, 'costo_unitario', null),
    jsonb_build_object('producto_id', (select id from public.productos where business_id = :demo and nombre = 'Marraqueta'),
                       'nombre_normalizado', 'marraqueta', 'fecha', '2026-03-04', 'cantidad', 50, 'costo_unitario', null),
    jsonb_build_object('producto_id', null, 'nombre_normalizado', 'prueba-f3 queque',
                       'fecha', '2026-03-07', 'cantidad', 1250, 'costo_unitario', null)
  )
) as resultado;

\echo '-- producto nuevo con los valores por defecto de 6.9 (stock 0 a la fecha de importación, 2+1 días, Faltan datos)'
select nombre, stock_inicial, fecha_stock_inicial, costo, precio, perecible,
       dias_entrega_proveedor, dias_colchon, datos_incompletos
  from public.productos where nombre = 'PRUEBA-F3 Queque';
select tipo, nombre_archivo, filas_guardadas from public.importaciones where nombre_archivo = 'PRUEBA-F3.csv';

\echo '== 2. Atomicidad: una fila con un producto inexistente hace fallar TODO (no se crea PRUEBA-F3 Atómico)'
select public.guardar_importacion(
  :demo, 'venta', 'PRUEBA-F3-falla.csv', '2026-11-08',
  '[{"nombre": "PRUEBA-F3 Atómico", "nombre_normalizado": "prueba-f3 atomico"}]',
  '[{"producto_id": null, "nombre_normalizado": "prueba-f3 atomico", "fecha": "2026-03-07", "cantidad": 1},
    {"producto_id": "99999999-9999-4999-8999-999999999999", "nombre_normalizado": "x", "fecha": "2026-03-07", "cantidad": 1}]'
);
select (select count(*) from public.productos where nombre like 'PRUEBA-F3 At%') as productos_atomico,
       (select count(*) from public.importaciones where nombre_archivo = 'PRUEBA-F3-falla.csv') as importaciones_falla;

\echo '== 3. anon no puede llamar a la función'
reset role;
set role anon;
select public.guardar_importacion(:demo, 'venta', 'x', '2026-11-08', '[]', '[]');
reset role;

\echo '== 4. Eliminar la importación completa: sus filas caen por cascada; el producto creado NO se elimina'
delete from public.importaciones where nombre_archivo = 'PRUEBA-F3.csv';
select (select count(*) from public.ventas v join public.productos p on p.id = v.producto_id
         where p.nombre = 'PRUEBA-F3 Queque') as ventas_queque,
       (select count(*) from public.productos where nombre = 'PRUEBA-F3 Queque') as producto_queque_sigue;

\echo '-- limpieza del producto PRUEBA-F3'
delete from public.productos where nombre like 'PRUEBA-F3%';

\echo '-- conteos DESPUÉS (deben ser iguales a los de ANTES)'
select (select count(*) from public.productos)     as productos,
       (select count(*) from public.ventas)        as ventas,
       (select count(*) from public.compras)       as compras,
       (select count(*) from public.importaciones) as importaciones;
