-- Fase 3, T7: "Tejer este diseño" (ADR 0009, con la enmienda T1-9).
--
-- 1. projects.pattern_version (entero sin clave foránea) se elimina; si hubiera filas con valor, la
--    migración falla en vez de borrar datos en silencio.
-- 2. projects.pattern_version_id -> pattern_versions(id) ON DELETE NO ACTION: un diseño con proyectos
--    no se puede borrar (23503). Borrar la cuenta sigue funcionando: la cascada desde auth.users borra
--    proyectos y patrones (y versiones) en la misma sentencia, y NO ACTION se comprueba al final.
--    Clave foránea compuesta (pattern_version_id, pattern_id): la versión es del patrón del proyecto
--    cuando las dos columnas tienen valor.
-- 3. El cliente ya no escribe pattern_id ni pattern_version_id (ni INSERT ni UPDATE). INSERT del
--    cliente limitado a (id, owner_id, title, status) y UPDATE a (title, status).
-- 4. pattern_versions: inmutable también para service_role (disparador before update).
-- 5. project_progress: cotas generales del puntero (ADR 0007, LIMITS); el cliente escribe solo el
--    puntero (part_id, round_number, stitch_index). `device` ya no lo escribe (no se usa en la fase 3).
--    Concurrencia optimista: la Server Action escribe con `where updated_at = $esperado`.
-- 6. start_chart_project y repin_project: security definer, search_path vacío, atómicas.
--
-- QUIÉN VALIDA `valid` (ADR 0006, E10): la Server Action (T11) lee el documento desde la base, lo
-- pasa por migratePattern y validatePattern sin opciones y exige `valid`. La base no puede ejecutar el
-- validador, así que estas funciones NO son ejecutables por anon ni authenticated: si lo fueran,
-- cualquier sesión podría llamarlas por /rpc con el updated_at actual de un borrador con errores de
-- tejido y fijarlo sin validar. Solo service_role las ejecuta; la Server Action las llama con la clave
-- secreta DESPUÉS de validar, pasando p_owner_id = id de la sesión verificada con auth.getUser().
-- El updated_at exacto garantiza que el documento fijado es el mismo que se validó.
--
-- Reversión: ver el bloque comentado al final.

-- ----------------------------------------------- 1. eliminar projects.pattern_version

do $$
begin
  if exists (select 1 from public.projects where pattern_version is not null) then
    raise exception 'projects.pattern_version tiene datos: revisar antes de eliminar la columna (ADR 0009, T1-9)'
      using errcode = 'P0001';
  end if;
end $$;

alter table public.projects drop column pattern_version;

-- ----------------------------------------------- 2. versión fijada

alter table public.pattern_versions
  add constraint pattern_versions_id_pattern_key unique (id, pattern_id);

alter table public.projects
  add column pattern_version_id uuid
    constraint projects_pattern_version_id_fkey references public.pattern_versions (id) on delete no action;

-- MATCH SIMPLE: solo se exige con las dos columnas con valor. Si se borra el patrón, pattern_id pasa a
-- null (on delete set null) y la clave simple de arriba hace fallar la sentencia con 23503.
alter table public.projects
  add constraint projects_pattern_version_of_pattern
    foreign key (pattern_version_id, pattern_id) references public.pattern_versions (id, pattern_id)
    on delete no action;

create index projects_pattern_version_idx on public.projects (pattern_version_id);

-- ----------------------------------------------- 3. permisos por columna de projects

revoke insert, update on public.projects from anon, authenticated;
grant insert (id, owner_id, title, status) on public.projects to authenticated;
grant update (title, status) on public.projects to authenticated;

-- ----------------------------------------------- 4. versiones inmutables para todos

create function public.pattern_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las versiones guardadas no se modifican' using errcode = '42501';
end;
$$;
revoke execute on function public.pattern_versions_immutable() from public, anon, authenticated;

create trigger pattern_versions_immutable before update on public.pattern_versions
  for each row execute function public.pattern_versions_immutable();

-- ----------------------------------------------- 5. avance

