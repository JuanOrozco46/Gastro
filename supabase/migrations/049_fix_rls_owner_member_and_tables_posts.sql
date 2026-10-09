-- ============================================================================
-- GASTROSYNC - REPARACIÓN DE FUNCIONES RLS (PROFILES.TENANT_ID), MESAS QR Y POSTS
-- Versión: 049_fix_rls_owner_member_and_tables_posts.sql
-- Descripción:
--   1. Corrige el error 42703 ("column p.restaurant_id does not exist") en
--      public.is_restaurant_owner y public.is_restaurant_member usando las
--      columnas reales de public.profiles (tenant_id, business_role, platform_role).
--   2. Refuerza public.storage_is_restaurant_owner para permitir subida de
--      imágenes/videos de publicaciones y menús a dueños y miembros activos.
--   3. Optimiza public.restaurant_tables:
--      - Índice único parcial para mesas activas (archived_at IS NULL) para que
--        mesas eliminadas/archivadas no bloqueen volver a crear el mismo número.
--      - Trigger que activa automáticamente table_service_enabled en el restaurante
--        al registrar su primera mesa QR.
--      - Políticas RLS completas para dueños, miembros y administradores.
--   4. Optimiza public.posts:
--      - Trigger BEFORE INSERT que vincula o crea automáticamente el plato en
--        public.products si la publicación se envía sin product_id.
--      - Políticas RLS y delete_restaurant_post alineadas con is_restaurant_owner.
-- ============================================================================

