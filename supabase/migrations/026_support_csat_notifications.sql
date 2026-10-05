-- ============================================================================
-- GASTROSYNC - 026: CSAT & NOTIFICATIONS (FASE 5)
-- Idempotente.
-- ============================================================================

-- ============================================================================
-- 1. SUPPORT TICKET FEEDBACK (CSAT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_ticket_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.support_ticket_feedback ENABLE ROW LEVEL SECURITY;

-- Policies para support_ticket_feedback
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own feedback" ON public.support_ticket_feedback;
    DROP POLICY IF EXISTS "Admins can view all feedback" ON public.support_ticket_feedback;
    DROP POLICY IF EXISTS "Requester can insert feedback for resolved/closed tickets" ON public.support_ticket_feedback;
    DROP POLICY IF EXISTS "Requester can update own feedback" ON public.support_ticket_feedback;
EXCEPTION WHEN OTHERS THEN END $$;

CREATE POLICY "Users can view their own feedback" 
ON public.support_ticket_feedback FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all feedback" 
ON public.support_ticket_feedback FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND business_role = 'platform_admin'));

CREATE POLICY "Requester can insert feedback for resolved/closed tickets" 
ON public.support_ticket_feedback FOR INSERT 
WITH CHECK (
    user_id = auth.uid() 
    AND user_id = (SELECT requester_user_id FROM public.support_tickets WHERE id = ticket_id)
    AND (SELECT status FROM public.support_tickets WHERE id = ticket_id) IN ('resolved', 'closed')
);

CREATE POLICY "Requester can update own feedback" 
ON public.support_ticket_feedback FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_support_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_feedback_updated_at ON public.support_ticket_feedback;
CREATE TRIGGER trigger_support_feedback_updated_at
BEFORE UPDATE ON public.support_ticket_feedback
FOR EACH ROW
EXECUTE FUNCTION update_support_feedback_updated_at();


-- ============================================================================
-- 2. SUPPORT NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticket_id UUID NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'ticket_created', 'new_message', 'ticket_assigned', 'status_changed', 
        'priority_changed', 'ticket_escalated', 'information_requested', 
        'ticket_resolved', 'ticket_reopened', 'feedback_requested'
    )),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ NULL
);

-- Enable RLS
ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own notifications" ON public.support_notifications;
    DROP POLICY IF EXISTS "Users can update their own notifications" ON public.support_notifications;
EXCEPTION WHEN OTHERS THEN END $$;

CREATE POLICY "Users can view their own notifications" 
ON public.support_notifications FOR SELECT 
USING (recipient_user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" 
ON public.support_notifications FOR UPDATE 
USING (recipient_user_id = auth.uid())
WITH CHECK (recipient_user_id = auth.uid());
-- No frontend insert policy. Only internal functions create notifications.


-- ============================================================================
-- 3. NOTIFICATION GENERATION FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION internal_create_notification(
    p_recipient_user_id UUID,
    p_ticket_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_body TEXT
) RETURNS VOID 
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- No notificar a uno mismo, a menos que sea algo muy específico, pero como regla general:
    IF p_recipient_user_id = auth.uid() THEN
        RETURN;
    END IF;

    INSERT INTO public.support_notifications (recipient_user_id, ticket_id, type, title, body)
    VALUES (p_recipient_user_id, p_ticket_id, p_type, p_title, p_body);
END;
$$;

-- A) Trigger for New Ticket
CREATE OR REPLACE FUNCTION notify_on_ticket_created()
RETURNS TRIGGER AS $$
DECLARE
    admin_record RECORD;
BEGIN
    FOR admin_record IN SELECT id FROM public.profiles WHERE business_role = 'platform_admin'
    LOOP
        PERFORM internal_create_notification(
            admin_record.id,
            NEW.id,
            'ticket_created',
            'Nuevo Ticket Creado',
            'El usuario ha creado un nuevo ticket: ' || NEW.subject
        );
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_ticket_created ON public.support_tickets;
CREATE TRIGGER trigger_notify_ticket_created
AFTER INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION notify_on_ticket_created();


