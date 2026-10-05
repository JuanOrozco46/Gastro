-- ============================================================================
-- GASTROSYNC - 024: SUPPORT TICKETS (FASE 4)
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id UUID NOT NULL REFERENCES auth.users(id),
    restaurant_id UUID NULL REFERENCES public.restaurants(id),
    city_id UUID NULL REFERENCES public.cities(id),
    category TEXT NOT NULL CHECK (category IN ('order', 'payment', 'restaurant', 'delivery', 'account', 'menu', 'technical', 'other')),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'waiting_for_user', 'waiting_for_restaurant', 'resolved', 'closed')),
    assigned_to UUID NULL REFERENCES auth.users(id),
    related_order_id UUID NULL REFERENCES public.orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_response_at TIMESTAMPTZ NULL,
    resolved_at TIMESTAMPTZ NULL,
    closed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES auth.users(id),
    body TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TRIGGER: auto-update updated_at for support_tickets
-- ============================================================================
CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trigger_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION update_support_ticket_updated_at();

-- ============================================================================
-- TRIGGER: prevent unauthorized column updates by non-admins
-- ============================================================================
CREATE OR REPLACE FUNCTION protect_support_ticket_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_platform_admin(auth.uid()) = FALSE THEN
        -- Usuarios normales solo pueden cambiar el 'status' (ej. cerrarlo o reabrirlo)
        -- No pueden cambiar asignación, ni prioridad, ni el autor original, ni categoría/asunto/descripción
        IF NEW.requester_user_id <> OLD.requester_user_id THEN
            RAISE EXCEPTION 'No se puede cambiar el autor del ticket';
        END IF;
        IF NEW.priority <> OLD.priority THEN
            RAISE EXCEPTION 'No tienes permisos para cambiar la prioridad del ticket';
        END IF;
        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
            RAISE EXCEPTION 'No tienes permisos para reasignar el ticket';
        END IF;
        IF NEW.category <> OLD.category THEN
            RAISE EXCEPTION 'No se puede cambiar la categoría del ticket';
        END IF;
        IF NEW.subject <> OLD.subject THEN
            RAISE EXCEPTION 'No se puede cambiar el asunto del ticket';
        END IF;
        IF NEW.description <> OLD.description THEN
            RAISE EXCEPTION 'No se puede cambiar la descripción original del ticket';
        END IF;
    END IF;
    
    -- Manejo automático de fechas según estado
    IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
        NEW.resolved_at = COALESCE(NEW.resolved_at, NOW());
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
        NEW.closed_at = COALESCE(NEW.closed_at, NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_support_ticket_columns ON public.support_tickets;
CREATE TRIGGER trigger_protect_support_ticket_columns
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION protect_support_ticket_columns();

-- Trigger for first_response_at on first non-requester message
CREATE OR REPLACE FUNCTION support_message_first_response()
RETURNS TRIGGER AS $$
DECLARE
    v_requester UUID;
    v_first_response TIMESTAMPTZ;
BEGIN
    SELECT requester_user_id, first_response_at INTO v_requester, v_first_response
    FROM public.support_tickets WHERE id = NEW.ticket_id;
    
    IF v_first_response IS NULL AND NEW.author_user_id <> v_requester AND NEW.is_internal = FALSE THEN
        UPDATE public.support_tickets SET first_response_at = NOW() WHERE id = NEW.ticket_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_message_first_response ON public.support_messages;
CREATE TRIGGER trigger_support_message_first_response
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION support_message_first_response();


-- ============================================================================
-- RLS - ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- 1. Support Tickets Policies

DROP POLICY IF EXISTS "support_tickets_select" ON public.support_tickets;
CREATE POLICY "support_tickets_select" ON public.support_tickets FOR SELECT
USING (
    requester_user_id = auth.uid() 
    OR public.is_platform_admin(auth.uid()) 
    OR (
        restaurant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.restaurant_members 
            WHERE restaurant_members.restaurant_id = public.support_tickets.restaurant_id 
            AND restaurant_members.user_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "support_tickets_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_insert" ON public.support_tickets FOR INSERT
WITH CHECK (
    requester_user_id = auth.uid()
);

DROP POLICY IF EXISTS "support_tickets_update" ON public.support_tickets;
CREATE POLICY "support_tickets_update" ON public.support_tickets FOR UPDATE
USING (
    requester_user_id = auth.uid() 
    OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
    requester_user_id = auth.uid() 
    OR public.is_platform_admin(auth.uid())
);


-- 2. Support Messages Policies

DROP POLICY IF EXISTS "support_messages_select" ON public.support_messages;
CREATE POLICY "support_messages_select" ON public.support_messages FOR SELECT
USING (
    -- El ticket asociado debe ser visible (se cumple por cadena gracias a la RLS de tickets)
    EXISTS (SELECT 1 FROM public.support_tickets WHERE id = public.support_messages.ticket_id)
    AND 
    -- Solo admins ven internal notes
    (
        is_internal = FALSE 
        OR public.is_platform_admin(auth.uid())
    )
);

DROP POLICY IF EXISTS "support_messages_insert" ON public.support_messages;
CREATE POLICY "support_messages_insert" ON public.support_messages FOR INSERT
WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.support_tickets WHERE id = public.support_messages.ticket_id)
    AND (
        is_internal = FALSE 
        OR public.is_platform_admin(auth.uid())
    )
);
