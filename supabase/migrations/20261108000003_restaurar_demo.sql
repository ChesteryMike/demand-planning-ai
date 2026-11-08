-- =====================================================================
-- restaurar_demo() (PROMPT_MAESTRO 6.10)
-- Borra y vuelve a cargar los datos de "Panadería Don Aldo".
-- · Solo toca el negocio con es_demo = true (DEMO_BUSINESS_ID fijo).
-- · 10 productos y 12 semanas (84 días) de ventas que terminan AYER,
--   relativas a la fecha de restauración en America/Santiago.
-- · Ventas pseudoaleatorias con semilla fija (md5), sábado +60 %, domingo +40 %.
-- · El pan es producción propia: se modela como compra diaria con
--   dias_entrega_proveedor = 0. El resto es reventa con compra semanal.
-- · El stock inicial se calcula para que, al restaurar, el Panel muestre
--   al menos un producto en quiebre, merma, sobrestock, normal y sin_ventas.
-- · No borra uso_ia: restaurar la demo no debe reiniciar el tope diario de IA.
-- =====================================================================

create or replace function public.restaurar_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Debe coincidir con lib/negocio-demo.ts
  v_demo         constant uuid := '00000000-0000-4000-8000-000000000001';
  v_hoy          constant date := (now() at time zone 'America/Santiago')::date;
  v_inicio_stock constant date := v_hoy - 14;   -- fecha_stock_inicial de todos
  p              record;
  v_producto     uuid;
  d              integer;
  v_fecha        date;
  v_dow          integer;
  v_factor       numeric;
  v_u            numeric;
  v_cantidad     numeric;
  v_prom         numeric;
  v_ventas_vent  numeric;
  v_compras_vent numeric;
  v_objetivo     numeric;
  v_stock_ini    numeric;
