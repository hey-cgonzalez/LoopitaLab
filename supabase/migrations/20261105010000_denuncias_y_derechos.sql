-- Denuncias de patrones compartidos, topes de frecuencia y derechos de la usuaria (fase 2).
-- · pattern_reports: una usuaria con sesión denuncia un patrón público o compartido por enlace
--   (unlisted) que no sea suyo. Solo ve sus denuncias; el estado lo cambia la moderación con la
--   clave secreta. Cada denuncia guarda una instantánea (título, sha256 del documento, autora)
--   para que la evidencia sobreviva si el patrón se borra o se edita.
-- · rate_events: bitácora de solo inserción que escribe solo el servidor. Los topes cuentan aquí,
--   no en tablas que se puedan borrar (F2-M1): 60 intentos y 30 imágenes guardadas por día,
--   5 exportaciones por día.
-- · operation_locks: como máximo una subida y una exportación en curso por usuaria. Cada
--   candado tiene un token: solo quien lo tomó lo renueva o lo suelta.
-- · reauth_intents: intento de re-autenticación atado a la acción (eliminar cuenta, cambiar
--   contraseña). Ver begin_reauth / consume_reauth.
-- · purge_expired_data(): plazos de conservación (ver constantes en la función) y pg_cron.
-- · Las subidas ya no se borran desde el cliente: se borran por DELETE /api/subidas/[id].
--
-- Claves foráneas hacia auth.users revisadas para "Eliminar mi cuenta" (auth.admin.deleteUser):
--   profiles, patterns, projects, user_yarns, uploads, ai_jobs, rate_events, operation_locks,
--   reauth_intents y pattern_reports.reporter_id -> on delete cascade.
--   pattern_versions, project_progress, project_notes -> cascada a través de patterns / projects.
--   projects.pattern_id, ai_jobs.upload_id, ai_jobs.result_pattern_id, pattern_reports.pattern_id
--   -> on delete set null (el proyecto de otra usuaria y la denuncia sobreviven).
-- No falta ninguna: esta migración no cambia claves foráneas existentes.
--
-- Reversión: ver el bloque comentado al final.

-- ---------------------------------------------------------------- denuncias

create table public.pattern_reports (
  id uuid primary key default gen_random_uuid(),
  -- Nulo si el patrón se borró después: la denuncia y su instantánea se conservan.
  pattern_id uuid references public.patterns (id) on delete set null,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('copyright', 'offensive', 'spam', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  -- Instantánea al momento de denunciar (la llena un trigger; el cliente no la fija).
  pattern_title text,
  pattern_sha256 text check (pattern_sha256 ~ '^[0-9a-f]{64}$'),
  -- Sin clave foránea a propósito: identifica a la autora aunque el patrón ya no exista.
  pattern_owner_id uuid,
  created_at timestamptz not null default now(),
  unique (pattern_id, reporter_id)
);
comment on table public.pattern_reports is 'Denuncias de patrones públicos o compartidos por enlace. La usuaria crea y lee las suyas; la moderación las revisa con la clave secreta.';

-- pattern_id ya queda cubierto por el índice único (pattern_id, reporter_id).
create index pattern_reports_reporter_idx on public.pattern_reports (reporter_id, created_at desc);
create index pattern_reports_open_idx on public.pattern_reports (created_at) where status = 'open';
create index pattern_reports_owner_idx on public.pattern_reports (pattern_owner_id);

-- ¿La usuaria actual puede denunciar este patrón? Público o por enlace, y no propio. Security
-- definer porque la tabla de patrones no deja leer los ajenos. Devuelve false igual para un
-- patrón privado ajeno que para uno inexistente: no revela cuál existe.
create function public.pattern_is_reportable(p_pattern_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patterns
    where id = p_pattern_id and visibility in ('public', 'unlisted') and owner_id <> auth.uid()
  );
$$;
revoke execute on function public.pattern_is_reportable(uuid) from public, anon;
grant execute on function public.pattern_is_reportable(uuid) to authenticated;

-- Tope anti-abuso: 20 denuncias por usuaria en 24 h. El candado serializa las inserciones
-- simultáneas de una misma usuaria para que el conteo sea exacto. Las denuncias no se pueden
-- borrar desde el cliente, así que el conteo no se puede reducir.
create function public.pattern_reports_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('pattern_reports:' || new.reporter_id::text));
  if (select count(*) from public.pattern_reports
      where reporter_id = new.reporter_id and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Llegaste al tope de 20 denuncias en 24 horas' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger pattern_reports_quota before insert on public.pattern_reports
  for each row execute function public.pattern_reports_quota();

-- Instantánea del patrón denunciado. Security definer porque la denunciante no puede leer el
-- patrón ajeno; siempre sobrescribe lo que venga en la fila.
create function public.pattern_reports_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.title, encode(sha256(convert_to(p.document::text, 'UTF8')), 'hex'), p.owner_id
    into new.pattern_title, new.pattern_sha256, new.pattern_owner_id
  from public.patterns p
  where p.id = new.pattern_id;
  return new;
end;
$$;
revoke execute on function public.pattern_reports_snapshot() from public, anon, authenticated;

create trigger pattern_reports_snapshot before insert on public.pattern_reports
  for each row execute function public.pattern_reports_snapshot();

-- F2-M6: la autora solo se conserva mientras la denuncia está abierta. Al cerrarla (reviewed o
-- dismissed) se borra pattern_owner_id; el título y el hash quedan como evidencia del contenido.
-- Las abiertas por más tiempo del plazo se limpian en purge_expired_data().
create function public.pattern_reports_on_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    new.pattern_owner_id := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.pattern_reports_on_close() from public, anon, authenticated;

create trigger pattern_reports_on_close before update on public.pattern_reports
  for each row execute function public.pattern_reports_on_close();

alter table public.pattern_reports enable row level security;

create policy "denuncias: crear sobre patrones compartidos ajenos" on public.pattern_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.pattern_is_reportable(pattern_id));
create policy "denuncias: leer las propias" on public.pattern_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Permisos por columna: el cliente no fija id, status, created_at ni la instantánea; no edita
-- ni borra. reporter_id se permite porque la política exige que sea la propia usuaria.
-- La denunciante no lee el hash ni la autora (un patrón compartido no expone owner_id, M2).
revoke all on public.pattern_reports from anon, authenticated;
grant select (id, pattern_id, reporter_id, reason, details, status, pattern_title, created_at)
  on public.pattern_reports to authenticated;
