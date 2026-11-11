-- =====================================================================
-- Permisos explícitos sobre las tablas de "public" (PROMPT_MAESTRO 6.10)
--
-- Los proyectos nuevos de Supabase en la nube NO otorgan permisos
-- automáticamente a las tablas creadas con SQL (la base local de Docker sí
-- lo hace por defecto). Sin estos GRANT, ni la anon key ni la service role
-- pueden tocar las tablas y la app falla completa.
--
-- Principio de mínimo privilegio, además de RLS:
--   · anon          → SOLO lectura de las 7 tablas del negocio. RLS limita las
--                     filas al negocio demo. Nada de uso_ia ni limite_ip.
--   · service_role  → todo (las rutas de API del servidor). Se salta RLS, por
--                     eso el filtro por business_id en el servidor es obligatorio.
--   · authenticated → se agrega en la Fase 9 junto con sus políticas.
-- Es idempotente: se puede aplicar también sobre la base local.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- anon: solo SELECT, y solo de las tablas que la demo muestra.
grant select on table
  public.negocios,
  public.productos,
  public.importaciones,
  public.pedidos,
  public.ventas,
  public.compras,
  public.ajustes_stock
to anon;

-- service_role: las funciones atómicas (guardar_importacion, recibir_pedido y
-- los contadores) se ejecutan con sus permisos, así que necesita las tablas completas.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Tablas futuras: la service role las podrá usar sin repetir el GRANT.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
