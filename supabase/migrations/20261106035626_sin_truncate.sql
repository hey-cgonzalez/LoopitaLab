-- Defensa en profundidad (hallazgo O7 de QA): quitar TRUNCATE, REFERENCES y TRIGGER
-- a los roles de la API.
--
-- Supabase da por defecto a anon y authenticated todos los privilegios sobre las tablas
-- de public (la seguridad real la hace RLS). Pero TRUNCATE no pasa por RLS: quien lo
-- tuviera vaciaría la tabla entera de todas las usuarias. PostgREST no expone TRUNCATE,
-- así que hoy no es explotable; se revoca por si cambia la exposición (una función
-- mal definida, otro cliente SQL, una futura extensión).
--
-- * anon, authenticated: se revocan TRUNCATE, REFERENCES y TRIGGER.
--   - TRUNCATE: nadie lo usa; la purga y la eliminación de cuenta usan DELETE.
--   - REFERENCES: solo hace falta al crear una clave foránea (DDL, la hace el dueño de
--     la tabla, no la API). Con él, una usuaria podría atar su tabla a las nuestras.
--   - TRIGGER: solo hace falta al crear triggers (DDL). Ninguna ruta de la app lo usa.
-- * service_role: se revoca TRUNCATE. El servidor borra con DELETE (purge_expired_data,
--   eliminación de cuenta); su clave salta RLS, así que un TRUNCATE con clave filtrada
--   sería irreversible sin necesidad. Se conservan REFERENCES y TRIGGER (inofensivos
--   sin DDL y quitarlos no aporta nada).
-- * Tablas futuras: las crea el rol postgres en Supabase (migraciones y SQL editor);
--   los privilegios por defecto son por rol creador, por eso se ajusta postgres y,
--   si es otro, el rol que ejecuta esta migración. Las tablas que cree supabase_admin
--   (extensiones, componentes internos) no se tocan: no son del esquema de la app.
--   Una migración nueva que cree una tabla hereda estos valores; no hace falta revocar
--   nada más allá de los permisos propios de cada tabla.

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke truncate on all tables in schema public from service_role;

alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from service_role;

-- Privilegios por defecto del rol postgres (tablas, funciones y secuencias; ver más abajo). En Supabase esta migración la corre `postgres`
-- (CLI, `db push` y SQL editor), así que los `alter default privileges` de arriba ya cubren
-- las tablas que ese rol cree. Si la corre otro rol, hay que ajustar también postgres, y si no
-- se puede, la migración FALLA a propósito (sin `exception`): un aviso silencioso dejaría
-- tablas futuras con TRUNCATE o funciones con EXECUTE para anon/authenticated sin que nadie lo note.
do $$
begin
  if current_user <> 'postgres' and exists (select 1 from pg_roles where rolname = 'postgres') then
    execute 'alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke truncate on tables from service_role';
    execute 'alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke usage, select, update on sequences from anon, authenticated';
  end if;
end $$;

-- ------------------------------------------------------------ funciones futuras
-- Supabase otorga EXECUTE por defecto a anon, authenticated y service_role sobre funciones
-- nuevas de public. Se quitan esas entradas para anon y authenticated; service_role conserva
-- el suyo (servidor). Solo afecta a funciones FUTURAS: las existentes no se tocan (las que
-- deben ser invocables ya tienen grant explícito: get_shared_pattern, list_public_patterns,
-- snapshot_pattern, pattern_is_usable, pattern_is_reportable).
--
-- Lo que NO se hace, a propósito: revocar el EXECUTE por defecto de PUBLIC. Ese valor es
-- GLOBAL (PostgreSQL no permite acotarlo a un esquema) y alcanzaría a todas las funciones que
-- cree `postgres` en cualquier esquema, incluidas las extensiones que se activen desde el
-- panel: en este proyecto pgcrypto, uuid-ossp y pg_stat_statements son de `postgres`
-- (comprobado en la base real el 2026-11-06). Como anon y authenticated heredan de PUBLIC,
-- una función nueva sigue siendo ejecutable por ellos hasta que su migración la revoque. La
-- red de seguridad es el check de CI (supabase/checks/10_rls_check.sql): falla si alguna
-- función de public, que no sea de trigger, queda ejecutable por anon o authenticated sin
-- estar en la lista permitida.
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ------------------------------------------------------------ secuencias
-- La única secuencia de public es la de rate_events.id (`generated always as identity`).
-- Ninguna tabla con INSERT para authenticated usa secuencias: patterns, projects, project_notes,
-- user_yarns, pattern_reports, uploads usan uuid (gen_random_uuid()). Además, un INSERT en una
-- columna identity NO requiere USAGE sobre la secuencia, y rate_events solo la escribe el
-- servidor (service_role, que conserva sus privilegios). No hay ningún `serial`/nextval().
-- Si una tabla futura con INSERT de la usuaria necesitara `serial`, debe otorgar USAGE a mano.
revoke usage, select, update on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke usage, select, update on sequences from anon, authenticated;

-- Reversión (no es necesaria en operación normal; vuelve al estado por defecto de Supabase):
--   grant truncate, references, trigger on all tables in schema public to anon, authenticated;
--   grant truncate on all tables in schema public to service_role;
--   alter default privileges in schema public grant truncate, references, trigger on tables to anon, authenticated;
--   alter default privileges in schema public grant truncate on tables to service_role;
--   alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to anon, authenticated;
--   alter default privileges for role postgres in schema public grant truncate on tables to service_role;
--   alter default privileges in schema public grant execute on functions to anon, authenticated;
--   alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated;
--   grant usage, select, update on all sequences in schema public to anon, authenticated;
--   alter default privileges in schema public grant usage, select, update on sequences to anon, authenticated;
--   alter default privileges for role postgres in schema public grant usage, select, update on sequences to anon, authenticated;
-- Nota: rate_events ya tenía revocado truncate a service_role (denuncias_y_derechos);
-- la reversión de arriba se lo devolvería: volver a ejecutar
--   revoke update, delete, truncate on public.rate_events from service_role;