grant insert (pattern_id, reporter_id, reason, details) on public.pattern_reports to authenticated;

-- ------------------------------------------- bitácora de topes y candados

-- Solo inserción y solo el servidor: el cliente no la ve, y ni la clave secreta la edita o borra.
-- Se vacía únicamente en cascada al eliminar la cuenta.
create table public.rate_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('upload_attempt', 'upload_stored', 'export')),
  created_at timestamptz not null default now()
);
create index rate_events_owner_kind_idx on public.rate_events (owner_id, kind, created_at desc);
alter table public.rate_events enable row level security;
revoke all on public.rate_events from anon, authenticated;
revoke update, delete, truncate on public.rate_events from service_role;

-- Una operación en curso por usuaria y tipo. Un candado más viejo que su plazo se considera
-- abandonado (el servidor se cayó a mitad) y se puede retomar. El token identifica a quien lo
-- tomó: un proceso que se demoró más que el plazo no puede soltar el candado de otro (F2-B11).
create table public.operation_locks (
  owner_id uuid not null references auth.users (id) on delete cascade,
  operation text not null check (operation in ('upload', 'export')),
  token uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  primary key (owner_id, operation)
);
alter table public.operation_locks enable row level security;
revoke all on public.operation_locks from anon, authenticated;

-- Empieza una subida o exportación: toma el candado y cobra el intento antes de procesar,
-- así los intentos fallidos (archivo inválido, demasiado grande) también cuentan.
--   upload: 60 intentos y 30 imágenes guardadas por día; candado de 2 minutos (el servidor
--           corta la lectura del cuerpo a los 60 s).
--   export: 5 por día; candado de 5 minutos, renovado con renew_operation() cada minuto.
-- Devuelve el token del candado. Errores: 55P03 si ya hay una en curso, 54000 si se llegó al tope.
create function public.begin_operation(p_owner uuid, p_operation text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_limit integer;
  v_stale interval;
  v_token uuid;
begin
  if p_operation = 'upload' then
    v_kind := 'upload_attempt'; v_limit := 60; v_stale := interval '2 minutes';
  elsif p_operation = 'export' then
    v_kind := 'export'; v_limit := 5; v_stale := interval '5 minutes';
  else
    raise exception 'Operación desconocida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('operations:' || p_owner::text));

  insert into public.operation_locks (owner_id, operation) values (p_owner, p_operation)
  on conflict (owner_id, operation) do update set started_at = now(), token = gen_random_uuid()
    where public.operation_locks.started_at < now() - v_stale
  returning token into v_token;
  if v_token is null then
    raise exception 'Ya hay una operación en curso' using errcode = '55P03';
  end if;

  if (select count(*) from public.rate_events
      where owner_id = p_owner and kind = v_kind and created_at > now() - interval '24 hours') >= v_limit then
    raise exception 'Llegaste al tope de % intentos en 24 horas', v_limit using errcode = '54000';
  end if;
  if p_operation = 'upload' and (select count(*) from public.rate_events
      where owner_id = p_owner and kind = 'upload_stored' and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'Llegaste al tope de 30 imágenes en 24 horas' using errcode = '54000';
  end if;

  insert into public.rate_events (owner_id, kind) values (p_owner, v_kind);
  return v_token;
end;
$$;

-- Latido: renueva el candado si el token sigue siendo el vigente. false si ya lo perdió.
create function public.renew_operation(p_owner uuid, p_operation text, p_token uuid)
returns boolean
language sql
set search_path = ''
as $$
  with renewed as (
    update public.operation_locks set started_at = now()
    where owner_id = p_owner and operation = p_operation and token = p_token
    returning 1
  )
  select exists (select 1 from renewed);
$$;

-- Suelta el candado solo si el token coincide.
create function public.end_operation(p_owner uuid, p_operation text, p_token uuid)
returns void
language sql
set search_path = ''
as $$
  delete from public.operation_locks where owner_id = p_owner and operation = p_operation and token = p_token;
$$;

-- Solo el servidor (clave secreta): la usuaria no puede soltar su candado ni gastar cupo ajeno.
revoke execute on function public.begin_operation(uuid, text) from public, anon, authenticated;
revoke execute on function public.renew_operation(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.end_operation(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.begin_operation(uuid, text) to service_role;
grant execute on function public.renew_operation(uuid, text, uuid) to service_role;
grant execute on function public.end_operation(uuid, text, uuid) to service_role;

-- ------------------------------------------------ re-autenticación atada a la acción

-- F2-M5: una autenticación por contraseña reciente no basta (un ingreso normal también la
-- tiene). El servidor emite un intento ANTES de que la usuaria vuelva a escribir su contraseña,
-- y al ejecutar la acción exige, con el token de la sesión nueva:
--   · que el intento sea de esta usuaria y de esta acción, y de hace menos de 5 minutos;
--   · que la autenticación "password" del token sea posterior al intento;
--   · que la sesión sea distinta de la que pidió el intento (signInWithPassword crea otra).
-- El intento se consume en el primer uso, salga bien o mal.
create table public.reauth_intents (
  id uuid primary key default gen_random_uuid(), -- el nonce
  owner_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid,
  action text not null check (action in ('delete_account', 'change_password')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index reauth_intents_owner_idx on public.reauth_intents (owner_id, created_at desc);
alter table public.reauth_intents enable row level security;
revoke all on public.reauth_intents from anon, authenticated;

-- Emite un intento. Invalida los anteriores sin usar de la misma acción. Tope: 20 por hora.
create function public.begin_reauth(p_owner uuid, p_session uuid, p_action text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  -- Sin sesión no se puede exigir después una sesión distinta (F2-B17).
  if p_session is null then
    raise exception 'El intento de confirmación necesita la sesión' using errcode = '22004';
  end if;
  perform pg_advisory_xact_lock(hashtext('reauth:' || p_owner::text));
  if (select count(*) from public.reauth_intents
      where owner_id = p_owner and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Demasiados intentos de confirmación' using errcode = '54000';
  end if;
  update public.reauth_intents set consumed_at = now()
  where owner_id = p_owner and action = p_action and consumed_at is null;
  insert into public.reauth_intents (owner_id, session_id, action) values (p_owner, p_session, p_action)
  returning id into v_id;
  return v_id;
end;
$$;

-- Consume el intento (una sola vez) y dice si la re-autenticación vale para la acción.
-- p_auth_time: la marca de la autenticación "password" del token actual (amr, en segundos).
create function public.consume_reauth(p_owner uuid, p_nonce uuid, p_action text, p_session uuid, p_auth_time timestamptz)
returns boolean
language plpgsql
set search_path = ''
as $$
declare r public.reauth_intents;
begin
  update public.reauth_intents set consumed_at = now()
  where id = p_nonce and owner_id = p_owner and consumed_at is null
  returning * into r;
  if r.id is null then
    return false;
  end if;
  return r.action = p_action
     and r.created_at > now() - interval '5 minutes'
     and p_session is not null
     and p_session is distinct from r.session_id
     and p_auth_time is not null
     and p_auth_time >= date_trunc('second', r.created_at)
     and p_auth_time <= now() + interval '1 minute';
end;
$$;

revoke execute on function public.begin_reauth(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.consume_reauth(uuid, uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.begin_reauth(uuid, uuid, text) to service_role;
grant execute on function public.consume_reauth(uuid, uuid, text, uuid, timestamptz) to service_role;

-- ------------------------------------------------------- tope de subidas

-- Las subidas las registra solo el servidor (M3), pero el tope vive aquí para que no dependa
-- de él: 30 imágenes guardadas por usuaria cada 24 h, contadas en rate_events.
create function public.uploads_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('uploads:' || new.owner_id::text));
  if (select count(*) from public.rate_events
      where owner_id = new.owner_id and kind = 'upload_stored' and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'Llegaste al tope de 30 imágenes en 24 horas' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger uploads_quota before insert on public.uploads
  for each row execute function public.uploads_quota();

create function public.uploads_log_stored()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.rate_events (owner_id, kind) values (new.owner_id, 'upload_stored');
  return null;
end;
$$;

create trigger uploads_log_stored after insert on public.uploads
  for each row execute function public.uploads_log_stored();

revoke execute on function public.uploads_quota() from public, anon, authenticated;
revoke execute on function public.uploads_log_stored() from public, anon, authenticated;

-- F2-M1: borrar filas de uploads ya no libera cupo, y además el cliente ya no borra: el
-- servidor borra archivo y fila juntos (DELETE /api/subidas/[id]).
drop policy "subidas: borrar propias" on public.uploads;
revoke delete on public.uploads from anon, authenticated;
drop policy "subidas: borrar en carpeta propia" on storage.objects;

-- ------------------------------------------------------------------ purga

-- Plazos de conservación (F2-M6, F2-B13). Para cambiarlos, editar las constantes y crear una
-- migración nueva con `create or replace function`:
--   c_report_owner_days  180  autora del patrón en denuncias abiertas (en las cerradas se borra al cerrar)
--   c_rate_events_days    30  bitácora de topes (los topes miran solo 24 h)
--   c_reauth_days          1  intentos de re-autenticación (valen 5 minutos)
--   c_locks_days           1  candados abandonados (vencen en minutos)
-- Corre como dueña de las tablas (security definer): rate_events no se puede borrar ni con la
-- clave secreta. Devuelve cuántas filas tocó.
create function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_report_owner_days constant integer := 180;
  c_rate_events_days constant integer := 30;
  c_reauth_days constant integer := 1;
  c_locks_days constant integer := 1;
  v_reports integer;
  v_events integer;
  v_reauth integer;
  v_locks integer;
begin
  update public.pattern_reports set pattern_owner_id = null
  where pattern_owner_id is not null
    and (status <> 'open' or created_at < now() - make_interval(days => c_report_owner_days));
  get diagnostics v_reports = row_count;

  delete from public.rate_events where created_at < now() - make_interval(days => c_rate_events_days);
  get diagnostics v_events = row_count;

  delete from public.reauth_intents where created_at < now() - make_interval(days => c_reauth_days);
  get diagnostics v_reauth = row_count;

  delete from public.operation_locks where started_at < now() - make_interval(days => c_locks_days);
  get diagnostics v_locks = row_count;

  return jsonb_build_object('pattern_reports_anonymized', v_reports, 'rate_events_deleted', v_events,
                            'reauth_intents_deleted', v_reauth, 'operation_locks_deleted', v_locks);
end;
$$;
revoke execute on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;

-- Programación diaria con pg_cron (disponible en Supabase; se activa en Database > Extensions
-- o con `create extension pg_cron with schema pg_catalog`). Si la extensión no está instalada,
-- esto no hace nada y hay que programarla después (ver docs/seguridad.md) o llamar
-- `select public.purge_expired_data()` con la clave secreta.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('loopitalab-purga-diaria', '17 4 * * *', 'select public.purge_expired_data()')$cron$;
  end if;
end;
$$;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración (probado en local sobre PostgreSQL con los stubs de Supabase):
--
--   create policy "subidas: borrar en carpeta propia" on storage.objects for delete to authenticated using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
--   grant delete on public.uploads to authenticated;
--   create policy "subidas: borrar propias" on public.uploads for delete to authenticated using (owner_id = (select auth.uid()));
--   drop trigger if exists uploads_log_stored on public.uploads;
--   drop trigger if exists uploads_quota on public.uploads;
--   drop function if exists public.uploads_log_stored();
--   drop function if exists public.uploads_quota();
--   do $u$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule('loopitalab-purga-diaria'); end if; end $u$;
--   drop function if exists public.purge_expired_data();
--   drop function if exists public.begin_reauth(uuid, uuid, text);
--   drop function if exists public.consume_reauth(uuid, uuid, text, uuid, timestamptz);
--   drop table if exists public.reauth_intents;
--   drop function if exists public.begin_operation(uuid, text);
--   drop function if exists public.renew_operation(uuid, text, uuid);
--   drop function if exists public.end_operation(uuid, text, uuid);
--   drop table if exists public.operation_locks;
--   drop table if exists public.rate_events;
--   drop table if exists public.pattern_reports;
--   drop function if exists public.pattern_reports_snapshot();
--   drop function if exists public.pattern_reports_on_close();
--   drop function if exists public.pattern_reports_quota();
--   drop function if exists public.pattern_is_reportable(uuid);