-- B) Trigger for Ticket Updates
CREATE OR REPLACE FUNCTION notify_on_ticket_updated()
RETURNS TRIGGER AS $$
BEGIN
    -- Assigned to changed
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
        PERFORM internal_create_notification(
            NEW.assigned_to,
            NEW.id,
            'ticket_assigned',
            'Ticket Asignado',
            'Se te ha asignado el ticket: ' || NEW.subject
        );
    END IF;

    -- Status changed
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        -- Notify requester
        PERFORM internal_create_notification(
            NEW.requester_user_id,
            NEW.id,
            'status_changed',
            'Estado de Ticket Actualizado',
            'El ticket "' || NEW.subject || '" ha cambiado a estado: ' || NEW.status
        );

        -- Specific status notifications
        IF NEW.status = 'resolved' THEN
            PERFORM internal_create_notification(
                NEW.requester_user_id,
                NEW.id,
                'ticket_resolved',
                'Ticket Resuelto',
                'Tu caso ha sido resuelto. Por favor, califica tu experiencia.'
            );
        END IF;

        IF NEW.status = 'waiting_for_user' THEN
            PERFORM internal_create_notification(
                NEW.requester_user_id,
                NEW.id,
                'information_requested',
                'Información Requerida',
                'Necesitamos más detalles para tu ticket: ' || NEW.subject
            );
        END IF;
    END IF;

    -- Priority changed
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
        IF NEW.assigned_to IS NOT NULL THEN
            PERFORM internal_create_notification(
                NEW.assigned_to,
                NEW.id,
                'priority_changed',
                'Prioridad Cambiada',
                'La prioridad del ticket "' || NEW.subject || '" cambió a ' || NEW.priority
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_ticket_updated ON public.support_tickets;
CREATE TRIGGER trigger_notify_ticket_updated
AFTER UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION notify_on_ticket_updated();


-- C) Trigger for New Messages
CREATE OR REPLACE FUNCTION notify_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    rest_member RECORD;
BEGIN
    SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

    -- Si es interno, solo notificar a admin asignado
    IF NEW.is_internal THEN
        IF v_ticket.assigned_to IS NOT NULL THEN
            PERFORM internal_create_notification(
                v_ticket.assigned_to,
                NEW.ticket_id,
                'new_message',
                'Nota Interna',
                'Nueva nota interna en ticket: ' || v_ticket.subject
            );
        END IF;
        RETURN NEW;
    END IF;

    -- Si es público, notificar al requester si el autor no es el requester
    IF NEW.author_user_id <> v_ticket.requester_user_id THEN
        PERFORM internal_create_notification(
            v_ticket.requester_user_id,
            NEW.ticket_id,
            'new_message',
            'Nuevo Mensaje',
            'Tienes un nuevo mensaje en el ticket: ' || v_ticket.subject
        );
    END IF;

    -- Notificar al agente asignado si el autor no es el agente
    IF v_ticket.assigned_to IS NOT NULL AND NEW.author_user_id <> v_ticket.assigned_to THEN
        PERFORM internal_create_notification(
            v_ticket.assigned_to,
            NEW.ticket_id,
            'new_message',
            'Nuevo Mensaje',
            'Nuevo mensaje en tu ticket asignado: ' || v_ticket.subject
        );
    END IF;

    -- Notificar a los del restaurante (dueños/staff) si está asociado
    IF v_ticket.restaurant_id IS NOT NULL THEN
        FOR rest_member IN SELECT id FROM public.profiles WHERE tenant_id = v_ticket.restaurant_id AND id <> NEW.author_user_id
        LOOP
            PERFORM internal_create_notification(
                rest_member.id,
                NEW.ticket_id,
                'new_message',
                'Mensaje de Soporte',
                'Mensaje en ticket de tu restaurante: ' || v_ticket.subject
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_message ON public.support_messages;
CREATE TRIGGER trigger_notify_new_message
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION notify_on_new_message();


-- ============================================================================
-- 4. RPC PARA MÉTRICAS (FASE 8)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_support_metrics(
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_city_id UUID DEFAULT NULL,
    p_restaurant_id UUID DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_priority TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_total_created INT;
    v_total_open INT;
    v_total_resolved INT;
    v_total_closed INT;
    v_avg_first_response INTERVAL;
    v_avg_resolution INTERVAL;
    v_avg_rating NUMERIC;
    v_total_ratings INT;
    v_result JSON;
BEGIN
    -- Validar permisos (solo admin)
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND business_role = 'platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Calculate base metrics with filters
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('open', 'in_review', 'waiting_for_user', 'waiting_for_restaurant')),
        COUNT(*) FILTER (WHERE status = 'resolved'),
        COUNT(*) FILTER (WHERE status = 'closed'),
        AVG(first_response_at - created_at) FILTER (WHERE first_response_at IS NOT NULL),
        AVG(resolved_at - created_at) FILTER (WHERE resolved_at IS NOT NULL)
    INTO 
        v_total_created, v_total_open, v_total_resolved, v_total_closed, v_avg_first_response, v_avg_resolution
    FROM public.support_tickets t
    WHERE 
        (p_start_date IS NULL OR t.created_at >= p_start_date)
        AND (p_end_date IS NULL OR t.created_at <= p_end_date)
        AND (p_city_id IS NULL OR t.city_id = p_city_id)
        AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
        AND (p_category IS NULL OR t.category = p_category)
        AND (p_assigned_to IS NULL OR t.assigned_to = p_assigned_to)
        AND (p_priority IS NULL OR t.priority = p_priority);

    -- Calculate rating metrics
    SELECT 
        AVG(f.rating),
        COUNT(f.id)
    INTO 
        v_avg_rating, v_total_ratings
    FROM public.support_ticket_feedback f
    JOIN public.support_tickets t ON t.id = f.ticket_id
    WHERE 
        (p_start_date IS NULL OR t.created_at >= p_start_date)
        AND (p_end_date IS NULL OR t.created_at <= p_end_date)
        AND (p_city_id IS NULL OR t.city_id = p_city_id)
        AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
        AND (p_category IS NULL OR t.category = p_category)
        AND (p_assigned_to IS NULL OR t.assigned_to = p_assigned_to)
        AND (p_priority IS NULL OR t.priority = p_priority);

    -- Construct JSON
    v_result := json_build_object(
        'total_created', v_total_created,
        'total_open', v_total_open,
        'total_resolved', v_total_resolved,
        'total_closed', v_total_closed,
        'avg_first_response_seconds', EXTRACT(EPOCH FROM v_avg_first_response),
        'avg_resolution_seconds', EXTRACT(EPOCH FROM v_avg_resolution),
        'avg_rating', ROUND(COALESCE(v_avg_rating, 0), 2),
        'total_ratings', v_total_ratings
    );

    RETURN v_result;
END;
$$;
