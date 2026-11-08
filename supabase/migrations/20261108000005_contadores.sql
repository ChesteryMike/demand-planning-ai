-- =====================================================================
-- Contadores atómicos (PROMPT_MAESTRO 6.8 y 6.10). Solo service role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- registrar_uso_ia: ANTES de cada llamada a la IA.
-- Si el negocio llegó a su tope diario, o la suma de todos los negocios
-- llegó al tope global, NO incrementa y devuelve el motivo.
-- Si no, incrementa uso_ia (con la versión del prompt) y permite la llamada.
-- Un candado por fecha evita que dos llamadas simultáneas pasen el tope.
-- ---------------------------------------------------------------------
create or replace function public.registrar_uso_ia(
  p_business_id    uuid,
  p_fecha          date,
  p_ruta           text,
  p_version_prompt text,
  p_tope_negocio   integer,
  p_tope_global    integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uso_negocio integer;
  v_uso_global  integer;
begin
  perform pg_advisory_xact_lock(hashtext('uso_ia:' || p_fecha::text));

  select coalesce(sum(llamadas), 0) into v_uso_global from public.uso_ia where fecha = p_fecha;
  select coalesce(sum(llamadas), 0) into v_uso_negocio
    from public.uso_ia where fecha = p_fecha and business_id = p_business_id;

  if v_uso_global >= p_tope_global then
    return jsonb_build_object('permitido', false, 'motivo', 'global',
                              'uso_negocio', v_uso_negocio, 'uso_global', v_uso_global);
  end if;
  if v_uso_negocio >= p_tope_negocio then
    return jsonb_build_object('permitido', false, 'motivo', 'negocio',
                              'uso_negocio', v_uso_negocio, 'uso_global', v_uso_global);
  end if;

  insert into public.uso_ia (business_id, fecha, ruta, version_prompt, llamadas)
  values (p_business_id, p_fecha, p_ruta, p_version_prompt, 1)
  on conflict (business_id, fecha, ruta, version_prompt)
  do update set llamadas = public.uso_ia.llamadas + 1;

  return jsonb_build_object('permitido', true, 'motivo', null,
                            'uso_negocio', v_uso_negocio + 1, 'uso_global', v_uso_global + 1);
end;
$$;

revoke all on function public.registrar_uso_ia(uuid, date, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.registrar_uso_ia(uuid, date, text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------
-- registrar_llamada_ip: suma 1 a la ventana (ip_hash, ruta, ventana_inicio)
-- y devuelve el total; lib/limite-ip.ts decide si supera el máximo.
-- Solo se guarda el hash de la IP. De paso borra ventanas viejas de esa IP.
-- ---------------------------------------------------------------------
create or replace function public.registrar_llamada_ip(
  p_ip_hash        text,
  p_ruta           text,
  p_ventana_inicio timestamptz
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_llamadas integer;
begin
  insert into public.limite_ip (ip_hash, ruta, ventana_inicio, llamadas)
  values (p_ip_hash, p_ruta, p_ventana_inicio, 1)
  on conflict (ip_hash, ruta, ventana_inicio)
  do update set llamadas = public.limite_ip.llamadas + 1
  returning llamadas into v_llamadas;

  delete from public.limite_ip
   where ip_hash = p_ip_hash and ventana_inicio < p_ventana_inicio - interval '1 day';

  return v_llamadas;
end;
$$;

revoke all on function public.registrar_llamada_ip(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.registrar_llamada_ip(text, text, timestamptz) to service_role;
