-- ============================================================================
-- GASTROSYNC - PERFILES DE USUARIO (@USERNAME, AVATAR, DATOS DE PEDIDO) Y MODERACIÓN DE COMENTARIOS
-- Versión: 042_user_profiles_and_comment_moderation.sql
-- Descripción:
--   1. Agrega columnas username (@), avatar_url, phone, default_address y default_delivery_notes a public.profiles.
--   2. Actualiza el trigger handle_new_user() para persistir estos campos desde raw_user_meta_data al registrarse.
--   3. Actualiza la política RLS de borrado en public.post_comments para que solo puedan eliminar un comentario:
--      a) El usuario autor del comentario, o
--      b) El dueño / miembro activo del restaurante autor de la publicación (o platform_admin).
-- ============================================================================

-- 1. AGREGAR COLUMNAS A PUBLIC.PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS default_address TEXT,
  ADD COLUMN IF NOT EXISTS default_delivery_notes TEXT;

-- Índice único por username en minúsculas (permitiendo NULL para usuarios antiguos sin @)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower_unique
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL AND trim(username) <> '';

-- 2. ACTUALIZAR TRIGGER handle_new_user() PARA COPIAR METADATOS DE REGISTRO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_username TEXT;
  v_clean_username TEXT;
BEGIN
  v_raw_username := NULLIF( regexp_replace(LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'username', ''))), '^@+', ''), '' );

  -- Si el username ya está tomado por otro perfil, añadir sufijo corto del id para no abortar el signup
  IF v_raw_username IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = v_raw_username AND id <> NEW.id) THEN
      v_clean_username := v_raw_username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 4);
    ELSE
      v_clean_username := v_raw_username;
    END IF;
  ELSE
    v_clean_username := NULL;
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    username,
    avatar_url,
    phone,
    default_address,
    default_delivery_notes,
    platform_role,
    business_role,
    tenant_id
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, 'Usuario GastroSync'),
    v_clean_username,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'default_address', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'default_delivery_notes', '')), ''),
    'customer',
    'customer',
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    default_address = COALESCE(EXCLUDED.default_address, public.profiles.default_address),
    default_delivery_notes = COALESCE(EXCLUDED.default_delivery_notes, public.profiles.default_delivery_notes),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 3. FUNCIÓN HELPER PARA VERIFICAR SI EL USUARIO PUEDE MODERAR COMENTARIOS DE UN POST
CREATE OR REPLACE FUNCTION public.can_delete_post_comment(p_post_id UUID, p_comment_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1) Autor del comentario
  IF v_uid = p_comment_user_id THEN
    RETURN TRUE;
  END IF;

  -- 2) Dueño o miembro activo del restaurante dueño de la publicación
  IF EXISTS (
    SELECT 1
    FROM public.posts p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE p.id = p_post_id
      AND (
        r.owner_user_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.restaurant_members rm
          WHERE rm.restaurant_id = r.id
            AND rm.user_id = v_uid
            AND rm.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM public.profiles prof
          WHERE prof.id = v_uid
            AND prof.tenant_id = r.id
            AND prof.business_role IN ('restaurant_owner', 'restaurant_staff')
        )
      )
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 4. REEMPLAZAR POLÍTICA DE BORRADO EN PUBLIC.POST_COMMENTS
DROP POLICY IF EXISTS "post_comments_delete_auth" ON public.post_comments;
DROP POLICY IF EXISTS "post_comments_delete_author_or_restaurant" ON public.post_comments;

CREATE POLICY "post_comments_delete_author_or_restaurant"
  ON public.post_comments
  FOR DELETE
  TO authenticated
  USING (public.can_delete_post_comment(post_id, user_id));
