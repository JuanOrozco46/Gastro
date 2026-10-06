-- 037_resolve_table_diagnostics.sql
-- Modificar resolve_table_by_token para retornar razones exactas de bloqueo y evitar mensajes genéricos

CREATE OR REPLACE FUNCTION public.resolve_table_by_token(p_token UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table record;
  v_restaurant record;
BEGIN
  -- Buscar la mesa sin condiciones iniciales para diagnosticar
  SELECT * INTO v_table
  FROM public.restaurant_tables
  WHERE public_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_table.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'table_archived');
  END IF;

  IF NOT v_table.is_active THEN
    RETURN jsonb_build_object('error', 'table_inactive');
  END IF;

  -- Buscar restaurante
  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_table.restaurant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'restaurant_not_found');
  END IF;

  IF v_restaurant.status = 'pending' THEN
    RETURN jsonb_build_object('error', 'restaurant_not_approved');
  END IF;

  IF v_restaurant.status = 'paused' THEN
    RETURN jsonb_build_object('error', 'restaurant_paused');
  END IF;

  IF NOT v_restaurant.is_open THEN
    RETURN jsonb_build_object('error', 'restaurant_closed');
  END IF;

  IF NOT v_restaurant.accepting_orders THEN
    RETURN jsonb_build_object('error', 'restaurant_not_accepting_orders');
  END IF;

  IF NOT v_restaurant.table_service_enabled THEN
    RETURN jsonb_build_object('error', 'table_service_disabled');
  END IF;

  IF v_restaurant.status != 'active' THEN
    RETURN jsonb_build_object('error', 'restaurant_inactive');
  END IF;

  RETURN jsonb_build_object(
    'table', jsonb_build_object(
      'id', v_table.id,
      'restaurant_id', v_table.restaurant_id,
      'table_number', v_table.table_number,
      'display_name', v_table.display_name,
      'capacity', v_table.capacity
    ),
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id,
      'name', v_restaurant.name,
      'slug', v_restaurant.slug,
      'logo_url', v_restaurant.logo_url,
      'banner_url', v_restaurant.banner_url,
      'logo_emoji', v_restaurant.logo_emoji,
      'is_open', v_restaurant.is_open,
      'accepting_orders', v_restaurant.accepting_orders,
      'table_service_enabled', v_restaurant.table_service_enabled
    )
  );
END;
$$;
