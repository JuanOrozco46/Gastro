-- ============================================================================
-- GASTROSYNC - CONSOLIDACIÓN FINANCIERA POR RESTAURANTE Y LIQUIDACIÓN DE PEDIDOS
-- Versión: 048_fix_restaurant_finances_and_order_payments.sql
-- Descripción:
--   1. Refuerza is_restaurant_owner e is_restaurant_member para reconocer también
--      profiles.restaurant_id además de restaurant_members y restaurants.owner_user_id.
--   2. Backfill de pagos faltantes y liquidación automática de pedidos entregados
--      (calculando la comisión ética del 3% y el neto del 97% para el restaurante).
--   3. Actualiza create_order_with_items y update_order_status para asegurar que:
--      - Todo pedido tenga su registro financiero con comisión 3% calculada.
--      - Al marcar un pedido como 'delivered', su pago quede conciliado ('approved').
--   4. Reemplaza get_restaurant_financial_summary con aislamiento estricto por
--      p_restaurant_id, sin duplicidad por múltiples intentos de pago (LATERAL),
--      y contabilizando tanto pedidos entregados/aprobados como pedidos en curso
--      (pending, accepted, preparing, ready, out_for_delivery).
-- ============================================================================

-- 1. REFORZAR FUNCIONES DE PERTENENCIA AL RESTAURANTE
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
      AND p.restaurant_id = p_restaurant_id
      AND p.role IN ('restaurant_owner', 'admin')
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
      AND p.restaurant_id = p_restaurant_id
  );
END;
$$;

-- 2. BACKFILL DE REGISTROS DE PAGO Y CONCILIACIÓN DE PEDIDOS EXISTENTES
-- 2a. Insertar registro en public.payments para órdenes que no tenían fila en payments
INSERT INTO public.payments (
  order_id,
  provider,
  provider_reference,
  amount_cop,
  platform_fee_cop,
  restaurant_payout_cop,
  status,
  confirmed_at,
  created_at
)
SELECT
  o.id,
  'cash',
  o.id::TEXT,
  o.total_cop,
  ROUND(o.total_cop * COALESCE(r.commission_rate, 0.03))::INTEGER,
  (o.total_cop - ROUND(o.total_cop * COALESCE(r.commission_rate, 0.03)))::INTEGER,
  CASE
    WHEN o.status = 'delivered' THEN 'approved'
    WHEN o.status = 'cancelled' THEN 'voided'
    ELSE 'pending'
  END,
  CASE WHEN o.status = 'delivered' THEN COALESCE(o.updated_at, o.created_at) ELSE NULL END,
  o.created_at
FROM public.orders o
JOIN public.restaurants r ON r.id = o.restaurant_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.payments p WHERE p.order_id = o.id
);

-- 2b. Recalcular comisión 3% y neto 97% en pagos donde platform_fee_cop quedó en 0
UPDATE public.payments p
SET
  platform_fee_cop = ROUND(p.amount_cop * COALESCE(r.commission_rate, 0.03))::INTEGER,
  restaurant_payout_cop = (p.amount_cop - ROUND(p.amount_cop * COALESCE(r.commission_rate, 0.03)))::INTEGER
FROM public.orders o
JOIN public.restaurants r ON r.id = o.restaurant_id
WHERE p.order_id = o.id
  AND p.amount_cop > 0
  AND p.platform_fee_cop = 0;

-- 2c. Conciliar automáticamente pagos de pedidos que ya fueron entregados ('delivered')
UPDATE public.payments p
SET
  status = 'approved',
  confirmed_at = COALESCE(p.confirmed_at, o.updated_at, NOW())
FROM public.orders o
WHERE p.order_id = o.id
  AND o.status = 'delivered'
  AND p.status = 'pending';

-- 3. ACTUALIZAR CREATE_ORDER_WITH_ITEMS PARA CALCULAR COMISIÓN 3% Y CREAR REGISTRO FINANCIERO
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_restaurant_id UUID,
  p_fulfillment TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_delivery_address JSONB,
  p_items JSONB,
  p_table_number TEXT DEFAULT NULL,
  p_restaurant_notes TEXT DEFAULT NULL,
  p_table_id UUID DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_table_token TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'wompi'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_subtotal INTEGER := 0;
  v_delivery_fee INTEGER := 0;
  v_total INTEGER := 0;
  v_commission_rate NUMERIC := 0.03;
  v_platform_fee INTEGER := 0;
  v_restaurant_payout INTEGER := 0;
  v_item JSONB;
  v_unit_price INTEGER;
  v_product_name TEXT;
  v_product_available BOOLEAN;
  v_customer_id UUID;
  v_table_record RECORD;
  v_resolved_restaurant_id UUID;
  v_resolved_table_id UUID;
  v_accepts_cash BOOLEAN;
  v_qty INTEGER;
