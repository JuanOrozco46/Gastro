-- Migración 008: RPC de Actualización de Estado de Pedidos (KDS Remoto)
-- Descripción: Permite actualizar estados de manera transaccional y validada.

DROP FUNCTION IF EXISTS public.update_order_status(uuid, text);

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_next_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_uid uuid;
  v_tenant_id uuid;
  v_current_status text;
  v_user_role text;
  v_user_tenant_id uuid;
  v_fulfillment text;
BEGIN
  -- 1. Obtener y validar sesión
  v_user_uid := auth.uid();
  IF v_user_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
  END IF;

  -- 2. Obtener datos del pedido
  SELECT restaurant_id, status, fulfillment 
  INTO v_tenant_id, v_current_status, v_fulfillment
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido especificado no existe.';
  END IF;

  -- 3. No permitir reabrir pedidos cancelados o finalizados
  IF v_current_status IN ('cancelled', 'delivered') THEN
    RAISE EXCEPTION 'No se puede cambiar el estado de un pedido finalizado o cancelado.';
  END IF;

  -- 4. Obtener rol y tenant del usuario
  SELECT business_role, tenant_id 
  INTO v_user_role, v_user_tenant_id
  FROM public.profiles
  WHERE id = v_user_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de usuario no encontrado.';
  END IF;

  IF v_user_role NOT IN ('restaurant_owner', 'restaurant_staff') THEN
    RAISE EXCEPTION 'No tienes permisos administrativos para actualizar pedidos.';
  END IF;

  IF v_user_tenant_id IS NULL OR v_user_tenant_id != v_tenant_id THEN
    RAISE EXCEPTION 'No tienes autorización para modificar pedidos de este restaurante.';
  END IF;

  -- 5. Validar transiciones según el rol
  IF v_user_role = 'restaurant_staff' THEN
    IF NOT (
      (v_current_status = 'pending' AND p_next_status = 'accepted') OR
      (v_current_status = 'accepted' AND p_next_status = 'preparing') OR
      (v_current_status = 'preparing' AND p_next_status = 'ready')
    ) THEN
      RAISE EXCEPTION 'Transición de estado no permitida para personal de cocina.';
    END IF;
  ELSE
    -- v_user_role = 'restaurant_owner'
    IF NOT (
      (v_current_status = 'pending' AND p_next_status IN ('accepted', 'cancelled')) OR
      (v_current_status = 'accepted' AND p_next_status IN ('preparing', 'cancelled')) OR
      (v_current_status = 'preparing' AND p_next_status IN ('ready', 'cancelled')) OR
      (v_current_status = 'ready' AND p_next_status IN ('out_for_delivery', 'delivered', 'cancelled')) OR
      (v_current_status = 'out_for_delivery' AND p_next_status IN ('delivered', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Transición de estado no válida para el propietario.';
    END IF;
  END IF;

  -- 6. Ejecutar la actualización
  UPDATE public.orders
  SET 
    status = p_next_status,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

-- 7. Configuración de permisos estrictos
REVOKE ALL ON FUNCTION public.update_order_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, text) TO authenticated;
