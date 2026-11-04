-- Bucket privado para las imágenes que se suben a "imagen → patrón".
-- Cada usuaria escribe y lee solo dentro de su carpeta: {user_id}/archivo.ext
-- La validación de tipo real y la eliminación de EXIF se hacen en el servidor antes de guardar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "subidas: leer en carpeta propia" on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "subidas: crear en carpeta propia" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "subidas: borrar en carpeta propia" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
