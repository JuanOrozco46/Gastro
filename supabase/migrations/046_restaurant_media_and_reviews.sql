-- =============================================================================
-- MIGRACIÓN 046: FOTOS/BANNERS DE RESTAURANTES Y SISTEMA DE RESEÑAS Y CALIFICACIONES
-- 1. Repara permisos de Storage para subida de logos/banners en registro y panel admin.
-- 2. Sincroniza logos/banners faltantes en restaurantes existentes.
-- 3. Crea tabla public.restaurant_reviews con cálculo automático de rating_avg y
--    rating_count en public.restaurants mediante trigger SECURITY DEFINER.
-- =============================================================================

-- 1. AMPLIAR storage_is_restaurant_owner PARA CUBRIR owner_user_id Y MIEMBROS ACTIVOS
CREATE OR REPLACE FUNCTION public.storage_is_restaurant_owner(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.restaurant_id = p_restaurant_id
      AND rm.user_id = auth.uid()
      AND rm.role IN ('owner', 'staff')
      AND (rm.status = 'active' OR rm.status IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.platform_role = 'platform_admin'
  );
END;
$function$;

-- Permitir subir logos y banners durante el registro de solicitud en gastro-media/applications/*
DROP POLICY IF EXISTS "gastro_media_insert_application_assets" ON storage.objects;
CREATE POLICY "gastro_media_insert_application_assets"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'gastro-media'
  AND (string_to_array(name, '/'))[1] = 'applications'
);

DROP POLICY IF EXISTS "gastro_media_update_application_assets" ON storage.objects;
CREATE POLICY "gastro_media_update_application_assets"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'gastro-media'
  AND (string_to_array(name, '/'))[1] = 'applications'
)
WITH CHECK (
  bucket_id = 'gastro-media'
  AND (string_to_array(name, '/'))[1] = 'applications'
);

-- 2. NORMALIZAR CADENAS VACÍAS EN logo_url / banner_url Y RELLENAR CON IMÁGENES DEL LOCAL SI FALTAN
UPDATE public.restaurants
SET
  logo_url = NULLIF(btrim(logo_url), ''),
  banner_url = NULLIF(btrim(banner_url), '');

-- Si el restaurante tiene productos o posts con fotos pero aún no tiene banner_url o logo_url,
-- usar su propia fotografía gastronómica subida como respaldo inicial.
UPDATE public.restaurants r
SET banner_url = COALESCE(
  r.banner_url,
  (
    SELECT p.media_url
    FROM public.posts p
    WHERE p.restaurant_id = r.id
      AND p.media_type = 'photo'
      AND p.media_url IS NOT NULL
      AND btrim(p.media_url) <> ''
    ORDER BY p.created_at DESC
    LIMIT 1
  ),
  (
    SELECT pr.image_url
    FROM public.products pr
    WHERE pr.restaurant_id = r.id
      AND pr.image_url IS NOT NULL
      AND btrim(pr.image_url) <> ''
    ORDER BY pr.created_at DESC
    LIMIT 1
  )
)
WHERE r.banner_url IS NULL;

UPDATE public.restaurants r
SET logo_url = COALESCE(
  r.logo_url,
  (
    SELECT pr.image_url
    FROM public.products pr
    WHERE pr.restaurant_id = r.id
      AND pr.image_url IS NOT NULL
      AND btrim(pr.image_url) <> ''
    ORDER BY pr.created_at ASC
    LIMIT 1
  ),
  (
    SELECT p.media_url
    FROM public.posts p
    WHERE p.restaurant_id = r.id
      AND p.media_type = 'photo'
      AND p.media_url IS NOT NULL
      AND btrim(p.media_url) <> ''
    ORDER BY p.created_at ASC
    LIMIT 1
  )
)
WHERE r.logo_url IS NULL;

-- 3. AGREGAR COLUMNAS DE CALIFICACIÓN EN public.restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

-- 4. CREAR TABLA public.restaurant_reviews
CREATE TABLE IF NOT EXISTS public.restaurant_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL DEFAULT '',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  owner_reply TEXT,
  owner_replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_reviews_order_id
  ON public.restaurant_reviews(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_restaurant_created
  ON public.restaurant_reviews(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_user_id
  ON public.restaurant_reviews(user_id);

-- 5. FUNCIÓN Y TRIGGER PARA RECALCULAR AUTOMÁTICAMENTE rating_avg Y rating_count EN public.restaurants
CREATE OR REPLACE FUNCTION public.recompute_restaurant_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_restaurant_id UUID;
  v_avg NUMERIC(3,2);
  v_cnt INTEGER;
BEGIN
  v_target_restaurant_id := COALESCE(NEW.restaurant_id, OLD.restaurant_id);
  IF v_target_restaurant_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 5.00),
    COUNT(*)::integer
  INTO v_avg, v_cnt
  FROM public.restaurant_reviews
  WHERE restaurant_id = v_target_restaurant_id;

  UPDATE public.restaurants
  SET
    rating_avg = CASE WHEN v_cnt > 0 THEN v_avg ELSE 5.00 END,
    rating_count = v_cnt,
    updated_at = NOW()
  WHERE id = v_target_restaurant_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_restaurant_rating ON public.restaurant_reviews;
CREATE TRIGGER trg_recompute_restaurant_rating
AFTER INSERT OR UPDATE OR DELETE ON public.restaurant_reviews
FOR EACH ROW
EXECUTE FUNCTION public.recompute_restaurant_rating();

-- 6. POLÍTICAS RLS EN public.restaurant_reviews
ALTER TABLE public.restaurant_reviews ENABLE ROW LEVEL SECURITY;

-- Cualquier visitante o usuario puede leer las reseñas de los restaurantes
DROP POLICY IF EXISTS "restaurant_reviews_select_public" ON public.restaurant_reviews;
CREATE POLICY "restaurant_reviews_select_public"
ON public.restaurant_reviews
FOR SELECT
USING (true);

-- Usuarios autenticados pueden publicar sus propias reseñas
DROP POLICY IF EXISTS "restaurant_reviews_insert_own" ON public.restaurant_reviews;
CREATE POLICY "restaurant_reviews_insert_own"
ON public.restaurant_reviews
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- El autor puede editar su reseña y el dueño del restaurante puede responder
DROP POLICY IF EXISTS "restaurant_reviews_update_author_or_owner" ON public.restaurant_reviews;
CREATE POLICY "restaurant_reviews_update_author_or_owner"
ON public.restaurant_reviews
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.storage_is_restaurant_owner(restaurant_id)
)
WITH CHECK (
  auth.uid() = user_id
  OR public.storage_is_restaurant_owner(restaurant_id)
);

-- Solo el autor de la reseña, el dueño del restaurante o el platform_admin pueden eliminarla
DROP POLICY IF EXISTS "restaurant_reviews_delete_author_or_owner" ON public.restaurant_reviews;
CREATE POLICY "restaurant_reviews_delete_author_or_owner"
ON public.restaurant_reviews
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.storage_is_restaurant_owner(restaurant_id)
);
