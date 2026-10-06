-- Migration: 035_table_orders_security_fix
-- Description: Fix public read access leak for table orders by using device_id and RPC

-- 1. Añadir device_id a orders para rastrear sesiones anónimas
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 2. Eliminar políticas públicas inseguras creadas en 034
DROP POLICY IF EXISTS "orders_select_table_service" ON public.orders;
DROP POLICY IF EXISTS "order_items_select_table_service" ON public.order_items;

-- 3. Crear RPC segura (SECURITY DEFINER) para consultar los pedidos
-- Solo devuelve los pedidos que coinciden con el table_id Y el device_id proporcionado
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
  items JSONB
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.restaurant_id,
    o.customer_id,
    o.fulfillment,
    o.status,
    o.customer_name,
    o.customer_phone,
    o.delivery_address,
    o.table_number,
    o.table_id,
    o.restaurant_notes,
    o.cancellation_reason,
    o.subtotal_cop,
    o.delivery_fee_cop,
    o.total_cop,
    o.created_at,
    o.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'order_id', oi.order_id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'unit_price_cop', oi.unit_price_cop,
            'quantity', oi.quantity
          )
        )
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ), 
      '[]'::jsonb
    ) AS items
  FROM public.orders o
  WHERE o.table_id = p_table_id 
    AND o.device_id = p_session_id
    AND o.fulfillment = 'table_service'
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 4. Modificar create_order_with_items para aceptar p_device_id
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
  p_device_id TEXT DEFAULT NULL
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
BEGIN
  -- Validar mesa si es table_service
  IF p_fulfillment = 'table_service' THEN
    IF p_table_id IS NULL THEN
      RAISE EXCEPTION 'invalid_table: table_id is required for table_service';
    END IF;

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

  v_customer_id := auth.uid();

  -- Obtener tarifa de delivery
  IF p_fulfillment = 'restaurant_delivery' THEN
    SELECT delivery_fee INTO v_delivery_fee
    FROM public.restaurants
    WHERE id = p_restaurant_id;
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
    p_restaurant_id, v_customer_id, p_fulfillment, 'pending',
    p_customer_name, p_customer_phone, p_delivery_address,
    p_table_number, p_table_id, p_restaurant_notes, p_device_id
  ) RETURNING id INTO v_order_id;

  -- Procesar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price, name INTO v_unit_price, v_product_name
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID AND tenant_id = p_restaurant_id;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Invalid product id % for restaurant %', (v_item->>'product_id'), p_restaurant_id;
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
