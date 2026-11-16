-- Verificación de aislamiento entre usuarias (RLS) y reglas de integridad.
-- Corre en una transacción que se revierte: no deja datos.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/10_rls_check.sql
-- Cada caso imprime "ok - …"; el primer fallo detiene el script con error.
--
-- IMPORTANTE: debe correrse como `postgres` (el rol que crea las tablas y funciones en Supabase).
-- Los privilegios por defecto son por rol creador: corrido con otro rol, la verificación de
-- "objetos futuros" no probaría lo que ocurre en producción. NO cubre objetos creados por
-- supabase_admin (extensiones y componentes internos de Supabase), que no son del esquema de la app.

\set ON_ERROR_STOP on
begin;

-- Usuarias de prueba (como superusuario, igual que lo haría Supabase Auth).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.test', '{"display_name": "Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'bea@example.test', '{}');

-- Un patrón generado por IA lo crea el servidor (aquí, el superusuario).
insert into public.patterns (id, owner_id, title, technique, kind, schema_version, origin, document) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'IA de Ana', 'knit', 'chart', 1, 'ai',
   '{"schemaVersion":1,"title":"IA de Ana","kind":"chart","technique":"knit","origin":{"kind":"ai","model":"claude"},"yarns":[]}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'el registro debe crear el perfil';
  assert (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Ana', 'nombre desde metadatos';
  assert (select count(*) from public.yarn_weights) = 8, 'grosores cargados';
  assert (select count(*) from public.palette_colors) = 48, 'paleta cargada';
  assert (select count(*) from public.fibers) >= 14, 'fibras cargadas';
  -- Regla de oro 9 (T3b): ningún alias ni equivalencia en inglés lleva nombres de tienda ni Baby/Roving.
  assert not exists (
    select 1 from public.yarn_weights w, unnest(w.alias || w.ingles) as t(v)
    where v ~* '(orqu[ií]dea|rev[eé]s ?derecho|modista|baby|roving)'
  ), 'alias de grosores sin nombres de tienda';
  raise notice 'ok - registro crea perfil y datos de referencia cargados';
end $$;

-- ================================================================ Ana
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.patterns (id, title, technique, kind, schema_version, origin, document) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Privado de Ana', 'crochet', 'written', 1, 'manual',
   '{"schemaVersion":1,"title":"Privado de Ana","kind":"written","technique":"crochet","origin":{"kind":"manual"},"yarns":[{"id":"A","note":"la lana de mi abuela"}]}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Público de Ana', 'knit', 'chart', 1, 'manual',
   '{"schemaVersion":1,"title":"Público de Ana","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[{"id":"A"}]}');
-- Publicar no lo hace la usuaria (T15-M2): lo hace el servidor (aquí, el superusuario).
reset role;
update public.patterns set visibility = 'public' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Desde T7 (ADR 0009) el cliente no asocia patrones: solo start_chart_project (servidor). El proyecto
-- se crea suelto y el superusuario lo asocia (proyecto de antes de la fase 3, sin versión fijada).
insert into public.projects (id, title) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Bolita para Mateo');
reset role;
update public.projects set pattern_id = 'aaaaaaaa-0000-0000-0000-000000000001' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set local role authenticated;
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
    values ('Falso IA', 'knit', 'chart', 1, 'ai', '{"schemaVersion":1,"title":"Falso IA","kind":"chart","technique":"knit","origin":{"kind":"ai"},"yarns":[]}');
    raise exception 'FALLO: la usuaria no puede crear patrones marcados como IA';
  exception when insufficient_privilege then null; end;

  -- Desde T4 el título vive también en el documento: renombrar es editar el documento, y editar IA la marca ai_edited.
  update public.patterns set title = 'IA renombrado', document = jsonb_set(document, '{title}', '"IA renombrado"') where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  assert (select origin from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 'ai_edited', 'renombrar un patrón IA lo marca ai_edited';

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
declare i integer; d text;
begin
  begin
    insert into public.pattern_versions (pattern_id, version, document) values ('aaaaaaaa-0000-0000-0000-000000000001', 99, '{}');
    raise exception 'FALLO: Ana no debe insertar versiones directamente';
  exception when insufficient_privilege then null; end;
  -- T15-M2: la usuaria no publica ni crea nada que no sea privado, ni con la base abierta.
  begin
    update public.patterns set visibility = 'public' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLO: la usuaria no puede cambiar visibility';
  exception when insufficient_privilege then null; end;
  begin
    update public.patterns set visibility = 'private' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLO: ni siquiera hacia private (la columna no es editable)';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.patterns (title, technique, kind, schema_version, visibility, document)
    values ('Publicado a la fuerza', 'knit', 'chart', 1, 'public', '{"schemaVersion":1,"title":"Publicado a la fuerza","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
    raise exception 'FALLO: un INSERT del cliente no puede fijar visibility';
  exception when insufficient_privilege then null; end;
  assert (select visibility from public.patterns where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'private', 'sigue privado';
  begin
    insert into public.patterns (title, technique, kind, schema_version, document)
    values ('Inconsistente', 'knit', 'written', 1, '{"schemaVersion":1,"title":"Inconsistente","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
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
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'versions_per_pattern', 'detail del tope 201 por diseño (snapshot_pattern): ' || coalesce(d, 'null');
  end;
  raise notice 'ok - integridad, columnas editables, privacidad y topes';
end $$;

-- Restricciones de la base que ya no se alcanzan como usuaria (visibility es del servidor): se
-- prueban como superusuario, que es lo que hará el servidor al publicar (fase 7).
reset role;
do $$ begin
  begin
    update public.patterns set visibility = 'public' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLO: un patrón con nota privada de lana no debe poder compartirse';
  exception when check_violation then null; end;
  begin
    insert into public.patterns (owner_id, title, technique, kind, schema_version, visibility, document)
    values ('11111111-1111-1111-1111-111111111111', 'Notas escondidas', 'knit', 'chart', 1, 'public', '{"schemaVersion":1,"title":"Notas escondidas","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":{"A":{"note":"secreto"}}}');
    raise exception 'FALLO: yarns debe ser un arreglo';
  exception when check_violation then null; end;
  raise notice 'ok - la nota privada de lana y yarns-arreglo siguen protegidas al publicar';
end $$;

-- T15-M3: cuota de 500 diseños por usuaria (candado por usuaria; aquí solo el efecto).
insert into auth.users (id, email) values ('99999999-9999-4999-8999-999999999999', 'cuota@example.test');
insert into public.patterns (owner_id, title, technique, kind, schema_version, document)
select '99999999-9999-4999-8999-999999999999', 'Cuota ' || i, 'knit', 'chart', 1,
       ('{"schemaVersion":1,"title":"Cuota ' || i || '","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}')::jsonb
from generate_series(1, 500) i;
set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
do $$ declare d text; begin
  begin
    insert into public.patterns (title, technique, kind, schema_version, document)
    values ('Cuota 501', 'knit', 'chart', 1, '{"schemaVersion":1,"title":"Cuota 501","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
    raise exception 'FALLO: el diseño 501 debe rechazarse';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'patterns', 'detail del tope patterns: ' || coalesce(d, 'null');
  end;
  assert (select count(*) from public.patterns) = 500, 'quedan exactamente 500';
  delete from public.patterns where title = 'Cuota 1';
  insert into public.patterns (title, technique, kind, schema_version, document)
  values ('Cuota 501', 'knit', 'chart', 1, '{"schemaVersion":1,"title":"Cuota 501","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
  assert (select count(*) from public.patterns) = 500, 'borrar libera cupo';
  raise notice 'ok - cuota de 500 diseños por usuaria (54000)';
end $$;
reset role;
delete from auth.users where id = '99999999-9999-4999-8999-999999999999';
-- Ana de nuevo.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

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
    values ('11111111-1111-1111-1111-111111111111', 'suplantación', 'knit', 'chart', 1, '{"schemaVersion":1,"title":"suplantación","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
    raise exception 'FALLO: Bea no puede crear patrones a nombre de Ana';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.projects (title, pattern_id) values ('copia', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FALLO: Bea no puede usar el patrón privado de Ana en un proyecto';
  exception when insufficient_privilege then null; end;
  -- Desde T7 tampoco asocia un patrón público por la API (proyectos sobre patrones ajenos: fase 7).
  begin
    insert into public.projects (title, pattern_id) values ('copia', 'aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'FALLO: el cliente no escribe pattern_id';
  exception when insufficient_privilege then null; end;

  -- Su proyecto suelto; el patrón público de Ana se lo asocia el superusuario más abajo.
  insert into public.projects (id, title) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Gorro de Ana');
  raise notice 'ok - Bea no ve ni modifica nada privado de Ana, ni asocia patrones ajenos';
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
   '{"schemaVersion":1,"title":"Enlace de Ana","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
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
       ('{"schemaVersion":1,"title":"Tope ' || i || '","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}')::jsonb
from generate_series(1, 20) i;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare
  ids uuid[];
  i integer;
begin
  -- Bea no lee la tabla de patrones; los ids salen del listado público.
  select array_agg(id) into ids from public.list_public_patterns(24) where title like 'Tope %';
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
  select id into last_id from public.list_public_patterns(24)
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
-- T15-M4: el listado público no entrega más de 24 documentos por página, pida lo que pida.
insert into public.patterns (owner_id, title, technique, kind, schema_version, visibility, document)
select '11111111-1111-1111-1111-111111111111', 'Lim ' || i, 'knit', 'chart', 1, 'public',
       ('{"schemaVersion":1,"title":"Lim ' || i || '","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}')::jsonb
from generate_series(1, 10) i;
set local role anon;
do $$ begin
  assert (select count(*) from public.list_public_patterns(1000, 0)) = 24, 'p_limit se recorta a 24';
  assert (select count(*) from public.list_public_patterns(1000, 24)) = 7, 'la segunda página trae el resto (31 en total)';
  raise notice 'ok - list_public_patterns entrega como máximo 24 por página';
end $$;
reset role;
delete from public.patterns where title like 'Lim %';
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
reset role;
update public.patterns set visibility = 'private' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
set local role authenticated;
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

-- ¿La cuenta tiene contraseña? (user_has_password, A1). Ana tiene contraseña; Bea entra solo
-- con proveedor (encrypted_password vacío, como lo deja Supabase Auth) y una tercera con nulo.
update auth.users set encrypted_password = '$2a$10$hashdepruebahashdepruebahashdepruebahashdeprueba12'
where id = '11111111-1111-1111-1111-111111111111';
update auth.users set encrypted_password = '' where id = '22222222-2222-2222-2222-222222222222';
insert into auth.users (id, email, encrypted_password) values ('44444444-4444-4444-4444-444444444444', 'dora@example.test', null);
set local role service_role;
do $$ begin
  assert public.user_has_password('11111111-1111-1111-1111-111111111111') is true, 'con contraseña: true';
  assert public.user_has_password('22222222-2222-2222-2222-222222222222') is false, 'contraseña vacía: false';
  assert public.user_has_password('44444444-4444-4444-4444-444444444444') is false, 'contraseña nula: false';
  assert public.user_has_password('99999999-9999-9999-9999-999999999999') is false, 'usuaria inexistente: false';
  assert public.user_has_password(null) is false, 'sin usuaria: false';
  raise notice 'ok - user_has_password distingue cuentas con y sin contraseña';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  begin
    perform public.user_has_password('11111111-1111-1111-1111-111111111111');
    raise exception 'FALLO: authenticated no puede consultar user_has_password';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - authenticated no ejecuta user_has_password';
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.user_has_password('11111111-1111-1111-1111-111111111111');
    raise exception 'FALLO: anon no puede consultar user_has_password';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - anon no ejecuta user_has_password';
end $$;
reset role;
delete from auth.users where id = '44444444-4444-4444-4444-444444444444';

-- Tejer en espejo (T3c): preferencia de vista, falsa por defecto, solo la cambia su dueña.
do $$ begin
  assert (select mirror_knitting from public.profiles where id = '11111111-1111-1111-1111-111111111111') is false, 'el perfil nuevo trae mirror_knitting = false';
  assert (select mirror_knitting from public.profiles where id = '22222222-2222-2222-2222-222222222222') is false, 'el perfil de Bea trae mirror_knitting = false';
  raise notice 'ok - el perfil nuevo trae mirror_knitting = false';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$ declare n int; begin
  update public.profiles set mirror_knitting = true where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  assert n = 1, 'Ana puede activar su mirror_knitting';
  assert (select mirror_knitting from public.profiles where id = '11111111-1111-1111-1111-111111111111') is true, 'Ana ve su valor nuevo';
  update public.profiles set mirror_knitting = false where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  assert n = 1, 'Ana puede desactivar su mirror_knitting';
  update public.profiles set mirror_knitting = true where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  assert n = 0, 'Ana no puede cambiar el mirror_knitting de Bea';
  raise notice 'ok - la usuaria cambia su mirror_knitting y no el ajeno';
end $$;
reset role;
do $$ begin
  assert (select mirror_knitting from public.profiles where id = '22222222-2222-2222-2222-222222222222') is false, 'el de Bea sigue en false';
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    update public.profiles set mirror_knitting = true where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FALLO: anon no puede cambiar mirror_knitting';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - anon no cambia mirror_knitting';
end $$;
reset role;

-- ================================================================ T7: tejer un diseño (ADR 0009)
-- Eva teje sus gráficos; Fina es la otra usuaria. start_chart_project y repin_project solo las
-- ejecuta service_role (la Server Action, con la clave secreta, después de exigir `valid`).
-- Dentro de la transacción now() no avanza: los diseños nacen con updated_at de hace una hora (como
-- superusuario, sin disparador) para que una edición posterior lo cambie.
insert into auth.users (id, email) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'eva@example.test'),
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'fina@example.test');
insert into public.patterns (id, owner_id, title, technique, kind, schema_version, document, updated_at)
select ('e1000000-0000-4000-8000-00000000000' || i)::uuid, 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', t, 'knit', k, 1,
       ('{"schemaVersion":1,"title":"' || t || '","kind":"' || k || '","technique":"knit","origin":{"kind":"manual"},"yarns":[]}')::jsonb,
       now() - interval '1 hour'
from (values (1, 'Gorro de Eva', 'chart'), (2, 'Escrito de Eva', 'written'), (3, 'Lleno de Eva', 'chart'), (4, 'Suelto de Eva', 'chart')) v(i, t, k);

do $$ begin
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'projects' and column_name = 'pattern_version'),
    'projects.pattern_version ya no existe (T1-9)';
  assert not has_function_privilege('authenticated', 'public.start_chart_project(uuid, uuid, timestamptz, text)', 'execute'), 'start_chart_project no es para authenticated';
  assert not has_function_privilege('anon', 'public.start_chart_project(uuid, uuid, timestamptz, text)', 'execute'), 'start_chart_project no es para anon';
  assert has_function_privilege('service_role', 'public.start_chart_project(uuid, uuid, timestamptz, text)', 'execute'), 'start_chart_project es del servidor';
  assert not has_function_privilege('authenticated', 'public.repin_project(uuid, uuid, timestamptz, timestamptz, integer, integer)', 'execute'), 'repin_project no es para authenticated';
  assert has_function_privilege('service_role', 'public.repin_project(uuid, uuid, timestamptz, timestamptz, integer, integer)', 'execute'), 'repin_project es del servidor';
  assert not has_function_privilege('service_role', 'public.pin_current_version(uuid, jsonb)', 'execute'), 'pin_current_version es interna';
  assert not has_function_privilege('authenticated', 'public.pin_current_version(uuid, jsonb)', 'execute'), 'pin_current_version es interna';
  raise notice 'ok - T7: pattern_version eliminada; las funciones de tejer solo las ejecuta service_role';
end $$;

-- La sesión no puede llamar a las funciones (saltaría la validación de `valid` de la Server Action).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', true);
do $$ begin
  begin
    perform public.start_chart_project('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-8000-000000000001',
      (select updated_at from public.patterns where id = 'e1000000-0000-4000-8000-000000000001'), 'x');
    raise exception 'FALLO: authenticated no ejecuta start_chart_project';
  exception when insufficient_privilege then null; end;
  begin
    perform public.repin_project('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', gen_random_uuid(), now(), null, 1, 0);
    raise exception 'FALLO: authenticated no ejecuta repin_project';
  exception when insufficient_privilege then null; end;
  begin
    perform public.pin_current_version('e1000000-0000-4000-8000-000000000001', '{}');
    raise exception 'FALLO: authenticated no ejecuta pin_current_version';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - T7: la sesión no llama a start_chart_project, repin_project ni pin_current_version';
end $$;

-- Empezar: carrera de updated_at, aislamiento, tipo, versión nueva y reutilizada.
set local role service_role;
do $$
declare
  eva constant uuid := 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
  fina constant uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  g constant uuid := 'e1000000-0000-4000-8000-000000000001';
  t0 timestamptz;
  r record;
  r2 record;
begin
  select updated_at into t0 from public.patterns where id = g;
  begin
    perform public.start_chart_project(eva, g, t0 - interval '1 microsecond', null);
    raise exception 'FALLO: un updated_at distinto debe dar conflicto';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.start_chart_project(fina, g, t0, null);
    raise exception 'FALLO: Fina no fija versiones del diseño de Eva';
  exception when no_data_found then null; end;
  begin
    perform public.start_chart_project(eva, gen_random_uuid(), t0, null);
    raise exception 'FALLO: un diseño inexistente es no encontrado';
  exception when no_data_found then null; end;
  begin
    perform public.start_chart_project(eva, 'e1000000-0000-4000-8000-000000000002',
      (select updated_at from public.patterns where id = 'e1000000-0000-4000-8000-000000000002'), null);
    raise exception 'FALLO: solo se tejen gráficos';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.start_chart_project(eva, g, t0, repeat('a', 121));
    raise exception 'FALLO: título de 121 caracteres';
  exception when check_violation then null; end;
  assert not exists (select 1 from public.pattern_versions where pattern_id = g), 'los intentos fallidos no dejan versiones';
  assert not exists (select 1 from public.projects where owner_id = eva), 'ni proyectos';

  select * into r from public.start_chart_project(eva, g, t0, '  ');
  assert r.version = 1 and not r.reused, 'primera vez: versión 1 nueva';
  assert (select title from public.projects where id = r.project_id) = 'Gorro de Eva', 'título vacío: el del diseño';
  assert (select status from public.projects where id = r.project_id) = 'in_progress', 'proyecto en curso';
  assert (select v.version from public.projects p join public.pattern_versions v on v.id = p.pattern_version_id
          where p.id = r.project_id and p.pattern_id = g) = 1, 'proyecto con la versión 1 fijada';
  assert (select round_number = 1 and stitch_index = 0 and part_id is null from public.project_progress where project_id = r.project_id),
    'puntero inicial: vuelta 1, punto 0';

  select * into r2 from public.start_chart_project(eva, g, t0, 'Segundo gorro');
  assert r2.version = 1 and r2.reused, 'mismo documento: reutiliza la versión 1';
  assert (select count(*) from public.pattern_versions where pattern_id = g) = 1, 'no gasta cuota de versiones';
  assert r2.project_id <> r.project_id, 'pero es otro proyecto';
  raise notice 'ok - T7: start_chart_project exige dueña, gráfico y updated_at exacto; reutiliza la versión idéntica';
end $$;

-- Autoguardado entre validar y fijar (la carrera del problema 2): la edición cambia updated_at y el
-- updated_at viejo, el que validó la Server Action, ya no sirve.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', true);
update public.patterns set document = jsonb_set(document, '{yarns}', '[{"id":"A"}]') where id = 'e1000000-0000-4000-8000-000000000001';
set local role service_role;
do $$
declare
  eva constant uuid := 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
  fina constant uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  g constant uuid := 'e1000000-0000-4000-8000-000000000001';
  t1 timestamptz;
  pid uuid;
  pt timestamptz;
  r record;
begin
  select updated_at into t1 from public.patterns where id = g;
  assert t1 = now(), 'la edición renovó updated_at';
  begin
    perform public.start_chart_project(eva, g, now() - interval '1 hour', null);
    raise exception 'FALLO: el updated_at validado antes del autoguardado debe dar conflicto';
  exception when sqlstate 'PT409' then null; end;

  -- Pasar a la versión actual: el primer proyecto (versión 1) a la versión 2, con el puntero reubicado.
  select id into pid from public.projects where owner_id = eva and title = 'Gorro de Eva';
  select updated_at into pt from public.project_progress where project_id = pid;
  begin
    perform public.repin_project(eva, pid, now() - interval '1 hour', pt, 5, 0);
    raise exception 'FALLO: repin con updated_at viejo';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.repin_project(eva, pid, t1, pt - interval '1 minute', 5, 0);
    raise exception 'FALLO: repin con el avance cambiado en otro dispositivo';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.repin_project(fina, pid, t1, pt, 5, 0);
    raise exception 'FALLO: Fina no cambia la versión de un proyecto de Eva';
  exception when no_data_found then null; end;
  begin
    perform public.repin_project(eva, pid, t1, pt, 100002, 0);
    raise exception 'FALLO: el puntero respeta las cotas';
  exception when check_violation then null; end;
  assert (select v.version from public.projects p join public.pattern_versions v on v.id = p.pattern_version_id where p.id = pid) = 1,
    'los intentos fallidos no cambian la versión';

  select * into r from public.repin_project(eva, pid, t1, pt, 5, 0);
  assert r.version = 2 and not r.reused, 'documento distinto: versión 2 nueva';
  assert (select v.version from public.projects p join public.pattern_versions v on v.id = p.pattern_version_id where p.id = pid) = 2,
    'el proyecto queda en la versión 2';
  assert (select round_number from public.project_progress where project_id = pid) = 5, 'con el puntero reubicado';
  assert r.progress_updated_at = (select updated_at from public.project_progress where project_id = pid), 'devuelve el updated_at del avance';
  assert (select v.version from public.projects p join public.pattern_versions v on v.id = p.pattern_version_id
          where p.owner_id = eva and p.title = 'Segundo gorro') = 1, 'el otro proyecto sigue en la versión 1';

  select * into r from public.start_chart_project(eva, g, t1, 'Tercer gorro');
  assert r.version = 2 and r.reused, 'empezar después reutiliza la versión 2';

  -- Un proyecto suelto (sin diseño) no se puede "pasar a la versión actual".
  insert into public.projects (owner_id, title) values (eva, 'Suelto') returning id into pid;
  begin
    perform public.repin_project(eva, pid, t1, null, 1, 0);
    raise exception 'FALLO: repin sin diseño';
  exception when invalid_parameter_value then null; end;
  raise notice 'ok - T7: la carrera validar -> fijar da conflicto; repin_project es atómico, con avance y dueña';
end $$;

-- Topes al empezar (54000), sin dejar nada a medias.
reset role;
insert into public.pattern_versions (pattern_id, version, document)
select 'e1000000-0000-4000-8000-000000000003', v, '{}'::jsonb from generate_series(1, 200) v;
set local role service_role;
do $$
declare
  eva constant uuid := 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
  n integer;
  d text;
begin
  begin
    perform public.start_chart_project(eva, 'e1000000-0000-4000-8000-000000000003',
      (select updated_at from public.patterns where id = 'e1000000-0000-4000-8000-000000000003'), null);
    raise exception 'FALLO: tope de 200 versiones por diseño';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'versions_per_pattern', 'detail del tope 200 por diseño (pin_current_version): ' || coalesce(d, 'null');
  end;

  select count(*) into n from public.projects where owner_id = eva;
  insert into public.projects (owner_id, title) select eva, 'Relleno ' || i from generate_series(1, 1000 - n) i;
  begin
    perform public.start_chart_project(eva, 'e1000000-0000-4000-8000-000000000004',
      (select updated_at from public.patterns where id = 'e1000000-0000-4000-8000-000000000004'), null);
    raise exception 'FALLO: tope de 1000 proyectos';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'projects', 'detail del tope 1000 proyectos (start_chart_project): ' || coalesce(d, 'null');
  end;
  assert not exists (select 1 from public.pattern_versions where pattern_id = 'e1000000-0000-4000-8000-000000000004'),
    'el tope de proyectos deshace también la versión creada (atómica)';
  delete from public.projects where owner_id = eva and title like 'Relleno %';
  raise notice 'ok - T7: start_chart_project respeta los topes (54000) y es atómica';
end $$;

-- La sesión de Eva: no escribe pattern_id ni pattern_version_id; escribe solo su puntero, con
-- concurrencia optimista; no borra un diseño con proyectos; las versiones fijadas no cambian.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', true);
do $$
declare
  pid uuid;
  v1 uuid;
  pt timestamptz;
  n integer;
begin
  select id into pid from public.projects where title = 'Gorro de Eva';
  select id into v1 from public.pattern_versions where pattern_id = 'e1000000-0000-4000-8000-000000000001' and version = 1;
  begin
    update public.projects set pattern_version_id = v1 where id = pid;
    raise exception 'FALLO: el cliente no escribe pattern_version_id';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects set pattern_id = 'e1000000-0000-4000-8000-000000000004' where id = pid;
    raise exception 'FALLO: el cliente no escribe pattern_id';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.projects (title, pattern_id, pattern_version_id) values ('a mano', 'e1000000-0000-4000-8000-000000000001', v1);
    raise exception 'FALLO: el cliente no crea proyectos con versión fijada';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.projects (title, created_at) values ('a mano', now() - interval '1 year');
    raise exception 'FALLO: INSERT limitado a id, owner_id, title y status';
  exception when insufficient_privilege then null; end;
  update public.projects set title = 'Gorro rojo', status = 'paused' where id = pid;
  get diagnostics n = row_count;
  assert n = 1, 'título y estado siguen editables';

  -- Puntero con concurrencia optimista (lo que hará saveProgress).
  select updated_at into pt from public.project_progress where project_id = pid;
  update public.project_progress set round_number = 6, stitch_index = 12 where project_id = pid and updated_at = pt - interval '1 minute';
  get diagnostics n = row_count;
  assert n = 0, 'updated_at viejo: no escribe (conflicto explícito)';
  update public.project_progress set round_number = 6, stitch_index = 12 where project_id = pid and updated_at = pt;
  get diagnostics n = row_count;
  assert n = 1, 'updated_at vigente: escribe';
  begin
    update public.project_progress set round_number = 100002 where project_id = pid;
    raise exception 'FALLO: cota de round_number';
  exception when check_violation then null; end;
  begin
    update public.project_progress set stitch_index = 100001 where project_id = pid;
    raise exception 'FALLO: cota de stitch_index';
  exception when check_violation then null; end;
  -- QA T16 (fase 3): las cotas exactas se aceptan (gráfico terminado en el diseño más largo, 200 × 500 filas) y
  -- los mínimos se respetan; después se deja el puntero como estaba.
  update public.project_progress set round_number = 100001, stitch_index = 100000 where project_id = pid;
  get diagnostics n = row_count;
  assert n = 1, 'las cotas exactas (round_number 100001 y stitch_index 100000) se aceptan';
  begin
    update public.project_progress set round_number = 0 where project_id = pid;
    raise exception 'FALLO: round_number mínimo (1)';
  exception when check_violation then null; end;
  begin
    update public.project_progress set stitch_index = -1 where project_id = pid;
    raise exception 'FALLO: stitch_index mínimo (0)';
  exception when check_violation then null; end;
  update public.project_progress set round_number = 6, stitch_index = 12 where project_id = pid;
  begin
    update public.project_progress set device = 'tableta' where project_id = pid;
    raise exception 'FALLO: device no se escribe en la fase 3';
  exception when insufficient_privilege then null; end;
  begin
    update public.project_progress set updated_at = now() - interval '1 day' where project_id = pid;
    raise exception 'FALLO: updated_at lo pone la base';
  exception when insufficient_privilege then null; end;

  begin
    update public.pattern_versions set document = '{}' where id = v1;
    raise exception 'FALLO: la versión fijada es inmutable';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.pattern_versions where id = v1;
    raise exception 'FALLO: la usuaria no borra versiones';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.patterns where id = 'e1000000-0000-4000-8000-000000000001';
    raise exception 'FALLO: un diseño con proyectos no se borra';
  exception when foreign_key_violation then null; end;
  assert exists (select 1 from public.patterns where id = 'e1000000-0000-4000-8000-000000000001'), 'el diseño sigue';
  -- Sin proyectos que lo tejan, sí se borra (con sus versiones).
  delete from public.projects where pattern_id = 'e1000000-0000-4000-8000-000000000001';
  delete from public.patterns where id = 'e1000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'sin proyectos, el diseño se borra';
  raise notice 'ok - T7: el cliente no fija versiones; escribe solo su puntero con updated_at; un diseño con proyectos no se borra';
end $$;

-- Fina no ve ni toca nada de Eva.
select set_config('request.jwt.claim.sub', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', true);
do $$
declare n integer;
begin
  assert (select count(*) from public.projects) = 0, 'Fina no ve proyectos de Eva';
  assert (select count(*) from public.project_progress) = 0, 'Fina no ve el avance de Eva';
  assert (select count(*) from public.pattern_versions) = 0, 'Fina no ve versiones de Eva';
  update public.project_progress set round_number = 1;
  get diagnostics n = row_count;
  assert n = 0, 'Fina no mueve el puntero de Eva';
  begin
    insert into public.project_progress (project_id, round_number, stitch_index)
    select gen_random_uuid(), 1, 0;
    raise exception 'FALLO: Fina no crea avance en proyectos que no son suyos';
  exception when insufficient_privilege or foreign_key_violation then null; end;
  raise notice 'ok - T7: aislamiento entre usuarias en proyectos, avance y versiones';
end $$;

-- Como servidor/superusuario: la versión fijada sigue inmutable y debe ser del patrón del proyecto.
reset role;
do $$
declare
  pid uuid;
  vid uuid;
  other uuid;
begin
  -- Eva vuelve a empezar un proyecto con el diseño 4 para las pruebas de abajo.
  select project_id into pid from public.start_chart_project('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-8000-000000000004',
    (select updated_at from public.patterns where id = 'e1000000-0000-4000-8000-000000000004'), null);
  select pattern_version_id into vid from public.projects where id = pid;
  select id into other from public.pattern_versions where pattern_id = 'e1000000-0000-4000-8000-000000000003' limit 1;
  begin
    update public.pattern_versions set label = 'cambiada' where id = vid;
    raise exception 'FALLO: ni el servidor modifica una versión';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.pattern_versions where id = vid;
    raise exception 'FALLO: una versión fijada no se borra';
  exception when foreign_key_violation then null; end;
  begin
    update public.projects set pattern_version_id = other where id = pid;
    raise exception 'FALLO: la versión debe ser del patrón del proyecto';
  exception when foreign_key_violation then null; end;
  raise notice 'ok - T7: versión fijada inmutable y del mismo patrón que el proyecto';
end $$;

-- Borrar la cuenta con proyectos y versiones fijadas funciona (NO ACTION se comprueba al final de la
-- sentencia, cuando la cascada ya borró los proyectos).
delete from auth.users where id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
do $$ begin
  assert not exists (select 1 from public.projects where owner_id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'), 'sin proyectos de Eva';
  assert not exists (select 1 from public.pattern_versions where pattern_id::text like 'e1000000-%'), 'sin versiones de Eva';
  assert not exists (select 1 from public.patterns where owner_id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'), 'sin diseños de Eva';
  raise notice 'ok - T7: eliminar la cuenta con proyectos y versiones fijadas borra todo';
end $$;
delete from auth.users where id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';

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

-- O7: ni anon ni authenticated pueden vaciar, referenciar ni poner triggers en tablas de
-- public (TRUNCATE no pasa por RLS); service_role tampoco puede vaciarlas. Incluye una
-- tabla creada después de las migraciones (privilegios por defecto).
create table public.__tabla_futura_o7 (id int);
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as t, g.role, g.priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join (values ('anon','TRUNCATE'),('anon','REFERENCES'),('anon','TRIGGER'),
                       ('authenticated','TRUNCATE'),('authenticated','REFERENCES'),('authenticated','TRIGGER'),
                       ('service_role','TRUNCATE')) as g(role, priv)
    where c.relkind in ('r','p')
  loop
    assert not has_table_privilege(r.role, r.t, r.priv), format('%s tiene %s en %s', r.role, r.priv, r.t);
  end loop;
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r','p')) >= 12, 'se revisaron las tablas de public';
  raise notice 'ok - sin TRUNCATE/REFERENCES/TRIGGER para anon y authenticated (ni TRUNCATE para service_role)';
end $$;
drop table public.__tabla_futura_o7;

-- ================================================================ T4: título y tamaño del documento (ADR 0006)
-- Dora: usuaria nueva para no mezclar con los datos de las secciones anteriores.
insert into auth.users (id, email, raw_user_meta_data) values ('77777777-7777-4777-8777-777777777777', 'dora@example.test', '{}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);

insert into public.patterns (id, title, technique, kind, schema_version, document) values
  ('dddddddd-0000-0000-0000-000000000001', 'Gorro', 'knit', 'chart', 1,
   '{"schemaVersion":1,"title":"Gorro","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');

do $$ begin
  -- La columna title y document.title deben coincidir, en inserción y en actualización.
  begin
    insert into public.patterns (title, technique, kind, schema_version, document)
    values ('Uno', 'knit', 'chart', 1, '{"schemaVersion":1,"title":"Otro","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
    raise exception 'FALLO: title y document.title distintos deben rechazarse al insertar';
  exception when check_violation then null; end;
  begin
    insert into public.patterns (title, technique, kind, schema_version, document)
    values ('Sin título en el documento', 'knit', 'chart', 1, '{"schemaVersion":1,"kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}');
    raise exception 'FALLO: un documento sin título debe rechazarse (NULL no puede pasar la restricción)';
  exception when check_violation then null; end;
  begin
    update public.patterns set title = 'Gorro nuevo' where id = 'dddddddd-0000-0000-0000-000000000001';
    raise exception 'FALLO: cambiar solo la columna title debe rechazarse';
  exception when check_violation then null; end;
  begin
    update public.patterns set document = jsonb_set(document, '{title}', '"Gorro nuevo"') where id = 'dddddddd-0000-0000-0000-000000000001';
    raise exception 'FALLO: cambiar solo document.title debe rechazarse';
  exception when check_violation then null; end;
  begin
    update public.patterns set document = jsonb_set(document, '{title}', '123') where id = 'dddddddd-0000-0000-0000-000000000001';
    raise exception 'FALLO: un título que no es texto debe rechazarse';
  exception when check_violation then null; end;
  -- Cambiar ambos a la vez es lo que hace la aplicación.
  update public.patterns set title = 'Gorro nuevo', document = jsonb_set(document, '{title}', '"Gorro nuevo"') where id = 'dddddddd-0000-0000-0000-000000000001';
  assert (select title from public.patterns where id = 'dddddddd-0000-0000-0000-000000000001') = 'Gorro nuevo', 'título actualizado en ambos';
  raise notice 'ok - title y document.title deben coincidir (inserción y actualización)';
end $$;

-- Peor documento válido de la interfaz: 200 x 200 celdas con 32 lanas (todas con nota), repeticiones
-- máximas (500 x 500), título, id, 50 notas de 2000 caracteres y notas de lana de 500. Se prueba con
-- texto ASCII y, si la base es UTF8 (Supabase lo es), con caracteres de 4 bytes: el peor caso en bytes.
-- Medido en 2026-11-06 (texto de jsonb, con espacios): ASCII 269 235 bytes y 4 bytes 617 595; en JSON compacto
-- del cliente, 228 573 y 576 933. Tope de la base: 1 000 000 bytes (margen de 1,6 veces).
do $$
declare
  ch text;
  worst jsonb;
  t0 timestamptz;
  ms numeric;
  bytes integer;
  pid uuid;
  n integer := 0;
begin
  foreach ch in array array['a', case when current_setting('server_encoding') = 'UTF8' then chr(128512) else 'b' end] loop
    n := n + 1;
    pid := ('dddddddd-0000-0000-0000-00000000010' || n)::uuid;
    worst := jsonb_build_object(
      'schemaVersion', 1, 'id', repeat('i', 64), 'title', repeat(ch, 120), 'kind', 'chart', 'technique', 'knit',
      'origin', jsonb_build_object('kind', 'manual'),
      'gauge', jsonb_build_object('stitchesPer10cm', 22, 'rowsPer10cm', 30),
      'yarns', (select jsonb_agg(jsonb_build_object('id', 'Y' || i, 'weight', 4,
                   'composition', '[{"fiber":"lana","percent":50},{"fiber":"algodon","percent":50}]'::jsonb,
                   'color', jsonb_build_object('hex', '#BA222C'), 'note', repeat(ch, 500)) order by i)
                from generate_series(0, 31) i),
      'notes', (select jsonb_agg(repeat(ch, 2000)) from generate_series(1, 50)),
      'chart', jsonb_build_object('width', 200, 'height', 200, 'repeat', jsonb_build_object('x', 500, 'y', 500),
                 'workedIn', 'rounds', 'renderAs', 'tube', 'direction', 'bottom_up',
                 'cells', (select jsonb_agg((i * 7919) % 32 order by i) from generate_series(1, 40000) i)));
    bytes := octet_length(worst::text);
    t0 := clock_timestamp();
    insert into public.patterns (id, title, technique, kind, schema_version, document)
    values (pid, repeat(ch, 120), 'knit', 'chart', 1, worst);
    ms := extract(epoch from clock_timestamp() - t0) * 1000;
    assert bytes <= 1000000, format('el peor documento válido (%s bytes) cabe en el tope de 1 000 000', bytes);
    assert (select pg_column_size(document) from public.patterns where id = pid) <= 2000000, 'cabe en patterns_document_size';
    assert ms < 2000, format('insertar el peor documento tarda %s ms (tope 2000)', ms);
    -- Se lee igual que se escribió, se versiona y se actualiza dentro de límites razonables.
    assert (select document from public.patterns where id = pid) = worst, 'ida y vuelta sin pérdidas';
    t0 := clock_timestamp();
    assert public.snapshot_pattern(pid, 'peor caso') >= 1, 'snapshot del peor documento';
    update public.patterns set document = jsonb_set(document, '{chart,cells,0}', '1') where id = pid;
    ms := ms + extract(epoch from clock_timestamp() - t0) * 1000;
    assert ms < 4000, format('insertar, versionar y actualizar el peor documento tarda %s ms', ms);
    raise notice 'ok - peor documento % (% bytes de texto JSON) insertado, versionado y actualizado en % ms', n, bytes, round(ms);
  end loop;
end $$;

-- Un documento por encima del tope se rechaza (check_violation), aunque comprimido pese poco.
do $$
begin
  begin
    insert into public.patterns (title, technique, kind, schema_version, document)
    values ('Gigante', 'knit', 'chart', 1,
      jsonb_build_object('schemaVersion', 1, 'title', 'Gigante', 'kind', 'chart', 'technique', 'knit',
        'origin', jsonb_build_object('kind', 'manual'), 'yarns', '[]'::jsonb,
        'notes', jsonb_build_array(repeat('a', 1000001))));
    raise exception 'FALLO: un documento de más de 1 000 000 bytes debe rechazarse';
  exception when check_violation then null; end;
  assert (select count(*) from public.patterns where title = 'Gigante') = 0, 'el gigante no se guardó';
  raise notice 'ok - un documento mayor que el tope de texto JSON se rechaza';
end $$;

-- Aislamiento: Ana no ve ni toca los diseños de Dora.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n integer;
begin
  assert not exists (select 1 from public.patterns where owner_id = '77777777-7777-4777-8777-777777777777'), 'Ana no ve los diseños de Dora';
  update public.patterns set title = 'robado', document = jsonb_set(document, '{title}', '"robado"') where id = 'dddddddd-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'Ana no actualiza el diseño de Dora';
  delete from public.patterns where id = 'dddddddd-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'Ana no borra el diseño de Dora';
  begin
    perform public.snapshot_pattern('dddddddd-0000-0000-0000-000000000001', 'ajena');
    raise exception 'FALLO: Ana no puede versionar un diseño de Dora';
  exception when sqlstate 'P0002' then null; end;
  raise notice 'ok - los diseños de Dora (incluido el peor caso) son invisibles e intocables para Ana';
end $$;
reset role;
delete from auth.users where id = '77777777-7777-4777-8777-777777777777';
do $$ begin
  assert not exists (select 1 from public.patterns where owner_id = '77777777-7777-4777-8777-777777777777'), 'los diseños se van con la cuenta';
  assert not exists (select 1 from public.pattern_versions v where v.pattern_id::text like 'dddddddd-%'), 'las versiones se van con el diseño';
end $$;

-- Funciones de public ejecutables por anon o authenticated: SOLO las de la lista permitida.
-- Una función nueva hereda EXECUTE de PUBLIC (valor global de PostgreSQL que no se revoca, ver
-- 20261106035626_sin_truncate.sql): si su migración olvida el `revoke`, este check falla.
-- Las funciones de trigger no cuentan aquí: no se pueden invocar por /rpc. Tienen su propia
-- verificación, más abajo (ninguna debe ser ejecutable por anon ni authenticated).
-- Para exponer una función nueva: grant explícito en su migración y agregarla aquí.
do $$
declare
  permitidas constant text[] := array[
    'composition_is_valid(jsonb)',           -- pura, la usa una restricción de user_yarns
    'get_shared_pattern(uuid)',              -- compartir por enlace (anon y authenticated)
    'list_public_patterns(integer,integer)', -- listado público (anon y authenticated)
    'pattern_is_reportable(uuid)',           -- authenticated
    'pattern_is_usable(uuid)',               -- authenticated
    'snapshot_pattern(uuid,text)'            -- authenticated
    -- start_chart_project y repin_project (T7, ADR 0009) NO están aquí a propósito: fijan una versión
    -- para tejer, que exige `valid` (ADR 0006, E10), y solo la Server Action puede validar. Las ejecuta
    -- service_role (ver la sección T7 y 20261111031813_tejer_disenos.sql).
  ];
  f record;
  n integer := 0;
begin
  for f in
    select p.oid, replace(p.oid::regprocedure::text, 'public.', '') as firma
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prorettype <> 'trigger'::regtype
  loop
    n := n + 1;
    if (has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute'))
       and not (f.firma = any (permitidas)) then
      raise exception 'FALLO: % es ejecutable por anon o authenticated y no está en la lista permitida', f.firma;
    end if;
  end loop;
  assert n >= 6, 'se revisaron las funciones de public';
  assert has_function_privilege('anon', 'public.get_shared_pattern(uuid)', 'execute'), 'get_shared_pattern sigue pública';
  assert not has_function_privilege('anon', 'public.snapshot_pattern(uuid, text)', 'execute'), 'snapshot_pattern no es para anon';
  assert has_function_privilege('authenticated', 'public.snapshot_pattern(uuid, text)', 'execute'), 'snapshot_pattern sigue disponible';
  raise notice 'ok - solo las funciones de la lista permitida son ejecutables por anon o authenticated';
end $$;

-- Y el check detecta una función nueva sin revoke (prueba de la red de seguridad).
create function public.__funcion_futura() returns int language sql as 'select 1';
do $$ begin
  assert has_function_privilege('service_role', 'public.__funcion_futura()', 'execute'), 'service_role conserva EXECUTE por defecto';
  -- Hereda de PUBLIC: así se comporta en Supabase real; por eso existe la lista permitida.
  assert has_function_privilege('anon', 'public.__funcion_futura()', 'execute')
      or not has_function_privilege('public', 'public.__funcion_futura()', 'execute'), 'una función nueva sin revoke es ejecutable vía PUBLIC';
  raise notice 'ok - una función nueva sin revoke quedaría expuesta: la lista permitida la detecta';
end $$;
drop function public.__funcion_futura();

-- Funciones de trigger de public: ninguna es ejecutable por anon ni authenticated (docs/seguridad.md,
-- "Limpieza menor: EXECUTE en funciones de trigger", 20261111031138_revocar_execute_triggers.sql).
-- No son invocables por /rpc, pero un trigger nuevo con EXECUTE vía PUBLIC sería exposición innecesaria.
-- Los disparadores siguen funcionando sin EXECUTE: las pruebas de arriba disparan patterns_quota,
-- patterns_guard_origin y projects_check_pattern como authenticated.
do $$
declare
  f record;
  n integer := 0;
begin
  for f in
    select p.oid, replace(p.oid::regprocedure::text, 'public.', '') as firma
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    n := n + 1;
    if has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then
      raise exception 'FALLO: la función de trigger % es ejecutable por anon o authenticated', f.firma;
    end if;
  end loop;
  assert n >= 14, 'se revisaron las funciones de trigger de public';
  assert not has_function_privilege('anon', 'public.patterns_quota()', 'execute'), 'patterns_quota no es para anon';
  assert not has_function_privilege('authenticated', 'public.pattern_reports_quota()', 'execute'), 'pattern_reports_quota no es para authenticated';
  raise notice 'ok - ninguna función de trigger de public es ejecutable por anon ni authenticated';
end $$;

-- Y la prueba en negativo: una función de trigger nueva sin revoke sería detectada.
create function public.__trigger_futura() returns trigger language plpgsql as $f$ begin return new; end; $f$;
do $$ begin
  -- Hereda EXECUTE de PUBLIC, así que la búsqueda de arriba la marcaría (salvo que PUBLIC ya no lo tenga).
  assert has_function_privilege('anon', 'public.__trigger_futura()', 'execute')
      or not has_function_privilege('public', 'public.__trigger_futura()', 'execute'), 'una función de trigger nueva sin revoke quedaría expuesta';
  raise notice 'ok - una función de trigger nueva sin revoke quedaría expuesta: la verificación la detecta';
end $$;
drop function public.__trigger_futura();

-- Secuencias: anon y authenticated no tienen USAGE, SELECT ni UPDATE sobre ninguna secuencia de
-- public (hoy solo existe la de rate_events.id, identity, que escribe el servidor). Si una tabla
-- futura con INSERT de la usuaria necesita una secuencia (serial), añadir aquí la excepción documentada.
create sequence public.__secuencia_futura;
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as s, g.role, g.priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join (values ('anon','USAGE'),('anon','SELECT'),('anon','UPDATE'),
                       ('authenticated','USAGE'),('authenticated','SELECT'),('authenticated','UPDATE')) as g(role, priv)
    where c.relkind = 'S'
  loop
    assert not has_sequence_privilege(r.role, r.s, r.priv), format('%s tiene %s en la secuencia %s', r.role, r.priv, r.s);
  end loop;
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'S') >= 2, 'se revisaron las secuencias de public';
  raise notice 'ok - sin privilegios de secuencia para anon ni authenticated';
end $$;
drop sequence public.__secuencia_futura;

-- Claves ausentes en el documento (T15 B-3): kind, technique, schemaVersion u origin faltantes no
-- pasan el CHECK por comparar con NULL. Se prueba como superusuario (sin RLS de por medio).
reset role;
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'eli@example.test');
do $$
declare
  base jsonb := '{"schemaVersion":1,"kind":"chart","technique":"knit","title":"T","origin":{"kind":"manual"},"yarns":[]}';
  k text;
begin
  foreach k in array array['kind', 'technique', 'schemaVersion', 'origin'] loop
    begin
      insert into public.patterns (owner_id, title, technique, kind, schema_version, origin, document)
      values ('55555555-5555-5555-5555-555555555555', 'T', 'knit', 'chart', 1, 'manual', base - k);
      raise exception 'FALLO: un documento sin % no debe pasar la restricción', k;
    exception when check_violation then null; end;
  end loop;
  raise notice 'ok - un documento sin kind, technique, schemaVersion u origin no pasa el CHECK';
end $$;

-- T15 final (MEDIO-2): topes de proyectos (1000), notas (10 000), lanas (500) y versiones (5000)
-- por usuaria, y largo de la fibra en la composición. Se prueban como superusuario: los triggers
-- corren para cualquier rol.
reset role;
insert into auth.users (id, email) values ('66666666-6666-4666-8666-666666666666', 'topes@example.test');
insert into public.projects (owner_id, title) select '66666666-6666-4666-8666-666666666666', 'P' || i from generate_series(1, 1000) i;
insert into public.user_yarns (owner_id, weight, composition, color_hex)
  select '66666666-6666-4666-8666-666666666666', 3, '[{"fiber":"algodon","percent":100}]', '#E9DDBE' from generate_series(1, 500) i;
do $$
declare pid uuid; d text;
begin
  begin
    insert into public.projects (owner_id, title) values ('66666666-6666-4666-8666-666666666666', 'P1001');
    raise exception 'FALLO: el proyecto 1001 debe rechazarse';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'projects', 'detail del tope proyecto 1001: ' || coalesce(d, 'null');
  end;
  delete from public.projects where title = 'P1';
  insert into public.projects (owner_id, title) values ('66666666-6666-4666-8666-666666666666', 'P1001');
  assert (select count(*) from public.projects where owner_id = '66666666-6666-4666-8666-666666666666') = 1000, 'borrar libera cupo de proyectos';
  -- Otra usuaria no se ve afectada por el tope de esta.
  insert into auth.users (id, email) values ('67676767-6767-4767-8767-676767676767', 'libre@example.test');
  insert into public.projects (owner_id, title) values ('67676767-6767-4767-8767-676767676767', 'Libre');

  begin
    insert into public.user_yarns (owner_id, weight, composition, color_hex)
    values ('66666666-6666-4666-8666-666666666666', 3, '[{"fiber":"algodon","percent":100}]', '#E9DDBE');
    raise exception 'FALLO: la lana 501 debe rechazarse';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'user_yarns', 'detail del tope lana 501: ' || coalesce(d, 'null');
  end;
  delete from public.user_yarns where ctid = (select ctid from public.user_yarns where owner_id = '66666666-6666-4666-8666-666666666666' limit 1);
  insert into public.user_yarns (owner_id, weight, composition, color_hex)
  values ('66666666-6666-4666-8666-666666666666', 3, '[{"fiber":"algodon","percent":100}]', '#E9DDBE');
  assert (select count(*) from public.user_yarns where owner_id = '66666666-6666-4666-8666-666666666666') = 500, 'borrar libera cupo de lanas';

  -- Notas: 10 000 repartidas en dos proyectos de la misma usuaria (el tope es por usuaria).
  select id into pid from public.projects where title = 'P2' and owner_id = '66666666-6666-4666-8666-666666666666';
  insert into public.project_notes (project_id, body) select pid, 'n' from generate_series(1, 5000);
  select id into pid from public.projects where title = 'P3' and owner_id = '66666666-6666-4666-8666-666666666666';
  insert into public.project_notes (project_id, body) select pid, 'n' from generate_series(1, 5000);
  begin
    insert into public.project_notes (project_id, body) values (pid, 'n10001');
    raise exception 'FALLO: la nota 10001 debe rechazarse';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'project_notes', 'detail del tope nota 10001: ' || coalesce(d, 'null');
  end;
  delete from public.project_notes where ctid = (select ctid from public.project_notes where project_id = pid limit 1);
  insert into public.project_notes (project_id, body) values (pid, 'n10001');
  raise notice 'ok - topes por usuaria: 1000 proyectos, 500 lanas, 10 000 notas (54000); borrar libera';
end $$;

-- Versiones: 25 diseños x 200 = 5000; la siguiente falla aunque cada diseño esté bajo su tope de 200.
insert into public.patterns (id, owner_id, title, technique, kind, schema_version, document)
select ('66666666-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '66666666-6666-4666-8666-666666666666', 'V' || i, 'knit', 'chart', 1,
       ('{"schemaVersion":1,"title":"V' || i || '","kind":"chart","technique":"knit","origin":{"kind":"manual"},"yarns":[]}')::jsonb
from generate_series(1, 26) i;
insert into public.pattern_versions (pattern_id, version, document)
select ('66666666-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, v, '{}'::jsonb
from generate_series(1, 25) i, generate_series(1, 200) v;
do $$ declare d text; begin
  begin
    insert into public.pattern_versions (pattern_id, version, document)
    values ('66666666-0000-4000-8000-000000000026', 1, '{}');
    raise exception 'FALLO: la versión 5001 debe rechazarse';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'versions_total', 'detail del tope versión 5001: ' || coalesce(d, 'null');
  end;
  delete from public.pattern_versions where pattern_id = '66666666-0000-4000-8000-000000000001' and version = 1;
  insert into public.pattern_versions (pattern_id, version, document)
  values ('66666666-0000-4000-8000-000000000026', 1, '{}');
  raise notice 'ok - tope total de 5000 versiones por usuaria (54000); borrar libera';
end $$;
-- También por la función que usa la usuaria.
set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
do $$ declare d text; begin
  begin
    perform public.snapshot_pattern('66666666-0000-4000-8000-000000000026');
    raise exception 'FALLO: snapshot_pattern debe respetar el tope total';
  exception when program_limit_exceeded then
    get stacked diagnostics d = pg_exception_detail;
    assert d = 'versions_total', 'detail del tope snapshot_pattern con 5000 en total: ' || coalesce(d, 'null');
  end;
  raise notice 'ok - snapshot_pattern respeta el tope total de versiones';
end $$;
reset role;
delete from auth.users where id = '66666666-6666-4666-8666-666666666666';
delete from auth.users where id = '67676767-6767-4767-8767-676767676767';

-- Largo del nombre de fibra: 40 caracteres pasan, 41 no.
do $$ begin
  assert public.composition_is_valid(('[{"fiber":"' || repeat('a', 40) || '","percent":100}]')::jsonb), '40 caracteres valen';
  assert not public.composition_is_valid(('[{"fiber":"' || repeat('a', 41) || '","percent":100}]')::jsonb), '41 caracteres no valen';
  assert not public.composition_is_valid('[{"fiber":"","percent":100}]'), 'fibra vacía no vale';
  begin
    insert into public.user_yarns (owner_id, weight, composition, color_hex)
    values ('55555555-5555-5555-5555-555555555555', 3, ('[{"fiber":"' || repeat('a', 41) || '","percent":100}]')::jsonb, '#E9DDBE');
    raise exception 'FALLO: una fibra de 41 caracteres no pasa el CHECK';
  exception when check_violation then null; end;
  raise notice 'ok - la fibra de una composición mide 1 a 40 caracteres';
end $$;

-- Toda relación de public (tablas y particionadas) tiene RLS activado; las vistas, security_invoker
-- o sin grants para anon y authenticated (T15 MEDIO-1).
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select c.oid::regclass as t, c.relrowsecurity, c.relkind, c.reloptions
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind in ('r','p','v','m')
  loop
    if r.relkind in ('r','p') then
      n := n + 1;
      if not r.relrowsecurity then
        raise exception 'FALLO: % no tiene RLS activado', r.t;
      end if;
    elsif r.relkind = 'v' then
      if not coalesce(r.reloptions @> array['security_invoker=true'], false)
         and (has_table_privilege('anon', r.t, 'select') or has_table_privilege('authenticated', r.t, 'select')) then
        raise exception 'FALLO: la vista % no es security_invoker y es legible por anon o authenticated', r.t;
      end if;
    else
      if has_table_privilege('anon', r.t, 'select') or has_table_privilege('authenticated', r.t, 'select') then
        raise exception 'FALLO: la vista materializada % es legible por anon o authenticated (no admite RLS)', r.t;
      end if;
    end if;
  end loop;
  assert n >= 16, format('se revisaron solo %s tablas de public', n);
  raise notice 'ok - las % tablas de public tienen RLS activado; vistas seguras', n;
end $$;
-- Prueba en negativo: una tabla sin RLS hace fallar la aserción; una vista sin security_invoker, también.
create table public.__sin_rls (id int);
create view public.__vista_abierta as select 1 as x;
grant select on public.__vista_abierta to anon;
do $$
declare
  r record;
  tabla_detectada boolean := false;
  vista_detectada boolean := false;
begin
  for r in
    select c.oid::regclass as t, c.relrowsecurity, c.relkind, c.reloptions
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind in ('r','p','v')
  loop
    if r.relkind in ('r','p') and not r.relrowsecurity then tabla_detectada := true; end if;
    if r.relkind = 'v' and not coalesce(r.reloptions @> array['security_invoker=true'], false)
       and has_table_privilege('anon', r.t, 'select') then vista_detectada := true; end if;
  end loop;
  assert tabla_detectada, 'una tabla sin RLS debe detectarse';
  assert vista_detectada, 'una vista abierta debe detectarse';
  raise notice 'ok - el check detecta una tabla sin RLS y una vista sin security_invoker';
end $$;
drop view public.__vista_abierta;
drop table public.__sin_rls;

-- T17 (M1): part_id admite hasta 64 caracteres; 65 viola project_progress_part_id_len.
reset role;
insert into auth.users (id, email) values ('68686868-6868-4868-8868-686868686868', 'partid@example.test');
insert into public.projects (id, owner_id, title) values ('68000000-0000-4000-8000-000000000001', '68686868-6868-4868-8868-686868686868', 'PartId');
do $$ begin
  insert into public.project_progress (project_id, part_id, round_number, stitch_index)
  values ('68000000-0000-4000-8000-000000000001', repeat('p', 64), 1, 0);
  update public.project_progress set part_id = null where project_id = '68000000-0000-4000-8000-000000000001';
  begin
    update public.project_progress set part_id = repeat('p', 65) where project_id = '68000000-0000-4000-8000-000000000001';
    raise exception 'FALLO: part_id de 65 caracteres debe rechazarse';
  exception when check_violation then null; end;
  begin
    update public.project_progress set part_id = repeat('p', 64) where project_id = '68000000-0000-4000-8000-000000000001';
  exception when others then raise exception 'FALLO: part_id de 64 caracteres debe aceptarse (%)', sqlerrm; end;
  raise notice 'ok - T17: part_id hasta 64 caracteres (65 es check_violation)';
end $$;

-- T8 (fase 4): profiles.pattern_dialect, 'es' por defecto, solo la cambia su dueña, con CHECK.
reset role;
insert into auth.users (id, email) values
  ('81818181-8181-4181-8181-818181818181', 'dialecto-a@example.test'),
  ('82828282-8282-4282-8282-828282828282', 'dialecto-b@example.test');
do $$ begin
  assert (select pattern_dialect from public.profiles where id = '81818181-8181-4181-8181-818181818181') = 'es', 'el perfil de la dueña trae pattern_dialect = es';
  assert (select pattern_dialect from public.profiles where id = '82828282-8282-4282-8282-828282828282') = 'es', 'el perfil de la otra usuaria trae pattern_dialect = es';
  raise notice 'ok - el perfil nuevo trae pattern_dialect = es';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81818181-8181-4181-8181-818181818181', true);
do $$ declare n int; v text; begin
  foreach v in array array['uk', 'us', 'es'] loop
    update public.profiles set pattern_dialect = v where id = '81818181-8181-4181-8181-818181818181';
    get diagnostics n = row_count;
    assert n = 1, 'la dueña puede cambiar su pattern_dialect a ' || v;
    assert (select pattern_dialect from public.profiles where id = '81818181-8181-4181-8181-818181818181') = v, 'la dueña lee su dialecto ' || v;
  end loop;
  update public.profiles set pattern_dialect = 'uk' where id = '82828282-8282-4282-8282-828282828282';
  get diagnostics n = row_count;
  assert n = 0, 'la dueña no puede cambiar el pattern_dialect de la otra usuaria';
  begin
    update public.profiles set pattern_dialect = 'es-uk' where id = '81818181-8181-4181-8181-818181818181';
    raise exception 'FALLO: un dialecto fuera del CHECK debe rechazarse';
  exception when check_violation then null; end;
  begin
    update public.profiles set pattern_dialect = null where id = '81818181-8181-4181-8181-818181818181';
    raise exception 'FALLO: pattern_dialect no admite null';
  exception when not_null_violation then null; end;
  assert (select pattern_dialect from public.profiles where id = '81818181-8181-4181-8181-818181818181') = 'es', 'el valor de la dueña no cambió con los intentos inválidos';
  raise notice 'ok - la usuaria cambia su pattern_dialect; no el ajeno; el CHECK rechaza valores fuera de es/us/uk';
end $$;
reset role;
do $$ begin
  assert (select pattern_dialect from public.profiles where id = '82828282-8282-4282-8282-828282828282') = 'es', 'el de la otra usuaria sigue en es';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82828282-8282-4282-8282-828282828282', true);
do $$ begin
  assert (select count(*) from public.profiles where pattern_dialect is not null) = 1, 'la otra usuaria lee solo su propio dialecto';
  raise notice 'ok - la otra usuaria solo lee su dialecto';
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    update public.profiles set pattern_dialect = 'uk' where id = '81818181-8181-4181-8181-818181818181';
    raise exception 'FALLO: anon no puede cambiar pattern_dialect';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.profiles) = 0, 'anon no lee pattern_dialect';
  raise notice 'ok - anon no lee ni cambia pattern_dialect';
end $$;
reset role;

-- T20-I1 / T20-B8: lista exacta de columnas con UPDATE para authenticated en profiles; terminology no está.
reset role;
do $$ declare cols text; begin
  select string_agg(column_name::text, ',' order by column_name) into cols
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  assert cols = 'display_name,dominant_hand,mirror_knitting,pattern_dialect,units',
    'columnas con UPDATE en profiles para authenticated: ' || coalesce(cols, 'ninguna');
  assert not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee in ('anon', 'public') and privilege_type = 'UPDATE'),
    'anon no tiene UPDATE en ninguna columna de profiles';
  raise notice 'ok - T20-I1: lista exacta de columnas con UPDATE en profiles';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81818181-8181-4181-8181-818181818181', true);
do $$ begin
  begin
    update public.profiles set terminology = 'uk' where id = '81818181-8181-4181-8181-818181818181';
    raise exception 'FALLO: terminology no debe poder actualizarse con la sesión propia';
  exception when insufficient_privilege then null; end;
  raise notice 'ok - T20-B8: actualizar terminology falla con insufficient_privilege';
end $$;
reset role;

rollback;

\echo 'RLS: todas las verificaciones pasaron'
