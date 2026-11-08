-- =====================================================================
-- RLS (PROMPT_MAESTRO 6.10)
-- · RLS activo en TODAS las tablas.
-- · El rol anon solo puede LEER los datos del negocio demo.
-- · Nadie escribe con anon ni authenticated: las escrituras pasan por las
--   rutas de API del servidor con la service role (que se salta RLS).
-- · uso_ia y limite_ip son tablas técnicas: sin ninguna política.
-- =====================================================================

alter table public.negocios       enable row level security;
alter table public.productos      enable row level security;
alter table public.importaciones  enable row level security;
alter table public.pedidos        enable row level security;
alter table public.ventas         enable row level security;
alter table public.compras        enable row level security;
alter table public.ajustes_stock  enable row level security;
alter table public.uso_ia         enable row level security;
alter table public.limite_ip      enable row level security;

-- Segunda barrera además de RLS: anon y authenticated no tienen privilegios
-- de escritura en ninguna tabla. En uso_ia y limite_ip la lectura queda
-- cerrada por RLS sin políticas (una consulta de anon devuelve 0 filas).
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;

-- ¿Pertenece este business_id al negocio demo?
-- security definer + search_path fijo: se evalúa sin depender de la RLS
-- de "negocios" y sin riesgo de que otro esquema suplante la tabla.
create or replace function public.es_negocio_demo(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.negocios n
    where n.id = p_business_id and n.es_demo
  );
$$;

revoke all on function public.es_negocio_demo(uuid) from public;
grant execute on function public.es_negocio_demo(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Políticas de lectura para anon (solo el demo)
-- ---------------------------------------------------------------------
create policy anon_lee_negocio_demo on public.negocios
  for select to anon using (es_demo);

create policy anon_lee_productos_demo on public.productos
  for select to anon using (public.es_negocio_demo(business_id));

create policy anon_lee_importaciones_demo on public.importaciones
  for select to anon using (public.es_negocio_demo(business_id));

create policy anon_lee_pedidos_demo on public.pedidos
  for select to anon using (public.es_negocio_demo(business_id));

create policy anon_lee_ventas_demo on public.ventas
  for select to anon using (public.es_negocio_demo(business_id));

create policy anon_lee_compras_demo on public.compras
  for select to anon using (public.es_negocio_demo(business_id));

create policy anon_lee_ajustes_demo on public.ajustes_stock
  for select to anon using (public.es_negocio_demo(business_id));

-- Las políticas para "authenticated" se agregan en la Fase 9 (6.13).
