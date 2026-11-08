-- =====================================================================
-- Fase 6 (c): comprueba que el pedido de prueba (Marraqueta, 7,777) creó
-- exactamente 1 compra, que recibirlo otra vez no crea otra, y lo revierte.
-- =====================================================================
\pset footer off
\set demo '\'00000000-0000-4000-8000-000000000001\''

\echo '-- pedido de prueba y sus compras (esperado: 1 pedido recibido y 1 compra origen pedido)'
select pe.estado, pe.cantidad, pe.fecha_pedido, pe.fecha_recepcion,
       (select count(*) from public.compras c where c.pedido_id = pe.id) as compras_del_pedido,
       (select string_agg(c.origen || ' ' || c.cantidad, ', ') from public.compras c where c.pedido_id = pe.id) as compra
  from public.pedidos pe join public.productos p on p.id = pe.producto_id
 where p.business_id = :demo and p.nombre = 'Marraqueta' and pe.cantidad = 7.777;

\echo '== recibir el MISMO pedido otra vez (directo en la base): ya_recibido = true y sigue 1 compra'
set role service_role;
select public.recibir_pedido(:demo, pe.id, 7.777, current_date) as segunda_recepcion
  from public.pedidos pe join public.productos p on p.id = pe.producto_id
 where p.business_id = :demo and p.nombre = 'Marraqueta' and pe.cantidad = 7.777;
select count(*) as compras_del_pedido
  from public.compras c join public.pedidos pe on pe.id = c.pedido_id
 where pe.cantidad = 7.777;

\echo '-- revertir: borrar el pedido de prueba (su compra cae por cascada)'
delete from public.pedidos pe using public.productos p
 where p.id = pe.producto_id and p.business_id = :demo and p.nombre = 'Marraqueta' and pe.cantidad = 7.777;
reset role;
