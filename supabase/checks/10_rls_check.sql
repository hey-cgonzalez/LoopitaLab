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

-- Denuncias (pattern_reports): Bea denuncia el patrón público de Ana.
do $$
declare n integer;
begin
  insert into public.pattern_reports (pattern_id, reason, details)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'copyright', 'Es copia de un libro');
  assert (select count(*) from public.pattern_reports) = 1, 'Bea ve su denuncia';
  assert (select status from public.pattern_reports) = 'open', 'la denuncia parte abierta';
  assert (select reporter_id from public.pattern_reports) = '22222222-2222-2222-2222-222222222222', 'reporter_id por defecto es la usuaria';

  begin
    insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000002', 'spam');
    raise exception 'FALLO: no se puede denunciar dos veces el mismo patrón';
  exception when unique_violation then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000001', 'spam');
    raise exception 'FALLO: no se puede denunciar un patrón privado';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reporter_id, reason)
    values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'spam');
    raise exception 'FALLO: no se puede denunciar a nombre de otra';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason, status) values ('aaaaaaaa-0000-0000-0000-000000000002', 'spam', 'dismissed');
    raise exception 'FALLO: el cliente no fija el estado';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pattern_reports (id, pattern_id, reason) values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', 'spam');
    raise exception 'FALLO: el cliente no fija el id';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason) values (gen_random_uuid(), 'otra');
    raise exception 'FALLO: motivo fuera de la lista';
  exception when check_violation or insufficient_privilege then null; end;
  begin
    update public.pattern_reports set status = 'reviewed';
    raise exception 'FALLO: el cliente no cambia el estado';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.pattern_reports;
    raise exception 'FALLO: el cliente no borra denuncias';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - Bea denuncia un patrón público ajeno, sin duplicados, sin fijar estado ni borrar';
end $$;

-- Denuncias: validaciones de columnas aisladas (la política pasa: patrón público ajeno),
-- así el error esperado es el de la restricción y no el de RLS.
do $$
declare n integer;
begin
  begin
    insert into public.pattern_reports (pattern_id, reason, details)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'spam', repeat('x', 1001));
    raise exception 'FALLO: el detalle admite hasta 1000 caracteres';
  exception when check_violation then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason, details)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'spam', repeat('ñ', 1001));
    raise exception 'FALLO: el tope de 1000 se mide en caracteres, no en bytes';
  exception when check_violation then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000002', 'otra');
    raise exception 'FALLO: motivo fuera de la lista';
  exception when check_violation then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000002', 'SPAM');
    raise exception 'FALLO: el motivo distingue mayúsculas';
  exception when check_violation then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000002', null);
    raise exception 'FALLO: el motivo es obligatorio';
  exception when not_null_violation then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'spam');
    raise exception 'FALLO: no se denuncia un patrón inexistente';
  exception when insufficient_privilege then null; end;
  begin
    update public.pattern_reports set details = 'cambio', reason = 'other';
    raise exception 'FALLO: el cliente no edita el detalle ni el motivo';
  exception when insufficient_privilege then null; end;
  begin
    update public.pattern_reports set reporter_id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FALLO: el cliente no reasigna la denuncia';
  exception when insufficient_privilege then null; end;
  assert public.pattern_is_reportable('aaaaaaaa-0000-0000-0000-000000000002'), 'el patrón público ajeno es denunciable';
  assert not public.pattern_is_reportable('aaaaaaaa-0000-0000-0000-000000000001'), 'el privado ajeno no es denunciable';
  assert not public.pattern_is_reportable('aaaaaaaa-0000-0000-0000-0000000000ff'), 'uno inexistente tampoco';
  assert public.pattern_is_reportable('aaaaaaaa-0000-0000-0000-000000000001') is not distinct from
         public.pattern_is_reportable('aaaaaaaa-0000-0000-0000-0000000000ff'), 'privado e inexistente no se distinguen';
  assert public.pattern_is_reportable(null) = false, 'null tampoco';
  assert (select count(*) from public.pattern_reports) = 1, 'ningún intento fallido dejó filas';
  raise notice 'ok - denuncias: detalle <= 1000 caracteres, motivo de la lista, sin edición';
