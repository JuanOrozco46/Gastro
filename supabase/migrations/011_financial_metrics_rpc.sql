-- Migration: 011_financial_metrics_rpc.sql
-- Description: Financial metrics for RestaurantAdmin with tenant isolation.

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
BEGIN
    -- 1. Authorization: Only owner or platform_admin
    IF NOT (
        EXISTS (
            SELECT 1 FROM restaurant_members 
            WHERE restaurant_id = p_restaurant_id 
              AND user_id = auth.uid() 
              AND role = 'owner'
        ) OR public.is_platform_admin(auth.uid())
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    WITH order_metrics AS (
        SELECT
            o.id as order_id,
            o.status as order_status,
            o.subtotal_cop,
            o.delivery_fee_cop,
            o.total_cop,
            p.status as payment_status,
            p.platform_fee_cop,
            p.restaurant_payout_cop,
            p.amount_cop
        FROM orders o
        LEFT JOIN payments p ON p.order_id = o.id
        WHERE o.restaurant_id = p_restaurant_id
          AND o.created_at >= p_start_date
          AND o.created_at <= p_end_date
    )
    SELECT
        -- Ventas brutas: suma de montos aprobados de pedidos NO cancelados
        COALESCE(SUM(total_cop) FILTER (WHERE payment_status = 'approved' AND order_status != 'cancelled'), 0)::NUMERIC AS gross_sales,
        
        -- Neto: ventas brutas - comisión. (Asumiendo que el delivery fee pertenece al restaurante)
        COALESCE(SUM(restaurant_payout_cop) FILTER (WHERE payment_status = 'approved' AND order_status != 'cancelled'), 0)::NUMERIC AS net_restaurant,
        
        -- Comisión plataforma
        COALESCE(SUM(platform_fee_cop) FILTER (WHERE payment_status = 'approved' AND order_status != 'cancelled'), 0)::NUMERIC AS platform_commission,
        
        -- Pedidos pagados
        COUNT(*) FILTER (WHERE payment_status = 'approved' AND order_status != 'cancelled')::BIGINT AS paid_orders_count,
        
        -- Pedidos pendientes (incluye todos los order_status = pending, independientemente del pago)
        COUNT(*) FILTER (WHERE order_status = 'pending')::BIGINT AS pending_orders_count,
        
        -- Pedidos cancelados
        COUNT(*) FILTER (WHERE order_status = 'cancelled')::BIGINT AS cancelled_orders_count,
        
        -- Reembolsos: Pedidos cancelados PERO que ya estaban pagados (approved)
        COALESCE(SUM(total_cop) FILTER (WHERE payment_status = 'approved' AND order_status = 'cancelled'), 0)::NUMERIC AS refunds,
        
        -- Ahorro vs 30%
        COALESCE(SUM((total_cop * 0.30) - platform_fee_cop) FILTER (WHERE payment_status = 'approved' AND order_status != 'cancelled'), 0)::NUMERIC AS savings_vs_30,
        
        -- Delivery fees de los pagados
        COALESCE(SUM(delivery_fee_cop) FILTER (WHERE payment_status = 'approved' AND order_status != 'cancelled'), 0)::NUMERIC AS delivery_fees
    FROM order_metrics;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_financial_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