begin
  if exists (select 1 from public.negocios where es_demo and id <> v_demo) then
    raise exception 'Hay otro negocio marcado como demo; no se restaura nada.';
  end if;

  insert into public.negocios (id, nombre, es_demo, owner_id)
  values (v_demo, 'Panadería Don Aldo', true, null)
  on conflict (id) do update
    set nombre = excluded.nombre, es_demo = true, owner_id = null;

  -- Borrado solo del demo. Los productos arrastran ventas, compras,
  -- ajustes y pedidos (on delete cascade); las importaciones, sus filas.
  delete from public.importaciones where business_id = v_demo;
  delete from public.productos     where business_id = v_demo;

  -- nombre, unidad, categoría, perecible, vida útil, costo, precio,
  -- días de entrega, días de colchón, venta base diaria, cobertura objetivo
  -- (días de stock al restaurar; nula = sin ventas), tipo de reposición,
  -- y si solo tiene ventas antiguas (> 28 días).
  for p in
    select * from (values
      -- Producción propia (E = 0), perecibles
      ('Marraqueta',          'kg', 'Producción propia', true,  1,    1200, 2200, 0, 1, 40.0, 0.5::numeric,  'diaria',  false), -- quiebre (0,5 < 1)
      ('Hallulla',            'kg', 'Producción propia', true,  2,    1300, 2400, 0, 1, 25.0, 1.5,           'diaria',  false), -- normal  (1 ≤ 1,5 ≤ 2)
      ('Pan amasado',         'un', 'Producción propia', true,  3,     150,  300, 0, 1, 30.0, 5.0,           'diaria',  false), -- merma   (5 > vida 3)
      -- Reventa: lácteos
      ('Leche entera 1L',     'un', 'Lácteos',           true,  10,    890, 1190, 2, 1, 18.0, 6.0,           'semanal', false), -- normal  (3 ≤ 6 ≤ 10)
      ('Yogur natural',       'un', 'Lácteos',           true,  20,    450,  700, 2, 1, 12.0, 2.0,           'semanal', false), -- quiebre (2 < 3)
      -- Reventa: abarrotes y bebidas (no perecibles)
      ('Arroz grado 1 1kg',   'un', 'Abarrotes',         false, null, 1100, 1590, 5, 2,  6.0, 30.0,          'semanal', false), -- sobrestock (30 > 3 × 7)
      ('Azúcar 1kg',          'un', 'Abarrotes',         false, null,  950, 1390, 5, 2,  8.0, 12.0,          'semanal', false), -- normal  (7 ≤ 12 ≤ 21)
      ('Aceite vegetal 1L',   'un', 'Abarrotes',         false, null, 2100, 2890, 5, 2,  5.0, 9.0,           'semanal', false), -- normal  (7 ≤ 9 ≤ 21)
      ('Bebida cola 1,5L',    'un', 'Bebidas',           false, null, 1250, 1990, 3, 1, 15.0, 3.0,           'semanal', false), -- quiebre (3 < 4)
      ('Harina 1kg',          'un', 'Abarrotes',         false, null,  800, 1190, 3, 1,  4.0, null,          'semanal', true)   -- sin_ventas
    ) as t(nombre, unidad, categoria, perecible, vida, costo, precio,
           entrega, colchon, base, cobertura, reposicion, solo_antiguas)
  loop
    insert into public.productos (
      business_id, nombre, nombre_normalizado, unidad, categoria, perecible,
      dias_vida_util, costo, precio, dias_entrega_proveedor, dias_colchon,
      stock_inicial, fecha_stock_inicial, datos_incompletos
    ) values (
      v_demo, p.nombre, public.normalizar_nombre(p.nombre), p.unidad, p.categoria, p.perecible,
      p.vida, p.costo, p.precio, p.entrega, p.colchon,
      0, v_inicio_stock, false
    )
    returning id into v_producto;

    -- d = días antes de hoy (1 = ayer, 84 = hace 12 semanas)
    for d in 1..84 loop
      -- Un producto "sin ventas" dejó de venderse hace más de 5 semanas.
      continue when p.solo_antiguas and d <= 35;

      v_fecha  := v_hoy - d;
      v_dow    := extract(dow from v_fecha);           -- 0 = domingo, 6 = sábado
      v_factor := case v_dow when 6 then 1.6 when 0 then 1.4 else 1.0 end;
      -- Ruido determinista en [0,85; 1,15) a partir de una semilla fija.
      v_u := ('x' || substr(md5('don-aldo:' || p.nombre || ':' || d), 1, 7))::bit(28)::integer
             / 268435456.0;
      v_cantidad := greatest(1, round(p.base * v_factor * (0.85 + 0.30 * v_u)));

      insert into public.ventas (business_id, producto_id, fecha, cantidad, origen)
      values (v_demo, v_producto, v_fecha, v_cantidad, 'manual');

      -- Producción propia: cada día se "compra" (hornea) lo que se vende.
      if p.reposicion = 'diaria' then
        insert into public.compras (business_id, producto_id, fecha, cantidad, costo_unitario, origen)
        values (v_demo, v_producto, v_fecha, v_cantidad, p.costo, 'manual');
      end if;
    end loop;

    -- Reventa: una compra semanal ≈ una semana de venta (base × 8, por los
    -- factores de fin de semana: 5 + 1,6 + 1,4 = 8).
    if p.reposicion = 'semanal' then
      for d in 1..84 loop
        continue when d % 7 <> 3;
        continue when p.solo_antiguas and d <= 35;
        insert into public.compras (business_id, producto_id, fecha, cantidad, costo_unitario, origen)
        values (v_demo, v_producto, v_hoy - d, round(p.base * 8), p.costo, 'manual');
      end loop;
    end if;

    -- Promedio diario igual que lib/planificacion.ts: ventana hoy−28..hoy−1,
    -- n = 28 porque hay 84 días de historial.
    select coalesce(sum(cantidad), 0) / 28.0 into v_prom
      from public.ventas
     where producto_id = v_producto and fecha between v_hoy - 28 and v_hoy - 1;

    select coalesce(sum(cantidad), 0) into v_ventas_vent
      from public.ventas where producto_id = v_producto and fecha >= v_inicio_stock;
    select coalesce(sum(cantidad), 0) into v_compras_vent
      from public.compras where producto_id = v_producto and fecha >= v_inicio_stock;

    -- Stock deseado hoy: cobertura objetivo × promedio (sin ventas: 20 unidades).
    v_objetivo := case when p.cobertura is null then 20 else round(p.cobertura * v_prom) end;

    -- stockActual = stock_inicial + compras − ventas (desde fecha_stock_inicial)
    v_stock_ini := v_objetivo - v_compras_vent + v_ventas_vent;
    if v_stock_ini < 0 then
      raise exception 'Datos demo incoherentes: stock inicial negativo para %', p.nombre;
    end if;

    update public.productos set stock_inicial = v_stock_ini where id = v_producto;
  end loop;
end;
$$;

-- Ejecutable solo por la service role (y el dueño, para seed.sql).
revoke all on function public.restaurar_demo() from public, anon, authenticated;
grant execute on function public.restaurar_demo() to service_role;
