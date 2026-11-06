-- T15 (revisión de seguridad de T4): M2, M3 y M4.
--
-- M2. Publicar no es una operación de la usuaria con la base abierta: hoy `authenticated` podía
--     hacer `update patterns set visibility = 'public'` (y insertar con ese valor) saltándose la
--     aplicación. Ahora no tiene permiso sobre la columna `visibility`: toda fila que crea el
--     cliente nace `private` (default de la columna) y solo el servidor con la clave secreta
--     (service_role) o el superusuario la cambia. Publicar llega en la fase 7 con una Server Action
--     que exigirá `valid` y escribirá con service_role (o una función security definer que lo exija).
--     Las Server Actions no son una barrera: la base es la única barrera (docs/seguridad.md).
--     El INSERT del cliente queda limitado a una lista de columnas (sin `visibility`).
--
-- M3. Cuota de diseños: 500 por usuaria, en un trigger before insert con candado por usuaria
--     (igual que pattern_reports_quota). Error 54000.
--
-- M4. list_public_patterns: máximo 24 por página (antes 100) para `anon`. Devolver un resumen sin
--     `document` y paginar por cursor queda para la fase 7.
--
-- Reversión: ver el bloque comentado al final.

-- ------------------------------------------------------------------- M2

revoke insert, update on public.patterns from anon, authenticated;

grant insert (id, owner_id, title, technique, kind, schema_version, origin, document) on public.patterns to authenticated;
grant update (title, technique, kind, schema_version, origin, document) on public.patterns to authenticated;

-- ------------------------------------------------------------------- M3

create function public.patterns_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('patterns:' || new.owner_id::text));
  if (select count(*) from public.patterns where owner_id = new.owner_id) >= 500 then
    raise exception 'Llegaste al tope de 500 diseños' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger patterns_quota before insert on public.patterns
  for each row execute function public.patterns_quota();

-- ------------------------------------------------------------------- M4

create or replace function public.list_public_patterns(p_limit integer default 24, p_offset integer default 0)
returns table (
  id uuid, title text, technique text, kind text, schema_version smallint,
  origin text, document jsonb, author_name text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title, p.technique, p.kind, p.schema_version, p.origin, p.document,
         coalesce(pr.display_name, 'Tejedora'), p.updated_at
  from public.patterns p
  left join public.profiles pr on pr.id = p.owner_id
  where p.visibility = 'public'
  order by p.updated_at desc
  limit least(greatest(p_limit, 1), 24) offset greatest(p_offset, 0);
$$;

-- create or replace conserva los grants; se repiten por si la función se recreara.
revoke execute on function public.list_public_patterns(integer, integer) from public;
grant execute on function public.list_public_patterns(integer, integer) to anon, authenticated;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración:
--
--   create or replace function public.list_public_patterns(p_limit integer default 24, p_offset integer default 0)
--   returns table (id uuid, title text, technique text, kind text, schema_version smallint,
--     origin text, document jsonb, author_name text, updated_at timestamptz)
--   language sql stable security definer set search_path = ''
--   as $f$
--     select p.id, p.title, p.technique, p.kind, p.schema_version, p.origin, p.document,
--            coalesce(pr.display_name, 'Tejedora'), p.updated_at
--     from public.patterns p left join public.profiles pr on pr.id = p.owner_id
--     where p.visibility = 'public'
--     order by p.updated_at desc
--     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
--   $f$;
--   drop trigger patterns_quota on public.patterns;
--   drop function public.patterns_quota();
--   revoke insert, update on public.patterns from authenticated;
--   grant insert on public.patterns to anon, authenticated;
--   grant update (title, technique, kind, schema_version, origin, visibility, document) on public.patterns to authenticated;
