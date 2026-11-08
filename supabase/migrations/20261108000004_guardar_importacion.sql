-- =====================================================================
-- guardar_importacion() (PROMPT_MAESTRO 6.9)
-- Guarda una importación completa en UNA transacción: crea los productos
-- nuevos con los valores por defecto, la fila de "importaciones" y todas
-- las ventas o compras. Si algo falla, no queda nada a medias.
-- La llama lib/importar/guardar.ts desde el servidor (service role), que
-- fija p_business_id con negocioActivo(); nunca viene del navegador.
-- =====================================================================

create or replace function public.guardar_importacion(
  p_business_id      uuid,
  p_tipo             text,
  p_nombre_archivo   text,
  p_fecha            date,    -- fecha de la importación (hoy en Chile)
  p_productos_nuevos jsonb,   -- [{ "nombre": "...", "nombre_normalizado": "..." }]
  p_filas            jsonb    -- [{ "producto_id": uuid|null, "nombre_normalizado": "...",
                              --    "fecha": "AAAA-MM-DD", "cantidad": n, "costo_unitario": n|null }]
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_importacion uuid;
  v_nuevo       jsonb;
  v_id          uuid;
  v_creados     jsonb := '[]'::jsonb;
  v_filas       integer;
begin
  if p_tipo not in ('venta', 'compra') then
    raise exception 'Tipo de importación inválido: %', p_tipo;
  end if;
  if not exists (select 1 from public.negocios where id = p_business_id) then
    raise exception 'Negocio inexistente';
  end if;
  if jsonb_array_length(coalesce(p_filas, '[]'::jsonb)) = 0 then
    raise exception 'No hay filas para guardar';
  end if;

  -- 1. Productos nuevos con los valores por defecto de 6.9.
  for v_nuevo in select * from jsonb_array_elements(coalesce(p_productos_nuevos, '[]'::jsonb)) loop
    insert into public.productos (
      business_id, nombre, nombre_normalizado, stock_inicial, fecha_stock_inicial,
      costo, precio, perecible, dias_vida_util, dias_entrega_proveedor, dias_colchon, datos_incompletos
    ) values (
      p_business_id, v_nuevo->>'nombre', v_nuevo->>'nombre_normalizado', 0, p_fecha,
      0, 0, false, null, 2, 1, true
    )
    on conflict (business_id, nombre_normalizado) do nothing
    returning id into v_id;

    -- Si ya existía (otra importación lo creó un instante antes), se usa el existente y no cuenta como creado.
    if v_id is not null then
      v_creados := v_creados || jsonb_build_object('id', v_id, 'nombre', v_nuevo->>'nombre');
    end if;
    v_id := null;
  end loop;

  -- 2. La importación (agrupa las filas para poder borrarlas juntas).
  insert into public.importaciones (business_id, tipo, nombre_archivo, filas_guardadas)
  values (p_business_id, p_tipo, p_nombre_archivo, 0)
  returning id into v_importacion;

  -- 3. Filas. El producto sale de la fila o, si es nuevo, de su nombre normalizado.
  --    La FK compuesta (producto_id, business_id) impide usar un producto de otro negocio.
  with filas as (
    select
      coalesce(
        nullif(f->>'producto_id', '')::uuid,
        (select p.id from public.productos p
          where p.business_id = p_business_id and p.nombre_normalizado = f->>'nombre_normalizado')
      ) as producto_id,
      (f->>'fecha')::date as fecha,
      (f->>'cantidad')::numeric as cantidad,
      nullif(f->>'costo_unitario', '')::numeric as costo_unitario
    from jsonb_array_elements(p_filas) as f
  )
  select count(*) into v_filas from filas where producto_id is null;
  if v_filas > 0 then
    raise exception 'Hay % filas sin producto', v_filas;
  end if;

  if p_tipo = 'venta' then
    insert into public.ventas (business_id, producto_id, fecha, cantidad, origen, importacion_id)
    select p_business_id,
           coalesce(nullif(f->>'producto_id', '')::uuid,
                    (select p.id from public.productos p
                      where p.business_id = p_business_id and p.nombre_normalizado = f->>'nombre_normalizado')),
           (f->>'fecha')::date, (f->>'cantidad')::numeric, 'importacion', v_importacion
      from jsonb_array_elements(p_filas) as f;
  else
    insert into public.compras (business_id, producto_id, fecha, cantidad, costo_unitario, origen, importacion_id)
    select p_business_id,
           coalesce(nullif(f->>'producto_id', '')::uuid,
                    (select p.id from public.productos p
                      where p.business_id = p_business_id and p.nombre_normalizado = f->>'nombre_normalizado')),
           (f->>'fecha')::date, (f->>'cantidad')::numeric, nullif(f->>'costo_unitario', '')::numeric,
           'importacion', v_importacion
      from jsonb_array_elements(p_filas) as f;
  end if;
  get diagnostics v_filas = row_count;

  update public.importaciones set filas_guardadas = v_filas where id = v_importacion;

  return jsonb_build_object(
    'importacion_id', v_importacion,
    'filas_guardadas', v_filas,
    'productos_creados', v_creados
  );
end;
$$;

-- Solo el servidor (service role) puede llamarla.
revoke all on function public.guardar_importacion(uuid, text, text, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_importacion(uuid, text, text, date, jsonb, jsonb) to service_role;
