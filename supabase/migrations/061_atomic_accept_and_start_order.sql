-- ============================================================================
-- Migración 061: Aceptar y empezar a cocinar en una sola transacción (KDS)
--
-- Antes, el botón "Aceptar y Cocinar" del KDS hacía dos llamadas RPC seguidas
-- (pending -> accepted y accepted -> preparing). Si la segunda fallaba (red,
-- timeout), el pedido quedaba a medias en 'accepted' y el cliente veía dos
-- cambios de estado. Esta función ejecuta ambos pasos dentro de la misma
-- transacción reutilizando public.update_order_status, de modo que conserva
-- TODAS sus validaciones (sesión, pertenencia al restaurante, transiciones
-- permitidas por rol) y sus efectos secundarios. Si cualquier paso falla, se
-- revierte todo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_and_start_order(
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
  END IF;

  -- Bloquear la fila para evitar que dos tablets del KDS acepten a la vez
  SELECT status INTO v_current_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido especificado no existe.';
  END IF;

  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Transición de estado no válida: el pedido ya no está pendiente.';
  END IF;

  PERFORM public.update_order_status(p_order_id, 'accepted');
  PERFORM public.update_order_status(p_order_id, 'preparing');

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_and_start_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_and_start_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_and_start_order(UUID) TO authenticated;
