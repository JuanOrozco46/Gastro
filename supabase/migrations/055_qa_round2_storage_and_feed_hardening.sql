-- ============================================================================
-- MIGRACIÓN 055: ENDURECIMIENTO QA RONDA 2 — AISLAMIENTO ESTRICTO DE STORAGE
-- (AVATARS / REVIEWS / RESTAURANTS), WHITELIST MIME EN BUCKET Y REVERSIÓN
-- CONTABLE ('refunded') AL CANCELAR PEDIDOS CON PAGO DIGITAL APROBADO
-- ============================================================================

-- 1. Restringir tipos MIME permitidos y tamaño máximo a nivel del bucket 'gastro-media'
--    Bloquea físicamente subidas de SVG, HTML, scripts o ejecutables (prevención XSS almacenado).
UPDATE storage.buckets
SET
  file_size_limit = 52428800, -- 50 MB tope global (videos cortos); imágenes y avatares se validan además en cliente/RLS
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
WHERE id = 'gastro-media';

-- 2. Reemplazar políticas RLS de storage.objects en 'gastro-media' para exigir:
--    a) Si el primer segmento es 'restaurants', el 2º segmento debe ser UUID de un restaurante del usuario.
--    b) Si el primer segmento es 'avatars', 'reviews' o 'general', el 2º segmento DEBE ser auth.uid()::text
--       (ningún usuario autenticado puede escribir fuera de su propia subcarpeta ni en rutas arbitrarias).
--    c) En 'avatars', solo se permiten extensiones .jpg, .jpeg, .png o .webp.
DROP POLICY IF EXISTS "gastro_media_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_delete_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_insert_user_media" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_update_user_media" ON storage.objects;

CREATE POLICY "gastro_media_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gastro-media'
  AND auth.role() = 'authenticated'
  AND (
    (
      (string_to_array(name, '/'))[1] = 'restaurants'
      AND (string_to_array(name, '/'))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.storage_is_restaurant_owner(((string_to_array(name, '/'))[2])::uuid)
    )
    OR (
      (string_to_array(name, '/'))[1] = 'avatars'
      AND (string_to_array(name, '/'))[2] = auth.uid()::text
      AND lower(name) ~ '\.(jpg|jpeg|png|webp)$'
    )
    OR (
      (string_to_array(name, '/'))[1] IN ('reviews', 'general')
      AND (string_to_array(name, '/'))[2] = auth.uid()::text
    )
  )
);

CREATE POLICY "gastro_media_update_authenticated"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'gastro-media'
  AND auth.role() = 'authenticated'
  AND (
    (
      (string_to_array(name, '/'))[1] = 'restaurants'
      AND (string_to_array(name, '/'))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.storage_is_restaurant_owner(((string_to_array(name, '/'))[2])::uuid)
    )
    OR (
      (string_to_array(name, '/'))[1] IN ('avatars', 'reviews', 'general')
      AND (string_to_array(name, '/'))[2] = auth.uid()::text
      AND (owner = auth.uid() OR owner IS NULL)
    )
  )
)
WITH CHECK (
  bucket_id = 'gastro-media'
  AND auth.role() = 'authenticated'
  AND (
    (
      (string_to_array(name, '/'))[1] = 'restaurants'
      AND (string_to_array(name, '/'))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.storage_is_restaurant_owner(((string_to_array(name, '/'))[2])::uuid)
    )
    OR (
      (string_to_array(name, '/'))[1] = 'avatars'
      AND (string_to_array(name, '/'))[2] = auth.uid()::text
      AND lower(name) ~ '\.(jpg|jpeg|png|webp)$'
    )
    OR (
      (string_to_array(name, '/'))[1] IN ('reviews', 'general')
      AND (string_to_array(name, '/'))[2] = auth.uid()::text
    )
  )
);

CREATE POLICY "gastro_media_delete_authenticated"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'gastro-media'
  AND auth.role() = 'authenticated'
  AND (
    (
      (string_to_array(name, '/'))[1] = 'restaurants'
      AND (string_to_array(name, '/'))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.storage_is_restaurant_owner(((string_to_array(name, '/'))[2])::uuid)
    )
    OR (
      (string_to_array(name, '/'))[1] IN ('avatars', 'reviews', 'general')
      AND (string_to_array(name, '/'))[2] = auth.uid()::text
      AND (owner = auth.uid() OR owner IS NULL)
    )
  )
);

-- 3. Actualizar update_order_status para marcar como 'refunded' los pagos aprobados si un pedido se cancela
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_next_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_uid UUID;
  v_tenant_id UUID;
  v_current_status TEXT;
  v_total_cop INTEGER;
  v_payment_method TEXT;
  v_commission_rate NUMERIC := 0.03;
  v_platform_fee INTEGER;
  v_gateway_fee INTEGER;
  v_gateway_iva INTEGER;
  v_payout INTEGER;
  v_target_payment_id UUID;
  v_is_owner BOOLEAN;
  v_is_member BOOLEAN;
