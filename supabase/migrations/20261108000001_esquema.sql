-- =====================================================================
-- Demand Planning AI · Esquema base (Fase 1)
-- Todas las tablas viven en "public" y tienen RLS (ver migración 0002).
-- El stock NUNCA se guarda: se deriva de movimientos (PROMPT_MAESTRO 5.2).
-- =====================================================================

-- Normaliza un nombre de producto igual que lib/importar/mapeo.ts:
-- minúsculas, sin tildes, espacios recortados y colapsados.
create or replace function public.normalizar_nombre(texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    btrim(
      translate(
        lower(texto),
        'áéíóúüñàèìòùâêîôûäëïö',
        'aeiouunaeiouaeiouaeio'
      )
    ),
    '\s+', ' ', 'g'
  );
$$;

-- ---------------------------------------------------------------------
-- negocios: tabla raíz (sin business_id; su RLS se define sobre id)
-- ---------------------------------------------------------------------
create table public.negocios (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(btrim(nombre)) > 0),
  es_demo    boolean not null default false,
  -- Un negocio por usuario en esta versión (único). Nulo en el demo.
  owner_id   uuid unique references auth.users (id) on delete cascade,
  creado_en  timestamptz not null default now(),
  -- El demo nunca tiene dueño.
  constraint demo_sin_dueno check (not (es_demo and owner_id is not null))
);

-- A lo más un negocio demo (la función restaurar_demo garantiza que exista).
create unique index negocios_un_solo_demo on public.negocios (es_demo) where es_demo;

-- ---------------------------------------------------------------------
-- productos
-- ---------------------------------------------------------------------
create table public.productos (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null references public.negocios (id) on delete cascade,
  nombre                  text not null check (length(btrim(nombre)) > 0),
  nombre_normalizado      text not null,
  unidad                  text not null default 'un',
  categoria               text,
  perecible               boolean not null default false,
  dias_vida_util          integer,
  costo                   numeric(12,2) not null default 0 check (costo >= 0),
  precio                  numeric(12,2) not null default 0 check (precio >= 0),
  dias_entrega_proveedor  integer not null default 2 check (dias_entrega_proveedor >= 0),
  dias_colchon            integer not null default 1 check (dias_colchon >= 0),
  stock_inicial           numeric(12,3) not null default 0 check (stock_inicial >= 0),
  fecha_stock_inicial     date not null,
  datos_incompletos       boolean not null default false,
  -- Vida útil: obligatoria (≥ 1) si es perecible, nula si no lo es.
  constraint vida_util_coherente check (
    (perecible and dias_vida_util is not null and dias_vida_util >= 1)
    or (not perecible and dias_vida_util is null)
  ),
  constraint productos_nombre_unico unique (business_id, nombre_normalizado),
  -- Permite que los movimientos referencien (id, business_id) y así
  -- impedir que una venta apunte a un producto de otro negocio.
  constraint productos_id_negocio unique (id, business_id)
);

-- ---------------------------------------------------------------------
-- importaciones (agrupan filas de venta/compra para borrarlas juntas)
-- ---------------------------------------------------------------------
create table public.importaciones (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.negocios (id) on delete cascade,
  tipo             text not null check (tipo in ('venta', 'compra')),
  nombre_archivo   text not null,
  creada_en        timestamptz not null default now(),
  filas_guardadas  integer not null default 0 check (filas_guardadas >= 0),
  constraint importaciones_id_negocio unique (id, business_id)
);

-- ---------------------------------------------------------------------
-- pedidos (estado: pedido → recibido | cancelado)
-- ---------------------------------------------------------------------
create table public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.negocios (id) on delete cascade,
  producto_id      uuid not null,
  cantidad         numeric(12,3) not null check (cantidad > 0),
  estado           text not null default 'pedido' check (estado in ('pedido', 'recibido', 'cancelado')),
  fecha_pedido     date not null,
  fecha_recepcion  date,
  constraint pedidos_producto_fk foreign key (producto_id, business_id)
    references public.productos (id, business_id) on delete cascade,
  constraint pedidos_id_negocio unique (id, business_id)
);

