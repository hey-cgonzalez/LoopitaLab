-- Limpieza menor (docs/seguridad.md): funciones de trigger de public con EXECUTE para anon y authenticated.
--
-- Esas cinco funciones de trigger conservaban EXECUTE para anon y authenticated por el privilegio
-- global de PUBLIC (ver 20261106035626_sin_truncate.sql). No se pueden invocar por /rpc porque
-- devuelven `trigger`, pero no hay razón para que la API las vea:
--
--   set_updated_at()
--   patterns_guard_origin()
--   projects_check_pattern()
--   pattern_reports_quota()
--   patterns_quota()
--
-- Los disparadores siguen funcionando: PostgreSQL exige EXECUTE solo al crear el disparador, no al
-- dispararlo. Las demás funciones de trigger de public ya no tenían EXECUTE para anon ni
-- authenticated (las de 20261107010000 y las de auth/pg_cron). El check 10_rls_check.sql
-- verifica ahora que ninguna función de trigger de public quede expuesta.
--
-- Reversión: ver el bloque comentado al final.

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.patterns_guard_origin() from public, anon, authenticated;
revoke execute on function public.projects_check_pattern() from public, anon, authenticated;
revoke execute on function public.pattern_reports_quota() from public, anon, authenticated;
revoke execute on function public.patterns_quota() from public, anon, authenticated;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración (vuelve al estado previo: EXECUTE vía PUBLIC):
--
--   grant execute on function public.set_updated_at() to public, anon, authenticated;
--   grant execute on function public.patterns_guard_origin() to public, anon, authenticated;
--   grant execute on function public.projects_check_pattern() to public, anon, authenticated;
--   grant execute on function public.pattern_reports_quota() to public, anon, authenticated;
--   grant execute on function public.patterns_quota() to public, anon, authenticated;
