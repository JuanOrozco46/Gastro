-- ============================================================================
-- GASTROSYNC - AISLAMIENTO ESTRICTO DE PEDIDOS (CLIENTES Y RESTAURANTES) Y FIX RPC
-- Versión: 043_orders_isolation_and_rpc_fix.sql
-- Descripción:
--   1. Refuerza las funciones de pertenencia a restaurante (is_restaurant_member / is_restaurant_owner)
--      para validar estrictamente por restaurant_id.
--   2. Refuerza las políticas RLS de orders, order_items y payments para que:
--      - Cada cliente vea ÚNICAMENTE sus propios pedidos (customer_id = auth.uid()).
--      - Cada restaurante vea ÚNICAMENTE los pedidos de su propio restaurante (restaurant_id).
--   3. Corrige create_order_with_items para usar price_cop y restaurant_id en public.products
--      y calcular subtotal_cop, delivery_fee_cop y total_cop antes del INSERT en public.orders.
--   4. Corrige update_order_status y confirm_cash_payment para validar membresía real del restaurante.
-- ============================================================================

-- 1. FUNCIONES DE PERTENENCIA A RESTAURANTE ESTRICTAS POR RESTAURANT_ID
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
  );
END;
$$;

-- 2. POLÍTICAS RLS ESTRICTAS EN ORDERS, ORDER_ITEMS Y PAYMENTS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_customer_or_member" ON public.orders;
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_select_table_service" ON public.orders;

CREATE POLICY "orders_select_policy" ON public.orders
  FOR SELECT
  USING (
    (customer_id IS NOT NULL AND customer_id = auth.uid())
    OR public.is_restaurant_member(auth.uid(), restaurant_id)
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_table_service" ON public.order_items;

CREATE POLICY "order_items_select_policy" ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          (o.customer_id IS NOT NULL AND o.customer_id = auth.uid())
          OR public.is_restaurant_member(auth.uid(), o.restaurant_id)
          OR public.is_platform_admin(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "payments_select_owner_or_admin" ON public.payments;
DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;

CREATE POLICY "payments_select_policy" ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id
        AND (
          (o.customer_id IS NOT NULL AND o.customer_id = auth.uid())
          OR public.is_restaurant_member(auth.uid(), o.restaurant_id)
          OR public.is_platform_admin(auth.uid())
        )
    )
  );

-- 3. CORREGIR CREATE_ORDER_WITH_ITEMS (PRECIO EN PRICE_COP, RESTAURANT_ID Y TOTALES NOT NULL)
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

  -- Para pedidos que no son en mesa con QR, exigir sesión autenticada
  IF p_fulfillment != 'table_service' AND v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
  END IF;

  -- Validar mesa si es table_service
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

  -- Validar efectivo si aplica
  SELECT COALESCE(accepts_cash, TRUE) INTO v_accepts_cash
  FROM public.restaurants
  WHERE id = v_resolved_restaurant_id;

  IF p_payment_method = 'cash' AND v_accepts_cash = FALSE THEN
    RAISE EXCEPTION 'invalid_payment: restaurant does not accept cash';
  END IF;

  -- Obtener tarifa de delivery del restaurante
  IF p_fulfillment = 'restaurant_delivery' THEN
    SELECT COALESCE(delivery_fee, 0) INTO v_delivery_fee
    FROM public.restaurants
    WHERE id = v_resolved_restaurant_id;

    IF v_delivery_fee IS NULL THEN
      v_delivery_fee := 0;
    END IF;
  END IF;

  -- 1. Validar productos y calcular subtotal antes de insertar la orden
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

  v_total := v_subtotal + v_delivery_fee;

  -- 2. Crear la orden vinculada estrictamente a v_resolved_restaurant_id y v_customer_id
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
    v_delivery_fee,
    v_total
  ) RETURNING id INTO v_order_id;

  -- 3. Insertar los ítems de la orden
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

  -- 4. Si el pago es en efectivo, registrar el pago pendiente
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
      0,
      v_total,
      'pending'
    );
  END IF;

  RETURN v_order_id;
END;
$$;

-- 4. CORREGIR UPDATE_ORDER_STATUS PARA VALIDAR ESTRICTAMENTE EL RESTAURANTE DEL PEDIDO
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
  v_is_owner BOOLEAN;
  v_is_member BOOLEAN;
BEGIN
  v_user_uid := auth.uid();
  IF v_user_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
  END IF;

  SELECT restaurant_id, status
  INTO v_tenant_id, v_current_status
  FROM public.orders
  WHERE id = p_order_id;

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

  RETURN TRUE;
END;
$$;

-- 5. CORREGIR CONFIRM_CASH_PAYMENT (USAR IS_RESTAURANT_MEMBER EN LUGAR DE TABLA INEXISTENTE PUBLIC.USERS)
CREATE OR REPLACE FUNCTION public.confirm_cash_payment(p_payment_id UUID, p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_payment RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.*, o.restaurant_id INTO v_payment
  FROM public.payments p
  JOIN public.orders o ON p.order_id = o.id
  WHERE p.id = p_payment_id AND p.order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or does not belong to order';
  END IF;

  IF NOT public.is_restaurant_member(v_user_id, v_payment.restaurant_id) AND NOT public.is_platform_admin(v_user_id) THEN
    RAISE EXCEPTION 'Order belongs to another restaurant or user is not authorized';
  END IF;

  IF v_payment.provider != 'cash' THEN
    RAISE EXCEPTION 'Only cash payments can be confirmed manually';
  END IF;

  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Payment is not pending';
  END IF;

  UPDATE public.payments
  SET
    status = 'approved',
    confirmed_by = v_user_id,
    confirmed_at = NOW()
  WHERE id = p_payment_id;

  INSERT INTO public.payment_audit_log (payment_id, order_id, actor_user_id, action_type)
  VALUES (p_payment_id, p_order_id, v_user_id, 'confirm_cash_payment');

  RETURN TRUE;
END;
$$;
