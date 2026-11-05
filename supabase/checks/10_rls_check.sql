-- Verificación de aislamiento entre usuarias (RLS) y reglas de integridad.
-- Corre en una transacción que se revierte: no deja datos.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/10_rls_check.sql
-- Cada caso imprime "ok - …"; el primer fallo detiene el script con error.

\set ON_ERROR_STOP on
begin;

-- Usuarias de prueba (como superusuario, igual que lo haría Supabase Auth).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.test', '{"display_name": "Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'bea@example.test', '{}');

-- Un patrón generado por IA lo crea el servidor (aquí, el superusuario).
insert into public.patterns (id, owner_id, title, technique, kind, schema_version, origin, document) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'IA de Ana', 'knit', 'chart', 1, 'ai',
   '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"ai","model":"claude"},"yarns":[]}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'el registro debe crear el perfil';
  assert (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Ana', 'nombre desde metadatos';
  assert (select count(*) from public.yarn_weights) = 8, 'grosores cargados';
  assert (select count(*) from public.palette_colors) = 48, 'paleta cargada';
  assert (select count(*) from public.fibers) >= 14, 'fibras cargadas';
  raise notice 'ok - registro crea perfil y datos de referencia cargados';
end $$;

-- ================================================================ Ana
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.patterns (id, title, technique, kind, schema_version, origin, document) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Privado de Ana', 'crochet', 'written', 1, 'manual',
   '{"schemaVersion":1,"kind":"written","technique":"crochet","origin":{"kind":"manual"},"yarns":[{"id":"A","note":"la lana de mi abuela"}]}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Público de Ana', 'knit', 'chart', 1, 'manual',
   '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[{"id":"A"}]}');
update public.patterns set visibility = 'public' where id = 'aaaaaaaa-0000-0000-0000-000000000002';

insert into public.projects (id, title, pattern_id) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Bolita para Mateo', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.project_progress (project_id, part_id, round_number, stitch_index) values ('bbbbbbbb-0000-0000-0000-000000000001', 'bolita', 3, 5);
insert into public.project_notes (project_id, body) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Usar relleno hipoalergénico');
insert into public.user_yarns (weight, composition, color_hex, palette_id) values (3, '[{"fiber":"algodon","percent":100}]', '#E9DDBE', 'crudo');

do $$ begin
  assert public.snapshot_pattern('aaaaaaaa-0000-0000-0000-000000000001', 'primera') = 1, 'primera versión';
  assert public.snapshot_pattern('aaaaaaaa-0000-0000-0000-000000000001') = 2, 'segunda versión';
  assert (select count(*) from public.pattern_versions) = 2, 'Ana ve sus versiones';
  assert (select count(*) from public.patterns) = 3, 'Ana ve sus tres patrones';
  raise notice 'ok - Ana crea patrones, proyecto, avance, notas, lanas y versiones';
end $$;

-- Etiqueta de IA (M1).
do $$ begin
  begin
    insert into public.patterns (title, technique, kind, schema_version, origin, document)
    values ('Falso IA', 'knit', 'chart', 1, 'ai', '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"ai"},"yarns":[]}');
    raise exception 'FALLO: la usuaria no puede crear patrones marcados como IA';
  exception when insufficient_privilege then null; end;

  update public.patterns set title = 'IA renombrado' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  assert (select origin from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 'ai', 'cambiar el título no altera el origen';

  update public.patterns set document = jsonb_set(document, '{yarns}', '[{"id":"A"}]') where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  assert (select origin from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 'ai_edited', 'editar un patrón IA lo marca ai_edited';
  assert (select document -> 'origin' ->> 'kind' from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 'ai_edited', 'el documento también';
  assert (select document -> 'origin' ->> 'model' from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 'claude', 'se conserva el modelo';

  begin
    update public.patterns set origin = 'manual', document = jsonb_set(document, '{origin,kind}', '"manual"') where id = 'aaaaaaaa-0000-0000-0000-000000000003';
    raise exception 'FALLO: no se puede quitar la etiqueta de IA';
  exception when insufficient_privilege then null; end;
  begin
    update public.patterns set origin = 'ai', document = jsonb_set(document, '{origin,kind}', '"ai"') where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLO: un patrón manual no puede pasar a IA';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - la etiqueta de IA no se puede crear, quitar ni falsificar';
end $$;

do $$
declare i integer;
begin
  begin
    insert into public.pattern_versions (pattern_id, version, document) values ('aaaaaaaa-0000-0000-0000-000000000001', 99, '{}');
    raise exception 'FALLO: Ana no debe insertar versiones directamente';
  exception when insufficient_privilege then null; end;
  begin
    update public.patterns set visibility = 'public' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLO: un patrón con nota privada de lana no debe poder compartirse';
  exception when check_violation then null; end;
  begin
    insert into public.patterns (title, technique, kind, schema_version, visibility, document)
    values ('Notas escondidas', 'knit', 'chart', 1, 'public', '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":{"A":{"note":"secreto"}}}');
    raise exception 'FALLO: yarns debe ser un arreglo';
  exception when check_violation then null; end;
  begin
    insert into public.patterns (title, technique, kind, schema_version, document)
    values ('Inconsistente', 'knit', 'written', 1, '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
    raise exception 'FALLO: columnas y documento deben coincidir';
  exception when check_violation then null; end;
  begin
    insert into public.user_yarns (weight, composition, color_hex) values (3, '[{"fiber":"lana","percent":70}]', '#000000');
    raise exception 'FALLO: la composición debe sumar 100';
  exception when check_violation then null; end;
  begin
    update public.projects set created_at = now() - interval '1 year' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    raise exception 'FALLO: created_at no es editable';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects set id = gen_random_uuid() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    raise exception 'FALLO: el id no es editable';
  exception when insufficient_privilege then null; end;
  begin
    update public.project_progress set project_id = 'bbbbbbbb-0000-0000-0000-000000000009';
    raise exception 'FALLO: el avance no se puede mover de proyecto';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.uploads (storage_path, mime_type, size_bytes) values ('11111111-1111-1111-1111-111111111111/x.png', 'image/png', 10);
    raise exception 'FALLO: las subidas las registra solo el servidor';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.ai_jobs (owner_id, kind) values ('11111111-1111-1111-1111-111111111111', 'image_to_chart');
    raise exception 'FALLO: los trabajos de IA solo los escribe el servidor';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.fibers (id, nombre, origen, elasticidad, calidez, definicion, halo, brillo, afieltra) values ('x', 'x', 'x', 'baja', 'baja', 'baja', 'bajo', 'bajo', false);
    raise exception 'FALLO: las tablas de referencia no se modifican desde el cliente';
  exception when insufficient_privilege then null; end;

  for i in 1..200 loop perform public.snapshot_pattern('aaaaaaaa-0000-0000-0000-000000000002'); end loop;
  begin
    perform public.snapshot_pattern('aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'FALLO: debe haber un tope de versiones';
  exception when program_limit_exceeded then null; end;
  raise notice 'ok - integridad, columnas editables, privacidad y topes';
end $$;

-- ================================================================ Bea
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

do $$
declare
  n integer;
  shared record;
begin
  assert (select count(*) from public.profiles) = 1, 'Bea solo ve su perfil';
  assert (select count(*) from public.patterns) = 0, 'Bea no lee la tabla de patrones ajenos, ni los públicos';
  assert (select count(*) from public.projects) = 0, 'Bea no ve proyectos de Ana';
  assert (select count(*) from public.project_progress) = 0, 'Bea no ve el avance de Ana';
  assert (select count(*) from public.project_notes) = 0, 'Bea no ve las notas de Ana';
  assert (select count(*) from public.user_yarns) = 0, 'Bea no ve las lanas de Ana';
  assert (select count(*) from public.pattern_versions) = 0, 'Bea no ve versiones de Ana';

  assert (select count(*) from public.list_public_patterns()) = 1, 'el listado público muestra el patrón público';
  select * into shared from public.get_shared_pattern('aaaaaaaa-0000-0000-0000-000000000002');
  assert shared.title = 'Público de Ana' and shared.author_name = 'Ana', 'patrón compartido con nombre visible';
  assert (select count(*) from public.get_shared_pattern('aaaaaaaa-0000-0000-0000-000000000001')) = 0, 'un patrón privado no se comparte por enlace';
  assert not exists (
    select 1 from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_name in ('get_shared_pattern', 'list_public_patterns') and p.parameter_name = 'owner_id'
  ), 'las funciones públicas no devuelven owner_id';

  update public.patterns set title = 'hackeado' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'Bea no puede editar el patrón público de Ana';
  delete from public.projects where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'Bea no puede borrar proyectos de Ana';
  update public.profiles set display_name = 'x' where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'Bea no puede editar el perfil de Ana';

  begin
    perform public.snapshot_pattern('aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'FALLO: Bea no puede versionar patrones ajenos';
  exception when no_data_found then null; end;
  begin
    insert into public.project_notes (project_id, body) values ('bbbbbbbb-0000-0000-0000-000000000001', 'intrusa');
    raise exception 'FALLO: Bea no puede escribir notas en proyectos de Ana';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.patterns (owner_id, title, technique, kind, schema_version, document)
    values ('11111111-1111-1111-1111-111111111111', 'suplantación', 'knit', 'chart', 1, '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
    raise exception 'FALLO: Bea no puede crear patrones a nombre de Ana';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.projects (title, pattern_id) values ('copia', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FALLO: Bea no puede usar el patrón privado de Ana en un proyecto';
  exception when insufficient_privilege then null; end;

  -- Sí puede tejer un patrón público.
  insert into public.projects (id, title, pattern_id) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Gorro de Ana', 'aaaaaaaa-0000-0000-0000-000000000002');
  raise notice 'ok - Bea no ve ni modifica nada privado de Ana, y sí puede usar su patrón público';
end $$;

-- Storage: solo el servidor sube; nadie escribe desde el cliente (M3).
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('uploads', '22222222-2222-2222-2222-222222222222/foto.png');
    raise exception 'FALLO: el cliente no sube directo, ni siquiera a su carpeta';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - las subidas pasan por el servidor';
end $$;

-- Ana vuelve privado su patrón; el proyecto de Bea sigue editable (B3).
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.patterns set visibility = 'private' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n integer;
begin
  update public.projects set status = 'in_progress' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 1, 'Bea puede seguir editando su proyecto';
  assert (select count(*) from public.get_shared_pattern('aaaaaaaa-0000-0000-0000-000000000002')) = 0, 'el patrón ya no se comparte';
  raise notice 'ok - un proyecto sigue editable aunque su patrón deje de ser público';
end $$;

-- ================================================================ Anónimo
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$ begin
  begin
    perform count(*) from public.patterns;
    raise exception 'FALLO: anónimo no lee la tabla de patrones';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.list_public_patterns()) = 0, 'no quedan patrones públicos';
  assert (select count(*) from public.palette_colors) = 48, 'anónimo lee la paleta';
  assert (select count(*) from public.profiles) = 0, 'anónimo no ve perfiles';
  assert (select count(*) from public.projects) = 0, 'anónimo no ve proyectos';
  begin
    perform public.snapshot_pattern('aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'FALLO: anónimo no puede versionar';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - acceso anónimo limitado a lo público';
end $$;

reset role;
rollback;
\echo 'RLS: todas las verificaciones pasaron'
