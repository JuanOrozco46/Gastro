-- 038_accepts_cash.sql
-- Añadir soporte para efectivo a restaurantes y RPC

ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS accepts_cash BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION create_order_with_items(
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
AS $$
DECLARE
  v_order_id UUID;
  v_subtotal NUMERIC := 0;
  v_delivery_fee NUMERIC := 0;
  v_item JSONB;
  v_unit_price NUMERIC;
  v_product_name TEXT;
  v_customer_id UUID;
  v_table_record RECORD;
  v_resolved_restaurant_id UUID;
  v_resolved_table_id UUID;
  v_accepts_cash BOOLEAN;
BEGIN
  v_resolved_restaurant_id := p_restaurant_id;
  v_resolved_table_id := p_table_id;

  -- Validar mesa si es table_service usando el token si está presente (seguridad reforzada)
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
    ELSE
      RAISE EXCEPTION 'invalid_table: table_id or table_token is required for table_service';
    END IF;

    -- Validar que el restaurante acepta pedidos en mesa
    IF NOT EXISTS (
      SELECT 1 FROM public.restaurants 
      WHERE id = v_resolved_restaurant_id 
        AND table_service_enabled = true
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'invalid_restaurant: restaurant does not accept table orders or is inactive';
    END IF;

    -- Exigir device_id para pedidos anónimos en mesa
    IF auth.uid() IS NULL AND p_device_id IS NULL THEN
      RAISE EXCEPTION 'invalid_session: device_id is required for anonymous table orders';
    END IF;
  END IF;

  -- Validar efectivo
  SELECT accepts_cash INTO v_accepts_cash
  FROM public.restaurants
  WHERE id = v_resolved_restaurant_id;

  IF p_payment_method = 'cash' AND NOT v_accepts_cash THEN
    RAISE EXCEPTION 'invalid_payment: restaurant does not accept cash';
  END IF;

  v_customer_id := auth.uid();

  -- Obtener tarifa de delivery
  IF p_fulfillment = 'restaurant_delivery' THEN
    SELECT delivery_fee INTO v_delivery_fee
    FROM public.restaurants
    WHERE id = v_resolved_restaurant_id;

    IF v_delivery_fee IS NULL THEN
      v_delivery_fee := 0;
    END IF;
  END IF;

  -- Crear la orden
  INSERT INTO public.orders (
    restaurant_id, customer_id, fulfillment, status, 
    customer_name, customer_phone, delivery_address, 
    table_number, table_id, restaurant_notes, device_id
  ) VALUES (
    v_resolved_restaurant_id, v_customer_id, p_fulfillment, 'pending',
    p_customer_name, p_customer_phone, p_delivery_address,
    p_table_number, v_resolved_table_id, p_restaurant_notes, p_device_id
  ) RETURNING id INTO v_order_id;

  -- Procesar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price, name INTO v_unit_price, v_product_name
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID AND tenant_id = v_resolved_restaurant_id;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Invalid product id % for restaurant %', (v_item->>'product_id'), v_resolved_restaurant_id;
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * (v_item->>'quantity')::INTEGER);

    INSERT INTO public.order_items (
      order_id, product_id, product_name, unit_price_cop, quantity
    ) VALUES (
      v_order_id, 
      (v_item->>'product_id')::UUID, 
      v_product_name, 
      v_unit_price, 
      (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  -- Actualizar totales
  UPDATE public.orders
  SET subtotal_cop = v_subtotal,
      delivery_fee_cop = v_delivery_fee,
      total_cop = v_subtotal + v_delivery_fee
  WHERE id = v_order_id;

  -- Insertar payment en pending_cash si el método es cash
  IF p_payment_method = 'cash' THEN
    INSERT INTO public.payments (
      order_id, provider, provider_reference, amount_cop, platform_fee_cop, restaurant_payout_cop, status
    ) VALUES (
      v_order_id, 'cash', v_order_id::text, v_subtotal + v_delivery_fee, 0, v_subtotal + v_delivery_fee, 'pending'
    );
  END IF;

  RETURN v_order_id;
END;
$$;
DROP FUNCTION IF EXISTS get_table_orders_for_session(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_table_orders_for_session(p_table_id UUID, p_session_id TEXT)
RETURNS TABLE (
  id UUID,
  restaurant_id UUID,
  customer_id UUID,
  fulfillment TEXT,
  status TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address JSONB,
  table_number TEXT,
  table_id UUID,
  restaurant_notes TEXT,
  cancellation_reason TEXT,
  subtotal_cop NUMERIC,
  delivery_fee_cop NUMERIC,
  total_cop NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  order_items JSONB,
  payments JSONB
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id, o.restaurant_id, o.customer_id, o.fulfillment, o.status,
    o.customer_name, o.customer_phone, o.delivery_address, o.table_number,
    o.table_id, o.restaurant_notes, o.cancellation_reason, o.subtotal_cop,
    o.delivery_fee_cop, o.total_cop, o.created_at, o.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id, 'order_id', oi.order_id, 'product_id', oi.product_id,
          'product_name', oi.product_name, 'unit_price_cop', oi.unit_price_cop, 'quantity', oi.quantity
        ))
        FROM public.order_items oi WHERE oi.order_id = o.id
      ), '[]'::jsonb
    ) AS order_items,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id, 'status', p.status, 'provider', p.provider
        ))
        FROM public.payments p WHERE p.order_id = o.id
      ), '[]'::jsonb
    ) AS payments
  FROM public.orders o
  WHERE o.table_id = p_table_id 
    AND o.device_id = p_session_id
    AND o.fulfillment = 'table_service'
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;
