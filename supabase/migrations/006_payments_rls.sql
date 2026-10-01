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

-- Nota técnica: La inserción directa de pagos desde el navegador está deshabilitada por seguridad.
-- Los pagos reales se crearán desde una Edge Function utilizando el service role.
-- La service role key nunca se expone en Vite.
-- El cliente no puede declarar arbitrariamente amount_cop, platform_fee_cop o restaurant_payout_cop.