-- 1. CORREGIR is_restaurant_owner E is_restaurant_member (USANDO p.tenant_id Y p.business_role)
CREATE OR REPLACE FUNCTION public.is_restaurant_owner(p_user_id UUID, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.user_id = p_user_id
      AND rm.restaurant_id = p_restaurant_id
      AND rm.role = 'owner'
      AND (rm.status = 'active' OR rm.status IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.tenant_id = p_restaurant_id
      AND (p.business_role IN ('restaurant_owner', 'platform_admin') OR p.platform_role = 'platform_admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(p_user_id UUID, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.user_id = p_user_id
      AND rm.restaurant_id = p_restaurant_id
      AND (rm.status = 'active' OR rm.status IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.tenant_id = p_restaurant_id
  );
END;
$$;

-- 2. REFORZAR storage_is_restaurant_owner PARA SUBIDA DE FOTOS Y VIDEOS DE POSTS/MENÚ
CREATE OR REPLACE FUNCTION public.storage_is_restaurant_owner(p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.is_restaurant_owner(auth.uid(), p_restaurant_id)
    OR public.is_restaurant_member(auth.uid(), p_restaurant_id)
    OR public.is_platform_admin(auth.uid());
END;
$$;

-- 3. MEJORAS EN public.restaurant_tables (MESAS QR)
-- 3a. Reemplazar constraint único rígido por índice único parcial (solo mesas no archivadas)
ALTER TABLE public.restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_restaurant_id_table_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_tables_unique_active
  ON public.restaurant_tables (restaurant_id, table_number)
  WHERE archived_at IS NULL;

-- 3b. Trigger para habilitar automáticamente table_service_enabled en el restaurante al crear una mesa QR
CREATE OR REPLACE FUNCTION public.enable_table_service_on_table_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.restaurants
  SET
    table_service_enabled = TRUE,
    delivery_modes = CASE
      WHEN delivery_modes IS NULL THEN ARRAY['pickup', 'restaurant_delivery', 'table_service']::TEXT[]
      WHEN NOT ('table_service' = ANY(delivery_modes)) THEN array_append(delivery_modes, 'table_service')
      ELSE delivery_modes
    END,
    updated_at = NOW()
  WHERE id = NEW.restaurant_id
    AND (table_service_enabled IS DISTINCT FROM TRUE OR NOT ('table_service' = ANY(COALESCE(delivery_modes, ARRAY[]::TEXT[]))));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enable_table_service_on_table_create ON public.restaurant_tables;
CREATE TRIGGER trg_enable_table_service_on_table_create
  AFTER INSERT ON public.restaurant_tables
  FOR EACH ROW
  EXECUTE FUNCTION public.enable_table_service_on_table_create();

-- 3c. Políticas RLS para restaurant_tables (Dueños, miembros y platform_admin, más lectura pública de mesas activas)
DROP POLICY IF EXISTS "Dueños administran mesas" ON public.restaurant_tables;
DROP POLICY IF EXISTS "restaurant_tables_manage_member_or_admin" ON public.restaurant_tables;
DROP POLICY IF EXISTS "restaurant_tables_public_read_active" ON public.restaurant_tables;

CREATE POLICY "restaurant_tables_public_read_active"
ON public.restaurant_tables
FOR SELECT
USING (
  (is_active = TRUE AND archived_at IS NULL)
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "restaurant_tables_manage_member_or_admin"
ON public.restaurant_tables
FOR ALL
TO authenticated
USING (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

-- 4. MEJORAS EN public.posts (CREACIÓN Y VINCULACIÓN AUTOMÁTICA DE PLATOS)
-- 4a. Trigger BEFORE INSERT en public.posts: si product_id viene NULL, busca o crea el producto automáticamente
CREATE OR REPLACE FUNCTION public.ensure_post_linked_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar si ya existe un producto con el mismo nombre en este restaurante
  SELECT p.id INTO v_product_id
  FROM public.products p
  WHERE p.restaurant_id = NEW.restaurant_id
    AND lower(btrim(p.name)) = lower(btrim(NEW.title))
    AND COALESCE(p.is_archived, FALSE) = FALSE
  ORDER BY p.created_at DESC
  LIMIT 1;

  -- Si no existe, crearlo automáticamente en el menú del restaurante
  IF v_product_id IS NULL THEN
    INSERT INTO public.products (
      restaurant_id,
      name,
      description,
      category,
      price_cop,
      available,
      image_url
    ) VALUES (
      NEW.restaurant_id,
      btrim(NEW.title),
      COALESCE(NULLIF(btrim(NEW.description), ''), btrim(NEW.title)),
      'Especiales',
      GREATEST(0, COALESCE(NEW.price_cop, 0)),
       TRUE,
      CASE WHEN NEW.media_type = 'photo' THEN NEW.media_url ELSE NULL END
    )
    RETURNING id INTO v_product_id;
  END IF;

  NEW.product_id := v_product_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_post_linked_product ON public.posts;
CREATE TRIGGER trg_ensure_post_linked_product
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_post_linked_product();

-- 4b. Políticas RLS de public.posts para dueños, miembros activos y platform_admin
DROP POLICY IF EXISTS "posts_insert_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_update_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_owner_or_admin" ON public.posts;

CREATE POLICY "posts_insert_owner_or_admin"
ON public.posts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "posts_update_owner_or_admin"
ON public.posts
FOR UPDATE
TO authenticated
USING (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "posts_delete_owner_or_admin"
ON public.posts
FOR DELETE
TO authenticated
USING (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

-- 4c. Actualizar RPC delete_restaurant_post para usar is_restaurant_owner
CREATE OR REPLACE FUNCTION public.delete_restaurant_post(p_post_id UUID, p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_post RECORD;
  v_likes_count INT;
  v_comments_count INT;
  v_saved_count INT;
  v_media_url TEXT;
  v_action_taken TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.is_restaurant_owner(v_user_id, p_restaurant_id)
    OR public.is_platform_admin(v_user_id)
  ) THEN
    RAISE EXCEPTION 'No tienes permisos para eliminar publicaciones de este restaurante.';
  END IF;

  SELECT * INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publicación no encontrada.';
  END IF;

  IF v_post.restaurant_id != p_restaurant_id THEN
    RAISE EXCEPTION 'La publicación pertenece a otro restaurante.';
  END IF;

  v_media_url := v_post.media_url;

  SELECT COUNT(*) INTO v_likes_count FROM public.post_likes WHERE post_id = p_post_id;
  SELECT COUNT(*) INTO v_comments_count FROM public.post_comments WHERE post_id = p_post_id;
  SELECT COUNT(*) INTO v_saved_count FROM public.saved_posts WHERE post_id = p_post_id;

  IF v_likes_count > 0 OR v_comments_count > 0 OR v_saved_count > 0 THEN
    UPDATE public.posts
    SET is_archived = TRUE, is_published = FALSE, updated_at = NOW()
    WHERE id = p_post_id;
    v_action_taken := 'archived';
  ELSE
    DELETE FROM public.posts WHERE id = p_post_id;
    v_action_taken := 'deleted';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action_taken,
    'media_url', v_media_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_restaurant_post(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
