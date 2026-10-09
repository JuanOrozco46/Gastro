-- ============================================================================
-- MIGRACIÓN 054: ENDURECIMIENTO QA — ANTI DOBLE COBRO, CONCILIACIÓN SEGURA
-- Y FIJACIÓN DE SEARCH_PATH EN FUNCIONES SECURITY DEFINER
-- ============================================================================

-- 1. Saneamiento previo de public.payments antes de crear el índice único parcial
-- 1a. Si existieran múltiples pagos 'approved' para un mismo pedido, conservar el primero y anular duplicados
WITH ranked_approved AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY confirmed_at ASC NULLS LAST, created_at ASC, id ASC
    ) AS rn
  FROM public.payments
  WHERE status = 'approved'
)
UPDATE public.payments p
SET status = 'voided'
FROM ranked_approved ra
WHERE p.id = ra.id
  AND ra.rn > 1;

-- 1b. Si un pedido ya tiene un pago 'approved', anular cualquier intento 'pending' residual
UPDATE public.payments p
SET status = 'voided'
WHERE p.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.payments p2
    WHERE p2.order_id = p.order_id
      AND p2.status = 'approved'
  );

-- 1c. Si un pedido tiene múltiples intentos 'pending', conservar únicamente el más reciente y anular los previos
WITH ranked_pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.payments
  WHERE status = 'pending'
)
UPDATE public.payments p
SET status = 'voided'
FROM ranked_pending rp
WHERE p.id = rp.id
  AND rp.rn > 1;

