-- ============================================================================
-- GASTROSYNC - RPC DE CHECKOUT TRANSACCIONAL (ACTUALIZACIÓN REGLA CANÓNICA)
-- Versión: 017_update_checkout_rpc.sql
-- Descripción: Actualiza la función de checkout para exigir que accepting_orders = TRUE
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_order_with_items(
  uuid, text, text, text, jsonb, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_restaurant_id uuid,
  p_fulfillment text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address jsonb DEFAULT NULL,
  p_table_number text DEFAULT NULL,
  p_restaurant_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_restaurant record;
  v_subtotal_cop bigint := 0;
  v_delivery_fee_cop bigint := 0;
  v_total_cop bigint := 0;
  v_order_id uuid;
  v_item record;
  v_product record;
  v_item_count integer := 0;
  v_customer_name_norm text;
  v_customer_phone_norm text;
  v_restaurant_notes_norm text;
  v_table_number_norm text;
  v_product_id_text text;
  v_qty integer;
  v_seen_products jsonb := '[]'::jsonb;
BEGIN
  -- 1. Validate Authenticated User
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- 2. Validate JSON array
  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'p_items debe ser un array JSON';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'No se permiten más de 50 productos distintos por pedido';
  END IF;

  -- 3. Validate and Normalize Text fields
  v_customer_name_norm := trim(p_customer_name);
  v_customer_phone_norm := trim(p_customer_phone);
  v_restaurant_notes_norm := trim(p_restaurant_notes);
  v_table_number_norm := trim(p_table_number);

  IF v_customer_name_norm IS NULL OR v_customer_name_norm = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;
  IF length(v_customer_name_norm) > 100 THEN
    RAISE EXCEPTION 'El nombre del cliente excede la longitud máxima (100)';
  END IF;

  IF v_customer_phone_norm IS NULL OR v_customer_phone_norm = '' THEN
    RAISE EXCEPTION 'El teléfono del cliente es obligatorio';
  END IF;
  IF length(v_customer_phone_norm) > 50 THEN
    RAISE EXCEPTION 'El teléfono del cliente excede la longitud máxima (50)';
  END IF;

  IF v_restaurant_notes_norm IS NOT NULL AND length(v_restaurant_notes_norm) > 500 THEN
    RAISE EXCEPTION 'Las notas para el restaurante exceden la longitud máxima (500)';
  END IF;

  IF v_table_number_norm IS NOT NULL AND length(v_table_number_norm) > 20 THEN
    RAISE EXCEPTION 'El número de mesa excede la longitud máxima (20)';
  END IF;

  -- 4. Validate Restaurant and Modality
  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id AND status = 'active' AND is_open = TRUE AND accepting_orders = TRUE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurante no disponible, inactivo, cerrado o pausado';
  END IF;

  IF NOT (p_fulfillment = ANY(v_restaurant.delivery_modes)) THEN
    RAISE EXCEPTION 'Modalidad de entrega no soportada por el restaurante';
  END IF;

  -- Modality specific validations
  IF p_fulfillment = 'pickup' THEN
    IF p_delivery_address IS NOT NULL THEN
      RAISE EXCEPTION 'pickup no debe incluir dirección de entrega';
    END IF;
    IF v_table_number_norm IS NOT NULL AND v_table_number_norm != '' THEN
      RAISE EXCEPTION 'pickup no debe incluir número de mesa';
    END IF;
    v_delivery_fee_cop := 0;

  ELSIF p_fulfillment = 'restaurant_delivery' THEN
    IF p_delivery_address IS NULL OR jsonb_typeof(p_delivery_address) != 'object' THEN
      RAISE EXCEPTION 'restaurant_delivery requiere p_delivery_address como objeto JSON';
    END IF;
    
    IF NOT p_delivery_address ? 'addressLine' THEN
      RAISE EXCEPTION 'La dirección de entrega debe contener addressLine';
    END IF;
    
    IF jsonb_typeof(p_delivery_address->'addressLine') != 'string' THEN
      RAISE EXCEPTION 'addressLine debe ser texto';
    END IF;

    IF trim(p_delivery_address->>'addressLine') = '' THEN
      RAISE EXCEPTION 'addressLine no puede estar vacío';
    END IF;

    IF length(p_delivery_address->>'addressLine') > 200 THEN
      RAISE EXCEPTION 'addressLine excede la longitud máxima permitida';
    END IF;

    IF p_delivery_address ? 'label' AND jsonb_typeof(p_delivery_address->'label') = 'string' THEN
      IF length(p_delivery_address->>'label') > 50 THEN
        RAISE EXCEPTION 'label excede la longitud máxima permitida';
      END IF;
    END IF;

    IF p_delivery_address ? 'notes' AND jsonb_typeof(p_delivery_address->'notes') = 'string' THEN
      IF length(p_delivery_address->>'notes') > 250 THEN
        RAISE EXCEPTION 'notes en dirección excede la longitud máxima permitida';
      END IF;
    END IF;
    IF v_table_number_norm IS NOT NULL AND v_table_number_norm != '' THEN
      RAISE EXCEPTION 'restaurant_delivery no debe incluir número de mesa';
    END IF;
    v_delivery_fee_cop := COALESCE(v_restaurant.delivery_fee, 0);

  ELSIF p_fulfillment = 'table_service' THEN
    IF v_table_number_norm IS NULL OR v_table_number_norm = '' THEN
      RAISE EXCEPTION 'table_service requiere p_table_number';
    END IF;
    IF p_delivery_address IS NOT NULL THEN
      RAISE EXCEPTION 'table_service no debe incluir dirección de entrega';
    END IF;
    v_delivery_fee_cop := 0;
  ELSE
    RAISE EXCEPTION 'Modalidad de entrega inválida';
  END IF;

  -- 5. Iterar items, consultar precios reales y calcular subtotales
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item.value) != 'object' THEN
      RAISE EXCEPTION 'Cada ítem debe ser un objeto JSON';
    END IF;

    IF NOT (v_item.value ? 'product_id' AND v_item.value ? 'quantity') THEN
      RAISE EXCEPTION 'Cada ítem debe contener product_id y quantity';
    END IF;

    IF v_item.value ? 'price' OR v_item.value ? 'price_cop' OR v_item.value ? 'unit_price' OR v_item.value ? 'total' THEN
      RAISE EXCEPTION 'No se permiten campos de precio en los ítems (se usa el precio del servidor)';
    END IF;

    v_product_id_text := v_item.value->>'product_id';
    IF v_product_id_text IS NULL OR v_product_id_text = '' THEN
      RAISE EXCEPTION 'product_id inválido o vacío';
    END IF;

    IF v_seen_products @> to_jsonb(v_product_id_text) THEN
      RAISE EXCEPTION 'Producto duplicado en el pedido: %', v_product_id_text;
    END IF;
    v_seen_products := v_seen_products || to_jsonb(v_product_id_text);

    IF jsonb_typeof(v_item.value->'quantity') != 'number' THEN
      RAISE EXCEPTION 'quantity debe ser un número';
    END IF;
    
    IF (v_item.value->>'quantity')::numeric % 1 != 0 THEN
      RAISE EXCEPTION 'quantity debe ser un número entero';
    END IF;

    v_qty := (v_item.value->>'quantity')::integer;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad menor o igual a cero para el producto %', v_product_id_text;
    END IF;

    IF v_qty > 99 THEN
      RAISE EXCEPTION 'Cantidad superior al límite (99) para el producto %', v_product_id_text;
    END IF;

    SELECT id, name, price_cop, available INTO v_product
    FROM public.products
    WHERE id = v_product_id_text::uuid AND restaurant_id = p_restaurant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no encontrado en este restaurante', v_product_id_text;
    END IF;

    IF v_product.available = FALSE THEN
      RAISE EXCEPTION 'El producto "%" no se encuentra disponible', v_product.name;
    END IF;

    IF v_product.price_cop < 0 THEN
      RAISE EXCEPTION 'Precio negativo detectado en el producto "%"', v_product.name;
    END IF;

    v_subtotal_cop := v_subtotal_cop + (v_product.price_cop::bigint * v_qty::bigint);
    v_item_count := v_item_count + 1;
  END LOOP;

  IF v_subtotal_cop < v_restaurant.min_order THEN
    RAISE EXCEPTION 'El subtotal no alcanza el pedido mínimo del restaurante';
  END IF;

  v_total_cop := v_subtotal_cop + v_delivery_fee_cop;

  IF v_total_cop > 2147483647 THEN
    RAISE EXCEPTION 'El total excede el límite permitido';
  END IF;

  -- 6. Crear Order
  INSERT INTO public.orders (
    restaurant_id,
    customer_id,
    fulfillment,
    status,
    customer_name,
    customer_phone,
    delivery_address,
    table_number,
    restaurant_notes,
    subtotal_cop,
    delivery_fee_cop,
    total_cop
  ) VALUES (
    p_restaurant_id,
    v_customer_id,
    p_fulfillment,
    'pending',
    v_customer_name_norm,
    v_customer_phone_norm,
    p_delivery_address,
    v_table_number_norm,
    v_restaurant_notes_norm,
    v_subtotal_cop::integer,
    v_delivery_fee_cop::integer,
    v_total_cop::integer
  ) RETURNING id INTO v_order_id;

  -- 7. Crear Order Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT name, price_cop INTO v_product
    FROM public.products
    WHERE id = (v_item.value->>'product_id')::uuid;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price_cop,
      quantity
    ) VALUES (
      v_order_id,
      (v_item.value->>'product_id')::uuid,
      v_product.name,
      v_product.price_cop,
      (v_item.value->>'quantity')::integer
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- Revocar y conceder permisos según instrucciones de seguridad (Security Definer no restringe llamadas per se)
REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, text, text, text, jsonb, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, text, text, text, jsonb, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, text, text, jsonb, text, text, jsonb) TO authenticated;

-- Documentación: La función usa SECURITY DEFINER para tener permisos de insertar sobre order/order_items
-- ignorando temporalmente la RLS del cliente (que está bloqueada para INSERT), pero la revocación de
-- PUBLIC/anon asegura que solo usuarios autenticados puedan invocarla, y la lógica interna
-- valida explícitamente `auth.uid()`.
