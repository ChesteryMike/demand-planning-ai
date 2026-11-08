-- =====================================================================
-- recibir_pedido() (PROMPT_MAESTRO 6.11): registra UNA compra con
-- origen = 'pedido' y marca el pedido como recibido.
-- Recibir es idempotente: si el pedido ya estaba recibido, devuelve la
-- compra existente sin crear otra (aunque se pulse dos veces). Lo garantizan
-- el bloqueo de la fila del pedido y el pedido_id único en compras.
-- =====================================================================

create or replace function public.recibir_pedido(
  p_business_id uuid,
  p_pedido_id   uuid,
  p_cantidad    numeric,
  p_fecha       date
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_compra uuid;
begin
  select * into v_pedido from public.pedidos
   where id = p_pedido_id and business_id = p_business_id
   for update;
  if not found then
    raise exception 'Pedido inexistente';
  end if;

  if v_pedido.estado = 'recibido' then
    select id into v_compra from public.compras where pedido_id = p_pedido_id;
    return jsonb_build_object('compra_id', v_compra, 'ya_recibido', true);
  end if;
  if v_pedido.estado = 'cancelado' then
    raise exception 'El pedido está cancelado';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad recibida debe ser mayor que cero';
  end if;

  insert into public.compras (business_id, producto_id, fecha, cantidad, costo_unitario, origen, pedido_id)
  select p_business_id, v_pedido.producto_id, p_fecha, p_cantidad, nullif(p.costo, 0), 'pedido', p_pedido_id
    from public.productos p
   where p.id = v_pedido.producto_id and p.business_id = p_business_id
  returning id into v_compra;

  update public.pedidos set estado = 'recibido', fecha_recepcion = p_fecha where id = p_pedido_id;

  return jsonb_build_object('compra_id', v_compra, 'ya_recibido', false);
end;
$$;

revoke all on function public.recibir_pedido(uuid, uuid, numeric, date) from public, anon, authenticated;
grant execute on function public.recibir_pedido(uuid, uuid, numeric, date) to service_role;
