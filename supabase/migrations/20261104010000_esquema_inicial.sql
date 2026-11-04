-- LoopitaLab: esquema inicial con Row Level Security.
-- Regla general: cada usuaria solo ve y modifica lo suyo. Las tablas de referencia
-- (grosores, fibras, paleta) son de solo lectura para todo el mundo.

-- ---------------------------------------------------------------- utilidades

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Composición de una lana: arreglo de {fiber, percent} con porcentajes entre 0 y 100 que suman 100.
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
          or jsonb_typeof(e -> 'percent') <> 'number'
          or (e ->> 'percent')::numeric <= 0
          or (e ->> 'percent')::numeric > 100
     )
     and abs((select sum((e ->> 'percent')::numeric) from jsonb_array_elements(c) e) - 100) <= 0.01;
$$;

-- --------------------------------------------------------- datos de referencia

create table public.yarn_weights (
  cat smallint primary key check (cat between 0 and 7),
  nombre text not null,
  ingles text[] not null default '{}',
  alias text[] not null default '{}',
  muestra_palillo_min smallint not null,
  muestra_palillo_max smallint not null,
  agujas_mm_min numeric(5,2) not null,
  agujas_mm_max numeric(5,2),
  muestra_crochet_min smallint not null,
  muestra_crochet_max smallint not null,
  muestra_crochet_punto text not null,
  crochet_mm_min numeric(5,2) not null,
  crochet_mm_max numeric(5,2)
);
comment on table public.yarn_weights is 'Categorías de grosor del Craft Yarn Council (0–7). Datos de packages/yarn-catalog/data/grosores.json.';

create table public.fibers (
  id text primary key,
  nombre text not null,
  origen text not null,
  elasticidad text not null check (elasticidad in ('baja', 'media', 'alta')),
  calidez text not null check (calidez in ('baja', 'media', 'alta')),
  definicion text not null check (definicion in ('baja', 'media', 'alta')),
  halo text not null check (halo in ('bajo', 'medio', 'alto')),
  brillo text not null check (brillo in ('bajo', 'medio', 'alto')),
  afieltra boolean not null,
  notas text not null default '',
  usos text[] not null default '{}'
);
comment on table public.fibers is 'Fibras de composición. Datos de packages/yarn-catalog/data/fibras.json.';

create table public.palette_colors (
  id text primary key,
  nombre text not null,
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  familia text not null,
  tono smallint not null check (tono between 1 and 6),
  orden smallint not null unique
);
comment on table public.palette_colors is 'Paleta propia (8 familias × 6 tonos). Datos de packages/yarn-catalog/data/paleta.json.';

-- ------------------------------------------------------------------- perfiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  terminology text not null default 'es' check (terminology in ('es', 'us', 'uk')),
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  dominant_hand text not null default 'right' check (dominant_hand in ('right', 'left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil al registrarse. Corre como dueño de la función porque la usuaria
-- todavía no tiene sesión en ese momento.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 80));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------- patrones

create table public.patterns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  technique text not null check (technique in ('knit', 'crochet')),
  kind text not null check (kind in ('chart', 'written')),
  schema_version smallint not null,
  origin text not null default 'manual' check (origin in ('manual', 'ai', 'ai_edited')),
  ai_meta jsonb,
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  -- Modelo canónico completo (packages/pattern-core). Se valida en la aplicación antes de guardar.
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Las columnas de búsqueda deben coincidir con el documento: una sola fuente de verdad.
  constraint patterns_document_consistent check (
    jsonb_typeof(document) = 'object'
    and document ->> 'kind' = kind
    and document ->> 'technique' = technique
    and (document ->> 'schemaVersion')::smallint = schema_version
    and document -> 'origin' ->> 'kind' = origin
  ),
  constraint patterns_document_size check (pg_column_size(document) <= 2000000),
  -- La nota libre de cada lana ("la lana que tengo") es privada: un patrón compartido no puede llevarla.
  constraint patterns_shared_without_private_notes check (
    visibility = 'private' or not jsonb_path_exists(document, '$.yarns[*].note')
  )
);

create index patterns_owner_idx on public.patterns (owner_id, updated_at desc);
create index patterns_public_idx on public.patterns (updated_at desc) where visibility = 'public';

create trigger patterns_updated_at before update on public.patterns
  for each row execute function public.set_updated_at();

-- Historial inmutable. Solo se escribe a través de snapshot_pattern().
create table public.pattern_versions (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  version integer not null check (version >= 1),
  label text check (char_length(label) <= 80),
  document jsonb not null,
  created_at timestamptz not null default now(),
  unique (pattern_id, version)
);

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

  insert into public.pattern_versions (pattern_id, version, label, document)
  values (p_pattern_id, v_next, left(p_label, 80), v_doc);

  return v_next;
end;
$$;

-- Lectura de un patrón compartido por enlace ("unlisted"): solo por id, sin poder listar.
create or replace function public.get_shared_pattern(p_pattern_id uuid)
returns setof public.patterns
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.patterns
  where id = p_pattern_id and visibility in ('unlisted', 'public');
$$;

-- ------------------------------------------------------------------- proyectos

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern_id uuid references public.patterns (id) on delete set null,
  pattern_version integer,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'paused', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_idx on public.projects (owner_id, updated_at desc);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- Puntero del modo tejiendo: una fila por proyecto.
create table public.project_progress (
  project_id uuid primary key references public.projects (id) on delete cascade,
  part_id text,
  round_number integer check (round_number >= 1),
  stitch_index integer check (stitch_index >= 0),
  device text check (char_length(device) <= 80),
  updated_at timestamptz not null default now()
);

