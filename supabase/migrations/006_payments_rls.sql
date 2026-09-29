-- ============================================================================
-- GASTROSYNC - PARCHE DE REFORZAMIENTO Y RLS EN REGISTRO DE PAGOS (PUBLIC.PAYMENTS)
-- Versión: 006_payments_rls.sql
-- Descripción: Definición de políticas RLS para consulta de comprobantes de pago por cliente y comercio.
-- ============================================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_policy" ON public.payments;

-- Lectura de pagos: Clientes leen los pagos de sus pedidos, miembros leen los de su restaurante, administradores leen todo
CREATE POLICY "payments_select_policy" ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (
        o.customer_id = auth.uid()
        OR public.is_restaurant_member(auth.uid(), o.restaurant_id)
        OR public.is_platform_admin(auth.uid())
      )
    )
  );

-- Inserción de registro de pago para pedidos activos
CREATE POLICY "payments_insert_policy" ON public.payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (
        o.customer_id = auth.uid()
        OR auth.role() = 'authenticated'
      )
    )
  );
