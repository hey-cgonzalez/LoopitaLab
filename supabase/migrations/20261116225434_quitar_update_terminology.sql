-- Quita profiles.terminology del permiso de UPDATE (fase 4, revisión T20: T20-B8, decisión 5, paso a).
-- · La columna ya no se usa en la interfaz (la preferencia vigente es pattern_dialect).
-- · La columna NO se borra aquí: eso va en un segundo paso, después de desplegar el código que ya no la lee.
-- · Se vuelve a otorgar la lista completa de columnas con UPDATE para que quede legible en un solo lugar.
--
-- Reversión: ver el bloque comentado al final.

revoke update on public.profiles from anon, authenticated;
grant update (display_name, units, dominant_hand, mirror_knitting, pattern_dialect) on public.profiles to authenticated;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración:
--
--   revoke update on public.profiles from anon, authenticated;
--   grant update (display_name, terminology, units, dominant_hand, mirror_knitting, pattern_dialect) on public.profiles to authenticated;