BEGIN
  v_resolved_restaurant_id := p_restaurant_id;
  v_resolved_table_id := p_table_id;
  v_customer_id := auth.uid();

  IF p_fulfillment != 'table_service' AND v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
  END IF;

  IF p_fulfillment = 'table_service' THEN
    IF p_table_token IS NOT NULL THEN
      SELECT * INTO v_table_record
      FROM public.restaurant_tables
      WHERE public_token = p_table_token
        AND is_active = true
        AND archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_table: table does not exist, is inactive, or token is invalid';
      END IF;

      v_resolved_table_id := v_table_record.id;
      v_resolved_restaurant_id := v_table_record.restaurant_id;
      p_table_number := v_table_record.table_number;
    ELSIF p_table_id IS NOT NULL THEN
      SELECT * INTO v_table_record
      FROM public.restaurant_tables
      WHERE id = p_table_id
        AND restaurant_id = p_restaurant_id
        AND is_active = true
        AND archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_table: table does not exist, belongs to another restaurant, or is inactive';
      END IF;
    END IF;

    IF v_customer_id IS NULL AND p_device_id IS NULL THEN
      RAISE EXCEPTION 'invalid_session: device_id is required for anonymous table orders';
    END IF;
  END IF;

  SELECT
    COALESCE(accepts_cash, TRUE),
    COALESCE(commission_rate, 0.03),
    CASE WHEN p_fulfillment = 'restaurant_delivery' THEN COALESCE(delivery_fee, 0) ELSE 0 END
  INTO v_accepts_cash, v_commission_rate, v_delivery_fee
  FROM public.restaurants
  WHERE id = v_resolved_restaurant_id;

  IF p_payment_method = 'cash' AND v_accepts_cash = FALSE THEN
    RAISE EXCEPTION 'invalid_payment: restaurant does not accept cash';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para producto en el pedido.';
    END IF;

    SELECT price_cop, name, available
    INTO v_unit_price, v_product_name, v_product_available
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND restaurant_id = v_resolved_restaurant_id;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'El producto % no existe o no pertenece a este restaurante.', (v_item->>'product_id');
    END IF;

    IF v_product_available = FALSE THEN
      RAISE EXCEPTION 'El producto "%" está agotado temporalmente.', v_product_name;
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  END LOOP;

  v_total := v_subtotal + COALESCE(v_delivery_fee, 0);
  v_platform_fee := ROUND(v_total * COALESCE(v_commission_rate, 0.03))::INTEGER;
  v_restaurant_payout := GREATEST(0, v_total - v_platform_fee);

  INSERT INTO public.orders (
    restaurant_id,
    customer_id,
    fulfillment,
    status,
    customer_name,
    customer_phone,
    delivery_address,
    table_number,
    table_id,
    restaurant_notes,
    device_id,
    subtotal_cop,
    delivery_fee_cop,
    total_cop
  ) VALUES (
    v_resolved_restaurant_id,
    v_customer_id,
    p_fulfillment,
    'pending',
    COALESCE(NULLIF(trim(p_customer_name), ''), 'Cliente'),
    COALESCE(NULLIF(trim(p_customer_phone), ''), 'Sin teléfono'),
    p_delivery_address,
    p_table_number,
    v_resolved_table_id,
    p_restaurant_notes,
    p_device_id,
    v_subtotal,
    COALESCE(v_delivery_fee, 0),
    v_total
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::INTEGER;
    SELECT price_cop, name INTO v_unit_price, v_product_name
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND restaurant_id = v_resolved_restaurant_id;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price_cop,
      quantity
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_product_name,
      v_unit_price,
      v_qty
    );
  END LOOP;

  IF p_payment_method = 'cash' THEN
    INSERT INTO public.payments (
      order_id,
      provider,
      provider_reference,
      amount_cop,
      platform_fee_cop,
      restaurant_payout_cop,
      status
    ) VALUES (
      v_order_id,
      'cash',
      v_order_id::TEXT,
      v_total,
      v_platform_fee,
      v_restaurant_payout,
      'pending'
    );
  END IF;

  RETURN v_order_id;
END;
$$;

-- 4. ACTUALIZAR UPDATE_ORDER_STATUS PARA CONCILIAR EL PAGO AL ENTREGAR O CANCELAR
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
  v_commission_rate NUMERIC := 0.03;
  v_platform_fee INTEGER;
  v_payout INTEGER;
  v_is_owner BOOLEAN;
  v_is_member BOOLEAN;