alter table public.project_progress
  add constraint project_progress_round_number_max check (round_number <= 100001),
  add constraint project_progress_stitch_index_max check (stitch_index <= 100000);

revoke insert, update on public.project_progress from anon, authenticated;
grant insert (project_id, part_id, round_number, stitch_index) on public.project_progress to authenticated;
grant update (part_id, round_number, stitch_index) on public.project_progress to authenticated;

-- ----------------------------------------------- 6. funciones

-- Errores (SQLSTATE):
--   P0002  patrón o proyecto inexistente o ajeno (no se distingue, para no revelar existencia)
--   22023  el patrón no es un gráfico, el proyecto no tiene patrón, o faltan argumentos
--   PT409  conflicto: el diseño cambió (detail 'pattern') o el avance cambió (detail 'progress')
--   54000  topes: 200 versiones por diseño, 5000 versiones o 1000 proyectos por usuaria
--   23514  título fuera de 1 a 120 caracteres (CHECK de projects)

-- Fija la versión actual del diseño: reutiliza la última si su documento es idéntico; si no, crea
-- una (misma lógica y topes que snapshot_pattern). Llamar con la fila del patrón ya bloqueada.
create function public.pin_current_version(p_pattern_id uuid, p_document jsonb)
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
    raise exception 'Este patrón llegó al máximo de 200 versiones guardadas' using errcode = '54000';
  end if;

  return query
    insert into public.pattern_versions as pv (pattern_id, version, document)
    values (p_pattern_id, coalesce(v_last.version, 0) + 1, p_document)
    returning pv.id, pv.version, false;
end;
$$;
-- Interna: solo la llaman las dos funciones de abajo (con el patrón bloqueado). Nadie más la ejecuta.
revoke execute on function public.pin_current_version(uuid, jsonb) from public, anon, authenticated, service_role;