-- 2. Índice único parcial: impide físicamente dos pagos 'approved' para el mismo pedido (Hallazgo P1 #1)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_approved_per_order
  ON public.payments (order_id)
  WHERE status = 'approved';

-- 3. Trigger BEFORE INSERT en public.payments:
--    - Bloquea nuevos intentos si el pedido ya tiene un pago 'approved'.
--    - Anula ('voided') automáticamente cualquier intento 'pending' anterior del mismo pedido
--      al crear un nuevo intent 'pending' (ej. botón "Reintentar Pago" o inicio de checkout Wompi).
CREATE OR REPLACE FUNCTION public.guard_payment_intent_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE order_id = NEW.order_id
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'duplicate_payment: Este pedido ya cuenta con un pago aprobado.';
  END IF;

  IF NEW.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'voided'
    WHERE order_id = NEW.order_id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payment_intent_insert ON public.payments;
CREATE TRIGGER trg_guard_payment_intent_insert
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_payment_intent_insert();

-- 4. Actualizar update_order_status para:
--    - Evitar colisión con idx_payments_one_approved_per_order si el pago ya estaba 'approved'.
--    - No forzar 'approved' al entregar pedidos cuyo método de pago es digital ('wompi') y nunca fueron aprobados por la pasarela (Hallazgo P3 #4).
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_next_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_uid UUID;
  v_tenant_id UUID;
  v_current_status TEXT;
  v_total_cop INTEGER;
  v_payment_method TEXT;
  v_commission_rate NUMERIC := 0.03;
  v_platform_fee INTEGER;
  v_gateway_fee INTEGER;
  v_gateway_iva INTEGER;
  v_payout INTEGER;
  v_target_payment_id UUID;
  v_is_owner BOOLEAN;
  v_is_member BOOLEAN;
BEGIN
  v_user_uid := auth.uid();
  IF v_user_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Se requiere sesión activa.';
  END IF;

  SELECT
    o.restaurant_id,
    o.status,
    o.total_cop,
    COALESCE(o.payment_method, 'cash'),
    COALESCE(r.commission_rate, 0.03)
  INTO v_tenant_id, v_current_status, v_total_cop, v_payment_method, v_commission_rate
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido especificado no existe.';
  END IF;

  IF v_current_status IN ('cancelled', 'delivered') THEN
    RAISE EXCEPTION 'No se puede cambiar el estado de un pedido finalizado o cancelado.';
  END IF;

  v_is_owner := public.is_restaurant_owner(v_user_uid, v_tenant_id) OR public.is_platform_admin(v_user_uid);
  v_is_member := public.is_restaurant_member(v_user_uid, v_tenant_id);

  IF NOT v_is_owner AND NOT v_is_member THEN
    RAISE EXCEPTION 'No tienes autorización para modificar pedidos de este restaurante.';
  END IF;

  IF v_is_member AND NOT v_is_owner THEN
    IF NOT (
      (v_current_status = 'pending' AND p_next_status = 'accepted') OR
      (v_current_status = 'accepted' AND p_next_status = 'preparing') OR
      (v_current_status = 'preparing' AND p_next_status = 'ready')
    ) THEN
      RAISE EXCEPTION 'Transición de estado no permitida para personal de cocina.';
    END IF;
  ELSE
    IF NOT (
      (v_current_status = 'pending' AND p_next_status IN ('accepted', 'cancelled')) OR
      (v_current_status = 'accepted' AND p_next_status IN ('preparing', 'cancelled')) OR
      (v_current_status = 'preparing' AND p_next_status IN ('ready', 'cancelled')) OR
      (v_current_status = 'ready' AND p_next_status IN ('out_for_delivery', 'delivered', 'cancelled')) OR
      (v_current_status = 'out_for_delivery' AND p_next_status IN ('delivered', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Transición de estado no válida.';
    END IF;
  END IF;

  UPDATE public.orders
  SET
    status = p_next_status,
    updated_at = NOW()
  WHERE id = p_order_id
    AND restaurant_id = v_tenant_id;

  IF p_next_status = 'delivered' THEN
    v_platform_fee := ROUND(v_total_cop * v_commission_rate)::INTEGER;
    v_gateway_fee := public.calculate_wompi_gateway_fee_cop(v_total_cop, v_payment_method);
    v_gateway_iva := public.calculate_wompi_gateway_iva_cop(v_total_cop, v_payment_method);
    v_payout := GREATEST(0, v_total_cop - v_platform_fee - v_gateway_fee);

    -- Si ya existe un pago aprobado para la orden, solo anulamos posibles pendientes residuales
    IF EXISTS (
      SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'approved'
    ) THEN
      UPDATE public.payments
      SET status = 'voided'
      WHERE order_id = p_order_id
        AND status = 'pending';
    ELSIF COALESCE(lower(btrim(v_payment_method)), 'cash') = 'cash' THEN
      -- Solo auto-aprobar al entregar cuando el pedido es en efectivo ('cash')
      SELECT id INTO v_target_payment_id
      FROM public.payments
      WHERE order_id = p_order_id
        AND status = 'pending'
      ORDER BY created_at DESC, id DESC
      LIMIT 1;

      IF v_target_payment_id IS NOT NULL THEN
        UPDATE public.payments
        SET status = 'voided'
        WHERE order_id = p_order_id
          AND status = 'pending'
          AND id != v_target_payment_id;

        UPDATE public.payments
        SET
          status = 'approved',
          platform_fee_cop = v_platform_fee,
          gateway_fee_cop = public.calculate_wompi_gateway_fee_cop(amount_cop, provider),
          gateway_iva_cop = public.calculate_wompi_gateway_iva_cop(amount_cop, provider),
          restaurant_payout_cop = GREATEST(
            0,
            amount_cop - v_platform_fee - public.calculate_wompi_gateway_fee_cop(amount_cop, provider)
          ),
          confirmed_by = COALESCE(confirmed_by, v_user_uid),
          confirmed_at = COALESCE(confirmed_at, NOW())
        WHERE id = v_target_payment_id;
      ELSE
        INSERT INTO public.payments (
          order_id,
          provider,
          provider_reference,
          amount_cop,
          platform_fee_cop,
          gateway_fee_cop,
          gateway_iva_cop,
          restaurant_payout_cop,
          status,
          confirmed_by,
          confirmed_at
        ) VALUES (
          p_order_id,
          'cash',
          p_order_id::TEXT,
          v_total_cop,
          v_platform_fee,
          0,
          0,
          GREATEST(0, v_total_cop - v_platform_fee),
          'approved',
          v_user_uid,
          NOW()
        );
      END IF;
    END IF;

    PERFORM public.evaluate_restaurant_cash_limit_lock(v_tenant_id);
  ELSIF p_next_status = 'cancelled' THEN
    UPDATE public.payments
    SET status = 'voided'
    WHERE order_id = p_order_id
      AND status = 'pending';
  END IF;

  RETURN TRUE;
END;
$$;

-- 5. Fijar SET search_path = public en las funciones SECURITY DEFINER de soporte y pedidos (Hallazgo P2 #7)
CREATE OR REPLACE FUNCTION public.log_support_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.support_ticket_events (ticket_id, actor_user_id, event_type, new_value)
    VALUES (NEW.id, v_actor, 'created', NEW.status);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.support_ticket_events (ticket_id, actor_user_id, event_type, old_value, new_value)
      VALUES (NEW.id, v_actor, 'status_changed', OLD.status, NEW.status);
    END IF;

    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO public.support_ticket_events (ticket_id, actor_user_id, event_type, old_value, new_value)
      VALUES (NEW.id, v_actor, 'priority_changed', OLD.priority, NEW.priority);
    END IF;

    IF OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id THEN
      INSERT INTO public.support_ticket_events (ticket_id, actor_user_id, event_type, old_value, new_value)
      VALUES (NEW.id, v_actor, 'assigned_changed', OLD.assigned_to_user_id::TEXT, NEW.assigned_to_user_id::TEXT);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id, metadata)
  VALUES (
    NEW.created_by_user_id,
    'ticket_created',
    'Ticket Recibido: ' || NEW.ticket_number,
    'Hemos recibido tu solicitud "' || NEW.subject || '". Nuestro equipo la revisará pronto.',
    'support_ticket',
    NEW.id::TEXT,
    jsonb_build_object('ticket_number', NEW.ticket_number, 'priority', NEW.priority)
  );

  FOR v_admin IN (SELECT id FROM public.profiles WHERE role = 'admin' AND id != NEW.created_by_user_id) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id, metadata)
    VALUES (
      v_admin.id,
      'ticket_created_admin',
      'Nuevo Ticket [' || upper(NEW.priority) || ']: ' || NEW.ticket_number,
      NEW.requester_name || ' (' || NEW.requester_role || ') reportó: ' || NEW.subject,
      'support_ticket_admin',
      NEW.id::TEXT,
      jsonb_build_object('ticket_number', NEW.ticket_number, 'priority', NEW.priority, 'category', NEW.category)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_ticket_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_status_label TEXT;
BEGIN
  v_actor := auth.uid();

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'open' THEN v_status_label := 'Abierto';
      WHEN 'in_progress' THEN v_status_label := 'En Revisión';
      WHEN 'waiting_user' THEN v_status_label := 'Esperando tu Respuesta';
      WHEN 'resolved' THEN v_status_label := 'Resuelto';
      WHEN 'closed' THEN v_status_label := 'Cerrado';
      ELSE v_status_label := NEW.status;
    END CASE;

    IF v_actor IS DISTINCT FROM NEW.created_by_user_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id, metadata)
      VALUES (
        NEW.created_by_user_id,
        CASE WHEN NEW.status = 'resolved' THEN 'ticket_resolved' ELSE 'ticket_status_changed' END,
        'Actualización en ' || NEW.ticket_number || ': ' || v_status_label,
        CASE
          WHEN NEW.status = 'resolved' THEN COALESCE(NEW.resolution_summary, 'Tu caso ha sido marcado como resuelto. ¡Califica nuestra atención!')
          WHEN NEW.status = 'waiting_user' THEN 'Necesitamos información adicional de tu parte para continuar.'
          ELSE 'El estado de tu caso cambió a ' || v_status_label || '.'
        END,
        'support_ticket',
        NEW.id::TEXT,
        jsonb_build_object('ticket_number', NEW.ticket_number, 'new_status', NEW.status)
      );
    END IF;
  END IF;

  IF OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id AND NEW.assigned_to_user_id IS NOT NULL THEN
    IF v_actor IS DISTINCT FROM NEW.assigned_to_user_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id, metadata)
      VALUES (
        NEW.assigned_to_user_id,
        'ticket_assigned',
        'Caso Asignado: ' || NEW.ticket_number,
        'Se te ha asignado el ticket "' || NEW.subject || '" [' || upper(NEW.priority) || '].',
        'support_ticket_admin',
        NEW.id::TEXT,
        jsonb_build_object('ticket_number', NEW.ticket_number, 'priority', NEW.priority)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_admin RECORD;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_user_id != v_ticket.created_by_user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id, metadata)
    VALUES (
      v_ticket.created_by_user_id,
      'ticket_reply',
      'Nueva respuesta en ' || v_ticket.ticket_number,
      NEW.sender_name || ': ' || left(NEW.body, 100),
      'support_ticket',
      v_ticket.id::TEXT,
      jsonb_build_object('ticket_number', v_ticket.ticket_number)
    );
  ELSE
    IF v_ticket.assigned_to_user_id IS NOT NULL AND v_ticket.assigned_to_user_id != NEW.sender_user_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id, metadata)
      VALUES (
        v_ticket.assigned_to_user_id,
        'ticket_user_reply',
        'Respuesta del usuario en ' || v_ticket.ticket_number,
        NEW.sender_name || ': ' || left(NEW.body, 100),
        'support_ticket_admin',
        v_ticket.id::TEXT,
        jsonb_build_object('ticket_number', v_ticket.ticket_number)
      );
    ELSE
      FOR v_admin IN (SELECT id FROM public.profiles WHERE role = 'admin' AND id != NEW.sender_user_id) LOOP
        INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id, metadata)
        VALUES (
          v_admin.id,
          'ticket_user_reply',
          'Respuesta en ' || v_ticket.ticket_number || ' (Sin asignar)',
          NEW.sender_name || ': ' || left(NEW.body, 100),
          'support_ticket_admin',
          v_ticket.id::TEXT,
          jsonb_build_object('ticket_number', v_ticket.ticket_number)
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Blindaje global: asegurar SET search_path = public en TODA función SECURITY DEFINER del esquema public
DO $$
DECLARE
  v_func RECORD;
BEGIN
  FOR v_func IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = TRUE
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      v_func.schema_name,
      v_func.func_name,
      v_func.func_args
    );
  END LOOP;
END;
$$;
