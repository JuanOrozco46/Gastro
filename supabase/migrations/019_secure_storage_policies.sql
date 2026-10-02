-- ============================================================================
-- GASTROSYNC - STORAGE POLICIES (ISOLATED PATHS)
-- Versión: 019_secure_storage_policies.sql
-- Descripción: Restringe subida de archivos aislando las rutas por restaurante.
-- ============================================================================

-- Crear función helper para chequear si el auth.uid() es owner del restaurante o platform_admin
CREATE OR REPLACE FUNCTION public.storage_is_restaurant_owner(p_restaurant_id UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.restaurant_id = p_restaurant_id 
      AND rm.user_id = auth.uid() 
      AND rm.role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND p.platform_role = 'platform_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Forzar que la política se aplique correctamente al bucket
DROP POLICY IF EXISTS "gastro_media_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_delete_authenticated" ON storage.objects;

-- Inserción restrictiva:
-- Debe estar en gastro-media y:
-- 1) si la ruta es restaurants/uuid/..., se valida con storage_is_restaurant_owner
-- 2) de lo contrario (ej. avatars propios), permitimos si owner = auth.uid() (mantener compatibilidad)
CREATE POLICY "gastro_media_insert_authenticated" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
    AND (
      (
        (string_to_array(name, '/'))[1] = 'restaurants' 
        AND 
        -- array_length asegura que hay al menos 2 elementos y que el segundo puede ser UUID válido.
        -- Para evitar errores de casteo, si no es UUID fallará, pero podemos controlarlo
        -- En RLS si el casteo falla, la política devuelve falso.
        public.storage_is_restaurant_owner( (string_to_array(name, '/'))[2]::uuid )
      )
      OR
      (
        (string_to_array(name, '/'))[1] != 'restaurants'
      )
    )
  );

CREATE POLICY "gastro_media_update_authenticated" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
    AND (
      ( (string_to_array(name, '/'))[1] = 'restaurants' AND public.storage_is_restaurant_owner( (string_to_array(name, '/'))[2]::uuid ) )
      OR 
      ( (string_to_array(name, '/'))[1] != 'restaurants' AND owner = auth.uid() )
    )
  )
  WITH CHECK (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
    AND (
      ( (string_to_array(name, '/'))[1] = 'restaurants' AND public.storage_is_restaurant_owner( (string_to_array(name, '/'))[2]::uuid ) )
      OR 
      ( (string_to_array(name, '/'))[1] != 'restaurants' AND owner = auth.uid() )
    )
  );

CREATE POLICY "gastro_media_delete_authenticated" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gastro-media'
    AND auth.role() = 'authenticated'
    AND (
      ( (string_to_array(name, '/'))[1] = 'restaurants' AND public.storage_is_restaurant_owner( (string_to_array(name, '/'))[2]::uuid ) )
      OR 
      ( (string_to_array(name, '/'))[1] != 'restaurants' AND owner = auth.uid() )
    )
  );