BEGIN
  v_user_uid := auth.uid();
  IF v_user_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
  END IF;

  SELECT
    o.restaurant_id,
    o.status,
    o.total_cop,
    COALESCE(o.payment_method, 'cash'),
    COALESCE(r.commission_rate, 0.03)
  INTO v_tenant_id, v_current_status, v_total_cop, v_payment_method, v_commission_rate
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido especificado no existe.';
  END IF;

  IF v_current_status IN ('cancelled', 'delivered') THEN
    RAISE EXCEPTION 'No se puede cambiar el estado de un pedido finalizado o cancelado.';
  END IF;

  v_is_owner := public.is_restaurant_owner(v_user_uid, v_tenant_id) OR public.is_platform_admin(v_user_uid);
  v_is_member := public.is_restaurant_member(v_user_uid, v_tenant_id);

  IF NOT v_is_owner AND NOT v_is_member THEN
    RAISE EXCEPTION 'No tienes autorización para modificar pedidos de este restaurante.';
  END IF;

  IF v_is_member AND NOT v_is_owner THEN
    IF NOT (
      (v_current_status = 'pending' AND p_next_status = 'accepted') OR
      (v_current_status = 'accepted' AND p_next_status = 'preparing') OR
      (v_current_status = 'preparing' AND p_next_status = 'ready')
    ) THEN
      RAISE EXCEPTION 'Transición de estado no permitida para personal de cocina.';
    END IF;
  ELSE
    IF NOT (
      (v_current_status = 'pending' AND p_next_status IN ('accepted', 'cancelled')) OR
      (v_current_status = 'accepted' AND p_next_status IN ('preparing', 'cancelled')) OR
      (v_current_status = 'preparing' AND p_next_status IN ('ready', 'cancelled')) OR
      (v_current_status = 'ready' AND p_next_status IN ('out_for_delivery', 'delivered', 'cancelled')) OR
      (v_current_status = 'out_for_delivery' AND p_next_status IN ('delivered', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Transición de estado no válida.';
    END IF;
  END IF;

  UPDATE public.orders
  SET
    status = p_next_status,
    updated_at = NOW()
  WHERE id = p_order_id
    AND restaurant_id = v_tenant_id;

  IF p_next_status = 'delivered' THEN
    v_platform_fee := ROUND(v_total_cop * v_commission_rate)::INTEGER;
    v_gateway_fee := public.calculate_wompi_gateway_fee_cop(v_total_cop, v_payment_method);
    v_gateway_iva := public.calculate_wompi_gateway_iva_cop(v_total_cop, v_payment_method);
    v_payout := GREATEST(0, v_total_cop - v_platform_fee - v_gateway_fee);

    IF EXISTS (
      SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'approved'
    ) THEN
      UPDATE public.payments
      SET status = 'voided'
      WHERE order_id = p_order_id
        AND status = 'pending';
    ELSIF COALESCE(lower(btrim(v_payment_method)), 'cash') = 'cash' THEN
      SELECT id INTO v_target_payment_id
      FROM public.payments
      WHERE order_id = p_order_id
        AND status = 'pending'
      ORDER BY created_at DESC, id DESC
      LIMIT 1;

      IF v_target_payment_id IS NOT NULL THEN
        UPDATE public.payments
        SET status = 'voided'
        WHERE order_id = p_order_id
          AND status = 'pending'
          AND id != v_target_payment_id;

        UPDATE public.payments
        SET
          status = 'approved',
          platform_fee_cop = v_platform_fee,
          gateway_fee_cop = public.calculate_wompi_gateway_fee_cop(amount_cop, provider),
          gateway_iva_cop = public.calculate_wompi_gateway_iva_cop(amount_cop, provider),
          restaurant_payout_cop = GREATEST(
            0,
            amount_cop - v_platform_fee - public.calculate_wompi_gateway_fee_cop(amount_cop, provider)
          ),
          confirmed_by = COALESCE(confirmed_by, v_user_uid),
          confirmed_at = COALESCE(confirmed_at, NOW())
        WHERE id = v_target_payment_id;
      ELSE
        INSERT INTO public.payments (
          order_id,
          provider,
          provider_reference,
          amount_cop,
          platform_fee_cop,
          gateway_fee_cop,
          gateway_iva_cop,
          restaurant_payout_cop,
          status,
          confirmed_by,
          confirmed_at
        ) VALUES (
          p_order_id,
          'cash',
          p_order_id::TEXT,
          v_total_cop,
          v_platform_fee,
          0,
          0,
          GREATEST(0, v_total_cop - v_platform_fee),
          'approved',
          v_user_uid,
          NOW()
        );
      END IF;
    END IF;

    PERFORM public.evaluate_restaurant_cash_limit_lock(v_tenant_id);
  ELSIF p_next_status = 'cancelled' THEN
    UPDATE public.payments
    SET status = 'voided'
    WHERE order_id = p_order_id
      AND status = 'pending';

    -- Si ya tenía un pago aprobado (p.ej. Wompi digital), marcarlo como 'refunded' para no cobrar comisión ni incluirlo como venta efectiva
    UPDATE public.payments
    SET status = 'refunded'
    WHERE order_id = p_order_id
      AND status = 'approved';

    PERFORM public.evaluate_restaurant_cash_limit_lock(v_tenant_id);
  END IF;

  RETURN TRUE;
END;
$$;
