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