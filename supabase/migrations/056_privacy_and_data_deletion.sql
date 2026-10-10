-- ============================================================================
-- MIGRACIÓN 056: CUMPLIMIENTO LEGAL EN COLOMBIA (LEY ESTATUTARIA 1581 DE 2012,
-- DECRETO 1377 DE 2013 Y ESTATUTO DEL CONSUMIDOR LEY 1480 DE 2011)
-- - Trazabilidad de consentimiento informado en perfiles y solicitudes de aliados
-- - Derecho de Supresión / "Derecho al Olvido" para clientes (delete_my_user_account)
-- - Baja voluntaria y purga de datos de restaurantes aliados (deactivate_and_purge_my_restaurant)
-- ============================================================================

-- 1. Columnas de auditoría de consentimiento informado (Habeas Data - Ley 1581 de 2012)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT DEFAULT '2026.1';

ALTER TABLE public.restaurant_applications
  ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT DEFAULT '2026.1';

-- 2. RPC para registrar o renovar la aceptación explícita de Términos y Política de Tratamiento de Datos
CREATE OR REPLACE FUNCTION public.record_user_legal_consent(
  p_policy_version TEXT DEFAULT '2026.1'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado: debes iniciar sesión para registrar tu consentimiento.';
  END IF;

  UPDATE public.profiles
  SET
    terms_accepted_at = NOW(),
    privacy_accepted_at = NOW(),
    privacy_policy_version = COALESCE(NULLIF(btrim(p_policy_version), ''), '2026.1'),
    updated_at = NOW()
  WHERE id = v_uid;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_legal_consent(TEXT) TO authenticated;

-- 3. RPC de Supresión de Cuenta de Usuario y Anonimización de Pedidos (Art. 8 y 15 Ley 1581 de 2012)
--    Conserva únicamente los registros contables anonimizados exigidos por ley tributaria/comercial
--    (Art. 10 Ley 1581 de 2012) y elimina todos los datos personales identificables (PII).
CREATE OR REPLACE FUNCTION public.delete_my_user_account(
  p_confirm_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_active_orders INTEGER := 0;
  v_active_owned_restaurants INTEGER := 0;
  v_anonymized_orders INTEGER := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado: debes iniciar sesión para solicitar la supresión de tus datos.';
  END IF;

  IF upper(btrim(COALESCE(p_confirm_text, ''))) != 'ELIMINAR MI CUENTA' THEN
    RAISE EXCEPTION 'Confirmación inválida: escribe exactamente ELIMINAR MI CUENTA para continuar.';
  END IF;

  -- Verificar que no sea propietario de un restaurante activo sin haberlo dado de baja antes
  SELECT COUNT(*) INTO v_active_owned_restaurants
  FROM public.restaurants r
  WHERE r.owner_user_id = v_uid
    AND COALESCE(r.status, 'active') != 'suspended';

  IF v_active_owned_restaurants > 0 THEN
    RAISE EXCEPTION 'Tienes un restaurante activo vinculado a tu cuenta. Primero da de baja tu restaurante desde Panel Admin > Configuración > Privacidad y Baja antes de eliminar tu cuenta personal.';
  END IF;

  -- Verificar que no tenga pedidos activos en curso
  SELECT COUNT(*) INTO v_active_orders
  FROM public.orders o
  WHERE o.customer_id = v_uid
    AND o.status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RAISE EXCEPTION 'Tienes % pedido(s) activo(s) en curso. Espera a que finalicen o cancélalos antes de eliminar tu cuenta.', v_active_orders;
  END IF;

  -- 3a. Anonimizar órdenes históricas por deber legal contable/tributario (Art. 10 Ley 1581)
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

  -- 3b. Eliminar interacciones sociales, favoritos, reseñas y membresías operativas
  DELETE FROM public.post_comments WHERE user_id = v_uid;
  DELETE FROM public.post_likes WHERE user_id = v_uid;
  DELETE FROM public.saved_posts WHERE user_id = v_uid;
  DELETE FROM public.restaurant_reviews WHERE user_id = v_uid;
  DELETE FROM public.restaurant_members WHERE user_id = v_uid;

  -- 3c. Eliminar objetos de almacenamiento propios del usuario (avatares y fotos de reseñas)
  DELETE FROM storage.objects
  WHERE bucket_id = 'gastro-media'
    AND (
      owner = v_uid
      OR (
        (string_to_array(name, '/'))[1] IN ('avatars', 'reviews', 'general')
        AND (string_to_array(name, '/'))[2] = v_uid::text
      )
    );

  -- 3d. Eliminar el perfil público del usuario
  DELETE FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', v_uid,
    'anonymized_orders', v_anonymized_orders,
    'deleted_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_user_account(TEXT) TO authenticated;

-- 4. RPC de Baja Voluntaria y Purga de Datos de Restaurante Aliado (Ley 1581 de 2012)
--    Verifica titularidad, valida ausencia de pedidos en curso, elimina catálogo comercial,
--    publicaciones, mesas y equipo, y purga los datos personales/bancarios del comercio.
CREATE OR REPLACE FUNCTION public.deactivate_and_purge_my_restaurant(
  p_restaurant_id UUID,
  p_confirm_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_is_owner BOOLEAN := FALSE;
  v_active_orders INTEGER := 0;
  v_deleted_posts INTEGER := 0;
  v_deleted_products INTEGER := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado: debes iniciar sesión.';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Debes especificar el identificador del restaurante.';
  END IF;

  IF upper(btrim(COALESCE(p_confirm_text, ''))) != 'ELIMINAR RESTAURANTE' THEN
    RAISE EXCEPTION 'Confirmación inválida: escribe exactamente ELIMINAR RESTAURANTE para confirmar la baja.';
  END IF;

  v_is_owner := public.is_restaurant_owner(v_uid, p_restaurant_id) OR public.is_platform_admin(v_uid);
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'No tienes permisos de propietario sobre este restaurante.';
  END IF;

  -- Verificar que no existan órdenes activas en cocina o reparto
  SELECT COUNT(*) INTO v_active_orders
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RAISE EXCEPTION 'El restaurante tiene % pedido(s) activo(s) en curso. Finalízalos o cancélalos antes de dar de baja el comercio.', v_active_orders;
  END IF;

  -- 4a. Eliminar publicaciones e interacciones asociadas del feed
  DELETE FROM public.posts WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_deleted_posts = ROW_COUNT;

  -- 4b. Eliminar horarios, mesas QR y miembros del equipo
  DELETE FROM public.restaurant_hours WHERE restaurant_id = p_restaurant_id;
  UPDATE public.restaurant_tables
  SET is_active = FALSE, archived_at = NOW()
  WHERE restaurant_id = p_restaurant_id;
  DELETE FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id;

  -- 4c. Eliminar productos sin historial contable y archivar los que tienen ítems en órdenes históricas
  DELETE FROM public.products pr
  WHERE pr.restaurant_id = p_restaurant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.product_id = pr.id
    );
  GET DIAGNOSTICS v_deleted_products = ROW_COUNT;

  UPDATE public.products
  SET
    available = FALSE,
    description = NULL,
    image_url = NULL
  WHERE restaurant_id = p_restaurant_id;

  -- 4d. Eliminar archivos multimedia del restaurante en Storage
  DELETE FROM storage.objects
  WHERE bucket_id = 'gastro-media'
    AND (string_to_array(name, '/'))[1] = 'restaurants'
    AND (string_to_array(name, '/'))[2] = p_restaurant_id::text;

  -- 4e. Suspender el restaurante y purgar PII y datos bancarios de dispersión
  UPDATE public.restaurants
  SET
    status = 'suspended',
    is_open = FALSE,
    accepting_orders = FALSE,
    name = 'Comercio Retirado (Ley 1581)',
    bio = NULL,
    phone = NULL,
    whatsapp = NULL,
    address = NULL,
    logo_url = NULL,
    cover_url = NULL,
    payout_bank_name = NULL,
    payout_account_type = NULL,
    payout_account_number = NULL,
    payout_holder_name = NULL,
    payout_document_type = NULL,
    payout_document_number = NULL,
    owner_user_id = NULL,
    updated_at = NOW()
  WHERE id = p_restaurant_id;

  -- 4f. Desvincular el perfil del propietario y regresarlo a rol cliente si no administra otro comercio
  UPDATE public.profiles
  SET
    restaurant_id = NULL,
    role = CASE
      WHEN role = 'restaurant_owner' THEN 'client_delivery'
      ELSE role
    END,
    updated_at = NOW()
  WHERE id = v_uid
    AND restaurant_id = p_restaurant_id;

  RETURN jsonb_build_object(
    'success', true,
    'purged_restaurant_id', p_restaurant_id,
    'deleted_posts', v_deleted_posts,
    'deleted_products', v_deleted_products,
    'purged_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_and_purge_my_restaurant(UUID, TEXT) TO authenticated;
