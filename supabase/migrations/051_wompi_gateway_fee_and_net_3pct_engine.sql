-- ============================================================================
-- GASTROSYNC - TARIFA EXACTA PASARELA WOMPI (2.65% + $700 COP + 19% IVA)
--              Y COMISIÓN 3% LIBRE INTACTA PARA GASTROSYNC
-- Versión: 051_wompi_gateway_fee_and_net_3pct_engine.sql
-- Descripción:
--   1. Crea las funciones inmutables calculate_wompi_gateway_fee_cop y
--      calculate_wompi_gateway_iva_cop:
--      - En efectivo ('cash'): $0 COP de costo de pasarela. Solo se cobra el 3%
--        de GastroSync.
--      - En pagos digitales ('wompi', 'card', 'pse', 'nequi', etc.):
--        Costo Wompi = ROUND((monto * 0.0265 + 700) * 1.19) [incluye 19% IVA].
--        Comisión Libre GastroSync = ROUND(monto * 0.03) [3% libre intacto].
--        Neto Restaurante = monto - Comisión GastroSync (3%) - Costo Wompi.
--   2. Añade gateway_fee_cop y gateway_iva_cop a public.payments, y
--      wompi_gateway_fee_cop a public.restaurant_settlements.
--   3. Actualiza create_order_with_items, update_order_status,
--      evaluate_restaurant_cash_limit_lock, get_restaurant_financial_summary,
--      get_restaurant_settlement_balance, get_all_restaurants_settlement_overview
--      y record_restaurant_settlement con el nuevo modelo matemático exacto.
-- ============================================================================

