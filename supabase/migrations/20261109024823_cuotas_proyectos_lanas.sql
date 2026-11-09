-- T15 final (MEDIO-2): topes por usuaria en lo que aún no tenía.
--
-- La base es la única barrera (docs/seguridad.md): sin tope, una cuenta puede crear filas hasta
-- llenar el disco. Mismo patrón que patterns_quota: trigger before insert con candado por usuaria
-- (pg_advisory_xact_lock) para que dos inserciones simultáneas no pasen el conteo a la vez.
-- Error 54000 (program_limit_exceeded).
--
--   proyectos        1000 por usuaria
--   notas            10 000 por usuaria (todas sus proyectos)
--   lanas            500 por usuaria
--   versiones        5000 por usuaria en total (snapshot_pattern ya limita a 200 por diseño;
--                    con 500 diseños el tope por diseño permitía 100 000)
--   composición      el nombre de fibra de user_yarns.composition mide 1 a 40 caracteres
--
-- Las funciones de trigger no se invocan por /rpc, pero se les quita EXECUTE a public, anon y
-- authenticated por consistencia: no entran en la lista permitida del check.
--
-- Reversión: ver el bloque comentado al final.

-- ------------------------------------------------------------ proyectos

create function public.projects_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('projects:' || new.owner_id::text));
  if (select count(*) from public.projects where owner_id = new.owner_id) >= 1000 then
    raise exception 'Llegaste al tope de 1000 proyectos' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke execute on function public.projects_quota() from public, anon, authenticated;

create trigger projects_quota before insert on public.projects
  for each row execute function public.projects_quota();

-- ---------------------------------------------------------------- notas

create function public.project_notes_quota()
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
    raise exception 'Llegaste al tope de 10000 notas' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke execute on function public.project_notes_quota() from public, anon, authenticated;

create trigger project_notes_quota before insert on public.project_notes
  for each row execute function public.project_notes_quota();

-- ---------------------------------------------------------------- lanas

create function public.user_yarns_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('user_yarns:' || new.owner_id::text));
  if (select count(*) from public.user_yarns where owner_id = new.owner_id) >= 500 then
    raise exception 'Llegaste al tope de 500 lanas' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke execute on function public.user_yarns_quota() from public, anon, authenticated;

create trigger user_yarns_quota before insert on public.user_yarns
  for each row execute function public.user_yarns_quota();

-- ----------------------------------------------------- versiones (total)

create function public.pattern_versions_quota()
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
    raise exception 'Llegaste al máximo de 5000 versiones guardadas' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke execute on function public.pattern_versions_quota() from public, anon, authenticated;

create trigger pattern_versions_quota before insert on public.pattern_versions
  for each row execute function public.pattern_versions_quota();

-- ------------------------------------- largo del nombre de fibra (lanas)
-- create or replace conserva los grants (ejecutable por anon y authenticated, está en la lista
-- permitida del check). Las filas existentes no se revalidan hasta que se escriban de nuevo.

create or replace function public.composition_is_valid(c jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) between 1 and 10
     and not exists (
       select 1 from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'fiber') <> 'string'
          or char_length(e ->> 'fiber') not between 1 and 40
          or jsonb_typeof(e -> 'percent') <> 'number'
          or (e ->> 'percent')::numeric <= 0
          or (e ->> 'percent')::numeric > 100
     )
     and abs((select sum((e ->> 'percent')::numeric) from jsonb_array_elements(c) e) - 100) <= 0.01;
$$;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración:
--
--   drop trigger pattern_versions_quota on public.pattern_versions;
--   drop function public.pattern_versions_quota();
--   drop trigger user_yarns_quota on public.user_yarns;
--   drop function public.user_yarns_quota();
--   drop trigger project_notes_quota on public.project_notes;
--   drop function public.project_notes_quota();
--   drop trigger projects_quota on public.projects;
--   drop function public.projects_quota();
--   create or replace function public.composition_is_valid(c jsonb)
--   returns boolean language sql immutable set search_path = ''
--   as $f$
--     select jsonb_typeof(c) = 'array'
--        and jsonb_array_length(c) between 1 and 10
--        and not exists (
--          select 1 from jsonb_array_elements(c) e
--          where jsonb_typeof(e) <> 'object'
--             or jsonb_typeof(e -> 'fiber') <> 'string'
--             or jsonb_typeof(e -> 'percent') <> 'number'
--             or (e ->> 'percent')::numeric <= 0
--             or (e ->> 'percent')::numeric > 100
--        )
--        and abs((select sum((e ->> 'percent')::numeric) from jsonb_array_elements(c) e) - 100) <= 0.01;
--   $f$;
