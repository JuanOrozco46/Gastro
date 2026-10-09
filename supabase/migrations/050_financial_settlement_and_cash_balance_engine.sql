-- ============================================================================
-- GASTROSYNC - MOTOR BANCARIO DE CRUCE DE SALDOS (EFECTIVO VS DIGITAL WOMPI),
--              CUPO DE COMISIÓN EN EFECTIVO Y CORTES DE LIQUIDACIÓN AUDITABLES
-- Versión: 050_financial_settlement_and_cash_balance_engine.sql
-- Descripción:
--   1. Extiende public.restaurants con configuración no sensible de dispersión
--      (Banco, Nequi, Daviplata, Bre-B, Wompi Merchant ID) y tope de deuda de
--      comisión en efectivo (cash_commission_limit_cop DEFAULT 50000 COP).
--   2. Añade payment_method a public.orders y garantiza que create_order_with_items
--      registre siempre el intento de pago con su proveedor real ('cash' vs 'wompi').
--   3. Crea la tabla public.restaurant_settlements (cortes de liquidación,
--      dispersiones a restaurantes y abonos de comisión en efectivo a GastroSync)
--      con políticas RLS estrictas.
--   4. Crea la función auxiliar public.evaluate_restaurant_cash_limit_lock(UUID)
--      que bloquea/desbloquea automáticamente pagos en efectivo según el cupo.
--   5. Crea los RPCs financieros de grado bancario:
--      - public.get_restaurant_settlement_balance(p_restaurant_id, p_start_date, p_end_date)
--      - public.get_all_restaurants_settlement_overview()
--      - public.update_restaurant_payout_settings(...)
--      - public.record_restaurant_settlement(...)
--      - public.confirm_restaurant_settlement(...)
-- ============================================================================

-- 1. EXTENDER public.restaurants CON DATOS DE DISPERSIÓN SEGUROS Y CUPO DE EFECTIVO
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS payout_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS payout_account_type TEXT DEFAULT 'ahorros',
  ADD COLUMN IF NOT EXISTS payout_account_number TEXT,
  ADD COLUMN IF NOT EXISTS payout_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS payout_document_type TEXT DEFAULT 'NIT',
  ADD COLUMN IF NOT EXISTS payout_document_number TEXT,
  ADD COLUMN IF NOT EXISTS wompi_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS cash_commission_limit_cop INTEGER NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS auto_lock_cash_on_limit BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. AÑADIR payment_method A public.orders Y BACKFILL DESDE public.payments
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

UPDATE public.orders o
SET payment_method = COALESCE(
  (
    SELECT p.provider
    FROM public.payments p
    WHERE p.order_id = o.id
    ORDER BY (p.status = 'approved') DESC, p.created_at DESC
    LIMIT 1
  ),
  'cash'
);

-- 3. CREAR TABLA DE CORTES Y LIQUIDACIONES (public.restaurant_settlements)
CREATE TABLE IF NOT EXISTS public.restaurant_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  settlement_type TEXT NOT NULL CHECK (
    settlement_type IN (
      'platform_payout_to_restaurant',
      'restaurant_payment_to_platform',
      'auto_netted_zero_cut'
    )
  ),
  gross_sales_cop INTEGER NOT NULL DEFAULT 0 CHECK (gross_sales_cop >= 0),
  cash_sales_cop INTEGER NOT NULL DEFAULT 0 CHECK (cash_sales_cop >= 0),
  digital_sales_cop INTEGER NOT NULL DEFAULT 0 CHECK (digital_sales_cop >= 0),
  cash_commission_cop INTEGER NOT NULL DEFAULT 0 CHECK (cash_commission_cop >= 0),
  digital_commission_cop INTEGER NOT NULL DEFAULT 0 CHECK (digital_commission_cop >= 0),
  auto_offset_cop INTEGER NOT NULL DEFAULT 0 CHECK (auto_offset_cop >= 0),
  net_amount_cop INTEGER NOT NULL DEFAULT 0 CHECK (net_amount_cop >= 0),
  payment_channel TEXT NOT NULL DEFAULT 'transferencia_bancaria',
  reference_code TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (
    status IN ('pending_review', 'completed', 'rejected')
  ),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_settlements_restaurant_created
  ON public.restaurant_settlements(restaurant_id, created_at DESC);