-- 1. FUNCIONES MATEMÁTICAS DE PASARELA WOMPI (2.65% + $700 COP + IVA 19%)
CREATE OR REPLACE FUNCTION public.calculate_wompi_gateway_fee_cop(
  p_amount_cop NUMERIC,
  p_payment_method TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF COALESCE(p_amount_cop, 0) <= 0 OR COALESCE(lower(btrim(p_payment_method)), 'cash') = 'cash' THEN
    RETURN 0;
  END IF;
  RETURN ROUND(((p_amount_cop * 0.0265) + 700.0) * 1.19)::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_wompi_gateway_iva_cop(
  p_amount_cop NUMERIC,
  p_payment_method TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base INTEGER;
  v_total INTEGER;
BEGIN
  IF COALESCE(p_amount_cop, 0) <= 0 OR COALESCE(lower(btrim(p_payment_method)), 'cash') = 'cash' THEN
    RETURN 0;
  END IF;
  v_base := ROUND((p_amount_cop * 0.0265) + 700.0)::INTEGER;
  v_total := ROUND(((p_amount_cop * 0.0265) + 700.0) * 1.19)::INTEGER;
  RETURN GREATEST(0, v_total - v_base);
END;
$$;

-- 2. EXTENDER public.payments Y public.restaurant_settlements CON COLUMNAS DE PASARELA WOMPI
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_fee_cop INTEGER NOT NULL DEFAULT 0 CHECK (gateway_fee_cop >= 0),
  ADD COLUMN IF NOT EXISTS gateway_iva_cop INTEGER NOT NULL DEFAULT 0 CHECK (gateway_iva_cop >= 0);

ALTER TABLE public.restaurant_settlements
  ADD COLUMN IF NOT EXISTS wompi_gateway_fee_cop INTEGER NOT NULL DEFAULT 0 CHECK (wompi_gateway_fee_cop >= 0);

-- Backfill de todos los registros existentes en public.payments
UPDATE public.payments p
SET
  platform_fee_cop = ROUND(p.amount_cop * COALESCE(r.commission_rate, 0.03))::INTEGER,
  gateway_fee_cop = public.calculate_wompi_gateway_fee_cop(p.amount_cop, p.provider),
  gateway_iva_cop = public.calculate_wompi_gateway_iva_cop(p.amount_cop, p.provider),
  restaurant_payout_cop = GREATEST(
    0,
    p.amount_cop
    - ROUND(p.amount_cop * COALESCE(r.commission_rate, 0.03))::INTEGER
    - public.calculate_wompi_gateway_fee_cop(p.amount_cop, p.provider)
  )
FROM public.orders o
JOIN public.restaurants r ON r.id = o.restaurant_id
WHERE p.order_id = o.id
  AND p.amount_cop > 0;

-- 3. ACTUALIZAR evaluate_restaurant_cash_limit_lock CON DESCUENTO DE WOMPI EN DIGITAL
CREATE OR REPLACE FUNCTION public.evaluate_restaurant_cash_limit_lock(
  p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate NUMERIC := 0.03;
  v_limit_cop INTEGER := 50000;
  v_auto_lock BOOLEAN := TRUE;
  v_accepts_cash BOOLEAN := TRUE;
  v_cash_commission_all BIGINT := 0;
  v_digital_net_all BIGINT := 0;
  v_payouts_sent BIGINT := 0;
  v_payments_received BIGINT := 0;
  v_live_net_position BIGINT := 0;
  v_pending_debt_cop BIGINT := 0;
BEGIN
  SELECT
    COALESCE(commission_rate, 0.03),
    COALESCE(cash_commission_limit_cop, 50000),
    COALESCE(auto_lock_cash_on_limit, TRUE),
    COALESCE(accepts_cash, TRUE)
  INTO v_commission_rate, v_limit_cop, v_auto_lock, v_accepts_cash
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('locked', FALSE, 'pending_debt_cop', 0);
  END IF;

  WITH completed_orders AS (
    SELECT
      o.total_cop,
      COALESCE(p.provider, o.payment_method, 'cash') AS pay_provider,
      ROUND(o.total_cop * v_commission_rate)::INTEGER AS fee_cop,
      GREATEST(
        0,
        o.total_cop
        - ROUND(o.total_cop * v_commission_rate)::INTEGER
        - public.calculate_wompi_gateway_fee_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))
      ) AS net_payout_cop
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT pay.status, pay.provider
      FROM public.payments pay
      WHERE pay.order_id = o.id
      ORDER BY (pay.status = 'approved') DESC, pay.created_at DESC
      LIMIT 1
    ) p ON TRUE
    WHERE o.restaurant_id = p_restaurant_id
      AND o.status != 'cancelled'
      AND (o.status = 'delivered' OR p.status = 'approved')
  )
  SELECT
    COALESCE(SUM(fee_cop) FILTER (WHERE pay_provider = 'cash'), 0)::BIGINT,
    COALESCE(SUM(net_payout_cop) FILTER (WHERE pay_provider != 'cash'), 0)::BIGINT
  INTO v_cash_commission_all, v_digital_net_all
  FROM completed_orders;

  SELECT
    COALESCE(SUM(net_amount_cop) FILTER (WHERE settlement_type = 'platform_payout_to_restaurant' AND status = 'completed'), 0)::BIGINT,
    COALESCE(SUM(net_amount_cop) FILTER (WHERE settlement_type = 'restaurant_payment_to_platform' AND status = 'completed'), 0)::BIGINT
  INTO v_payouts_sent, v_payments_received
  FROM public.restaurant_settlements
  WHERE restaurant_id = p_restaurant_id;

  v_live_net_position := (v_digital_net_all - v_cash_commission_all) - v_payouts_sent + v_payments_received;
  v_pending_debt_cop := GREATEST(0, -v_live_net_position);

  IF v_auto_lock AND v_limit_cop > 0 THEN
    IF v_pending_debt_cop >= v_limit_cop AND v_accepts_cash = TRUE THEN
      UPDATE public.restaurants
      SET accepts_cash = FALSE, updated_at = NOW()
      WHERE id = p_restaurant_id;
      v_accepts_cash := FALSE;
    ELSIF v_pending_debt_cop < v_limit_cop AND v_accepts_cash = FALSE THEN
      UPDATE public.restaurants
      SET accepts_cash = TRUE, updated_at = NOW()
      WHERE id = p_restaurant_id;
      v_accepts_cash := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'accepts_cash', v_accepts_cash,
    'pending_debt_cop', v_pending_debt_cop,
    'limit_cop', v_limit_cop,
    'is_over_limit', (v_limit_cop > 0 AND v_pending_debt_cop >= v_limit_cop)
  );
