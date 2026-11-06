-- Preferencia "tejer en espejo" (T3c, ADR 0003 "Revisión de experto-tejido", regla 2).
-- · profiles.mirror_knitting: preferencia de vista, desactivada por defecto. Es independiente de
--   dominant_hand: ser zurda no la activa y activarla no exige ser zurda.
-- · Solo cambia cómo se muestra el modo tejiendo; el patrón (modelo canónico) no se toca.
-- · Permisos: la usuaria puede actualizar solo esta columna además de las ya permitidas (B4).
--   SELECT de profiles es a nivel de tabla (RLS: solo la propia fila), así que ya la incluye.
-- · handle_new_user no cambia: el valor por defecto false cubre las cuentas nuevas.
--
-- Reversión: ver el bloque comentado al final.

alter table public.profiles add column mirror_knitting boolean not null default false;

comment on column public.profiles.mirror_knitting is
  'Preferencia de vista: tejer en espejo (invierte la lectura en el modo tejiendo). false por defecto; independiente de dominant_hand.';

-- Se vuelve a otorgar la lista completa para que el permiso de UPDATE quede legible en un solo lugar.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, terminology, units, dominant_hand, mirror_knitting) on public.profiles to authenticated;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración:
--
--   revoke update on public.profiles from anon, authenticated;
--   grant update (display_name, terminology, units, dominant_hand) on public.profiles to authenticated;
--   alter table public.profiles drop column mirror_knitting;
