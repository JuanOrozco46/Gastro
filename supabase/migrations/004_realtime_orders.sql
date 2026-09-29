-- ============================================================================
-- GASTROSYNC - PARCHE DE HABILITACIÓN DE WEBSOCKETS Y RLS PARA PEDIDOS EN VIVO
-- Versión: 004_realtime_orders.sql
-- Descripción: Agrega public.orders a la publicación supabase_realtime y afina
--              políticas RLS para consulta y actualización de comanda en el KDS.
-- ============================================================================

-- 1. HABILITAR PUBLICACIÓN SUPABASE REALTIME EN PUBLIC.ORDERS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- En entornos donde la publicación ya contiene la tabla, continuar silenciosamente
    NULL;
END $$;

-- 2. REFORZAR POLÍTICAS RLS EN PUBLIC.ORDERS

DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;

-- Lectura: Clientes leen sus propios pedidos, el personal del restaurante lee los de su local, administradores leen todo
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT
  USING (
    customer_id = auth.uid()
    OR public.is_restaurant_member(auth.uid(), restaurant_id)
    OR public.is_platform_admin(auth.uid())
  );

-- Actualización de estado: El personal del restaurante y administradores pueden actualizar el estado de los pedidos de su local
CREATE POLICY "orders_update_policy" ON public.orders FOR UPDATE
  USING (
    public.is_restaurant_member(auth.uid(), restaurant_id)
    OR public.is_platform_admin(auth.uid())
    OR customer_id = auth.uid()
  )
  WITH CHECK (
    public.is_restaurant_member(auth.uid(), restaurant_id)
    OR public.is_platform_admin(auth.uid())
    OR customer_id = auth.uid()
  );

-- 3. REFORZAR POLÍTICAS RLS EN PUBLIC.ORDER_ITEMS

DROP POLICY IF EXISTS "order_items_insert_policy" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;

CREATE POLICY "order_items_insert_policy" ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (o.customer_id = auth.uid() OR auth.role() = 'authenticated')
    )
  );

CREATE POLICY "order_items_select_policy" ON public.order_items FOR SELECT
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