END;
$$;

-- 4. ACTUALIZAR create_order_with_items Y update_order_status PARA GUARDAR gateway_fee_cop Y gateway_iva_cop
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
  v_gateway_fee INTEGER := 0;
  v_gateway_iva INTEGER := 0;
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
  v_normalized_method TEXT;
  v_qty INTEGER;
BEGIN
  v_resolved_restaurant_id := p_restaurant_id;
  v_resolved_table_id := p_table_id;
  v_customer_id := auth.uid();
  v_normalized_method := COALESCE(NULLIF(lower(btrim(p_payment_method)), ''), 'wompi');

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

  IF v_normalized_method = 'cash' AND v_accepts_cash = FALSE THEN
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
  -- 1. Comisión libre para GastroSync (3% exacto)
  v_platform_fee := ROUND(v_total * COALESCE(v_commission_rate, 0.03))::INTEGER;
  -- 2. Costo de pasarela Wompi (2.65% + $700 + IVA 19% en pagos digitales; $0 en efectivo)
  v_gateway_fee := public.calculate_wompi_gateway_fee_cop(v_total, v_normalized_method);
  v_gateway_iva := public.calculate_wompi_gateway_iva_cop(v_total, v_normalized_method);
  -- 3. Neto del restaurante después de descontar el 3% de GastroSync y el costo de Wompi
  v_restaurant_payout := GREATEST(0, v_total - v_platform_fee - v_gateway_fee);

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
    payment_method,
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
    v_normalized_method,
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

  INSERT INTO public.payments (
    order_id,
    provider,
    provider_reference,
    amount_cop,
    platform_fee_cop,
    gateway_fee_cop,
    gateway_iva_cop,
    restaurant_payout_cop,
    status
  ) VALUES (
    v_order_id,
    v_normalized_method,
    v_order_id::TEXT,
    v_total,
    v_platform_fee,
    v_gateway_fee,
    v_gateway_iva,
    v_restaurant_payout,
    'pending'
  );

  RETURN v_order_id;
END;
$$;

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

    IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id) THEN
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
      WHERE order_id = p_order_id
        AND status = 'pending';
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
        v_payment_method,
        p_order_id::TEXT,
        v_total_cop,
        v_platform_fee,
        v_gateway_fee,
        v_gateway_iva,
        v_payout,
        'approved',
        v_user_uid,
        NOW()
      );
    END IF;

    PERFORM public.evaluate_restaurant_cash_limit_lock(v_tenant_id);
  ELSIF p_next_status = 'cancelled' THEN
    UPDATE public.payments
    SET status = 'voided'
    WHERE order_id = p_order_id
      AND status = 'pending';
  END IF;

  RETURN TRUE;
END;
$$;

