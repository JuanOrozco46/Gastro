-- ============================================================================
-- MIGRACIÓN 059: CORRECCIÓN DE ELIMINACIÓN DE OBJETOS EN STORAGE DURANTE
-- BAJA DE RESTAURANTE Y SUPRESIÓN DE CUENTA (LEY 1581 DE 2012)
--
-- Causa raíz:
-- Supabase Storage incluye el trigger interno `storage.protect_delete` sobre
-- `storage.objects` que bloquea cualquier `DELETE FROM storage.objects` directo
-- desde SQL con el error:
--   "Direct deletion from storage tables is not allowed. Use the Storage API instead."
--
-- Solución:
-- 1. En `public.deactivate_and_purge_my_restaurant` y `public.delete_my_user_account`,
--    recolectar `v_storage_paths` (`SELECT name FROM storage.objects ...`) y
--    `v_media_urls` sin ejecutar `DELETE FROM storage.objects` en SQL, devolviendo
--    ambas listas en el JSONB de respuesta para que el cliente ejecute
--    `supabase.storage.from('gastro-media').remove(paths)` mediante la Storage API.
-- 2. Actualizar la política RLS `gastro_media_delete_authenticated` en `storage.objects`
--    para autorizar también al solicitante que acaba de registrar el acta en
--    `public.privacy_deletion_requests`, permitiendo que la limpieza vía Storage API
--    tenga éxito incluso después de haberse desvinculado `owner_user_id`.
-- ============================================================================

