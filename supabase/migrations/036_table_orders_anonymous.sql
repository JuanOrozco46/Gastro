-- 036_table_orders_anonymous.sql
-- Modificar create_order_with_items para resolver la mesa y el restaurante desde el token público.

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
  p_table_token TEXT DEFAULT NULL
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

  RETURN v_order_id;
END;
$$;