-- 5. ACTUALIZAR get_restaurant_financial_summary (INCLUYE wompi_gateway_fees Y 3% LIBRE)
DROP FUNCTION IF EXISTS public.get_restaurant_financial_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_restaurant_financial_summary(
  p_restaurant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  gross_sales NUMERIC,
  net_restaurant NUMERIC,
  platform_commission NUMERIC,
  wompi_gateway_fees NUMERIC,
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
      COALESCE(p.provider, o.payment_method, 'cash') AS pay_method,
      (o.status != 'cancelled' AND (o.status = 'delivered' OR p.status = 'approved')) AS is_completed_sale,
      ROUND(o.total_cop * v_commission_rate)::NUMERIC AS calc_platform_fee,
      public.calculate_wompi_gateway_fee_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))::NUMERIC AS calc_wompi_fee,
      GREATEST(
        0,
        o.total_cop
        - ROUND(o.total_cop * v_commission_rate)::INTEGER
        - public.calculate_wompi_gateway_fee_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))
      )::NUMERIC AS calc_restaurant_payout
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT pay.status, pay.provider
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
    COALESCE(SUM(total_cop) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS gross_sales,
    COALESCE(SUM(calc_restaurant_payout) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS net_restaurant,
    COALESCE(SUM(calc_platform_fee) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS platform_commission,
    COALESCE(SUM(calc_wompi_fee) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS wompi_gateway_fees,
    COUNT(*) FILTER (WHERE is_completed_sale)::BIGINT AS paid_orders_count,
    COUNT(*) FILTER (WHERE order_status != 'cancelled' AND NOT is_completed_sale)::BIGINT AS pending_orders_count,
    COUNT(*) FILTER (WHERE order_status = 'cancelled')::BIGINT AS cancelled_orders_count,
    COALESCE(SUM(total_cop) FILTER (WHERE order_status = 'cancelled'), 0)::NUMERIC AS refunds,
    COALESCE(SUM((total_cop * 0.30) - (calc_platform_fee + calc_wompi_fee)) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS savings_vs_30,
    COALESCE(SUM(delivery_fee_cop) FILTER (WHERE is_completed_sale), 0)::NUMERIC AS delivery_fees
  FROM order_metrics;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_financial_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 6. ACTUALIZAR get_restaurant_settlement_balance CON COSTO PASARELA WOMPI + IVA
DROP FUNCTION IF EXISTS public.get_restaurant_settlement_balance(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_restaurant_settlement_balance(
  p_restaurant_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT '2024-01-01T00:00:00Z'::TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  period_gross_sales_cop BIGINT,
  period_cash_sales_cop BIGINT,
  period_digital_sales_cop BIGINT,
  period_cash_orders_count BIGINT,
  period_digital_orders_count BIGINT,
  period_cash_commission_cop BIGINT,
  period_digital_commission_cop BIGINT,
  period_wompi_gateway_fee_cop BIGINT,
  period_wompi_gateway_iva_cop BIGINT,
  period_digital_net_97_cop BIGINT,
  period_auto_offset_cop BIGINT,
  period_net_payout_to_restaurant_cop BIGINT,
  period_net_debt_to_platform_cop BIGINT,
  all_time_cash_sales_cop BIGINT,
  all_time_digital_sales_cop BIGINT,
  all_time_cash_commission_cop BIGINT,
  all_time_digital_commission_cop BIGINT,
  all_time_wompi_gateway_fee_cop BIGINT,
  all_time_digital_net_97_cop BIGINT,
  all_time_auto_offset_cop BIGINT,
  total_payouts_sent_to_restaurant_cop BIGINT,
  total_payments_received_from_restaurant_cop BIGINT,
  live_pending_payout_to_restaurant_cop BIGINT,
  live_pending_debt_to_platform_cop BIGINT,
  cash_commission_limit_cop INTEGER,
  auto_lock_cash_on_limit BOOLEAN,
  accepts_cash BOOLEAN,
  is_cash_locked_by_limit BOOLEAN,
  payout_bank_name TEXT,
  payout_account_type TEXT,
  payout_account_number TEXT,
  payout_account_holder TEXT,
  payout_document_type TEXT,
  payout_document_number TEXT,
  wompi_merchant_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate NUMERIC := 0.03;
  v_limit_cop INTEGER := 50000;
  v_auto_lock BOOLEAN := TRUE;
  v_accepts_cash BOOLEAN := TRUE;
  v_bank_name TEXT;
  v_acc_type TEXT;
  v_acc_num TEXT;
  v_acc_holder TEXT;
  v_doc_type TEXT;
  v_doc_num TEXT;
  v_wompi_id TEXT;
BEGIN
  IF NOT (
    public.is_restaurant_owner(auth.uid(), p_restaurant_id)
    OR public.is_restaurant_member(auth.uid(), p_restaurant_id)
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT
    COALESCE(r.commission_rate, 0.03),
    COALESCE(r.cash_commission_limit_cop, 50000),
    COALESCE(r.auto_lock_cash_on_limit, TRUE),
    COALESCE(r.accepts_cash, TRUE),
    r.payout_bank_name,
    COALESCE(r.payout_account_type, 'ahorros'),
    r.payout_account_number,
    r.payout_account_holder,
    COALESCE(r.payout_document_type, 'NIT'),
    r.payout_document_number,
    r.wompi_merchant_id
  INTO
    v_commission_rate,
    v_limit_cop,
    v_auto_lock,
    v_accepts_cash,
    v_bank_name,
    v_acc_type,
    v_acc_num,
    v_acc_holder,
    v_doc_type,
    v_doc_num,
    v_wompi_id
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id;

  RETURN QUERY
  WITH completed_orders AS (
    SELECT
      o.id,
      o.created_at,
      o.total_cop::BIGINT AS total_cop,
      (COALESCE(p.provider, o.payment_method, 'cash') = 'cash') AS is_cash,
      (o.created_at >= p_start_date AND o.created_at <= p_end_date) AS in_period,
      ROUND(o.total_cop * v_commission_rate)::BIGINT AS fee_cop,
      public.calculate_wompi_gateway_fee_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))::BIGINT AS wompi_fee_cop,
      public.calculate_wompi_gateway_iva_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))::BIGINT AS wompi_iva_cop,
      GREATEST(
        0,
        o.total_cop
        - ROUND(o.total_cop * v_commission_rate)::INTEGER
        - public.calculate_wompi_gateway_fee_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))
      )::BIGINT AS payout_cop
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT pay.status, pay.provider
      FROM public.payments pay
      WHERE pay.order_id = o.id
      ORDER BY (pay.status = 'approved') DESC, pay.created_at DESC
      LIMIT 1
    ) p ON TRUE
    WHERE o.restaurant_id = p_restaurant_id
      AND o.status != 'cancelled'
      AND (o.status = 'delivered' OR p.status = 'approved')
  ),
  agg AS (
    SELECT
      COALESCE(SUM(total_cop) FILTER (WHERE in_period), 0)::BIGINT AS p_gross,
      COALESCE(SUM(total_cop) FILTER (WHERE in_period AND is_cash), 0)::BIGINT AS p_cash_sales,
      COALESCE(SUM(total_cop) FILTER (WHERE in_period AND NOT is_cash), 0)::BIGINT AS p_dig_sales,
      COUNT(*) FILTER (WHERE in_period AND is_cash)::BIGINT AS p_cash_cnt,
      COUNT(*) FILTER (WHERE in_period AND NOT is_cash)::BIGINT AS p_dig_cnt,
      COALESCE(SUM(fee_cop) FILTER (WHERE in_period AND is_cash), 0)::BIGINT AS p_cash_fee,
      COALESCE(SUM(fee_cop) FILTER (WHERE in_period AND NOT is_cash), 0)::BIGINT AS p_dig_fee,
      COALESCE(SUM(wompi_fee_cop) FILTER (WHERE in_period AND NOT is_cash), 0)::BIGINT AS p_wompi_fee,
      COALESCE(SUM(wompi_iva_cop) FILTER (WHERE in_period AND NOT is_cash), 0)::BIGINT AS p_wompi_iva,
      COALESCE(SUM(payout_cop) FILTER (WHERE in_period AND NOT is_cash), 0)::BIGINT AS p_dig_net,
      -- All time
      COALESCE(SUM(total_cop) FILTER (WHERE is_cash), 0)::BIGINT AS all_cash_sales,
      COALESCE(SUM(total_cop) FILTER (WHERE NOT is_cash), 0)::BIGINT AS all_dig_sales,
      COALESCE(SUM(fee_cop) FILTER (WHERE is_cash), 0)::BIGINT AS all_cash_fee,
      COALESCE(SUM(fee_cop) FILTER (WHERE NOT is_cash), 0)::BIGINT AS all_dig_fee,
      COALESCE(SUM(wompi_fee_cop) FILTER (WHERE NOT is_cash), 0)::BIGINT AS all_wompi_fee,
      COALESCE(SUM(payout_cop) FILTER (WHERE NOT is_cash), 0)::BIGINT AS all_dig_net
    FROM completed_orders
  ),
  settlements_agg AS (
    SELECT
      COALESCE(SUM(net_amount_cop) FILTER (WHERE settlement_type = 'platform_payout_to_restaurant' AND status = 'completed'), 0)::BIGINT AS s_payouts,
      COALESCE(SUM(net_amount_cop) FILTER (WHERE settlement_type = 'restaurant_payment_to_platform' AND status = 'completed'), 0)::BIGINT AS s_payments
    FROM public.restaurant_settlements
    WHERE restaurant_id = p_restaurant_id
  )
  SELECT
    agg.p_gross,
    agg.p_cash_sales,
    agg.p_dig_sales,
    agg.p_cash_cnt,
    agg.p_dig_cnt,
    agg.p_cash_fee,
    agg.p_dig_fee,
    agg.p_wompi_fee,
    agg.p_wompi_iva,
    agg.p_dig_net,
    LEAST(agg.p_dig_net, agg.p_cash_fee)::BIGINT AS period_auto_offset_cop,
    GREATEST(0::BIGINT, agg.p_dig_net - agg.p_cash_fee)::BIGINT AS period_net_payout_to_restaurant_cop,
    GREATEST(0::BIGINT, agg.p_cash_fee - agg.p_dig_net)::BIGINT AS period_net_debt_to_platform_cop,
    agg.all_cash_sales,
    agg.all_dig_sales,
    agg.all_cash_fee,
    agg.all_dig_fee,
    agg.all_wompi_fee,
    agg.all_dig_net,
    LEAST(agg.all_dig_net, agg.all_cash_fee)::BIGINT AS all_time_auto_offset_cop,
    settlements_agg.s_payouts,
    settlements_agg.s_payments,
    GREATEST(0::BIGINT, (agg.all_dig_net - agg.all_cash_fee) - settlements_agg.s_payouts + settlements_agg.s_payments)::BIGINT AS live_pending_payout_to_restaurant_cop,
    GREATEST(0::BIGINT, -((agg.all_dig_net - agg.all_cash_fee) - settlements_agg.s_payouts + settlements_agg.s_payments))::BIGINT AS live_pending_debt_to_platform_cop,
    v_limit_cop,
    v_auto_lock,
    v_accepts_cash,
    (v_limit_cop > 0 AND GREATEST(0::BIGINT, -((agg.all_dig_net - agg.all_cash_fee) - settlements_agg.s_payouts + settlements_agg.s_payments)) >= v_limit_cop) AS is_cash_locked_by_limit,
    v_bank_name,
    v_acc_type,
    v_acc_num,
    v_acc_holder,
    v_doc_type,
    v_doc_num,
    v_wompi_id
  FROM agg, settlements_agg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_settlement_balance(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 7. ACTUALIZAR get_all_restaurants_settlement_overview PARA SUPERADMIN (SEPARANDO 3% LIBRE Y WOMPI)
DROP FUNCTION IF EXISTS public.get_all_restaurants_settlement_overview();

CREATE OR REPLACE FUNCTION public.get_all_restaurants_settlement_overview()
RETURNS TABLE (
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_slug TEXT,
  commission_rate NUMERIC,
  accepts_cash BOOLEAN,
  cash_commission_limit_cop INTEGER,
  completed_orders_count BIGINT,
  cash_orders_count BIGINT,
  digital_orders_count BIGINT,
  gross_sales_cop BIGINT,
  cash_sales_cop BIGINT,
  digital_sales_cop BIGINT,
  cash_commission_cop BIGINT,
  digital_commission_cop BIGINT,
  total_commission_cop BIGINT,
  wompi_gateway_fee_cop BIGINT,
  digital_net_97_cop BIGINT,
  auto_offset_cop BIGINT,
  total_payouts_sent_cop BIGINT,
  total_payments_received_cop BIGINT,
  live_pending_payout_to_restaurant_cop BIGINT,
  live_pending_debt_to_platform_cop BIGINT,
  pending_review_settlements_count BIGINT,
  payout_bank_name TEXT,
  payout_account_type TEXT,
  payout_account_number TEXT,
  payout_account_holder TEXT,
  payout_document_type TEXT,
  payout_document_number TEXT,
  wompi_merchant_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: platform_admin required';
  END IF;

  RETURN QUERY
  WITH completed_orders AS (
    SELECT
      o.restaurant_id,
      o.total_cop::BIGINT AS total_cop,
      (COALESCE(p.provider, o.payment_method, 'cash') = 'cash') AS is_cash,
      ROUND(o.total_cop * COALESCE(r.commission_rate, 0.03))::BIGINT AS fee_cop,
      public.calculate_wompi_gateway_fee_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))::BIGINT AS wompi_fee_cop,
      GREATEST(
        0,
        o.total_cop
        - ROUND(o.total_cop * COALESCE(r.commission_rate, 0.03))::INTEGER
        - public.calculate_wompi_gateway_fee_cop(o.total_cop, COALESCE(p.provider, o.payment_method, 'cash'))
      )::BIGINT AS payout_cop
    FROM public.orders o
    JOIN public.restaurants r ON r.id = o.restaurant_id
    LEFT JOIN LATERAL (
      SELECT pay.status, pay.provider
      FROM public.payments pay
      WHERE pay.order_id = o.id
      ORDER BY (pay.status = 'approved') DESC, pay.created_at DESC
      LIMIT 1
    ) p ON TRUE
    WHERE o.status != 'cancelled'
      AND (o.status = 'delivered' OR p.status = 'approved')
  ),
  orders_by_rest AS (
    SELECT
      co.restaurant_id,
      COUNT(*)::BIGINT AS total_cnt,
      COUNT(*) FILTER (WHERE co.is_cash)::BIGINT AS cash_cnt,
      COUNT(*) FILTER (WHERE NOT co.is_cash)::BIGINT AS dig_cnt,
      COALESCE(SUM(co.total_cop), 0)::BIGINT AS gross_cop,
      COALESCE(SUM(co.total_cop) FILTER (WHERE co.is_cash), 0)::BIGINT AS cash_cop,
      COALESCE(SUM(co.total_cop) FILTER (WHERE NOT co.is_cash), 0)::BIGINT AS dig_cop,
      COALESCE(SUM(co.fee_cop) FILTER (WHERE co.is_cash), 0)::BIGINT AS cash_fee_cop,
      COALESCE(SUM(co.fee_cop) FILTER (WHERE NOT co.is_cash), 0)::BIGINT AS dig_fee_cop,
      COALESCE(SUM(co.fee_cop), 0)::BIGINT AS total_fee_cop,
      COALESCE(SUM(co.wompi_fee_cop) FILTER (WHERE NOT co.is_cash), 0)::BIGINT AS wompi_fee_cop,
      COALESCE(SUM(co.payout_cop) FILTER (WHERE NOT co.is_cash), 0)::BIGINT AS dig_net_cop
    FROM completed_orders co
    GROUP BY co.restaurant_id
  ),
  settlements_by_rest AS (
    SELECT
      rs.restaurant_id,
      COALESCE(SUM(rs.net_amount_cop) FILTER (WHERE rs.settlement_type = 'platform_payout_to_restaurant' AND rs.status = 'completed'), 0)::BIGINT AS s_payouts,
      COALESCE(SUM(rs.net_amount_cop) FILTER (WHERE rs.settlement_type = 'restaurant_payment_to_platform' AND rs.status = 'completed'), 0)::BIGINT AS s_payments,
      COUNT(*) FILTER (WHERE rs.status = 'pending_review')::BIGINT AS s_pending_review
    FROM public.restaurant_settlements rs
    GROUP BY rs.restaurant_id
  )
  SELECT
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.slug AS restaurant_slug,
    COALESCE(r.commission_rate, 0.03) AS commission_rate,
    COALESCE(r.accepts_cash, TRUE) AS accepts_cash,
    COALESCE(r.cash_commission_limit_cop, 50000) AS cash_commission_limit_cop,
    COALESCE(obr.total_cnt, 0)::BIGINT AS completed_orders_count,
    COALESCE(obr.cash_cnt, 0)::BIGINT AS cash_orders_count,
    COALESCE(obr.dig_cnt, 0)::BIGINT AS digital_orders_count,
    COALESCE(obr.gross_cop, 0)::BIGINT AS gross_sales_cop,
    COALESCE(obr.cash_cop, 0)::BIGINT AS cash_sales_cop,
    COALESCE(obr.dig_cop, 0)::BIGINT AS digital_sales_cop,
    COALESCE(obr.cash_fee_cop, 0)::BIGINT AS cash_commission_cop,
    COALESCE(obr.dig_fee_cop, 0)::BIGINT AS digital_commission_cop,
    COALESCE(obr.total_fee_cop, 0)::BIGINT AS total_commission_cop,
    COALESCE(obr.wompi_fee_cop, 0)::BIGINT AS wompi_gateway_fee_cop,
    COALESCE(obr.dig_net_cop, 0)::BIGINT AS digital_net_97_cop,
    LEAST(COALESCE(obr.dig_net_cop, 0), COALESCE(obr.cash_fee_cop, 0))::BIGINT AS auto_offset_cop,
    COALESCE(sbr.s_payouts, 0)::BIGINT AS total_payouts_sent_cop,
    COALESCE(sbr.s_payments, 0)::BIGINT AS total_payments_received_cop,
    GREATEST(
      0::BIGINT,
      (COALESCE(obr.dig_net_cop, 0) - COALESCE(obr.cash_fee_cop, 0))
      - COALESCE(sbr.s_payouts, 0)
      + COALESCE(sbr.s_payments, 0)
    )::BIGINT AS live_pending_payout_to_restaurant_cop,
    GREATEST(
      0::BIGINT,
      -(
        (COALESCE(obr.dig_net_cop, 0) - COALESCE(obr.cash_fee_cop, 0))
        - COALESCE(sbr.s_payouts, 0)
        + COALESCE(sbr.s_payments, 0)
      )
    )::BIGINT AS live_pending_debt_to_platform_cop,
    COALESCE(sbr.s_pending_review, 0)::BIGINT AS pending_review_settlements_count,
    r.payout_bank_name,
    COALESCE(r.payout_account_type, 'ahorros') AS payout_account_type,
    r.payout_account_number,
    r.payout_account_holder,
    COALESCE(r.payout_document_type, 'NIT') AS payout_document_type,
    r.payout_document_number,
    r.wompi_merchant_id
  FROM public.restaurants r
  LEFT JOIN orders_by_rest obr ON obr.restaurant_id = r.id
  LEFT JOIN settlements_by_rest sbr ON sbr.restaurant_id = r.id
  ORDER BY COALESCE(obr.gross_cop, 0) DESC, r.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_restaurants_settlement_overview() TO authenticated;