-- 1. Reemplazar public.deactivate_and_purge_my_restaurant sin DELETE directo en storage.objects
CREATE OR REPLACE FUNCTION public.deactivate_and_purge_my_restaurant(
  p_restaurant_id UUID,
  p_confirm_text TEXT DEFAULT 'ELIMINAR RESTAURANTE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rest RECORD;
  v_active_orders INTEGER := 0;
  v_deleted_posts INTEGER := 0;
  v_deleted_products INTEGER := 0;
  v_media_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_paths TEXT[] := ARRAY[]::TEXT[];
  v_request_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado: debes iniciar sesión para dar de baja tu restaurante.';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Debes especificar el identificador del restaurante.';
  END IF;

  IF upper(btrim(COALESCE(p_confirm_text, ''))) NOT IN ('ELIMINAR RESTAURANTE', 'OWNER_REQUEST') THEN
    RAISE EXCEPTION 'Confirmación inválida: escribe exactamente ELIMINAR RESTAURANTE para confirmar la baja.';
  END IF;

  SELECT * INTO v_rest
  FROM public.restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El restaurante especificado no existe.';
  END IF;

  -- Idempotencia: si ya fue dado de baja y purgado previamente
  IF v_rest.status = 'suspended' AND v_rest.owner_user_id IS NULL AND (
    v_rest.name LIKE 'Comercio Retirado%'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_purged', true,
      'purged_restaurant_id', p_restaurant_id,
      'restaurant_id', p_restaurant_id,
      'deleted_posts', 0,
      'deleted_products', 0,
      'media_urls', '[]'::jsonb,
      'storage_paths', '[]'::jsonb,
      'message', 'El restaurante ya había sido desactivado y anonimizado previamente.'
    );
  END IF;

  IF NOT (
    public.is_restaurant_owner(v_uid, p_restaurant_id)
    OR public.is_platform_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'Solo el propietario titular o un administrador de plataforma puede solicitar la baja del restaurante.';
  END IF;

  -- Verificar que no existan órdenes activas en cocina o reparto
  SELECT COUNT(*) INTO v_active_orders
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RAISE EXCEPTION 'El restaurante tiene % pedido(s) activo(s) en curso. Finalízalos o cancélalos antes de dar de baja el comercio.', v_active_orders;
  END IF;

  -- Recolectar URLs y rutas de objetos en Storage para eliminación vía Storage API
  SELECT ARRAY_REMOVE(
    ARRAY_CAT(
      ARRAY[v_rest.logo_url, v_rest.banner_url],
      ARRAY(
        SELECT p.media_url FROM public.posts p
        WHERE p.restaurant_id = p_restaurant_id AND p.media_url IS NOT NULL
        UNION ALL
        SELECT pr.image_url FROM public.products pr
        WHERE pr.restaurant_id = p_restaurant_id AND pr.image_url IS NOT NULL
      )
    ),
    NULL
  ) INTO v_media_urls;

  SELECT COALESCE(
    ARRAY(
      SELECT so.name
      FROM storage.objects so
      WHERE so.bucket_id = 'gastro-media'
        AND (string_to_array(so.name, '/'))[1] IN ('restaurants', 'stories', 'posts')
        AND (string_to_array(so.name, '/'))[2] = p_restaurant_id::TEXT
    ),
    ARRAY[]::TEXT[]
  ) INTO v_storage_paths;

  -- 1. Registrar acta en privacy_deletion_requests
  INSERT INTO public.privacy_deletion_requests (
    requester_user_id,
    target_type,
    target_restaurant_id,
    reason,
    status,
    completed_at
  ) VALUES (
    v_uid,
    'restaurant_tenant',
    p_restaurant_id,
    COALESCE(NULLIF(btrim(p_confirm_text), ''), 'ELIMINAR RESTAURANTE'),
    'completed',
    NOW()
  ) RETURNING id INTO v_request_id;

  -- 2. Archivar/despublicar publicaciones y productos (preservando FK de order_items)
  UPDATE public.posts
  SET
    is_published = FALSE,
    is_archived = TRUE,
    media_url = NULL,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_deleted_posts = ROW_COUNT;

  DELETE FROM public.products pr
  WHERE pr.restaurant_id = p_restaurant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.product_id = pr.id
    );
  GET DIAGNOSTICS v_deleted_products = ROW_COUNT;

  UPDATE public.products
  SET
    available = FALSE,
    is_archived = TRUE,
    description = NULL,
    image_url = NULL,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id;

  -- 3. Eliminar horarios y desactivar mesas QR del restaurante
  DELETE FROM public.restaurant_hours WHERE restaurant_id = p_restaurant_id;

  UPDATE public.restaurant_tables
  SET
    is_active = FALSE,
    archived_at = COALESCE(archived_at, NOW())
  WHERE restaurant_id = p_restaurant_id;

  -- 4. Anonimizar datos sensibles y bancarios en public.restaurants (usando columnas reales)
  UPDATE public.restaurants
  SET
    status = 'suspended',
    is_open = FALSE,
    accepting_orders = FALSE,
    table_service_enabled = FALSE,
    name = 'Comercio Retirado #' || substr(replace(p_restaurant_id::TEXT, '-', ''), 1, 6),
    description = 'Este comercio solicitó su retiro y supresión de datos comerciales en GastroSync.',
    phone = NULL,
    whatsapp = NULL,
    address = 'Dirección suprimida por solicitud del titular (Ley 1581)',
    logo_url = NULL,
    banner_url = NULL,
    payout_bank_name = NULL,
    payout_account_type = NULL,
    payout_account_number = NULL,
    payout_account_holder = NULL,
    payout_document_type = NULL,
    payout_document_number = NULL,
    wompi_merchant_id = NULL,
    owner_user_id = NULL,
    updated_at = NOW()
  WHERE id = p_restaurant_id;

  -- 5. Anonimizar solicitudes vinculadas en public.restaurant_applications
  UPDATE public.restaurant_applications
  SET
    owner_name = 'Titular Anonimizado',
    owner_email = 'retired+' || substr(replace(id::TEXT, '-', ''), 1, 8) || '@deleted.gastrosync.local',
    owner_phone = '0000000000',
    whatsapp = NULL,
    address = 'Dirección suprimida',
    notes = NULL,
    logo_url = NULL,
    banner_url = NULL,
    logo_path = NULL,
    banner_path = NULL,
    updated_at = NOW()
  WHERE activated_restaurant_id = p_restaurant_id;

  -- 6. Revocar membresías activas o invitadas del restaurante
  UPDATE public.restaurant_members
  SET
    status = 'revoked',
    revoked_at = COALESCE(revoked_at, NOW()),
    email = NULL,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id
    AND status != 'revoked';

  -- 7. Desvincular tenant_id de perfiles asociados usando tenant_id y business_role reales
  UPDATE public.profiles
  SET
    tenant_id = NULL,
    business_role = CASE
      WHEN platform_role = 'platform_admin' THEN 'platform_admin'
      ELSE 'customer'
    END,
    updated_at = NOW()
  WHERE tenant_id = p_restaurant_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'purged_restaurant_id', p_restaurant_id,
    'restaurant_id', p_restaurant_id,
    'deleted_posts', v_deleted_posts,
    'deleted_products', v_deleted_products,
    'media_urls', to_jsonb(COALESCE(v_media_urls, ARRAY[]::TEXT[])),
    'storage_paths', to_jsonb(COALESCE(v_storage_paths, ARRAY[]::TEXT[])),
    'purged_at', NOW(),
    'message', 'El restaurante ha sido desactivado, retirado del directorio público y sus datos bancarios y comerciales han sido anonimizados.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_and_purge_my_restaurant(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_and_purge_my_restaurant(UUID, TEXT) TO authenticated;


-- 2. Reemplazar public.delete_my_user_account sin DELETE directo en storage.objects
CREATE OR REPLACE FUNCTION public.delete_my_user_account(
  p_confirm_text TEXT DEFAULT 'ELIMINAR MI CUENTA'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_active_orders INT := 0;
  v_owned_active_restaurants INT := 0;
  v_anonymized_orders INT := 0;
  v_request_id UUID;
  v_media_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_paths TEXT[] := ARRAY[]::TEXT[];
  v_avatar_url TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado: debes iniciar sesión para solicitar la supresión de tus datos.';
  END IF;

  IF upper(btrim(COALESCE(p_confirm_text, ''))) NOT IN ('ELIMINAR MI CUENTA', 'USER_REQUEST') THEN
    RAISE EXCEPTION 'Confirmación inválida: escribe exactamente ELIMINAR MI CUENTA para continuar.';
  END IF;

  SELECT COUNT(*) INTO v_owned_active_restaurants
  FROM public.restaurants r
  WHERE r.owner_user_id = v_uid
    AND COALESCE(r.status, 'active') != 'suspended';

  IF v_owned_active_restaurants > 0 THEN
    RAISE EXCEPTION 'Tienes un restaurante activo asociado a tu cuenta. Primero debes dar de baja el restaurante desde el Panel del Restaurante antes de eliminar tu cuenta personal.';
  END IF;

  SELECT COUNT(*) INTO v_active_orders
  FROM public.orders o
  WHERE o.customer_id = v_uid
    AND o.status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RAISE EXCEPTION 'Tienes % pedido(s) activo(s) en curso. Espera a que finalicen o cancélalos antes de eliminar tu cuenta.', v_active_orders;
  END IF;

  SELECT avatar_url INTO v_avatar_url
  FROM public.profiles
  WHERE id = v_uid;

  SELECT ARRAY_REMOVE(
    ARRAY_CAT(
      ARRAY[v_avatar_url],
      ARRAY(
        SELECT rr.review_image_url
        FROM public.restaurant_reviews rr
        WHERE rr.user_id = v_uid AND rr.review_image_url IS NOT NULL
      )
    ),
    NULL
  ) INTO v_media_urls;

  SELECT COALESCE(
    ARRAY(
      SELECT so.name
      FROM storage.objects so
      WHERE so.bucket_id = 'gastro-media'
        AND (
          so.owner = v_uid
          OR (
            (string_to_array(so.name, '/'))[1] IN ('avatars', 'reviews', 'general')
            AND (string_to_array(so.name, '/'))[2] = v_uid::TEXT
          )
        )
    ),
    ARRAY[]::TEXT[]
  ) INTO v_storage_paths;

  INSERT INTO public.privacy_deletion_requests (
    requester_user_id,
    target_type,
    reason,
    status,
    completed_at
  ) VALUES (
    v_uid,
    'user_account',
    COALESCE(NULLIF(btrim(p_confirm_text), ''), 'ELIMINAR MI CUENTA'),
    'completed',
    NOW()
  ) RETURNING id INTO v_request_id;

  DELETE FROM public.saved_posts WHERE user_id = v_uid;
  DELETE FROM public.post_likes WHERE user_id = v_uid;
  DELETE FROM public.post_comments WHERE user_id = v_uid;

  UPDATE public.restaurant_reviews
  SET
    comment = '[Reseña anonimizada por solicitud de retiro del titular]',
    review_image_url = NULL,
    author_name = 'Usuario Eliminado',
    author_username = NULL,
    author_avatar_url = NULL,
    updated_at = NOW()
  WHERE user_id = v_uid;

  UPDATE public.orders
  SET
    customer_id = NULL,
    customer_name = 'Titular Suprimido (Ley 1581)',
    customer_phone = '0000000000',
    delivery_address = NULL,
    restaurant_notes = NULL,
    device_id = NULL,
    updated_at = NOW()
  WHERE customer_id = v_uid;

  GET DIAGNOSTICS v_anonymized_orders = ROW_COUNT;

  -- Anonimizar tickets y mensajes de soporte del usuario (P1-11)
  UPDATE public.support_tickets
  SET
    subject = 'Caso anonimizado por supresión de cuenta',
    description = '[Descripción suprimida por solicitud del titular - Ley 1581 de 2012]',
    satisfaction_comment = NULL,
    status = 'closed',
    closed_at = COALESCE(closed_at, NOW()),
    updated_at = NOW()
  WHERE requester_user_id = v_uid;

  UPDATE public.support_messages
  SET
    body = '[Mensaje suprimido por solicitud del titular - Ley 1581 de 2012]'
  WHERE author_user_id = v_uid
    AND COALESCE(is_internal, FALSE) = FALSE;

  DELETE FROM public.restaurant_members WHERE user_id = v_uid;
  DELETE FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'deleted_user_id', v_uid,
    'anonymized_orders', v_anonymized_orders,
    'media_urls', to_jsonb(COALESCE(v_media_urls, ARRAY[]::TEXT[])),
    'storage_paths', to_jsonb(COALESCE(v_storage_paths, ARRAY[]::TEXT[])),
    'deleted_at', NOW(),
    'message', 'Tu cuenta y tus datos personales han sido eliminados y anonimizados conforme a la Ley 1581 de 2012.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_user_account(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_user_account(TEXT) TO authenticated;


-- 3. Permitir en gastro_media_delete_authenticated que la limpieza por Storage API
--    funcione inmediatamente después de registrar la baja del restaurante en privacy_deletion_requests
CREATE OR REPLACE FUNCTION public.can_purge_restaurant_storage(p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.storage_is_restaurant_owner(p_restaurant_id)
    OR EXISTS (
      SELECT 1
      FROM public.privacy_deletion_requests pdr
      WHERE pdr.requester_user_id = auth.uid()
        AND pdr.target_restaurant_id = p_restaurant_id
        AND pdr.status = 'completed'
    );
$$;

REVOKE ALL ON FUNCTION public.can_purge_restaurant_storage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_purge_restaurant_storage(UUID) TO authenticated;

DROP POLICY IF EXISTS "gastro_media_delete_authenticated" ON storage.objects;
CREATE POLICY "gastro_media_delete_authenticated"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'gastro-media'
  AND auth.role() = 'authenticated'
  AND (
    (
      (string_to_array(name, '/'))[1] IN ('restaurants', 'stories', 'posts')
      AND (string_to_array(name, '/'))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.can_purge_restaurant_storage(((string_to_array(name, '/'))[2])::UUID)
    )
    OR (
      (string_to_array(name, '/'))[1] IN ('avatars', 'reviews', 'general')
      AND (
        (string_to_array(name, '/'))[2] = auth.uid()::TEXT
        OR owner = auth.uid()
      )
    )
  )
);

NOTIFY pgrst, 'reload schema';
