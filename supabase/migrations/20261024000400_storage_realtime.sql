-- rabeat · fotos (Storage) y tiempo real
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- Cada usuario con rol restaurante o superusuario sube a su carpeta: images/<uid>/...
create policy "subir imágenes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_role() in ('restaurant', 'superuser')
  );
create policy "borrar imágenes propias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superuser()));

alter publication supabase_realtime add table public.orders;