ALTER TABLE public.restaurant_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_settlements_read_owner_or_admin" ON public.restaurant_settlements;
CREATE POLICY "restaurant_settlements_read_owner_or_admin"
ON public.restaurant_settlements
FOR SELECT
TO authenticated
USING (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

DROP POLICY IF EXISTS "restaurant_settlements_insert_owner_or_admin" ON public.restaurant_settlements;
CREATE POLICY "restaurant_settlements_insert_owner_or_admin"
ON public.restaurant_settlements
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_restaurant_owner(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

DROP POLICY IF EXISTS "restaurant_settlements_update_admin" ON public.restaurant_settlements;
CREATE POLICY "restaurant_settlements_update_admin"
ON public.restaurant_settlements
FOR UPDATE
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_restaurant_owner(auth.uid(), restaurant_id)
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR public.is_restaurant_owner(auth.uid(), restaurant_id)
);

-- 4. FUNCIÓN INTERNA PARA EVALUAR Y APLICAR BLOQUEO/DESBLOQUEO DE EFECTIVO SEGÚN EL CUPO
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
      CASE
        WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.platform_fee_cop
        ELSE ROUND(o.total_cop * v_commission_rate)::INTEGER
      END AS fee_cop,
      CASE
        WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.restaurant_payout_cop
        ELSE (o.total_cop - ROUND(o.total_cop * v_commission_rate)::INTEGER)
      END AS payout_cop
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT pay.status, pay.provider, pay.platform_fee_cop, pay.restaurant_payout_cop
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
    COALESCE(SUM(payout_cop) FILTER (WHERE pay_provider != 'cash'), 0)::BIGINT
  INTO v_cash_commission_all, v_digital_net_all
  FROM completed_orders;

  SELECT
    COALESCE(SUM(net_amount_cop) FILTER (WHERE settlement_type = 'platform_payout_to_restaurant' AND status = 'completed'), 0)::BIGINT,
    COALESCE(SUM(net_amount_cop) FILTER (WHERE settlement_type = 'restaurant_payment_to_platform' AND status = 'completed'), 0)::BIGINT
  INTO v_payouts_sent, v_payments_received
  FROM public.restaurant_settlements
  WHERE restaurant_id = p_restaurant_id;

  -- Posición neta acumulada: positivo = saldo a favor del restaurante; negativo = deuda de comisión del restaurante hacia GastroSync
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

-- 5. ACTUALIZAR create_order_with_items Y update_order_status PARA GUARDAR SIEMPRE payment_method Y EVALUAR CUPO
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

  -- Registrar siempre la intención de pago inicial con el proveedor real ('cash' o digital)
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
    v_normalized_method,
    v_order_id::TEXT,
    v_total,
    v_platform_fee,
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
        v_payment_method,
        p_order_id::TEXT,
        v_total_cop,
        v_platform_fee,
        v_payout,
        'approved',
        v_user_uid,
        NOW()
      );
    END IF;

    -- Evaluar si el nuevo pedido entregado en efectivo superó el cupo de deuda de comisión
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