BEGIN
  v_user_uid := auth.uid();
  IF v_user_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
  END IF;

  SELECT o.restaurant_id, o.status, o.total_cop, COALESCE(r.commission_rate, 0.03)
  INTO v_tenant_id, v_current_status, v_total_cop, v_commission_rate
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

  -- Si el pedido pasa a 'delivered', garantizar que tenga registro de pago aprobado y liquidado
  IF p_next_status = 'delivered' THEN
    v_platform_fee := ROUND(v_total_cop * v_commission_rate)::INTEGER;
    v_payout := GREATEST(0, v_total_cop - v_platform_fee);

    IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id) THEN
      UPDATE public.payments
      SET
        status = 'approved',
        platform_fee_cop = CASE WHEN platform_fee_cop = 0 AND amount_cop > 0 THEN v_platform_fee ELSE platform_fee_cop END,
        restaurant_payout_cop = CASE WHEN platform_fee_cop = 0 AND amount_cop > 0 THEN v_payout ELSE restaurant_payout_cop END,
        confirmed_by = COALESCE(confirmed_by, v_user_uid),
        confirmed_at = COALESCE(confirmed_at, NOW())
      WHERE order_id = p_order_id
        AND status = 'pending';
    ELSE
      INSERT INTO public.payments (
        order_id,
        provider,
        provider_reference,
        amount_cop,
        platform_fee_cop,
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
        v_payout,
        'approved',
        v_user_uid,
        NOW()
      );
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

-- 5. ACTUALIZAR GET_RESTAURANT_FINANCIAL_SUMMARY CON AISLAMIENTO ESTRICTO Y PRECISIÓN TOTAL
CREATE OR REPLACE FUNCTION public.get_restaurant_financial_summary(
    p_restaurant_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
    gross_sales NUMERIC,
    net_restaurant NUMERIC,
    platform_commission NUMERIC,
    paid_orders_count BIGINT,
    pending_orders_count BIGINT,
    cancelled_orders_count BIGINT,
    refunds NUMERIC,
    savings_vs_30 NUMERIC,
    delivery_fees NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_commission_rate NUMERIC := 0.03;
BEGIN
    -- 1. Autorización estricta: únicamente propietario/miembro asignado a este restaurante o admin de plataforma
    IF NOT (
        public.is_restaurant_owner(auth.uid(), p_restaurant_id)
        OR public.is_restaurant_member(auth.uid(), p_restaurant_id)
        OR public.is_platform_admin(auth.uid())
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT COALESCE(commission_rate, 0.03)
    INTO v_commission_rate
    FROM public.restaurants
    WHERE id = p_restaurant_id;

    RETURN QUERY
    WITH order_metrics AS (
        SELECT
            o.id AS order_id,
            o.status AS order_status,
            o.subtotal_cop,
            o.delivery_fee_cop,
            o.total_cop,
            p.status AS payment_status,
            -- Si el pedido fue entregado o el pago aprobado, se considera venta efectiva del restaurante
            (o.status != 'cancelled' AND (o.status = 'delivered' OR p.status = 'approved')) AS is_completed_sale,
            -- Comisión ética (3%): usa el valor persistido si > 0, o lo calcula sobre total_cop
            CASE
                WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.platform_fee_cop::NUMERIC
                ELSE ROUND(o.total_cop * v_commission_rate)::NUMERIC
            END AS calc_platform_fee,
            -- Neto del restaurante (97%)
            CASE
                WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.restaurant_payout_cop::NUMERIC
                ELSE (o.total_cop - ROUND(o.total_cop * v_commission_rate))::NUMERIC
            END AS calc_restaurant_payout
        FROM public.orders o
        LEFT JOIN LATERAL (
            SELECT
                pay.status,
                pay.platform_fee_cop,
                pay.restaurant_payout_cop,
                pay.amount_cop
            FROM public.payments pay
            WHERE pay.order_id = o.id
            ORDER BY (pay.status = 'approved') DESC, pay.created_at DESC
            LIMIT 1
        ) p ON TRUE
        WHERE o.restaurant_id = p_restaurant_id
          AND o.created_at >= p_start_date
          AND o.created_at <= p_end_date
    )
    SELECT
        -- Ventas brutas efectivas (pedidos entregados o con pago aprobado, no cancelados)
        COALESCE(SUM(total_cop) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS gross_sales,

        -- Neto líquido del restaurante (97%)
        COALESCE(SUM(calc_restaurant_payout) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS net_restaurant,

        -- Comisión ética GastroSync (3%)
        COALESCE(SUM(calc_platform_fee) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS platform_commission,

        -- Pedidos pagados / entregados
        COUNT(*) FILTER (WHERE is_completed_sale)::BIGINT AS paid_orders_count,

        -- Pedidos activos / en curso (pending, accepted, preparing, ready, out_for_delivery que aún no están liquidados)
        COUNT(*) FILTER (WHERE order_status != 'cancelled' AND NOT is_completed_sale)::BIGINT AS pending_orders_count,

        -- Pedidos cancelados
        COUNT(*) FILTER (WHERE order_status = 'cancelled')::BIGINT AS cancelled_orders_count,

        -- Reembolsos / valor de pedidos cancelados
        COALESCE(SUM(total_cop) FILTER (WHERE order_status = 'cancelled'), 0)::NUMERIC AS refunds,

        -- Ahorro frente a plataformas tradicionales del 30%
        COALESCE(SUM((total_cop * 0.30) - calc_platform_fee) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS savings_vs_30,

        -- Total recaudado por domicilios en ventas efectivas
        COALESCE(SUM(delivery_fee_cop) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS delivery_fees
    FROM order_metrics;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_financial_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