create trigger project_progress_updated_at before update on public.project_progress
  for each row execute function public.set_updated_at();

create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index project_notes_project_idx on public.project_notes (project_id, created_at desc);

-- ---------------------------------------------------------------------- lanas

create table public.user_yarns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weight smallint not null references public.yarn_weights (cat),
  composition jsonb not null check (public.composition_is_valid(composition)),
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  palette_id text references public.palette_colors (id),
  -- Texto libre privado ("la lana que tengo"). Nunca se publica.
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index user_yarns_owner_idx on public.user_yarns (owner_id);

-- ------------------------------------------------------------ subidas e IA

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  -- La ruta debe estar dentro de la carpeta de la usuaria: {owner_id}/...
  constraint uploads_path_in_owner_folder check (split_part(storage_path, '/', 1) = owner_id::text)
);

-- Trabajos de IA: la usuaria solo lee los suyos; los escribe el servidor con la clave secreta.
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('image_to_chart', 'image_to_amigurumi', 'editor_assistant')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  upload_id uuid references public.uploads (id) on delete set null,
  result_pattern_id uuid references public.patterns (id) on delete set null,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,6),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_jobs_owner_idx on public.ai_jobs (owner_id, created_at desc);

-- ------------------------------------------------------------------------ RLS

alter table public.yarn_weights enable row level security;
alter table public.fibers enable row level security;
alter table public.palette_colors enable row level security;
alter table public.profiles enable row level security;
alter table public.patterns enable row level security;
alter table public.pattern_versions enable row level security;
alter table public.projects enable row level security;
alter table public.project_progress enable row level security;
alter table public.project_notes enable row level security;
alter table public.user_yarns enable row level security;
alter table public.uploads enable row level security;
alter table public.ai_jobs enable row level security;

-- Referencia: lectura pública, sin escritura.
create policy "referencia: lectura" on public.yarn_weights for select to anon, authenticated using (true);
create policy "referencia: lectura" on public.fibers for select to anon, authenticated using (true);
create policy "referencia: lectura" on public.palette_colors for select to anon, authenticated using (true);

-- Perfil: solo el propio. Se crea con el trigger de registro.
create policy "perfil: leer el propio" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "perfil: editar el propio" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Patrones: los propios y los públicos. Los "unlisted" solo con get_shared_pattern().
create policy "patrones: leer propios y públicos" on public.patterns for select to anon, authenticated
  using (owner_id = (select auth.uid()) or visibility = 'public');
create policy "patrones: crear propios" on public.patterns for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "patrones: editar propios" on public.patterns for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "patrones: borrar propios" on public.patterns for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Versiones: lectura de las propias. Escritura solo vía snapshot_pattern().
create policy "versiones: leer propias" on public.pattern_versions for select to authenticated
  using (exists (select 1 from public.patterns p where p.id = pattern_id and p.owner_id = (select auth.uid())));

-- Proyectos: solo los propios; el patrón asociado debe ser propio o público.
create policy "proyectos: leer propios" on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "proyectos: crear propios" on public.projects for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (pattern_id is null or exists (
      select 1 from public.patterns p
      where p.id = pattern_id and (p.owner_id = (select auth.uid()) or p.visibility = 'public')))
  );
create policy "proyectos: editar propios" on public.projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (pattern_id is null or exists (
      select 1 from public.patterns p
      where p.id = pattern_id and (p.owner_id = (select auth.uid()) or p.visibility = 'public')))
  );
create policy "proyectos: borrar propios" on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Avance y notas: a través del proyecto.
create policy "avance: todo en proyectos propios" on public.project_progress for all to authenticated
  using (exists (select 1 from public.projects pr where pr.id = project_id and pr.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects pr where pr.id = project_id and pr.owner_id = (select auth.uid())));
create policy "notas: todo en proyectos propios" on public.project_notes for all to authenticated
  using (exists (select 1 from public.projects pr where pr.id = project_id and pr.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects pr where pr.id = project_id and pr.owner_id = (select auth.uid())));

-- Lanas guardadas.
create policy "lanas: todo en las propias" on public.user_yarns for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Subidas: registro propio (el archivo vive en Storage, ver migración de storage).
create policy "subidas: leer propias" on public.uploads for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "subidas: crear propias" on public.uploads for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "subidas: borrar propias" on public.uploads for delete to authenticated
  using (owner_id = (select auth.uid()));

-- IA: solo lectura de los propios.
create policy "ia: leer propios" on public.ai_jobs for select to authenticated
  using (owner_id = (select auth.uid()));

-- ------------------------------------------------------------------- permisos

-- Funciones con privilegios elevados: solo para usuarias con sesión.
revoke execute on function public.snapshot_pattern(uuid, text) from public, anon;
grant execute on function public.snapshot_pattern(uuid, text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.get_shared_pattern(uuid) to anon, authenticated;

-- Las versiones son inmutables incluso para su dueña.
revoke insert, update, delete on public.pattern_versions from anon, authenticated;
-- Los trabajos de IA los escribe solo el servidor.
revoke insert, update, delete on public.ai_jobs from anon, authenticated;
-- Las tablas de referencia no se modifican desde el cliente.
revoke insert, update, delete on public.yarn_weights, public.fibers, public.palette_colors from anon, authenticated;
-- El perfil no se crea ni se borra desde el cliente (trigger y cascada).
revoke insert, delete on public.profiles from anon, authenticated;