-- ---------------------------------------------------------------------
-- ventas
-- ---------------------------------------------------------------------
create table public.ventas (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.negocios (id) on delete cascade,
  producto_id     uuid not null,
  fecha           date not null,
  cantidad        numeric(12,3) not null check (cantidad > 0),
  origen          text not null check (origen in ('manual', 'importacion', 'pedido')),
  importacion_id  uuid,
  constraint ventas_producto_fk foreign key (producto_id, business_id)
    references public.productos (id, business_id) on delete cascade,
  constraint ventas_importacion_fk foreign key (importacion_id)
    references public.importaciones (id) on delete cascade
);

-- ---------------------------------------------------------------------
-- compras (una recepción de pedido genera una sola compra: pedido_id único)
-- ---------------------------------------------------------------------
create table public.compras (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.negocios (id) on delete cascade,
  producto_id     uuid not null,
  fecha           date not null,
  cantidad        numeric(12,3) not null check (cantidad > 0),
  costo_unitario  numeric(12,2) check (costo_unitario is null or costo_unitario >= 0),
  origen          text not null check (origen in ('manual', 'importacion', 'pedido')),
  importacion_id  uuid,
  pedido_id       uuid unique,
  constraint compras_producto_fk foreign key (producto_id, business_id)
    references public.productos (id, business_id) on delete cascade,
  constraint compras_importacion_fk foreign key (importacion_id)
    references public.importaciones (id) on delete cascade,
  constraint compras_pedido_fk foreign key (pedido_id)
    references public.pedidos (id) on delete cascade,
  -- Una compra con pedido_id debe tener origen 'pedido'.
  constraint compras_origen_pedido check (pedido_id is null or origen = 'pedido')
);

-- ---------------------------------------------------------------------
-- ajustes_stock (conteo físico, merma u otro; la cantidad puede ser negativa)
-- ---------------------------------------------------------------------
create table public.ajustes_stock (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.negocios (id) on delete cascade,
  producto_id  uuid not null,
  fecha        date not null,
  cantidad     numeric(12,3) not null check (cantidad <> 0),
  motivo       text not null check (motivo in ('merma', 'conteo', 'otro')),
  nota         text,
  constraint ajustes_producto_fk foreign key (producto_id, business_id)
    references public.productos (id, business_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- uso_ia: contador diario de llamadas a la IA (tope por negocio y global)
-- ---------------------------------------------------------------------
create table public.uso_ia (
  business_id     uuid not null references public.negocios (id) on delete cascade,
  fecha           date not null,
  ruta            text not null,
  version_prompt  text not null,
  llamadas        integer not null default 0 check (llamadas >= 0),
  primary key (business_id, fecha, ruta, version_prompt)
);

-- ---------------------------------------------------------------------
-- limite_ip: tabla técnica (sin business_id). Solo hash de la IP.
-- ---------------------------------------------------------------------
create table public.limite_ip (
  ip_hash         text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  ruta            text not null,
  ventana_inicio  timestamptz not null,
  llamadas        integer not null default 0 check (llamadas >= 0),
  primary key (ip_hash, ruta, ventana_inicio)
);

-- ---------------------------------------------------------------------
-- Índices para las lecturas habituales (por negocio, producto y fecha)
-- ---------------------------------------------------------------------
create index ventas_negocio_producto_fecha  on public.ventas (business_id, producto_id, fecha);
create index compras_negocio_producto_fecha on public.compras (business_id, producto_id, fecha);
create index ajustes_negocio_producto_fecha on public.ajustes_stock (business_id, producto_id, fecha);
create index pedidos_negocio_estado         on public.pedidos (business_id, estado);
create index ventas_importacion             on public.ventas (importacion_id) where importacion_id is not null;
create index compras_importacion            on public.compras (importacion_id) where importacion_id is not null;
create index uso_ia_fecha                   on public.uso_ia (fecha);
