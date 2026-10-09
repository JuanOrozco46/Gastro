-- =============================================================================
-- MIGRACIÓN 047: FOTOS EN RESEÑAS, RESPUESTA OFICIAL DEL RESTAURANTE Y
--                LECTURA/UPSERT DE PERFILES PÚBLICOS (@USERNAME Y AVATAR)
-- =============================================================================

-- 1. AMPLIAR public.restaurant_reviews CON FOTO DE RESEÑA Y METADATOS DE AUTOR
ALTER TABLE public.restaurant_reviews
  ADD COLUMN IF NOT EXISTS review_image_url TEXT,
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS author_username TEXT,
  ADD COLUMN IF NOT EXISTS author_avatar_url TEXT;

-- 2. RPC SECURITY DEFINER PARA QUE EL RESTAURANTE RESPONDA OFICIALMENTE A UNA RESEÑA
CREATE OR REPLACE FUNCTION public.reply_to_restaurant_review(
  p_review_id UUID,
  p_reply TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_clean_reply TEXT;
  v_replied_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes iniciar sesión.');
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.restaurant_reviews
  WHERE id = p_review_id;

  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'La reseña no existe.');
  END IF;

  IF NOT public.storage_is_restaurant_owner(v_restaurant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el restaurante propietario puede responder a esta reseña.');
  END IF;

  v_clean_reply := NULLIF(btrim(COALESCE(p_reply, '')), '');
  v_replied_at := CASE WHEN v_clean_reply IS NOT NULL THEN NOW() ELSE NULL END;

  UPDATE public.restaurant_reviews
  SET
    owner_reply = v_clean_reply,
    owner_replied_at = v_replied_at,
    updated_at = NOW()
  WHERE id = p_review_id;

  RETURN jsonb_build_object(
    'success', true,
    'owner_reply', v_clean_reply,
    'owner_replied_at', v_replied_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reply_to_restaurant_review(UUID, TEXT) TO authenticated;

-- 3. ASEGURAR LECTURA DE PERFILES EN COMENTARIOS/RESEÑAS Y UPSERT DEL PROPIO PERFIL
DROP POLICY IF EXISTS "profiles_select_public_meta" ON public.profiles;
CREATE POLICY "profiles_select_public_meta"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND COALESCE(platform_role, 'customer') = 'customer'
);

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_platform_admin(auth.uid()))
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (
    id = auth.uid()
    AND COALESCE(platform_role, 'customer') = COALESCE(public.get_platform_role(auth.uid()), 'customer')
  )
);

-- 4. ASEGURAR PERMISOS DE STORAGE PARA FOTOS DE PERFIL (avatars/*) Y FOTOS DE RESEÑAS (reviews/*)
DROP POLICY IF EXISTS "gastro_media_insert_user_media" ON storage.objects;
CREATE POLICY "gastro_media_insert_user_media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gastro-media'
  AND (string_to_array(name, '/'))[1] IN ('avatars', 'reviews')
);

DROP POLICY IF EXISTS "gastro_media_update_user_media" ON storage.objects;
CREATE POLICY "gastro_media_update_user_media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'gastro-media'
  AND (string_to_array(name, '/'))[1] IN ('avatars', 'reviews')
)
WITH CHECK (
  bucket_id = 'gastro-media'
  AND (string_to_array(name, '/'))[1] IN ('avatars', 'reviews')
);
