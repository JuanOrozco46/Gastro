-- ============================================================================
-- GASTROSYNC - CONFIGURACIÓN DE BUCKET DE ALMACENAMIENTO (SUPABASE STORAGE)
-- Versión: 005_storage_buckets.sql
-- Descripción: Creación del bucket público 'gastro-media' y definición de
--              políticas de seguridad RLS para imágenes de menú, banners y posts.
-- ============================================================================

-- 1. CREACIÓN DEL BUCKET PÚBLICO EN STORAGE.BUCKETS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gastro-media',
  'gastro-media',
  TRUE,
  52428800, -- 50MB máximo por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. POLÍTICAS RLS EN STORAGE.OBJECTS

DROP POLICY IF EXISTS "gastro_media_select_public" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_delete_authenticated" ON storage.objects;

-- Lectura pública: Cualquier usuario o visitante puede ver las imágenes y videos
CREATE POLICY "gastro_media_select_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'gastro-media');

-- Inserción: Usuarios autenticados pueden subir archivos al bucket gastro-media
CREATE POLICY "gastro_media_insert_authenticated" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
  );

-- Actualización: Usuarios autenticados pueden reemplazar sus archivos
CREATE POLICY "gastro_media_update_authenticated" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
  );

-- Eliminación: Usuarios autenticados pueden eliminar archivos
CREATE POLICY "gastro_media_delete_authenticated" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
  );
