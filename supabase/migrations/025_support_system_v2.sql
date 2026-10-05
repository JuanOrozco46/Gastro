-- ============================================================================
-- GASTROSYNC - 025: SUPPORT SYSTEM V2 (FASE 2 Y 7)
-- ============================================================================

-- 1. Ampliación de support_tickets
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS requester_type TEXT CHECK (requester_type IN ('customer', 'restaurant_owner', 'restaurant_staff')),
ADD COLUMN IF NOT EXISTS related_payment_id TEXT,
ADD COLUMN IF NOT EXISTS subcategory TEXT,
ADD COLUMN IF NOT EXISTS satisfaction_score INT CHECK (satisfaction_score BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS satisfaction_comment TEXT,
ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_agent_message_at TIMESTAMPTZ;

-- Actualizar si requester_type es nulo (basado en el contexto)
UPDATE public.support_tickets SET requester_type = 'customer' WHERE requester_type IS NULL;

-- 2. Modificación de restricciones (Categories, Status, Priority)
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check 
CHECK (category IN ('order', 'missing_item', 'wrong_item', 'damaged_item', 'delayed_order', 'delivery', 'payment', 'refund_request', 'restaurant', 'account', 'password', 'menu', 'technical', 'safety', 'other'));

-- Migrar 'waiting_for_user' a 'waiting_for_customer'
UPDATE public.support_tickets SET status = 'waiting_for_customer' WHERE status = 'waiting_for_user';

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check 
CHECK (status IN ('open', 'in_review', 'waiting_for_customer', 'waiting_for_restaurant', 'waiting_for_payment_provider', 'escalated', 'resolved', 'closed'));

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_priority_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_priority_check 
CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical'));


-- ============================================================================
-- 3. AUDITORÍA Y TRAZABILIDAD (FASE 7)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    actor_user_id UUID NOT NULL REFERENCES auth.users(id),
    action_type TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_audit_log ENABLE ROW LEVEL SECURITY;

-- Solo administradores pueden ver la auditoría. Ni clientes ni restaurantes pueden verla.
DROP POLICY IF EXISTS "support_audit_log_select_admin" ON public.support_audit_log;
CREATE POLICY "support_audit_log_select_admin" ON public.support_audit_log FOR SELECT
USING (public.is_platform_admin(auth.uid()));

-- Insert es solo mediante función RPC o si es admin/agente, pero para mayor trazabilidad 
-- permitiremos a auth.uid() crear los suyos si es necesario, 
-- PERO es mejor manejarlo con un Security Definer trigger.
-- Sin embargo, el requerimiento: "No permitir que ningún usuario edite o borre el historial de auditoría."
DROP POLICY IF EXISTS "support_audit_log_insert" ON public.support_audit_log;
CREATE POLICY "support_audit_log_insert" ON public.support_audit_log FOR INSERT
WITH CHECK (actor_user_id = auth.uid());

-- Triggers para generar auditoría automática en cambios clave

CREATE OR REPLACE FUNCTION log_support_ticket_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- STATUS
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.support_audit_log (ticket_id, actor_user_id, action_type, previous_value, new_value)
        VALUES (NEW.id, COALESCE(auth.uid(), NEW.requester_user_id), 'status_change', OLD.status, NEW.status);
    END IF;

    -- PRIORITY
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
        INSERT INTO public.support_audit_log (ticket_id, actor_user_id, action_type, previous_value, new_value)
        VALUES (NEW.id, COALESCE(auth.uid(), NEW.requester_user_id), 'priority_change', OLD.priority, NEW.priority);
    END IF;

    -- ASSIGNED_TO
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        INSERT INTO public.support_audit_log (ticket_id, actor_user_id, action_type, previous_value, new_value)
        VALUES (NEW.id, COALESCE(auth.uid(), NEW.requester_user_id), 'assignment_change', CAST(OLD.assigned_to AS TEXT), CAST(NEW.assigned_to AS TEXT));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_support_ticket_changes ON public.support_tickets;
CREATE TRIGGER trigger_log_support_ticket_changes
AFTER UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION log_support_ticket_changes();


-- Trigger para registrar cuando se vincula una orden segura
-- Se asegura que related_order_id pertenece al requester.
CREATE OR REPLACE FUNCTION validate_support_ticket_order()
RETURNS TRIGGER AS $$
DECLARE
    v_order_user UUID;
BEGIN
    IF NEW.related_order_id IS NOT NULL THEN
        SELECT customer_id INTO v_order_user FROM public.orders WHERE id = NEW.related_order_id;
        IF v_order_user IS NULL OR v_order_user <> NEW.requester_user_id THEN
            RAISE EXCEPTION 'No se puede vincular un pedido que no te pertenece.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_support_ticket_order ON public.support_tickets;
CREATE TRIGGER trigger_validate_support_ticket_order
BEFORE INSERT OR UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION validate_support_ticket_order();


-- Proteger audit logs (nunca Update ni Delete)
CREATE OR REPLACE FUNCTION protect_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Los registros de auditoría no pueden ser modificados ni eliminados.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_audit_log ON public.support_audit_log;
CREATE TRIGGER trigger_protect_audit_log
BEFORE UPDATE OR DELETE ON public.support_audit_log
FOR EACH ROW
EXECUTE FUNCTION protect_audit_log();