end $$;

-- Instantánea de la denuncia (F2-B2) y columnas que la denunciante no lee.
do $$ begin
  begin
    insert into public.pattern_reports (pattern_id, reason, pattern_title) values ('aaaaaaaa-0000-0000-0000-000000000002', 'spam', 'falso');
    raise exception 'FALLO: el cliente no fija la instantánea';
  exception when insufficient_privilege then null; end;
  begin
    perform pattern_owner_id from public.pattern_reports;
    raise exception 'FALLO: la denunciante no lee la autora del patrón';
  exception when insufficient_privilege then null; end;
  begin
    perform pattern_sha256 from public.pattern_reports;
    raise exception 'FALLO: la denunciante no lee el hash';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.pattern_reports;
    raise exception 'FALLO: select * incluye columnas sin permiso';
  exception when insufficient_privilege then null; end;
  assert (select pattern_title from public.pattern_reports) = 'Público de Ana', 'la denunciante ve el título denunciado';
  raise notice 'ok - la instantánea la fija la base y la autora no se expone';
end $$;
reset role;
do $$ begin
  assert (select pattern_owner_id from public.pattern_reports where pattern_id = 'aaaaaaaa-0000-0000-0000-000000000002') = '11111111-1111-1111-1111-111111111111', 'instantánea: autora';
  assert (select pattern_sha256 from public.pattern_reports where pattern_id = 'aaaaaaaa-0000-0000-0000-000000000002')
       = (select encode(sha256(convert_to(document::text, 'UTF8')), 'hex') from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 'instantánea: sha256 del documento';
  raise notice 'ok - instantánea con título, sha256 y autora';
end $$;

-- Un patrón compartido por enlace (unlisted) también se puede denunciar (F2-B3).
insert into public.patterns (id, owner_id, title, technique, kind, schema_version, visibility, document) values
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Enlace de Ana', 'knit', 'chart', 1, 'unlisted',
   '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  assert public.pattern_is_reportable('aaaaaaaa-0000-0000-0000-000000000004'), 'unlisted ajeno es denunciable';
  insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000004', 'offensive');
  assert (select pattern_title from public.pattern_reports where pattern_id = 'aaaaaaaa-0000-0000-0000-000000000004') = 'Enlace de Ana', 'instantánea del unlisted';
  raise notice 'ok - se denuncia un patrón compartido por enlace';
end $$;
-- Se retira para no alterar los conteos del tope que siguen.
reset role;
delete from public.pattern_reports where pattern_id = 'aaaaaaaa-0000-0000-0000-000000000004';
delete from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

-- Ana no puede denunciar su propio patrón ni ve las denuncias de Bea.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  assert (select count(*) from public.pattern_reports) = 0, 'Ana no ve denuncias ajenas, ni las de su patrón';
  begin
    insert into public.pattern_reports (pattern_id, reason) values ('aaaaaaaa-0000-0000-0000-000000000002', 'other');
    raise exception 'FALLO: no se puede denunciar un patrón propio';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - nadie denuncia lo propio ni ve denuncias ajenas';
end $$;

-- Tope de 20 denuncias en 24 h (Bea ya hizo 1; se crean 20 patrones públicos más de Ana).
reset role;
insert into public.patterns (owner_id, title, technique, kind, schema_version, visibility, document)
select '11111111-1111-1111-1111-111111111111', 'Tope ' || i, 'knit', 'chart', 1, 'public',
       '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}'
from generate_series(1, 20) i;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare
  ids uuid[];
  i integer;
begin
  -- Bea no lee la tabla de patrones; los ids salen del listado público.
  select array_agg(id) into ids from public.list_public_patterns(100) where title like 'Tope %';
  assert array_length(ids, 1) = 20, 'veinte patrones públicos nuevos';
  for i in 1..19 loop
    insert into public.pattern_reports (pattern_id, reason) values (ids[i], 'spam');
  end loop;
  begin
    insert into public.pattern_reports (pattern_id, reason) values (ids[20], 'spam');
    raise exception 'FALLO: debe haber un tope de 20 denuncias en 24 horas';
  exception when program_limit_exceeded then null; end;
  assert (select count(*) from public.pattern_reports) = 20, 'exactamente 20 denuncias: la 21.ª no quedó';
  raise notice 'ok - tope de denuncias por usuaria (la 21.ª en 24 h falla con 54000)';
end $$;

-- El tope es una ventana de 24 h: una denuncia de hace 25 h ya no cuenta.
reset role;
update public.pattern_reports set created_at = now() - interval '25 hours'
where id = (select id from public.pattern_reports where reporter_id = '22222222-2222-2222-2222-222222222222' order by created_at, id limit 1);
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare last_id uuid;
begin
  select id into last_id from public.list_public_patterns(100)
  where title like 'Tope %' and id not in (select pattern_id from public.pattern_reports) limit 1;
  assert last_id is not null, 'queda un patrón público sin denunciar';
  insert into public.pattern_reports (pattern_id, reason) values (last_id, 'spam');
  raise notice 'ok - la ventana del tope de denuncias es de 24 horas';
end $$;

-- El tope de Bea no afecta a Ana, y la moderación (clave secreta) sí puede cambiar el estado.
set local role service_role;
do $$
declare n integer;
begin
  update public.pattern_reports set status = 'reviewed' where reporter_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  assert n = 21, 'la moderación ve y actualiza todas las denuncias';
  begin
    update public.pattern_reports set status = 'cerrada';
    raise exception 'FALLO: el estado es de la lista';
  exception when check_violation then null; end;
  raise notice 'ok - la moderación cambia el estado con la clave secreta';
end $$;
reset role;
delete from public.patterns where title like 'Tope %' and owner_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

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
  begin
    perform count(*) from public.pattern_reports;
    raise exception 'FALLO: anónimo no lee denuncias';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pattern_reports (pattern_id, reporter_id, reason) values (gen_random_uuid(), gen_random_uuid(), 'spam');
    raise exception 'FALLO: anónimo no denuncia';
  exception when insufficient_privilege then null; end;
  begin
    perform public.pattern_is_reportable('aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'FALLO: anónimo no ejecuta pattern_is_reportable';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.rate_events;
    raise exception 'FALLO: anónimo no lee la bitácora';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.profiles) = 0, 'anónimo no ve perfiles';
  assert (select count(*) from public.projects) = 0, 'anónimo no ve proyectos';
  begin
    perform public.snapshot_pattern('aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'FALLO: anónimo no puede versionar';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - acceso anónimo limitado a lo público';
end $$;

reset role;

-- ================================================================ Servidor (clave secreta)
-- Tope de 30 subidas por usuaria en 24 h, aunque las registre el servidor. Se corre con el rol
-- service_role (bypassrls, como la clave secreta): el trigger no se salta con RLS desactivado.
set local role service_role;
do $$
declare i integer;
begin
  assert (select rolbypassrls from pg_roles where rolname = 'service_role'), 'service_role se salta RLS';
  for i in 1..30 loop
    insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
    values ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222/' || gen_random_uuid() || '.webp', 'image/webp', 100);
  end loop;
  begin
    insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
    values ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222/extra.webp', 'image/webp', 100);
    raise exception 'FALLO: debe haber un tope de 30 subidas en 24 horas';
  exception when program_limit_exceeded then null; end;
  begin
    insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
    values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111/ajena.webp', 'image/webp', 100);
    raise exception 'FALLO: la ruta debe estar en la carpeta de la dueña';
  exception when check_violation or program_limit_exceeded then null; end;
  assert (select count(*) from public.uploads where owner_id = '22222222-2222-2222-2222-222222222222') = 30, 'exactamente 30 subidas';
  raise notice 'ok - tope de subidas por usuaria, también con service_role';
end $$;

-- Restricciones de la fila (con cupo disponible: Ana no tiene subidas).
do $$ begin
  begin
    insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
    values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222/ajena.webp', 'image/webp', 100);
    raise exception 'FALLO: la ruta debe estar en la carpeta de la dueña';
  exception when check_violation then null; end;
  begin
    insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
    values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/a.svg', 'image/svg+xml', 100);
    raise exception 'FALLO: solo JPEG, PNG o WebP';
  exception when check_violation then null; end;
  begin
    insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
    values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/b.webp', 'image/webp', 10485761);
    raise exception 'FALLO: máximo 10 MB';
  exception when check_violation then null; end;
  -- El tope de Bea no afecta a Ana.
  insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/ok.webp', 'image/webp', 100);
  raise notice 'ok - restricciones de subidas y tope independiente por usuaria';
end $$;

-- F2-M1: el cliente no borra subidas, y borrarlas por el servidor no libera cupo.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  begin
    delete from public.uploads;
    raise exception 'FALLO: el cliente no borra filas de subidas';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.rate_events;
    raise exception 'FALLO: el cliente no lee la bitácora';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.rate_events (owner_id, kind) values ('22222222-2222-2222-2222-222222222222', 'export');
    raise exception 'FALLO: el cliente no escribe la bitácora';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.operation_locks;
    raise exception 'FALLO: el cliente no ve los candados';
  exception when insufficient_privilege then null; end;
  begin
    perform public.begin_operation('22222222-2222-2222-2222-222222222222', 'upload');
    raise exception 'FALLO: el cliente no ejecuta begin_operation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.end_operation('22222222-2222-2222-2222-222222222222', 'upload', gen_random_uuid());
    raise exception 'FALLO: el cliente no suelta candados';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - el cliente no borra subidas ni toca la bitácora o los candados';
end $$;
reset role;
set local role service_role;
do $$ begin
  delete from public.uploads where owner_id = '22222222-2222-2222-2222-222222222222';
  assert not exists (select 1 from public.uploads where owner_id = '22222222-2222-2222-2222-222222222222'), 'el servidor borró las filas';
  begin
    insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
    values ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222/tras-borrar.webp', 'image/webp', 100);
    raise exception 'FALLO: borrar subidas no debe liberar cupo';
  exception when program_limit_exceeded then null; end;
  begin
    update public.rate_events set created_at = now() - interval '2 days';
    raise exception 'FALLO: la bitácora es de solo inserción';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.rate_events;
    raise exception 'FALLO: la bitácora no se borra';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - el tope cuenta sobre la bitácora aunque se borren las subidas';
end $$;

-- Un evento de hace más de 24 h no cuenta para el tope (se envejece como superusuario).
reset role;
update public.rate_events set created_at = now() - interval '25 hours'
where id = (select min(id) from public.rate_events where owner_id = '22222222-2222-2222-2222-222222222222' and kind = 'upload_stored');
set local role service_role;
insert into public.uploads (owner_id, storage_path, mime_type, size_bytes)
values ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222/nueva.webp', 'image/webp', 100);

-- Candados y cobro de intentos (F2-M2, F2-M3), con token (F2-B11).
do $$
declare
  i integer;
  t uuid;
  t2 uuid;
begin
  -- Bea ya tiene 30 imágenes guardadas en la ventana: no puede ni empezar otra subida.
  begin
    perform public.begin_operation('22222222-2222-2222-2222-222222222222', 'upload');
    raise exception 'FALLO: con 30 imágenes guardadas no se empieza otra subida';
  exception when program_limit_exceeded then null; end;
  assert not exists (select 1 from public.operation_locks where owner_id = '22222222-2222-2222-2222-222222222222'), 'el tope no deja el candado tomado';

  -- Ana: una subida a la vez, y cada intento se cobra aunque falle.
  t := public.begin_operation('11111111-1111-1111-1111-111111111111', 'upload');
  assert t is not null, 'begin_operation devuelve el token';
  begin
    perform public.begin_operation('11111111-1111-1111-1111-111111111111', 'upload');
    raise exception 'FALLO: solo una subida en curso por usuaria';
  exception when lock_not_available then null; end;
  -- Con otro token no se suelta ni se renueva.
  perform public.end_operation('11111111-1111-1111-1111-111111111111', 'upload', gen_random_uuid());
  assert exists (select 1 from public.operation_locks where owner_id = '11111111-1111-1111-1111-111111111111' and operation = 'upload'), 'un token ajeno no suelta el candado';
  assert not public.renew_operation('11111111-1111-1111-1111-111111111111', 'upload', gen_random_uuid()), 'un token ajeno no renueva';
  assert public.renew_operation('11111111-1111-1111-1111-111111111111', 'upload', t), 'el token vigente renueva';
  perform public.end_operation('11111111-1111-1111-1111-111111111111', 'upload', t);
  assert not exists (select 1 from public.operation_locks where owner_id = '11111111-1111-1111-1111-111111111111' and operation = 'upload'), 'el token vigente suelta';
  assert (select count(*) from public.rate_events where owner_id = '11111111-1111-1111-1111-111111111111' and kind = 'upload_attempt') = 1, 'el intento se cobró una vez';
  for i in 2..60 loop
    t := public.begin_operation('11111111-1111-1111-1111-111111111111', 'upload');
    perform public.end_operation('11111111-1111-1111-1111-111111111111', 'upload', t);
  end loop;
  begin
    perform public.begin_operation('11111111-1111-1111-1111-111111111111', 'upload');
    raise exception 'FALLO: tope de 60 intentos de subida en 24 horas';
  exception when program_limit_exceeded then null; end;

  -- Exportaciones: una a la vez y 5 por día. La subida no bloquea la exportación.
  t := public.begin_operation('11111111-1111-1111-1111-111111111111', 'export');
  begin
    perform public.begin_operation('11111111-1111-1111-1111-111111111111', 'export');
    raise exception 'FALLO: solo una exportación en curso';
  exception when lock_not_available then null; end;
  perform public.end_operation('11111111-1111-1111-1111-111111111111', 'export', t);
  for i in 2..5 loop
    t := public.begin_operation('11111111-1111-1111-1111-111111111111', 'export');
    perform public.end_operation('11111111-1111-1111-1111-111111111111', 'export', t);
  end loop;
  begin
    perform public.begin_operation('11111111-1111-1111-1111-111111111111', 'export');
    raise exception 'FALLO: tope de 5 exportaciones en 24 horas';
  exception when program_limit_exceeded then null; end;
  begin
    perform public.begin_operation('11111111-1111-1111-1111-111111111111', 'borrar');
    raise exception 'FALLO: operación desconocida';
  exception when invalid_parameter_value then null; end;
  raise notice 'ok - candados con token por usuaria y topes de intentos y exportaciones';
end $$;

-- Un candado abandonado (servidor caído a mitad) vence y se puede retomar; el proceso viejo
-- ya no puede soltar el candado nuevo.
reset role;
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'cata@example.test');
insert into public.operation_locks (owner_id, operation, token, started_at)
values ('33333333-3333-3333-3333-333333333333', 'export', 'cccccccc-0000-0000-0000-000000000001', now() - interval '6 minutes');
set local role service_role;
do $$
declare t uuid;
begin
  t := public.begin_operation('33333333-3333-3333-3333-333333333333', 'export');
  assert t <> 'cccccccc-0000-0000-0000-000000000001', 'el candado retomado tiene token nuevo';
  perform public.end_operation('33333333-3333-3333-3333-333333333333', 'export', 'cccccccc-0000-0000-0000-000000000001');
  assert (select token from public.operation_locks where owner_id = '33333333-3333-3333-3333-333333333333') = t, 'el proceso viejo no suelta el candado nuevo';
  assert not public.renew_operation('33333333-3333-3333-3333-333333333333', 'export', 'cccccccc-0000-0000-0000-000000000001'), 'ni lo renueva';
  perform public.end_operation('33333333-3333-3333-3333-333333333333', 'export', t);
  raise notice 'ok - un candado vencido se retoma con token nuevo';
end $$;

-- Re-autenticación atada a la acción (F2-M5). Sesión A pide el intento; la sesión B nace del
-- signInWithPassword posterior.
do $$
declare
  n uuid;
  n2 uuid;
  sa uuid := 'dddddddd-0000-0000-0000-00000000000a';
  sb uuid := 'dddddddd-0000-0000-0000-00000000000b';
  u uuid := '33333333-3333-3333-3333-333333333333';
begin
  -- Un ingreso normal reciente, sin intento previo, no basta.
  assert not public.consume_reauth(u, gen_random_uuid(), 'delete_account', sb, now()), 'sin intento no hay re-autenticación';

  -- Intento sin re-autenticación posterior: la marca "password" es anterior al intento.
  n := public.begin_reauth(u, sa, 'delete_account');
  assert not public.consume_reauth(u, n, 'delete_account', sb, now() - interval '1 minute'), 'password anterior al intento no basta';
  assert not public.consume_reauth(u, n, 'delete_account', sb, now()), 'y el intento ya se consumió en el primer uso';

  -- Misma sesión que pidió el intento: no hubo signInWithPassword nuevo.
  n := public.begin_reauth(u, sa, 'delete_account');
  assert not public.consume_reauth(u, n, 'delete_account', sa, now()), 'la misma sesión no cuenta';

  -- Acción distinta.
  n := public.begin_reauth(u, sa, 'change_password');
  assert not public.consume_reauth(u, n, 'delete_account', sb, now()), 'un intento de otra acción no sirve';

  -- Usuaria distinta.
  n := public.begin_reauth(u, sa, 'delete_account');
  assert not public.consume_reauth('22222222-2222-2222-2222-222222222222', n, 'delete_account', sb, now()), 'un intento ajeno no sirve';
  -- ...y ese intento sigue sin consumir para su dueña.
  assert public.consume_reauth(u, n, 'delete_account', sb, now()), 'intento + password posterior + sesión nueva: sí';
  assert not public.consume_reauth(u, n, 'delete_account', sb, now()), 'el nonce reutilizado falla';

  -- Un intento nuevo invalida el anterior sin usar.
  n := public.begin_reauth(u, sa, 'delete_account');
  n2 := public.begin_reauth(u, sa, 'delete_account');
  assert not public.consume_reauth(u, n, 'delete_account', sb, now()), 'el intento anterior quedó invalidado';
  assert public.consume_reauth(u, n2, 'delete_account', sb, now()), 'el último vale';
  raise notice 'ok - re-autenticación atada a la acción, a una sesión nueva y de un solo uso';
end $$;
reset role;
-- Intento vencido (más de 5 minutos).
insert into public.reauth_intents (id, owner_id, session_id, action, created_at)
values ('eeeeeeee-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'dddddddd-0000-0000-0000-00000000000a', 'delete_account', now() - interval '6 minutes');
set local role service_role;
do $$
declare i integer;
begin
  assert not public.consume_reauth('33333333-3333-3333-3333-333333333333', 'eeeeeeee-0000-0000-0000-000000000001', 'delete_account',
    'dddddddd-0000-0000-0000-00000000000b', now()), 'un intento de hace 6 minutos venció';
  -- Tope de 20 intentos por hora (ya hay 7 en la última hora).
  begin
    perform public.begin_reauth('33333333-3333-3333-3333-333333333333', null, 'change_password');
    raise exception 'FALLO: un intento sin sesión debe rechazarse';
  exception when null_value_not_allowed then null; end;
  for i in 1..13 loop perform public.begin_reauth('33333333-3333-3333-3333-333333333333', 'dddddddd-0000-0000-0000-00000000000c', 'change_password'); end loop;
  begin
    perform public.begin_reauth('33333333-3333-3333-3333-333333333333', 'dddddddd-0000-0000-0000-00000000000c', 'change_password');
    raise exception 'FALLO: tope de intentos de re-autenticación';
  exception when program_limit_exceeded then null; end;
  raise notice 'ok - el intento vence a los 5 minutos, exige sesión y hay tope por hora';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$ begin
  begin
    perform public.begin_reauth('33333333-3333-3333-3333-333333333333', null, 'delete_account');
    raise exception 'FALLO: el cliente no emite intentos';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_reauth('33333333-3333-3333-3333-333333333333', gen_random_uuid(), 'delete_account', null, now());
    raise exception 'FALLO: el cliente no consume intentos';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.reauth_intents;
    raise exception 'FALLO: el cliente no ve los intentos';
  exception when insufficient_privilege then null; end;
  begin
    perform public.purge_expired_data();
    raise exception 'FALLO: el cliente no purga';
  exception when insufficient_privilege then null; end;
  begin
    perform public.renew_operation('33333333-3333-3333-3333-333333333333', 'export', gen_random_uuid());
    raise exception 'FALLO: el cliente no renueva candados';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - el cliente no toca la re-autenticación, la purga ni los candados';
end $$;
reset role;

-- Plazos de conservación (F2-M6, F2-B13).
-- Una denuncia cerrada pierde la autora al cerrarse (fila de prueba como superusuario).
insert into public.pattern_reports (id, pattern_id, reporter_id, reason)
values ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'other');
do $$
declare r uuid := 'ffffffff-0000-0000-0000-000000000001';
begin
  assert (select pattern_owner_id from public.pattern_reports where id = r and status = 'open') is not null, 'hay una denuncia abierta con autora';
  assert r is not null, 'hay una denuncia abierta con autora';
  update public.pattern_reports set status = 'dismissed' where id = r;
  assert (select pattern_owner_id from public.pattern_reports where id = r) is null, 'al cerrar se borra la autora';
  assert (select pattern_title from public.pattern_reports where id = r) is not null, 'el título queda como evidencia';
  raise notice 'ok - cerrar una denuncia borra pattern_owner_id';
end $$;
delete from public.pattern_reports where id = 'ffffffff-0000-0000-0000-000000000001';
-- Datos viejos para la purga (como superusuario: la bitácora no se edita ni con la clave secreta).
insert into public.pattern_reports (pattern_id, reporter_id, reason)
values ('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'spam');
update public.pattern_reports set status = 'open', created_at = now() - interval '181 days'
where reporter_id = '33333333-3333-3333-3333-333333333333' and pattern_id = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into public.pattern_reports (pattern_id, reporter_id, reason)
select id, '33333333-3333-3333-3333-333333333333', 'other' from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000002';
-- El reportado 0002 hoy es privado, pero el superusuario no pasa por RLS; sirve de denuncia reciente.
insert into public.rate_events (owner_id, kind, created_at) values
  ('33333333-3333-3333-3333-333333333333', 'export', now() - interval '31 days'),
  ('33333333-3333-3333-3333-333333333333', 'export', now() - interval '29 days');
update public.pattern_reports set created_at = now() - interval '179 days'
where reporter_id = '33333333-3333-3333-3333-333333333333' and pattern_id = 'aaaaaaaa-0000-0000-0000-000000000002';
set local role service_role;
do $$
declare res jsonb;
begin
  res := public.purge_expired_data();
  assert (res ->> 'rate_events_deleted')::int >= 1, 'borra bitácora de más de 30 días';
  assert not exists (select 1 from public.rate_events where created_at < now() - interval '30 days'), 'no queda bitácora de más de 30 días';
  assert exists (select 1 from public.rate_events where owner_id = '33333333-3333-3333-3333-333333333333' and created_at > now() - interval '30 days' and created_at < now() - interval '28 days'), 'la de 29 días se conserva';
  assert not exists (select 1 from public.reauth_intents where created_at < now() - interval '1 day'), 'intentos viejos purgados';
  assert (select pattern_owner_id from public.pattern_reports
          where reporter_id = '33333333-3333-3333-3333-333333333333' and pattern_id = 'aaaaaaaa-0000-0000-0000-000000000003') is null,
    'denuncia abierta de más de 180 días: sin autora';
  assert (select pattern_owner_id from public.pattern_reports
          where reporter_id = '33333333-3333-3333-3333-333333333333' and pattern_id = 'aaaaaaaa-0000-0000-0000-000000000002') is not null,
    'denuncia abierta de 179 días: conserva la autora';
  assert not exists (select 1 from public.pattern_reports where status <> 'open' and pattern_owner_id is not null), 'ninguna cerrada con autora';
  raise notice 'ok - purga: bitácora 30 días, autora en denuncias 180 días o al cerrar';
end $$;
reset role;
-- Se retiran las denuncias de Cata de esta sección para no alterar los conteos siguientes.
delete from public.pattern_reports where reporter_id = '33333333-3333-3333-3333-333333333333';

-- Eliminar la cuenta (auth.admin.deleteUser) borra todo lo de la usuaria y no rompe lo ajeno.
-- Cata (Bea ya está en su tope de denuncias) denuncia el patrón de IA de Ana.
insert into public.pattern_reports (pattern_id, reporter_id, reason)
values ('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'other');
insert into public.ai_jobs (owner_id, kind, result_pattern_id)
values ('11111111-1111-1111-1111-111111111111', 'image_to_chart', 'aaaaaaaa-0000-0000-0000-000000000003');
update public.projects set pattern_id = 'aaaaaaaa-0000-0000-0000-000000000002' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'sin perfil';
  assert not exists (select 1 from public.patterns where owner_id = '11111111-1111-1111-1111-111111111111'), 'sin patrones';
  assert not exists (select 1 from public.pattern_versions), 'sin versiones';
  assert not exists (select 1 from public.projects where owner_id = '11111111-1111-1111-1111-111111111111'), 'sin proyectos';
  assert not exists (select 1 from public.project_progress where project_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'sin avance';
  assert not exists (select 1 from public.project_notes where project_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'sin notas';
  assert not exists (select 1 from public.user_yarns where owner_id = '11111111-1111-1111-1111-111111111111'), 'sin lanas';
  assert not exists (select 1 from public.ai_jobs where owner_id = '11111111-1111-1111-1111-111111111111'), 'sin trabajos de IA';
  assert (select count(*) from public.pattern_reports
          where pattern_id is null and pattern_title = 'IA renombrado' and pattern_owner_id = '11111111-1111-1111-1111-111111111111') = 1,
    'la denuncia sobrevive al patrón, con pattern_id nulo y su instantánea';
  assert not exists (select 1 from public.rate_events where owner_id = '11111111-1111-1111-1111-111111111111'), 'sin bitácora';
  assert not exists (select 1 from public.operation_locks where owner_id = '11111111-1111-1111-1111-111111111111'), 'sin candados';
  assert (select pattern_id from public.projects where id = 'bbbbbbbb-0000-0000-0000-000000000002') is null, 'el proyecto de Bea queda sin patrón, no se borra';
  assert (select count(*) from public.pattern_reports where reporter_id = '22222222-2222-2222-2222-222222222222') = 21,
    'las denuncias de Bea sobre patrones de Ana se conservan para la moderación';
  raise notice 'ok - eliminar la cuenta borra en cascada sin romper datos ajenos';
end $$;
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert not exists (select 1 from public.uploads), 'las subidas se van con la cuenta';
  assert not exists (select 1 from public.pattern_reports where reporter_id = '22222222-2222-2222-2222-222222222222'), 'las denuncias se van con la cuenta de quien denunció';
  assert not exists (select 1 from public.projects), 'el proyecto de Bea se va con su cuenta';
  raise notice 'ok - sin filas huérfanas';
end $$;

rollback;
\echo 'RLS: todas las verificaciones pasaron'