create function public.start_chart_project(
  p_owner_id uuid,
  p_pattern_id uuid,
  p_expected_updated_at timestamptz,
  p_title text default null
)
returns table (project_id uuid, version integer, reused boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pattern record;
  v_pin record;
  v_project uuid;
begin
  if p_owner_id is null or p_pattern_id is null or p_expected_updated_at is null then
    raise exception 'Faltan argumentos' using errcode = '22023';
  end if;

  select p.id, p.owner_id, p.kind, p.title, p.updated_at, p.document into v_pattern
  from public.patterns p
  where p.id = p_pattern_id
  for update;

  if not found or v_pattern.owner_id <> p_owner_id then
    raise exception 'Patrón no encontrado' using errcode = 'P0002';
  end if;
  if v_pattern.kind <> 'chart' then
    raise exception 'Solo se pueden tejer gráficos de colorwork' using errcode = '22023';
  end if;
  if v_pattern.updated_at <> p_expected_updated_at then
    raise exception 'El diseño cambió desde que se validó' using errcode = 'PT409', detail = 'pattern';
  end if;

  select * into v_pin from public.pin_current_version(p_pattern_id, v_pattern.document);

  insert into public.projects (owner_id, title, status, pattern_id, pattern_version_id)
  values (p_owner_id, coalesce(nullif(btrim(p_title), ''), v_pattern.title), 'in_progress',
          p_pattern_id, v_pin.version_id)
  returning id into v_project;

  insert into public.project_progress (project_id, part_id, round_number, stitch_index)
  values (v_project, null, 1, 0);

  return query select v_project, v_pin.version, v_pin.reused;
end;
$$;
revoke execute on function public.start_chart_project(uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.start_chart_project(uuid, uuid, timestamptz, text) to service_role;

-- Cambia la versión fijada a la del diseño actual y escribe, en la misma transacción, el puntero
-- reubicado con remapPointer (ADR 0007). Exige el updated_at del avance que vio la Server Action
-- (null si el proyecto aún no tiene fila de avance): así no se pisa en silencio un avance hecho en
-- otro dispositivo, y cualquier escritura en vuelo con el updated_at viejo da conflicto.
create function public.repin_project(
  p_owner_id uuid,
  p_project_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_progress_updated_at timestamptz,
  p_round_number integer,
  p_stitch_index integer
)
returns table (version integer, reused boolean, progress_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project record;
  v_pattern record;
  v_progress record;
  v_pin record;
  v_at timestamptz;
begin
  if p_owner_id is null or p_project_id is null or p_expected_updated_at is null
     or p_round_number is null or p_stitch_index is null then
    raise exception 'Faltan argumentos' using errcode = '22023';
  end if;

  select pr.id, pr.owner_id, pr.pattern_id into v_project
  from public.projects pr
  where pr.id = p_project_id
  for update;

  if not found or v_project.owner_id <> p_owner_id then
    raise exception 'Proyecto no encontrado' using errcode = 'P0002';
  end if;
  if v_project.pattern_id is null then
    raise exception 'El proyecto no tiene un diseño asociado' using errcode = '22023';
  end if;

  select p.id, p.owner_id, p.kind, p.updated_at, p.document into v_pattern
  from public.patterns p
  where p.id = v_project.pattern_id
  for update;

  if not found or v_pattern.owner_id <> p_owner_id then
    raise exception 'Patrón no encontrado' using errcode = 'P0002';
  end if;
  if v_pattern.kind <> 'chart' then
    raise exception 'Solo se pueden tejer gráficos de colorwork' using errcode = '22023';
  end if;
  if v_pattern.updated_at <> p_expected_updated_at then
    raise exception 'El diseño cambió desde que se validó' using errcode = 'PT409', detail = 'pattern';
  end if;

  select pp.updated_at into v_progress
  from public.project_progress pp
  where pp.project_id = p_project_id
  for update;

  if (found and v_progress.updated_at is distinct from p_expected_progress_updated_at)
     or (not found and p_expected_progress_updated_at is not null) then
    raise exception 'El avance cambió en otro dispositivo' using errcode = 'PT409', detail = 'progress';
  end if;

  select * into v_pin from public.pin_current_version(v_project.pattern_id, v_pattern.document);

  update public.projects set pattern_version_id = v_pin.version_id where id = p_project_id;

  -- Siempre se escribe (aunque el puntero no cambie) para renovar updated_at (set_updated_at, now() de
  -- esta transacción): la escritura en vuelo de otro dispositivo, con el updated_at anterior, da conflicto.
  insert into public.project_progress as pp (project_id, part_id, round_number, stitch_index)
  values (p_project_id, null, p_round_number, p_stitch_index)
  on conflict (project_id) do update
    set part_id = null, round_number = excluded.round_number, stitch_index = excluded.stitch_index
  returning pp.updated_at into v_at;

  return query select v_pin.version, v_pin.reused, v_at;
end;
$$;
revoke execute on function public.repin_project(uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.repin_project(uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración (la columna pattern_version vuelve vacía; los proyectos pierden la
-- versión fijada):
--
--   drop function public.repin_project(uuid, uuid, timestamptz, timestamptz, integer, integer);
--   drop function public.start_chart_project(uuid, uuid, timestamptz, text);
--   drop function public.pin_current_version(uuid, jsonb);
--   revoke insert, update on public.project_progress from authenticated;
--   grant insert on public.project_progress to anon, authenticated;
--   grant update (part_id, round_number, stitch_index, device) on public.project_progress to authenticated;
--   alter table public.project_progress drop constraint project_progress_stitch_index_max,
--     drop constraint project_progress_round_number_max;
--   drop trigger pattern_versions_immutable on public.pattern_versions;
--   drop function public.pattern_versions_immutable();
--   revoke insert, update on public.projects from authenticated;
--   alter table public.projects add column pattern_version integer;
--   grant insert on public.projects to anon, authenticated;
--   grant update (title, status, pattern_id, pattern_version) on public.projects to authenticated;
--   alter table public.projects drop constraint projects_pattern_version_of_pattern;
--   drop index public.projects_pattern_version_idx;
--   alter table public.projects drop column pattern_version_id;
--   alter table public.pattern_versions drop constraint pattern_versions_id_pattern_key;
