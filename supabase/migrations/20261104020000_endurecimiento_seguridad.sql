-- Correcciones de la revisión de seguridad (revisor-seguridad, 2026-11-04).
-- M1 origen IA protegido · M2 patrones públicos sin datos de la autora · M3 subidas solo por el servidor
-- B2 yarns como arreglo · B3 proyectos editables aunque el patrón deje de ser público
-- B4 columnas editables explícitas · B5 tope de versiones

-- ------------------------------------------------ M1: etiqueta de IA protegida

-- La usuaria no puede crear patrones "ai" ni quitar esa etiqueta. Si edita un patrón "ai",
-- pasa automáticamente a "ai_edited". Los patrones de IA los crea el servidor (service_role).
create or replace function public.patterns_guard_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.origin <> 'manual' then
      raise exception 'El origen IA lo asigna el servidor' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.origin = 'manual' and new.origin <> 'manual' then
    raise exception 'El origen de un patrón no se puede cambiar' using errcode = '42501';
  end if;
  if old.origin in ('ai', 'ai_edited') then
    if new.origin = 'manual' then
      raise exception 'Un patrón generado con IA conserva su etiqueta' using errcode = '42501';
    end if;
    if new.document is distinct from old.document or new.origin <> old.origin then
      new.origin := 'ai_edited';
      new.document := jsonb_set(new.document, '{origin,kind}', '"ai_edited"');
    end if;
  end if;
  return new;
end;
$$;

create trigger patterns_guard_origin before insert or update on public.patterns
  for each row execute function public.patterns_guard_origin();

-- ------------------------------- M2: lo público no expone a la autora ni datos de IA

-- Modelo, tokens y costo viven en ai_jobs (solo visibles para la dueña).
alter table public.patterns drop column ai_meta;

-- Lectura directa de la tabla: solo los patrones propios.
drop policy "patrones: leer propios y públicos" on public.patterns;
create policy "patrones: leer propios" on public.patterns for select to authenticated
  using (owner_id = (select auth.uid()));
revoke select on public.patterns from anon;

-- Vista segura de un patrón compartido (público o por enlace): sin owner_id, con el nombre visible.
drop function public.get_shared_pattern(uuid);
create function public.get_shared_pattern(p_pattern_id uuid)
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
  where p.id = p_pattern_id and p.visibility in ('unlisted', 'public');
$$;

-- Listado de patrones públicos, paginado y con las mismas columnas seguras.
create function public.list_public_patterns(p_limit integer default 24, p_offset integer default 0)
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
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

revoke execute on function public.get_shared_pattern(uuid) from public;
revoke execute on function public.list_public_patterns(integer, integer) from public;
grant execute on function public.get_shared_pattern(uuid) to anon, authenticated;
grant execute on function public.list_public_patterns(integer, integer) to anon, authenticated;

-- ------------------------------------------- B2: yarns siempre como arreglo

alter table public.patterns drop constraint patterns_document_consistent;
alter table public.patterns add constraint patterns_document_consistent check (
  jsonb_typeof(document) = 'object'
  and jsonb_typeof(document -> 'yarns') = 'array'
  and document ->> 'kind' = kind
  and document ->> 'technique' = technique
  and (document ->> 'schemaVersion')::smallint = schema_version
  and document -> 'origin' ->> 'kind' = origin
);

-- ------------------- B3: asociar patrón a un proyecto solo se valida al cambiarlo

-- ¿La usuaria actual puede usar este patrón? (propio o público). Security definer porque
-- la tabla de patrones ya no deja leer los públicos directamente.
create or replace function public.pattern_is_usable(p_pattern_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patterns
    where id = p_pattern_id and (owner_id = auth.uid() or visibility = 'public')
  );
$$;
revoke execute on function public.pattern_is_usable(uuid) from public, anon;
grant execute on function public.pattern_is_usable(uuid) to authenticated;

create or replace function public.projects_check_pattern()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pattern_id is not null
     and (tg_op = 'INSERT' or new.pattern_id is distinct from old.pattern_id)
     and current_user in ('anon', 'authenticated')
     and not public.pattern_is_usable(new.pattern_id) then
    raise exception 'El patrón no existe o no está disponible' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_check_pattern before insert or update of pattern_id on public.projects
  for each row execute function public.projects_check_pattern();

drop policy "proyectos: crear propios" on public.projects;
drop policy "proyectos: editar propios" on public.projects;
create policy "proyectos: crear propios" on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "proyectos: editar propios" on public.projects for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ----------------------------------------------- B4: columnas editables explícitas

revoke update on public.profiles, public.patterns, public.projects, public.project_progress,
  public.project_notes, public.user_yarns, public.uploads from anon, authenticated;

grant update (display_name, terminology, units, dominant_hand) on public.profiles to authenticated;
grant update (title, technique, kind, schema_version, origin, visibility, document) on public.patterns to authenticated;
grant update (title, status, pattern_id, pattern_version) on public.projects to authenticated;
grant update (part_id, round_number, stitch_index, device) on public.project_progress to authenticated;
grant update (body) on public.project_notes to authenticated;
grant update (weight, composition, color_hex, palette_id, note) on public.user_yarns to authenticated;

-- ---------------------------------------------- M3: subidas solo por el servidor

-- El servidor revisa el contenido real del archivo, lo re-codifica (elimina EXIF) y lo guarda
-- con la clave secreta. La usuaria solo puede leer y borrar lo suyo.
drop policy "subidas: crear en carpeta propia" on storage.objects;
drop policy "subidas: crear propias" on public.uploads;
revoke insert on public.uploads from anon, authenticated;

-- ---------------------------------------------------- B5: tope de versiones

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
    raise exception 'Este patrón llegó al máximo de 200 versiones guardadas' using errcode = '54000';
  end if;

  insert into public.pattern_versions (pattern_id, version, label, document)
  values (p_pattern_id, v_next, left(p_label, 80), v_doc);

  return v_next;
end;
$$;
