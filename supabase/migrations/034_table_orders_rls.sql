-- Migration: 034_table_orders_rls
-- Description: Allow public read access to table orders for active QR sessions

-- Permitir a los comensales (anónimos o autenticados) consultar los pedidos de su mesa
-- Se asume que el table_id (UUID) es suficientemente impredecible y el acceso se obtiene
-- mediante la resolución del public_token.

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'orders' 
      AND policyname = 'orders_select_table_service'
  ) THEN
    CREATE POLICY "orders_select_table_service" ON public.orders FOR SELECT
      USING (
        fulfillment = 'table_service'
        AND table_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'order_items' 
      AND policyname = 'order_items_select_table_service'
  ) THEN
    CREATE POLICY "order_items_select_table_service" ON public.order_items FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.orders 
          WHERE id = order_items.order_id 
            AND fulfillment = 'table_service' 
            AND table_id IS NOT NULL
        )
      );
  END IF;
END $$;
