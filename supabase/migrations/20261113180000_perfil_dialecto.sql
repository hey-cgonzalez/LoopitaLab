-- Preferencia de dialecto de patrones (fase 4, T8; ADR 0011, sección 8; decisión 4 de la fase 4).
-- · profiles.pattern_dialect: dialecto con que la usuaria ve y escribe los patrones
--   ('es' = español, 'us' = inglés US, 'uk' = inglés UK). Por omisión 'es'.
-- · No cambia el patrón (modelo canónico): solo la terminología de lectura y escritura.
-- · Permisos: la usuaria puede actualizar solo las columnas listadas (misma técnica que mirror_knitting).
--   SELECT de profiles es a nivel de tabla (RLS: solo la propia fila), así que ya la incluye.
-- · handle_new_user no cambia: el valor por defecto cubre las cuentas nuevas.
--
-- Reversión: ver el bloque comentado al final.

alter table public.profiles
  add column pattern_dialect text not null default 'es'
  constraint profiles_pattern_dialect_check check (pattern_dialect in ('es', 'us', 'uk'));

comment on column public.profiles.pattern_dialect is
  'Dialecto de terminología de patrones (ADR 0011): es, us o uk. Preferencia de vista; no cambia el modelo canónico.';

-- Se vuelve a otorgar la lista completa para que el permiso de UPDATE quede legible en un solo lugar.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, terminology, units, dominant_hand, mirror_knitting, pattern_dialect) on public.profiles to authenticated;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración:
--
--   revoke update on public.profiles from anon, authenticated;
--   grant update (display_name, terminology, units, dominant_hand, mirror_knitting) on public.profiles to authenticated;
--   alter table public.profiles drop column pattern_dialect;