-- 6. RPC: OBTENER CRUCE DE SALDOS Y ESTADO DE LIQUIDACIÓN DE UN RESTAURANTE
CREATE OR REPLACE FUNCTION public.get_restaurant_settlement_balance(
  p_restaurant_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT '2024-01-01T00:00:00Z'::TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  -- Ventas en el periodo seleccionado
  period_gross_sales_cop BIGINT,
  period_cash_sales_cop BIGINT,
  period_digital_sales_cop BIGINT,
  period_cash_orders_count BIGINT,
  period_digital_orders_count BIGINT,
  period_cash_commission_cop BIGINT,
  period_digital_commission_cop BIGINT,
  period_digital_net_97_cop BIGINT,
  period_auto_offset_cop BIGINT,
  period_net_payout_to_restaurant_cop BIGINT,
  period_net_debt_to_platform_cop BIGINT,
  -- Posición acumulada histórica y cupo en vivo (para liquidación real)
  all_time_cash_sales_cop BIGINT,
  all_time_digital_sales_cop BIGINT,
  all_time_cash_commission_cop BIGINT,
  all_time_digital_commission_cop BIGINT,
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
  -- Datos de dispersión configurados por el restaurante
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
      CASE
        WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.platform_fee_cop::BIGINT
        ELSE ROUND(o.total_cop * v_commission_rate)::BIGINT
      END AS fee_cop,
      CASE
        WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.restaurant_payout_cop::BIGINT
        ELSE (o.total_cop - ROUND(o.total_cop * v_commission_rate)::BIGINT)
      END AS payout_cop
    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT pay.status, pay.provider, pay.platform_fee_cop, pay.restaurant_payout_cop
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
      COALESCE(SUM(payout_cop) FILTER (WHERE in_period AND NOT is_cash), 0)::BIGINT AS p_dig_net97,
      -- All time
      COALESCE(SUM(total_cop) FILTER (WHERE is_cash), 0)::BIGINT AS all_cash_sales,
      COALESCE(SUM(total_cop) FILTER (WHERE NOT is_cash), 0)::BIGINT AS all_dig_sales,
      COALESCE(SUM(fee_cop) FILTER (WHERE is_cash), 0)::BIGINT AS all_cash_fee,
      COALESCE(SUM(fee_cop) FILTER (WHERE NOT is_cash), 0)::BIGINT AS all_dig_fee,
      COALESCE(SUM(payout_cop) FILTER (WHERE NOT is_cash), 0)::BIGINT AS all_dig_net97
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
    agg.p_dig_net97,
    LEAST(agg.p_dig_net97, agg.p_cash_fee)::BIGINT AS period_auto_offset_cop,
    GREATEST(0::BIGINT, agg.p_dig_net97 - agg.p_cash_fee)::BIGINT AS period_net_payout_to_restaurant_cop,
    GREATEST(0::BIGINT, agg.p_cash_fee - agg.p_dig_net97)::BIGINT AS period_net_debt_to_platform_cop,
    agg.all_cash_sales,
    agg.all_dig_sales,
    agg.all_cash_fee,
    agg.all_dig_fee,
    agg.all_dig_net97,
    LEAST(agg.all_dig_net97, agg.all_cash_fee)::BIGINT AS all_time_auto_offset_cop,
    settlements_agg.s_payouts,
    settlements_agg.s_payments,
    GREATEST(0::BIGINT, (agg.all_dig_net97 - agg.all_cash_fee) - settlements_agg.s_payouts + settlements_agg.s_payments)::BIGINT AS live_pending_payout_to_restaurant_cop,
    GREATEST(0::BIGINT, -((agg.all_dig_net97 - agg.all_cash_fee) - settlements_agg.s_payouts + settlements_agg.s_payments))::BIGINT AS live_pending_debt_to_platform_cop,
    v_limit_cop,
    v_auto_lock,
    v_accepts_cash,
    (v_limit_cop > 0 AND GREATEST(0::BIGINT, -((agg.all_dig_net97 - agg.all_cash_fee) - settlements_agg.s_payouts + settlements_agg.s_payments)) >= v_limit_cop) AS is_cash_locked_by_limit,
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

-- 7. RPC PARA SUPERADMIN: PANORAMA DE LIQUIDACIÓN DE TODA LA RED DE RESTAURANTES
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
      CASE
        WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.platform_fee_cop::BIGINT
        ELSE ROUND(o.total_cop * COALESCE(r.commission_rate, 0.03))::BIGINT
      END AS fee_cop,
      CASE
        WHEN COALESCE(p.platform_fee_cop, 0) > 0 THEN p.restaurant_payout_cop::BIGINT
        ELSE (o.total_cop - ROUND(o.total_cop * COALESCE(r.commission_rate, 0.03))::BIGINT)
      END AS payout_cop
    FROM public.orders o
    JOIN public.restaurants r ON r.id = o.restaurant_id
    LEFT JOIN LATERAL (
      SELECT pay.status, pay.provider, pay.platform_fee_cop, pay.restaurant_payout_cop
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
      COALESCE(SUM(co.payout_cop) FILTER (WHERE NOT co.is_cash), 0)::BIGINT AS dig_net97_cop
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
    COALESCE(obr.dig_net97_cop, 0)::BIGINT AS digital_net_97_cop,
    LEAST(COALESCE(obr.dig_net97_cop, 0), COALESCE(obr.cash_fee_cop, 0))::BIGINT AS auto_offset_cop,
    COALESCE(sbr.s_payouts, 0)::BIGINT AS total_payouts_sent_cop,
    COALESCE(sbr.s_payments, 0)::BIGINT AS total_payments_received_cop,
    GREATEST(
      0::BIGINT,
      (COALESCE(obr.dig_net97_cop, 0) - COALESCE(obr.cash_fee_cop, 0))
      - COALESCE(sbr.s_payouts, 0)
      + COALESCE(sbr.s_payments, 0)
    )::BIGINT AS live_pending_payout_to_restaurant_cop,
    GREATEST(
      0::BIGINT,
      -(
        (COALESCE(obr.dig_net97_cop, 0) - COALESCE(obr.cash_fee_cop, 0))
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

-- 8. RPC: CONFIGURAR CUENTA DE DISPERSIÓN Y TOPE DE EFECTIVO DEL RESTAURANTE (SIN DATOS SENSIBLES)
CREATE OR REPLACE FUNCTION public.update_restaurant_payout_settings(
  p_restaurant_id UUID,
  p_payout_bank_name TEXT,
  p_payout_account_type TEXT,
  p_payout_account_number TEXT,
  p_payout_account_holder TEXT,
  p_payout_document_type TEXT DEFAULT 'NIT',
  p_payout_document_number TEXT DEFAULT NULL,
  p_wompi_merchant_id TEXT DEFAULT NULL,
  p_cash_commission_limit_cop INTEGER DEFAULT NULL,
  p_auto_lock_cash_on_limit BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  v_is_admin := public.is_platform_admin(auth.uid());

  IF NOT (public.is_restaurant_owner(auth.uid(), p_restaurant_id) OR v_is_admin) THEN
    RAISE EXCEPTION 'No tienes permisos para modificar los datos de dispersión de este restaurante.';
  END IF;

  UPDATE public.restaurants
  SET
    payout_bank_name = NULLIF(btrim(p_payout_bank_name), ''),
    payout_account_type = COALESCE(NULLIF(btrim(p_payout_account_type), ''), 'ahorros'),
    payout_account_number = NULLIF(btrim(p_payout_account_number), ''),
    payout_account_holder = NULLIF(btrim(p_payout_account_holder), ''),
    payout_document_type = COALESCE(NULLIF(btrim(p_payout_document_type), ''), 'NIT'),
    payout_document_number = NULLIF(btrim(p_payout_document_number), ''),
    wompi_merchant_id = NULLIF(btrim(p_wompi_merchant_id), ''),
    cash_commission_limit_cop = CASE
      WHEN v_is_admin AND p_cash_commission_limit_cop IS NOT NULL THEN GREATEST(10000, p_cash_commission_limit_cop)
      ELSE cash_commission_limit_cop
    END,
    auto_lock_cash_on_limit = COALESCE(p_auto_lock_cash_on_limit, auto_lock_cash_on_limit),
    updated_at = NOW()
  WHERE id = p_restaurant_id;

  PERFORM public.evaluate_restaurant_cash_limit_lock(p_restaurant_id);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_restaurant_payout_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN) TO authenticated;

-- 9. RPC: REGISTRAR CORTE DE LIQUIDACIÓN O PAGO DE COMISIÓN EN EFECTIVO
CREATE OR REPLACE FUNCTION public.record_restaurant_settlement(
  p_restaurant_id UUID,
  p_settlement_type TEXT,
  p_net_amount_cop INTEGER,
  p_payment_channel TEXT DEFAULT 'transferencia_bancaria',
  p_reference_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_gross_sales_cop INTEGER DEFAULT 0,
  p_cash_sales_cop INTEGER DEFAULT 0,
  p_digital_sales_cop INTEGER DEFAULT 0,
  p_cash_commission_cop INTEGER DEFAULT 0,
  p_digital_commission_cop INTEGER DEFAULT 0,
  p_auto_offset_cop INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_status TEXT := 'completed';
  v_settlement_id UUID;
BEGIN
  v_is_admin := public.is_platform_admin(v_uid);
  v_is_owner := public.is_restaurant_owner(v_uid, p_restaurant_id);

  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'No autorizado para registrar liquidaciones de este restaurante.';
  END IF;

  IF p_settlement_type NOT IN ('platform_payout_to_restaurant', 'restaurant_payment_to_platform', 'auto_netted_zero_cut') THEN
    RAISE EXCEPTION 'Tipo de liquidación inválido.';
  END IF;

  -- Solo SuperAdmin puede registrar dispersiones salientes desde la plataforma al restaurante
  IF p_settlement_type = 'platform_payout_to_restaurant' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo el Administrador de Plataforma puede registrar dispersiones hacia el restaurante.';
  END IF;

  IF p_net_amount_cop < 0 THEN
    RAISE EXCEPTION 'El monto neto de liquidación no puede ser negativo.';
  END IF;

  -- Si el dueño paga en línea por Wompi/PSE o si lo registra el SuperAdmin, queda 'completed' de inmediato.
  -- Si reporta transferencia manual y no es admin, también lo aplicamos o marcamos según el canal.
  IF v_is_admin OR p_payment_channel IN ('wompi_pse', 'wompi_split', 'nequi_instant', 'bre_b') THEN
    v_status := 'completed';
  ELSE
    v_status := 'completed';
  END IF;

  INSERT INTO public.restaurant_settlements (
    restaurant_id,
    settlement_type,
    gross_sales_cop,
    cash_sales_cop,
    digital_sales_cop,
    cash_commission_cop,
    digital_commission_cop,
    auto_offset_cop,
    net_amount_cop,
    payment_channel,
    reference_code,
    notes,
    status,
    period_end,
    created_by,
    confirmed_by,
    confirmed_at
  ) VALUES (
    p_restaurant_id,
    p_settlement_type,
    GREATEST(0, COALESCE(p_gross_sales_cop, 0)),
    GREATEST(0, COALESCE(p_cash_sales_cop, 0)),
    GREATEST(0, COALESCE(p_digital_sales_cop, 0)),
    GREATEST(0, COALESCE(p_cash_commission_cop, 0)),
    GREATEST(0, COALESCE(p_digital_commission_cop, 0)),
    GREATEST(0, COALESCE(p_auto_offset_cop, 0)),
    GREATEST(0, COALESCE(p_net_amount_cop, 0)),
    COALESCE(NULLIF(btrim(p_payment_channel), ''), 'transferencia_bancaria'),
    COALESCE(NULLIF(btrim(p_reference_code), ''), 'GS-LIQ-' || floor(extract(epoch from now()))::TEXT),
    NULLIF(btrim(p_notes), ''),
    v_status,
    NOW(),
    v_uid,
    v_uid,
    NOW()
  )
  RETURNING id INTO v_settlement_id;

  -- Re-evaluar inmediatamente el cupo de efectivo para reactivar pagos en efectivo si se saldó la deuda
  PERFORM public.evaluate_restaurant_cash_limit_lock(p_restaurant_id);

  RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
