-- T17 (hallazgos M1 y B5): tope de part_id y `detail` estable en los errores de cuota.
--
-- M1: project_progress.part_id era texto sin tope (la usuaria escribe esa columna). Se limita a 64
--     caracteres. Si ya hubiera filas que lo violen, la migración se detiene (no borra ni recorta).
-- B5: los errores 54000 (program_limit_exceeded) llevan ahora un `detail` fijo, que PostgREST
--     entrega como `details`. El servidor distingue el tope por ese valor y no por el texto del
--     mensaje (que puede cambiar de redacción):
--       projects_quota            -> 'projects'
--       pattern_versions_quota    -> 'versions_total'     (5000 por usuaria)
--       pin_current_version       -> 'versions_per_pattern' (200 por diseño)
--       snapshot_pattern          -> 'versions_per_pattern'
--       patterns_quota            -> 'patterns'           (500 por usuaria)
--       user_yarns_quota          -> 'user_yarns'         (500 por usuaria)
--       project_notes_quota       -> 'project_notes'      (10 000 por usuaria)
-- Los cuerpos son idénticos a los de las migraciones anteriores salvo el `raise`. create or replace
-- conserva los grants; los revoke se repiten al final por claridad.
--
-- Reversión: ver el bloque comentado al final.

-- ------------------------------------------------------------------ M1
do $$
begin
  if exists (select 1 from public.project_progress where char_length(part_id) > 64) then
    raise exception 'project_progress.part_id tiene filas de más de 64 caracteres; revisarlas antes de aplicar';
  end if;
end $$;

alter table public.project_progress
  add constraint project_progress_part_id_len check (part_id is null or char_length(part_id) <= 64);

-- ------------------------------------------------------------------ B5
create or replace function public.projects_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('projects:' || new.owner_id::text));
  if (select count(*) from public.projects where owner_id = new.owner_id) >= 1000 then
    raise exception 'Llegaste al tope de 1000 proyectos' using errcode = '54000', detail = 'projects';
  end if;
  return new;
end;
$$;

create or replace function public.project_notes_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.projects where id = new.project_id;
  -- Proyecto inexistente o ajeno: que lo resuelvan la clave foránea y RLS.
  if v_owner is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('project_notes:' || v_owner::text));
  if (select count(*) from public.project_notes n
        join public.projects p on p.id = n.project_id
       where p.owner_id = v_owner) >= 10000 then
    raise exception 'Llegaste al tope de 10000 notas' using errcode = '54000', detail = 'project_notes';
  end if;
  return new;
end;
$$;

create or replace function public.user_yarns_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('user_yarns:' || new.owner_id::text));
  if (select count(*) from public.user_yarns where owner_id = new.owner_id) >= 500 then
    raise exception 'Llegaste al tope de 500 lanas' using errcode = '54000', detail = 'user_yarns';
  end if;
  return new;
end;
$$;

create or replace function public.pattern_versions_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.patterns where id = new.pattern_id;
  if v_owner is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('pattern_versions:' || v_owner::text));
  if (select count(*) from public.pattern_versions v
        join public.patterns p on p.id = v.pattern_id
       where p.owner_id = v_owner) >= 5000 then
    raise exception 'Llegaste al máximo de 5000 versiones guardadas' using errcode = '54000', detail = 'versions_total';
  end if;
  return new;
end;
$$;

create or replace function public.patterns_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('patterns:' || new.owner_id::text));
  if (select count(*) from public.patterns where owner_id = new.owner_id) >= 500 then
    raise exception 'Llegaste al tope de 500 diseños' using errcode = '54000', detail = 'patterns';
  end if;
  return new;
end;
$$;

create or replace function public.pin_current_version(p_pattern_id uuid, p_document jsonb)
returns table (version_id uuid, version integer, reused boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last record;
begin
  select v.id, v.version, v.document into v_last
  from public.pattern_versions v
  where v.pattern_id = p_pattern_id
  order by v.version desc
  limit 1;

  if found and v_last.document = p_document then
    return query select v_last.id, v_last.version, true;
    return;
  end if;

  if coalesce(v_last.version, 0) + 1 > 200 then
    raise exception 'Este patrón llegó al máximo de 200 versiones guardadas' using errcode = '54000', detail = 'versions_per_pattern';
  end if;

  return query
    insert into public.pattern_versions as pv (pattern_id, version, document)
    values (p_pattern_id, coalesce(v_last.version, 0) + 1, p_document)
    returning pv.id, pv.version, false;
end;
$$;

create or replace function public.snapshot_pattern(p_pattern_id uuid, p_label text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc jsonb;
  v_next integer;
begin
  select document into v_doc
  from public.patterns
  where id = p_pattern_id and owner_id = auth.uid()
  for update;

  if v_doc is null then
    raise exception 'Patrón no encontrado' using errcode = 'P0002';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.pattern_versions where pattern_id = p_pattern_id;

  if v_next > 200 then
    raise exception 'Este patrón llegó al máximo de 200 versiones guardadas' using errcode = '54000', detail = 'versions_per_pattern';
  end if;

  insert into public.pattern_versions (pattern_id, version, label, document)
  values (p_pattern_id, v_next, left(p_label, 80), v_doc);

  return v_next;
end;
$$;

revoke execute on function public.projects_quota() from public, anon, authenticated;
revoke execute on function public.project_notes_quota() from public, anon, authenticated;
revoke execute on function public.user_yarns_quota() from public, anon, authenticated;
revoke execute on function public.pattern_versions_quota() from public, anon, authenticated;
revoke execute on function public.patterns_quota() from public, anon, authenticated;
revoke execute on function public.pin_current_version(uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.snapshot_pattern(uuid, text) from public, anon;
grant execute on function public.snapshot_pattern(uuid, text) to authenticated;

-- ------------------------------------------------------------- reversión
-- Quitar la restricción y volver a los `raise` sin detail (cuerpos de las migraciones
-- 20261104034436, 20261106153415, 20261109024823 y 20261111031813: repetir `create or replace` de
-- cada función con su `raise ... using errcode = '54000'` original, sin `detail`). La restricción:
--
--   alter table public.project_progress drop constraint project_progress_part_id_len;
