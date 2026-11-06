-- ¿La cuenta tiene contraseña? (revisión de seguridad de OAuth, hallazgo A1).
-- · user_has_password(p_user): true si auth.users.encrypted_password no está vacío. false si la
--   usuaria no existe o si solo entra con un proveedor (Google, Microsoft).
-- · La usa el servidor (clave secreta) para decidir qué re-autenticación vale: una cuenta con
--   contraseña debe volver a escribirla para eliminar la cuenta; un ingreso con proveedor no
--   basta (Google con prompt=select_account no pide clave en un equipo compartido). Así el
--   servidor no depende de la lista de identidades para saberlo (B5).
-- · Solo devuelve un booleano: nunca expone el hash. Solo la ejecuta service_role.
--
-- Reversión: ver el bloque comentado al final.

create function public.user_has_password(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(u.encrypted_password, '') <> '' from auth.users u where u.id = p_user),
    false
  )
$$;

comment on function public.user_has_password(uuid) is
  'true si la cuenta tiene contraseña (encrypted_password no vacío); false si no existe o es solo con proveedor. Solo service_role.';

revoke execute on function public.user_has_password(uuid) from public, anon, authenticated;
grant execute on function public.user_has_password(uuid) to service_role;

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración (probado en local sobre PostgreSQL con los stubs de Supabase):
--
--   drop function if exists public.user_has_password(uuid);
