-- ============================================================================
-- GASTROSYNC - MIGRACIÓN 058: REMEDIACIÓN INTEGRAL DE AUDITORÍA TÉCNICA
-- Versión: 058_comprehensive_audit_remediation.sql
-- Fecha: 2026-10-12
-- Descripción:
--   Remedia en una migración nueva, idempotente y segura todos los hallazgos
--   de base de datos, RLS, RPCs, triggers y Storage identificados en la
--   auditoría integral (P0-01 a P0-06, P1-04, P1-06, P1-07, P1-09, P1-10,
--   P1-11, P1-13, P1-14, P1-15, P1-18).
--   Ninguna migración histórica (001..057) ha sido modificada.
-- ============================================================================

-- ============================================================================
-- 1. P0-01: REPARACIÓN INTEGRAL DE FUNCIONES Y TRIGGERS DE SOPORTE
--    Restaura las tablas reales (support_audit_log, support_notifications)
--    y columnas reales (requester_user_id, assigned_to, author_user_id,
--    platform_role = 'platform_admin'), con bloques EXCEPTION para no abortar
--    jamás la creación de tickets/mensajes y sin notificar notas internas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.internal_create_notification(
  p_recipient_user_id UUID,
  p_ticket_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient_user_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL AND p_recipient_user_id = auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO public.support_notifications (
    recipient_user_id,
    ticket_id,
    type,
    title,
    body
  ) VALUES (
    p_recipient_user_id,
    p_ticket_id,
    p_type,
    COALESCE(NULLIF(btrim(p_title), ''), 'Notificación de Soporte'),
    COALESCE(NULLIF(btrim(p_body), ''), '')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'internal_create_notification falló de forma segura: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_create_notification(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_create_notification(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_support_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := COALESCE(auth.uid(), NEW.requester_user_id);
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.support_audit_log (
        ticket_id,
        actor_user_id,
        action_type,
        new_value,
        metadata
      ) VALUES (
        NEW.id,
        v_actor,
        'ticket_created',
        NEW.status,
        jsonb_build_object(
          'priority', NEW.priority,
          'category', NEW.category,
          'requester_type', NEW.requester_type
        )
      );
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.support_audit_log (
          ticket_id,
          actor_user_id,
          action_type,
          previous_value,
          new_value
        ) VALUES (
          NEW.id,
          v_actor,
          CASE WHEN NEW.status = 'reopened' THEN 'ticket_reopened' ELSE 'status_changed' END,
          OLD.status,
          NEW.status
        );
      END IF;

      IF OLD.priority IS DISTINCT FROM NEW.priority THEN
        INSERT INTO public.support_audit_log (
          ticket_id,
          actor_user_id,
          action_type,
          previous_value,
          new_value
        ) VALUES (
          NEW.id,
          v_actor,
          'priority_changed',
          OLD.priority,
          NEW.priority
        );
      END IF;

      IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        INSERT INTO public.support_audit_log (
          ticket_id,
          actor_user_id,
          action_type,
          previous_value,
          new_value
        ) VALUES (
          NEW.id,
          v_actor,
          'assigned_changed',
          OLD.assigned_to::TEXT,
          NEW.assigned_to::TEXT
        );
      END IF;

      IF OLD.satisfaction_score IS DISTINCT FROM NEW.satisfaction_score AND NEW.satisfaction_score IS NOT NULL THEN
        INSERT INTO public.support_audit_log (
          ticket_id,
          actor_user_id,
          action_type,
          previous_value,
          new_value,
          metadata
        ) VALUES (
          NEW.id,
          v_actor,
          'feedback_submitted',
          OLD.satisfaction_score::TEXT,
          NEW.satisfaction_score::TEXT,
          jsonb_build_object('comment', NEW.satisfaction_comment)
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log_support_ticket_changes falló de forma segura: %', SQLERRM;
  END;

  RETURN NEW;
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
  v_short_id TEXT := upper(substring(NEW.id::TEXT FROM 1 FOR 8));
BEGIN
  BEGIN
    FOR v_admin IN
      SELECT id
      FROM public.profiles
      WHERE (platform_role = 'platform_admin' OR business_role = 'platform_admin')
        AND id IS DISTINCT FROM NEW.requester_user_id
    LOOP
      PERFORM public.internal_create_notification(
        v_admin.id,
        NEW.id,
        'ticket_created',
        'Nuevo Ticket #' || v_short_id,
        'Se ha creado un ticket (' || COALESCE(NEW.priority, 'medium') || '): ' || COALESCE(NEW.subject, 'Sin asunto')
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_ticket_created falló de forma segura: %', SQLERRM;
  END;

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
  v_short_id TEXT := upper(substring(NEW.id::TEXT FROM 1 FOR 8));
  v_admin RECORD;
BEGIN
  BEGIN
    -- 1. Cambio de asignación
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      PERFORM public.internal_create_notification(
        NEW.assigned_to,
        NEW.id,
        'ticket_assigned',
        'Ticket Asignado #' || v_short_id,
        'Se te ha asignado el ticket: ' || COALESCE(NEW.subject, 'Sin asunto')
      );
    END IF;

    -- 2. Cambio de estado
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'waiting_for_customer' THEN
        PERFORM public.internal_create_notification(
          NEW.requester_user_id,
          NEW.id,
          'information_requested',
          'Acción requerida en tu Ticket #' || v_short_id,
          'Soporte necesita más información sobre: ' || COALESCE(NEW.subject, '')
        );
      ELSIF NEW.status = 'resolved' THEN
        PERFORM public.internal_create_notification(
          NEW.requester_user_id,
          NEW.id,
          'ticket_resolved',
          'Ticket Resuelto #' || v_short_id,
          'Tu caso "' || COALESCE(NEW.subject, '') || '" ha sido marcado como resuelto.'
        );
        PERFORM public.internal_create_notification(
          NEW.requester_user_id,
          NEW.id,
          'feedback_requested',
          'Califica nuestra atención #' || v_short_id,
          'Cuéntanos cómo te fue con la resolución de tu caso.'
        );
      ELSIF NEW.status = 'reopened' THEN
        IF NEW.assigned_to IS NOT NULL THEN
          PERFORM public.internal_create_notification(
            NEW.assigned_to,
            NEW.id,
            'ticket_reopened',
            'Ticket Reabierto #' || v_short_id,
            'El usuario ha reabierto el ticket: ' || COALESCE(NEW.subject, '')
          );
        ELSE
          FOR v_admin IN
            SELECT id FROM public.profiles
            WHERE (platform_role = 'platform_admin' OR business_role = 'platform_admin')
              AND id IS DISTINCT FROM NEW.requester_user_id
          LOOP
            PERFORM public.internal_create_notification(
              v_admin.id,
              NEW.id,
              'ticket_reopened',
              'Ticket Reabierto #' || v_short_id,
              'El usuario ha reabierto el ticket: ' || COALESCE(NEW.subject, '')
            );
          END LOOP;
        END IF;
      ELSIF NEW.status IN ('in_progress', 'closed') THEN
        PERFORM public.internal_create_notification(
          NEW.requester_user_id,
          NEW.id,
          'status_changed',
          'Actualización en Ticket #' || v_short_id,
          'El estado de tu solicitud cambió a: ' || NEW.status
        );
      END IF;
    END IF;

    -- 3. Cambio de prioridad
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      IF NEW.priority = 'urgent' THEN
        IF NEW.assigned_to IS NOT NULL THEN
          PERFORM public.internal_create_notification(
            NEW.assigned_to,
            NEW.id,
            'ticket_escalated',
            'URGENTE: Ticket Escalado #' || v_short_id,
            'El ticket "' || COALESCE(NEW.subject, '') || '" ha sido escalado a prioridad urgente.'
          );
        ELSE
          FOR v_admin IN
            SELECT id FROM public.profiles
            WHERE (platform_role = 'platform_admin' OR business_role = 'platform_admin')
          LOOP
            PERFORM public.internal_create_notification(
              v_admin.id,
              NEW.id,
              'ticket_escalated',
              'URGENTE: Ticket Escalado #' || v_short_id,
              'El ticket "' || COALESCE(NEW.subject, '') || '" ha sido escalado a prioridad urgente.'
            );
          END LOOP;
        END IF;
      ELSIF NEW.assigned_to IS NOT NULL THEN
        PERFORM public.internal_create_notification(
          NEW.assigned_to,
          NEW.id,
          'priority_changed',
          'Prioridad modificada #' || v_short_id,
          'La prioridad del ticket ahora es: ' || NEW.priority
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_ticket_updated falló de forma segura: %', SQLERRM;
  END;

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
  v_short_id TEXT;
  v_is_admin BOOLEAN := FALSE;
  v_admin RECORD;
BEGIN
  BEGIN
    SELECT * INTO v_ticket
    FROM public.support_tickets
    WHERE id = NEW.ticket_id;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_short_id := upper(substring(v_ticket.id::TEXT FROM 1 FOR 8));
    v_is_admin := public.is_platform_admin(NEW.author_user_id);

    -- Actualizar marcas de tiempo en support_tickets
    IF v_is_admin THEN
      UPDATE public.support_tickets
      SET
        first_response_at = COALESCE(first_response_at, NOW()),
        last_agent_message_at = CASE WHEN NEW.is_internal = FALSE THEN NOW() ELSE last_agent_message_at END,
        updated_at = NOW()
      WHERE id = NEW.ticket_id;
    ELSE
      UPDATE public.support_tickets
      SET
        last_customer_message_at = NOW(),
        status = CASE WHEN status = 'waiting_for_customer' THEN 'in_progress' ELSE status END,
        updated_at = NOW()
      WHERE id = NEW.ticket_id;
    END IF;

    -- REGLA CRÍTICA P0-01 / P0-03: Si es nota interna, JAMÁS notificar al solicitante
    IF COALESCE(NEW.is_internal, FALSE) = TRUE THEN
      IF v_ticket.assigned_to IS NOT NULL AND v_ticket.assigned_to IS DISTINCT FROM NEW.author_user_id THEN
        PERFORM public.internal_create_notification(
          v_ticket.assigned_to,
          v_ticket.id,
          'new_message',
          'Nota interna en Ticket #' || v_short_id,
          'Se agregó una nota interna en "' || COALESCE(v_ticket.subject, '') || '".'
        );
      END IF;
      RETURN NEW;
    END IF;

    -- Mensaje público
    IF v_is_admin THEN
      IF v_ticket.requester_user_id IS DISTINCT FROM NEW.author_user_id THEN
        PERFORM public.internal_create_notification(
          v_ticket.requester_user_id,
          v_ticket.id,
          'new_message',
          'Nueva respuesta de Soporte #' || v_short_id,
          'Tienes un nuevo mensaje en "' || COALESCE(v_ticket.subject, '') || '".'
        );
      END IF;
    ELSE
      IF v_ticket.assigned_to IS NOT NULL THEN
        PERFORM public.internal_create_notification(
          v_ticket.assigned_to,
          v_ticket.id,
          'new_message',
          'Respuesta del usuario #' || v_short_id,
          'Nuevo mensaje en "' || COALESCE(v_ticket.subject, '') || '".'
        );
      ELSE
        FOR v_admin IN
          SELECT id FROM public.profiles
          WHERE (platform_role = 'platform_admin' OR business_role = 'platform_admin')
            AND id IS DISTINCT FROM NEW.author_user_id
        LOOP
          PERFORM public.internal_create_notification(
            v_admin.id,
            v_ticket.id,
            'new_message',
            'Nuevo mensaje en Ticket sin asignar #' || v_short_id,
            'El usuario escribió en "' || COALESCE(v_ticket.subject, '') || '".'
          );
        END LOOP;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_new_message falló de forma segura: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Asegurar triggers limpios y sin duplicados en support_tickets y support_messages
DROP TRIGGER IF EXISTS trigger_audit_support_tickets ON public.support_tickets;
DROP TRIGGER IF EXISTS trg_audit_support_tickets ON public.support_tickets;
CREATE TRIGGER trg_audit_support_tickets
  AFTER INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_support_ticket_changes();

DROP TRIGGER IF EXISTS trigger_notify_ticket_created ON public.support_tickets;
DROP TRIGGER IF EXISTS trg_notify_ticket_created ON public.support_tickets;
CREATE TRIGGER trg_notify_ticket_created
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_ticket_created();

DROP TRIGGER IF EXISTS trigger_notify_ticket_updated ON public.support_tickets;
DROP TRIGGER IF EXISTS trg_notify_ticket_updated ON public.support_tickets;
CREATE TRIGGER trg_notify_ticket_updated
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_ticket_updated();

DROP TRIGGER IF EXISTS trigger_notify_new_message ON public.support_messages;
DROP TRIGGER IF EXISTS trg_notify_new_message ON public.support_messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_message();


-- ============================================================================
-- 2. P0-02: PROTECCIÓN DE DATOS PERSONALES (PII) EN public.profiles
--    Elimina la política abierta profiles_select_public_meta (USING true) y
--    expone únicamente { id, full_name, username, avatar_url } mediante RPCs
--    SECURITY DEFINER de superficie mínima.
-- ============================================================================

DROP POLICY IF EXISTS "profiles_select_public_meta" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_platform_admin(auth.uid())
);

CREATE OR REPLACE FUNCTION public.get_public_profiles_by_ids(p_user_ids UUID[])
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  username TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_ids IS NULL OR COALESCE(array_length(p_user_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(NULLIF(btrim(p.full_name), ''), 'Cliente GastroSync') AS full_name,
    p.username,
    p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids[1:200]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profiles_by_ids(UUID[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_username_available(
  p_username TEXT,
  p_exclude_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  v_clean := NULLIF(regexp_replace(lower(btrim(COALESCE(p_username, ''))), '^@+', ''), '');
  IF v_clean IS NULL OR length(v_clean) < 3 THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.username) = v_clean
      AND (p_exclude_user_id IS NULL OR p.id <> p_exclude_user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_username TEXT;
  v_clean_username TEXT;
  v_pref_city UUID := NULL;
  v_pref_zone UUID := NULL;
  v_saved_addrs JSONB := '[]'::jsonb;
  v_terms_at TIMESTAMPTZ := NOW();
  v_privacy_at TIMESTAMPTZ := NOW();
BEGIN
  v_raw_username := NULLIF(regexp_replace(LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'username', ''))), '^@+', ''), '');

  IF v_raw_username IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = v_raw_username AND id <> NEW.id) THEN
      v_clean_username := v_raw_username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 4);
    ELSE
      v_clean_username := v_raw_username;
    END IF;
  ELSE
    v_clean_username := NULL;
  END IF;

  BEGIN
    IF NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'preferred_city_id', '')), '') IS NOT NULL THEN
      v_pref_city := (TRIM(NEW.raw_user_meta_data->>'preferred_city_id'))::UUID;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pref_city := NULL;
  END;

  BEGIN
    IF NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'preferred_zone_id', '')), '') IS NOT NULL THEN
      v_pref_zone := (TRIM(NEW.raw_user_meta_data->>'preferred_zone_id'))::UUID;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pref_zone := NULL;
  END;

  BEGIN
    IF NEW.raw_user_meta_data ? 'saved_addresses' AND jsonb_typeof(NEW.raw_user_meta_data->'saved_addresses') = 'array' THEN
      v_saved_addrs := NEW.raw_user_meta_data->'saved_addresses';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_saved_addrs := '[]'::jsonb;
  END;

  BEGIN
    IF NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'terms_accepted_at', '')), '') IS NOT NULL THEN
      v_terms_at := (TRIM(NEW.raw_user_meta_data->>'terms_accepted_at'))::TIMESTAMPTZ;
    END IF;
    IF NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'privacy_accepted_at', '')), '') IS NOT NULL THEN
      v_privacy_at := (TRIM(NEW.raw_user_meta_data->>'privacy_accepted_at'))::TIMESTAMPTZ;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_terms_at := NOW();
    v_privacy_at := NOW();
  END;

  INSERT INTO public.profiles (
    id,
    full_name,
    username,
    avatar_url,
    phone,
    default_address,
    default_delivery_notes,
    preferred_city_id,
    preferred_zone_id,
    saved_addresses,
    terms_accepted_at,
    privacy_accepted_at,
    privacy_policy_version,
    platform_role,
    business_role,
    tenant_id
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, 'Usuario GastroSync'),
    v_clean_username,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'default_address', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'default_delivery_notes', '')), ''),
    v_pref_city,
    v_pref_zone,
    v_saved_addrs,
    v_terms_at,
    v_privacy_at,
    COALESCE(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'privacy_policy_version', '')), ''), '2026.1'),
    'customer',
    'customer',
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    default_address = COALESCE(EXCLUDED.default_address, public.profiles.default_address),
    default_delivery_notes = COALESCE(EXCLUDED.default_delivery_notes, public.profiles.default_delivery_notes),
    preferred_city_id = COALESCE(EXCLUDED.preferred_city_id, public.profiles.preferred_city_id),
    preferred_zone_id = COALESCE(EXCLUDED.preferred_zone_id, public.profiles.preferred_zone_id),
    saved_addresses = CASE
      WHEN jsonb_typeof(EXCLUDED.saved_addresses) = 'array' AND jsonb_array_length(EXCLUDED.saved_addresses) > 0
        THEN EXCLUDED.saved_addresses
      ELSE public.profiles.saved_addresses
    END,
    terms_accepted_at = COALESCE(public.profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    privacy_accepted_at = COALESCE(public.profiles.privacy_accepted_at, EXCLUDED.privacy_accepted_at),
    privacy_policy_version = COALESCE(EXCLUDED.privacy_policy_version, public.profiles.privacy_policy_version),
    updated_at = NOW();

  PERFORM public.provision_restaurant_for_user(NEW.id, NEW.email);

  RETURN NEW;
END;
$$;


-- ============================================================================
-- 3. P0-03: AISLAMIENTO ESTRICTO DE NOTAS INTERNAS EN public.support_messages
--    Garantiza en RLS que ningún cliente ni restaurante pueda leer ni insertar
--    mensajes con is_internal = TRUE.
-- ============================================================================

DROP POLICY IF EXISTS "support_messages_select" ON public.support_messages;
CREATE POLICY "support_messages_select"
ON public.support_messages
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (
    COALESCE(is_internal, FALSE) = FALSE
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          t.requester_user_id = auth.uid()
          OR (t.restaurant_id IS NOT NULL AND public.is_restaurant_member(auth.uid(), t.restaurant_id))
        )
    )
  )
);

DROP POLICY IF EXISTS "support_messages_insert" ON public.support_messages;
CREATE POLICY "support_messages_insert"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND (
    public.is_platform_admin(auth.uid())
    OR (
      COALESCE(is_internal, FALSE) = FALSE
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets t
        WHERE t.id = support_messages.ticket_id
          AND t.status != 'closed'
          AND (
            t.requester_user_id = auth.uid()
            OR (t.restaurant_id IS NOT NULL AND public.is_restaurant_member(auth.uid(), t.restaurant_id))
          )
      )
    )
  )
);

-- Aislamiento criptográfico en Storage para el bucket support-attachments (tickets/{ticket_id}/{filename})
CREATE OR REPLACE FUNCTION public.can_access_support_attachment_path(p_object_name TEXT, p_for_write BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_parts TEXT[];
  v_ticket_id UUID;
BEGIN
  IF v_uid IS NULL OR p_object_name IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_platform_admin(v_uid) THEN
    RETURN TRUE;
  END IF;

  v_parts := string_to_array(p_object_name, '/');
  IF COALESCE(array_length(v_parts, 1), 0) < 3 OR v_parts[1] <> 'tickets' THEN
    RETURN FALSE;
  END IF;

  BEGIN
    v_ticket_id := v_parts[2]::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = v_ticket_id
      AND (NOT p_for_write OR t.status <> 'closed')
      AND (
        t.requester_user_id = v_uid
        OR (t.restaurant_id IS NOT NULL AND public.is_restaurant_member(v_uid, t.restaurant_id))
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_support_attachment_path(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_support_attachment_path(TEXT, BOOLEAN) TO authenticated;

DROP POLICY IF EXISTS "support_attachments_select_strict" ON storage.objects;
CREATE POLICY "support_attachments_select_strict"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND public.can_access_support_attachment_path(name, FALSE)
);

DROP POLICY IF EXISTS "support_attachments_insert_strict" ON storage.objects;
CREATE POLICY "support_attachments_insert_strict"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND public.can_access_support_attachment_path(name, TRUE)
);


-- ============================================================================
-- 4. P0-04: REPARACIÓN DE public.deactivate_and_purge_my_restaurant
--    Corrige las referencias a columnas reales (description, banner_url,
--    payout_account_holder, profiles.tenant_id, profiles.business_role),
--    anonimiza restaurant_applications, preserva órdenes/pagos/liquidaciones
--    y devuelve las URLs de archivos en Storage para limpieza.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.privacy_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user_account', 'restaurant_tenant')),
  target_restaurant_id UUID,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.privacy_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_deletion_requests_select_admin" ON public.privacy_deletion_requests;
CREATE POLICY "privacy_deletion_requests_select_admin"
ON public.privacy_deletion_requests
FOR SELECT
TO authenticated
USING (
  requester_user_id = auth.uid()
  OR public.is_platform_admin(auth.uid())
);

DROP FUNCTION IF EXISTS public.deactivate_and_purge_my_restaurant(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.deactivate_and_purge_my_restaurant(
  p_restaurant_id UUID,
  p_confirm_text TEXT DEFAULT 'ELIMINAR RESTAURANTE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rest RECORD;
  v_active_orders INTEGER := 0;
  v_deleted_posts INTEGER := 0;
  v_deleted_products INTEGER := 0;
  v_media_urls TEXT[] := ARRAY[]::TEXT[];
  v_request_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado: debes iniciar sesión para dar de baja tu restaurante.';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Debes especificar el identificador del restaurante.';
  END IF;

  IF upper(btrim(COALESCE(p_confirm_text, ''))) NOT IN ('ELIMINAR RESTAURANTE', 'OWNER_REQUEST') THEN
    RAISE EXCEPTION 'Confirmación inválida: escribe exactamente ELIMINAR RESTAURANTE para confirmar la baja.';
  END IF;

  SELECT * INTO v_rest
  FROM public.restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El restaurante especificado no existe.';
  END IF;

  -- Idempotencia: si ya fue dado de baja y purgado previamente
  IF v_rest.status = 'suspended' AND v_rest.owner_user_id IS NULL AND (
    v_rest.name LIKE 'Comercio Retirado%'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_purged', true,
      'purged_restaurant_id', p_restaurant_id,
      'restaurant_id', p_restaurant_id,
      'deleted_posts', 0,
      'deleted_products', 0,
      'media_urls', '[]'::jsonb,
      'message', 'El restaurante ya había sido desactivado y anonimizado previamente.'
    );
  END IF;

  IF NOT (
    public.is_restaurant_owner(v_uid, p_restaurant_id)
    OR public.is_platform_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'Solo el propietario titular o un administrador de plataforma puede solicitar la baja del restaurante.';
  END IF;

  -- Verificar que no existan órdenes activas en cocina o reparto
  SELECT COUNT(*) INTO v_active_orders
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RAISE EXCEPTION 'El restaurante tiene % pedido(s) activo(s) en curso. Finalízalos o cancélalos antes de dar de baja el comercio.', v_active_orders;
  END IF;

  -- Recolectar URLs de medios para limpieza en Storage
  SELECT ARRAY_REMOVE(
    ARRAY_CAT(
      ARRAY[v_rest.logo_url, v_rest.banner_url],
      ARRAY(
        SELECT p.media_url FROM public.posts p
        WHERE p.restaurant_id = p_restaurant_id AND p.media_url IS NOT NULL
        UNION ALL
        SELECT pr.image_url FROM public.products pr
        WHERE pr.restaurant_id = p_restaurant_id AND pr.image_url IS NOT NULL
      )
    ),
    NULL
  ) INTO v_media_urls;

  -- 1. Registrar acta en privacy_deletion_requests
  INSERT INTO public.privacy_deletion_requests (
    requester_user_id,
    target_type,
    target_restaurant_id,
    reason,
    status,
    completed_at
  ) VALUES (
    v_uid,
    'restaurant_tenant',
    p_restaurant_id,
    COALESCE(NULLIF(btrim(p_confirm_text), ''), 'ELIMINAR RESTAURANTE'),
    'completed',
    NOW()
  ) RETURNING id INTO v_request_id;

  -- 2. Archivar/despublicar publicaciones y productos (preservando FK de order_items)
  UPDATE public.posts
  SET
    is_published = FALSE,
    is_archived = TRUE,
    media_url = NULL,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS v_deleted_posts = ROW_COUNT;

  DELETE FROM public.products pr
  WHERE pr.restaurant_id = p_restaurant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.product_id = pr.id
    );
  GET DIAGNOSTICS v_deleted_products = ROW_COUNT;

  UPDATE public.products
  SET
    available = FALSE,
    is_archived = TRUE,
    description = NULL,
    image_url = NULL,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id;

  -- 3. Eliminar horarios y desactivar mesas QR del restaurante
  DELETE FROM public.restaurant_hours WHERE restaurant_id = p_restaurant_id;

  UPDATE public.restaurant_tables
  SET
    is_active = FALSE,
    archived_at = COALESCE(archived_at, NOW())
  WHERE restaurant_id = p_restaurant_id;

  -- 4. Eliminar objetos multimedia del restaurante en Storage si existen
  DELETE FROM storage.objects
  WHERE bucket_id = 'gastro-media'
    AND (string_to_array(name, '/'))[1] = 'restaurants'
    AND (string_to_array(name, '/'))[2] = p_restaurant_id::TEXT;

  -- 5. Anonimizar datos sensibles y bancarios en public.restaurants (usando columnas reales)
  UPDATE public.restaurants
  SET
    status = 'suspended',
    is_open = FALSE,
    accepting_orders = FALSE,
    table_service_enabled = FALSE,
    name = 'Comercio Retirado #' || substr(replace(p_restaurant_id::TEXT, '-', ''), 1, 6),
    description = 'Este comercio solicitó su retiro y supresión de datos comerciales en GastroSync.',
    phone = NULL,
    whatsapp = NULL,
    address = 'Dirección suprimida por solicitud del titular (Ley 1581)',
    logo_url = NULL,
    banner_url = NULL,
    payout_bank_name = NULL,
    payout_account_type = NULL,
    payout_account_number = NULL,
    payout_account_holder = NULL,
    payout_document_type = NULL,
    payout_document_number = NULL,
    wompi_merchant_id = NULL,
    owner_user_id = NULL,
    updated_at = NOW()
  WHERE id = p_restaurant_id;

  -- 6. Anonimizar solicitudes vinculadas en public.restaurant_applications
  UPDATE public.restaurant_applications
  SET
    owner_name = 'Titular Anonimizado',
    owner_email = 'retired+' || substr(replace(id::TEXT, '-', ''), 1, 8) || '@deleted.gastrosync.local',
    owner_phone = '0000000000',
    whatsapp = NULL,
    address = 'Dirección suprimida',
    notes = NULL,
    logo_url = NULL,
    banner_url = NULL,
    logo_path = NULL,
    banner_path = NULL,
    updated_at = NOW()
  WHERE activated_restaurant_id = p_restaurant_id;

  -- 7. Revocar membresías activas o invitadas del restaurante
  UPDATE public.restaurant_members
  SET
    status = 'revoked',
    revoked_at = COALESCE(revoked_at, NOW()),
    email = NULL,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id
    AND status != 'revoked';

  -- 8. Desvincular tenant_id de perfiles asociados usando tenant_id y business_role reales
  UPDATE public.profiles
  SET
    tenant_id = NULL,
    business_role = CASE
      WHEN platform_role = 'platform_admin' THEN 'platform_admin'
      ELSE 'customer'
    END,
    updated_at = NOW()
  WHERE tenant_id = p_restaurant_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'purged_restaurant_id', p_restaurant_id,
    'restaurant_id', p_restaurant_id,
    'deleted_posts', v_deleted_posts,
    'deleted_products', v_deleted_products,
    'media_urls', to_jsonb(COALESCE(v_media_urls, ARRAY[]::TEXT[])),
    'purged_at', NOW(),
    'message', 'El restaurante ha sido desactivado, retirado del directorio público y sus datos bancarios y comerciales han sido anonimizados.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_and_purge_my_restaurant(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_and_purge_my_restaurant(UUID, TEXT) TO authenticated;


-- ============================================================================
-- 5. P0-05, P1-07, P1-13: CHECKOUT DE MESA QR (/mesa/:token), VALIDACIÓN DE
--    RESTAURANTE ACTIVO/ABIERTO Y SESIÓN DE MESA AISLADA SIN BYPASS 'legacy'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_restaurant_id UUID,
  p_fulfillment TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_delivery_address JSONB,
  p_items JSONB,
  p_table_number TEXT DEFAULT NULL,
  p_restaurant_notes TEXT DEFAULT NULL,
  p_table_id UUID DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_table_token TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'wompi'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_subtotal INTEGER := 0;
  v_delivery_fee INTEGER := 0;
  v_total INTEGER := 0;
  v_commission_rate NUMERIC := 0.03;
  v_platform_fee INTEGER := 0;
  v_gateway_fee INTEGER := 0;
  v_gateway_iva INTEGER := 0;
  v_restaurant_payout INTEGER := 0;
  v_item JSONB;
  v_unit_price INTEGER;
  v_product_name TEXT;
  v_product_available BOOLEAN;
  v_customer_id UUID;
  v_table_record RECORD;
  v_restaurant_record RECORD;
  v_resolved_restaurant_id UUID;
  v_resolved_table_id UUID;
  v_accepts_cash BOOLEAN;
  v_normalized_method TEXT;
  v_qty INTEGER;
BEGIN
  v_resolved_restaurant_id := p_restaurant_id;
  v_resolved_table_id := p_table_id;
  v_customer_id := auth.uid();
  v_normalized_method := COALESCE(NULLIF(lower(btrim(p_payment_method)), ''), 'wompi');

  IF v_normalized_method NOT IN ('cash', 'wompi', 'card', 'pse', 'nequi') THEN
    RAISE EXCEPTION 'Método de pago inválido: %', v_normalized_method;
  END IF;

  IF p_fulfillment NOT IN ('pickup', 'restaurant_delivery', 'table_service') THEN
    RAISE EXCEPTION 'Modalidad de entrega inválida: %', p_fulfillment;
  END IF;

  -- Domicilio y recoger en tienda requieren sesión autenticada
  IF p_fulfillment != 'table_service' AND v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'El pedido excede el límite máximo de líneas de producto permitidas (50).';
  END IF;

  -- Validación estricta de mesa QR cuando es table_service
  IF p_fulfillment = 'table_service' THEN
    IF p_table_token IS NOT NULL AND btrim(p_table_token) <> '' THEN
      SELECT * INTO v_table_record
      FROM public.restaurant_tables
      WHERE public_token = btrim(p_table_token)
        AND is_active = TRUE
        AND archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_table: La mesa no existe, está inactiva o el código QR expiró.';
      END IF;

      v_resolved_table_id := v_table_record.id;
      v_resolved_restaurant_id := v_table_record.restaurant_id;
      p_table_number := v_table_record.table_number;
    ELSIF p_table_id IS NOT NULL THEN
      SELECT * INTO v_table_record
      FROM public.restaurant_tables
      WHERE id = p_table_id
        AND restaurant_id = p_restaurant_id
        AND is_active = TRUE
        AND archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_table: La mesa no existe, pertenece a otro restaurante o está inactiva.';
      END IF;
      p_table_number := COALESCE(NULLIF(btrim(p_table_number), ''), v_table_record.table_number);
    ELSE
      RAISE EXCEPTION 'invalid_table: Se requiere una mesa QR válida para pedidos en mesa.';
    END IF;

    IF v_customer_id IS NULL AND (p_device_id IS NOT NULL AND length(btrim(p_device_id)) < 8 OR p_device_id IS NULL) THEN
      RAISE EXCEPTION 'invalid_session: Se requiere un identificador de sesión de mesa válido.';
    END IF;
  END IF;

  -- P1-13: Validar que el restaurante exista, esté activo, abierto y aceptando pedidos
  SELECT
    r.id,
    r.status,
    r.is_open,
    COALESCE(r.accepting_orders, TRUE) AS accepting_orders,
    COALESCE(r.table_service_enabled, FALSE) AS table_service_enabled,
    COALESCE(r.accepts_cash, TRUE) AS accepts_cash,
    COALESCE(r.commission_rate, 0.03) AS commission_rate,
    COALESCE(r.delivery_fee, 0) AS delivery_fee,
    COALESCE(r.min_order, 0) AS min_order
  INTO v_restaurant_record
  FROM public.restaurants r
  WHERE r.id = v_resolved_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El restaurante seleccionado no existe.';
  END IF;

  IF v_restaurant_record.status != 'active' THEN
    RAISE EXCEPTION 'El restaurante no se encuentra activo en este momento.';
  END IF;

  IF v_restaurant_record.is_open = FALSE OR v_restaurant_record.accepting_orders = FALSE THEN
    RAISE EXCEPTION 'El restaurante se encuentra cerrado o no está recibiendo pedidos en este momento.';
  END IF;

  IF p_fulfillment = 'table_service' AND v_restaurant_record.table_service_enabled = FALSE THEN
    RAISE EXCEPTION 'El servicio a la mesa no está habilitado en este restaurante.';
  END IF;

  v_accepts_cash := v_restaurant_record.accepts_cash;
  v_commission_rate := v_restaurant_record.commission_rate;
  v_delivery_fee := CASE WHEN p_fulfillment = 'restaurant_delivery' THEN v_restaurant_record.delivery_fee ELSE 0 END;

  IF v_normalized_method = 'cash' AND v_accepts_cash = FALSE THEN
    RAISE EXCEPTION 'invalid_payment: Este restaurante no acepta pagos en efectivo en este momento.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
    IF v_qty <= 0 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Cantidad inválida para producto en el pedido (debe estar entre 1 y 99).';
    END IF;

    SELECT price_cop, name, available
    INTO v_unit_price, v_product_name, v_product_available
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND restaurant_id = v_resolved_restaurant_id
      AND COALESCE(is_archived, FALSE) = FALSE;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'El producto % no existe o no pertenece a este restaurante.', (v_item->>'product_id');
    END IF;

    IF v_product_available = FALSE THEN
      RAISE EXCEPTION 'El producto "%" está agotado temporalmente.', v_product_name;
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  END LOOP;

  v_total := v_subtotal + COALESCE(v_delivery_fee, 0);
  v_platform_fee := ROUND(v_total * COALESCE(v_commission_rate, 0.03))::INTEGER;
  v_gateway_fee := public.calculate_wompi_gateway_fee_cop(v_total, v_normalized_method);
  v_gateway_iva := public.calculate_wompi_gateway_iva_cop(v_total, v_normalized_method);
  v_restaurant_payout := GREATEST(0, v_total - v_platform_fee - v_gateway_fee);

  INSERT INTO public.orders (
    restaurant_id,
    customer_id,
    fulfillment,
    status,
    customer_name,
    customer_phone,
    delivery_address,
    table_number,
    table_id,
    restaurant_notes,
    device_id,
    payment_method,
    subtotal_cop,
    delivery_fee_cop,
    total_cop
  ) VALUES (
    v_resolved_restaurant_id,
    v_customer_id,
    p_fulfillment,
    'pending',
    LEFT(COALESCE(NULLIF(btrim(p_customer_name), ''), 'Comensal en Mesa'), 120),
    LEFT(COALESCE(NULLIF(btrim(p_customer_phone), ''), 'En mesa'), 40),
    p_delivery_address,
    p_table_number,
    v_resolved_table_id,
    LEFT(COALESCE(p_restaurant_notes, ''), 500),
    NULLIF(btrim(p_device_id), ''),
    v_normalized_method,
    v_subtotal,
    COALESCE(v_delivery_fee, 0),
    v_total
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::INTEGER;
    SELECT price_cop, name INTO v_unit_price, v_product_name
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND restaurant_id = v_resolved_restaurant_id;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price_cop,
      quantity
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_product_name,
      v_unit_price,
      v_qty
    );
  END LOOP;

  INSERT INTO public.payments (
    order_id,
    provider,
    provider_reference,
    amount_cop,
    platform_fee_cop,
    gateway_fee_cop,
    gateway_iva_cop,
    restaurant_payout_cop,
    status
  ) VALUES (
    v_order_id,
    v_normalized_method,
    v_order_id::TEXT,
    v_total,
    v_platform_fee,
    v_gateway_fee,
    v_gateway_iva,
    v_restaurant_payout,
    'pending'
  );

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_with_items(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- P1-07: Eliminar el bypass OR p_session_id = 'legacy' en get_table_orders_for_session
DROP FUNCTION IF EXISTS public.get_table_orders_for_session(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_table_orders_for_session(
  p_table_id UUID,
  p_session_id TEXT
)
RETURNS TABLE (
  id UUID,
  restaurant_id UUID,
  customer_id UUID,
  fulfillment TEXT,
  status TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address JSONB,
  table_number TEXT,
  table_id UUID,
  restaurant_notes TEXT,
  cancellation_reason TEXT,
  subtotal_cop NUMERIC,
  delivery_fee_cop NUMERIC,
  total_cop NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  order_items JSONB,
  payments JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table_id IS NULL
     OR p_session_id IS NULL
     OR length(btrim(p_session_id)) < 8
     OR lower(btrim(p_session_id)) = 'legacy' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.restaurant_id,
    o.customer_id,
    o.fulfillment,
    o.status,
    o.customer_name,
    o.customer_phone,
    o.delivery_address,
    o.table_number,
    o.table_id,
    o.restaurant_notes,
    o.cancellation_reason,
    o.subtotal_cop::NUMERIC,
    o.delivery_fee_cop::NUMERIC,
    o.total_cop::NUMERIC,
    o.created_at,
    o.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'order_id', oi.order_id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'unit_price_cop', oi.unit_price_cop,
            'quantity', oi.quantity
          )
        )
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ),
      '[]'::jsonb
    ) AS order_items,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'status', p.status,
            'provider', p.provider
          )
        )
        FROM public.payments p
        WHERE p.order_id = o.id
      ),
      '[]'::jsonb
    ) AS payments
  FROM public.orders o
  WHERE o.table_id = p_table_id
    AND o.device_id = btrim(p_session_id)
    AND o.fulfillment = 'table_service'
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_table_orders_for_session(UUID, TEXT) TO anon, authenticated;


-- ============================================================================
-- 6. P0-06 Y P1-04: ENDURECIMIENTO DE provision_restaurant_for_user,
--    resolve_or_provision_restaurant_owner Y activate_approved_restaurant_rpc
--    - Impide secuestro de restaurante pasando p_user_id/p_user_email ajenos.
--    - Obtiene siempre el correo real desde auth.users.
--    - Exige ra.status = 'approved' antes de aprovisionar un restaurante desde
--      restaurant_applications (no auto-aprueba solicitudes 'submitted').
--    - Preserva logo_url, banner_url y schedule_hours -> business_hours.
--    - Nunca sobrescribe platform_role = 'platform_admin'.
-- ============================================================================

DROP FUNCTION IF EXISTS public.provision_restaurant_for_user(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.provision_restaurant_for_user(
  p_user_id UUID,
  p_user_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_email TEXT;
  v_member_restaurant_id UUID;
  v_member_role TEXT;
  v_app public.restaurant_applications%ROWTYPE;
  v_base_slug TEXT;
  v_unique_slug TEXT;
  v_attempt INT;
  v_full_name TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('is_member', false);
  END IF;

  -- P0-06: Cuando se invoca vía RPC con sesión activa, validar que el actor sea el propio usuario o platform_admin
  IF v_caller_uid IS NOT NULL AND v_caller_uid <> p_user_id AND NOT public.is_platform_admin(v_caller_uid) THEN
    RAISE EXCEPTION 'No autorizado para aprovisionar restaurantes en nombre de otro usuario.';
  END IF;

  -- Obtener siempre el correo verificado desde auth.users (ignorando p_user_email manipulable en llamadas autenticadas)
  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_email IS NULL AND v_caller_uid IS NULL THEN
    v_email := lower(btrim(COALESCE(p_user_email, '')));
  END IF;

  IF v_email = '' THEN
    v_email := NULL;
  END IF;

  -- A) Si existe una invitación por correo en restaurant_members para este usuario, activarla y vincular user_id
  IF v_email IS NOT NULL THEN
    UPDATE public.restaurant_members
    SET
      user_id = p_user_id,
      status = CASE WHEN status IS NULL OR status = 'invited' THEN 'active' ELSE status END,
      accepted_at = COALESCE(accepted_at, NOW()),
      updated_at = NOW()
    WHERE lower(btrim(email)) = v_email
      AND (user_id IS NULL OR user_id = p_user_id)
      AND (status IS NULL OR status IN ('invited', 'active'));
  END IF;

  -- B) Normalizar cualquier membresía propia con status NULL
  UPDATE public.restaurant_members
  SET
    status = 'active',
    accepted_at = COALESCE(accepted_at, created_at, NOW()),
    email = COALESCE(email, v_email),
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND (status IS NULL OR btrim(status) = '');

  -- C) Verificar si ya tiene membresía activa en restaurant_members
  SELECT rm.restaurant_id, rm.role
  INTO v_member_restaurant_id, v_member_role
  FROM public.restaurant_members rm
  WHERE rm.user_id = p_user_id
    AND rm.status = 'active'
  ORDER BY CASE WHEN rm.role = 'owner' THEN 0 ELSE 1 END, rm.created_at DESC
  LIMIT 1;

  -- D) Si aún no aparece en restaurant_members, verificar si es owner_user_id en public.restaurants
  IF v_member_restaurant_id IS NULL THEN
    SELECT r.id, 'owner'
    INTO v_member_restaurant_id, v_member_role
    FROM public.restaurants r
    WHERE r.owner_user_id = p_user_id
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_member_restaurant_id IS NOT NULL THEN
      INSERT INTO public.restaurant_members (restaurant_id, user_id, email, role, status, accepted_at)
      VALUES (v_member_restaurant_id, p_user_id, v_email, 'owner', 'active', NOW())
      ON CONFLICT (restaurant_id, user_id) WHERE user_id IS NOT NULL
      DO UPDATE SET
        status = 'active',
        role = 'owner',
        accepted_at = COALESCE(public.restaurant_members.accepted_at, NOW()),
        updated_at = NOW();
    END IF;
  END IF;

  -- E) P0-06 + P1-04: Vincular o aprovisionar restaurante ÚNICAMENTE si la solicitud fue APROBADA ('approved')
  --    por un platform_admin o ya tiene activated_restaurant_id asignado.
  IF v_member_restaurant_id IS NULL AND v_email IS NOT NULL THEN
    SELECT * INTO v_app
    FROM public.restaurant_applications ra
    WHERE lower(btrim(ra.owner_email)) = v_email
      AND (ra.status = 'approved' OR ra.activated_restaurant_id IS NOT NULL)
    ORDER BY ra.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_app.activated_restaurant_id IS NOT NULL THEN
        v_member_restaurant_id := v_app.activated_restaurant_id;
        v_member_role := 'owner';

        UPDATE public.restaurants
        SET
          owner_user_id = COALESCE(owner_user_id, p_user_id),
          logo_url = COALESCE(NULLIF(btrim(logo_url), ''), NULLIF(btrim(v_app.logo_url), '')),
          banner_url = COALESCE(NULLIF(btrim(banner_url), ''), NULLIF(btrim(v_app.banner_url), '')),
          business_hours = COALESCE(business_hours, v_app.schedule_hours),
          updated_at = NOW()
        WHERE id = v_member_restaurant_id;
      ELSE
        v_base_slug := regexp_replace(lower(btrim(v_app.restaurant_name)), '[^a-z0-9]+', '-', 'g');
        v_base_slug := regexp_replace(v_base_slug, '^-+|-+$', '', 'g');
        IF v_base_slug IS NULL OR v_base_slug = '' THEN
          v_base_slug := 'restaurante';
        END IF;

        FOR v_attempt IN 1..5 LOOP
          v_unique_slug := v_base_slug || '-' || floor(random() * 90000 + 10000)::INT::TEXT;
          BEGIN
            INSERT INTO public.restaurants (
              owner_user_id,
              name,
              slug,
              category,
              description,
              address,
              status,
              is_open,
              accepting_orders,
              city_id,
              zone_id,
              phone,
              whatsapp,
              min_order,
              estimated_delivery_minutes,
              delivery_modes,
              delivery_fee,
              delivery_radius_km,
              logo_url,
              banner_url,
              business_hours
            ) VALUES (
              p_user_id,
              btrim(v_app.restaurant_name),
              v_unique_slug,
              btrim(v_app.category),
              v_app.description,
              btrim(v_app.address),
              'active',
              TRUE,
              TRUE,
              v_app.city_id,
              v_app.zone_id,
              v_app.owner_phone,
              v_app.whatsapp,
              COALESCE(v_app.min_order, 0),
              v_app.estimated_delivery_minutes,
              COALESCE(v_app.delivery_modes, ARRAY['pickup', 'restaurant_delivery']::TEXT[]),
              COALESCE(v_app.delivery_fee, 0),
              COALESCE(v_app.delivery_radius_km, 5),
              NULLIF(btrim(v_app.logo_url), ''),
              NULLIF(btrim(v_app.banner_url), ''),
              v_app.schedule_hours
            )
            RETURNING id INTO v_member_restaurant_id;
            v_member_role := 'owner';
            EXIT;
          EXCEPTION WHEN unique_violation THEN
            v_member_restaurant_id := NULL;
          END;
        END LOOP;

        IF v_member_restaurant_id IS NOT NULL THEN
          UPDATE public.restaurant_applications
          SET
            activated_at = COALESCE(activated_at, NOW()),
            activated_restaurant_id = v_member_restaurant_id,
            updated_at = NOW()
          WHERE id = v_app.id;
        END IF;
      END IF;

      IF v_member_restaurant_id IS NOT NULL THEN
        INSERT INTO public.restaurant_members (restaurant_id, user_id, email, role, status, accepted_at)
        VALUES (v_member_restaurant_id, p_user_id, v_email, 'owner', 'active', NOW())
        ON CONFLICT (restaurant_id, user_id) WHERE user_id IS NOT NULL
        DO UPDATE SET
          role = 'owner',
          status = 'active',
          accepted_at = COALESCE(public.restaurant_members.accepted_at, NOW()),
          email = EXCLUDED.email,
          updated_at = NOW();
      END IF;
    END IF;
  END IF;

  IF v_member_restaurant_id IS NOT NULL THEN
    UPDATE public.profiles p
    SET
      business_role = CASE
        WHEN p.platform_role = 'platform_admin' THEN 'platform_admin'
        WHEN v_member_role = 'owner' THEN 'restaurant_owner'
        ELSE 'restaurant_staff'
      END,
      tenant_id = v_member_restaurant_id,
      full_name = CASE
        WHEN p.full_name IS NULL OR btrim(p.full_name) = '' OR p.full_name LIKE '%@%'
          THEN COALESCE(
            (SELECT NULLIF(btrim(ra.owner_name), '') FROM public.restaurant_applications ra WHERE lower(btrim(ra.owner_email)) = v_email ORDER BY ra.created_at DESC LIMIT 1),
            p.full_name
          )
        ELSE p.full_name
      END,
      phone = COALESCE(
        NULLIF(btrim(p.phone), ''),
        (SELECT NULLIF(btrim(ra.owner_phone), '') FROM public.restaurant_applications ra WHERE lower(btrim(ra.owner_email)) = v_email ORDER BY ra.created_at DESC LIMIT 1)
      ),
      updated_at = NOW()
    WHERE p.id = p_user_id
    RETURNING p.full_name INTO v_full_name;

    RETURN jsonb_build_object(
      'is_member', true,
      'tenant_id', v_member_restaurant_id,
      'member_role', v_member_role,
      'business_role', CASE WHEN v_member_role = 'owner' THEN 'restaurant_owner' ELSE 'restaurant_staff' END,
      'full_name', v_full_name
    );
  END IF;

  RETURN jsonb_build_object('is_member', false);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_restaurant_for_user(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_restaurant_for_user(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_or_provision_restaurant_owner()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('is_member', false);
  END IF;
  RETURN public.provision_restaurant_for_user(auth.uid(), NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_or_provision_restaurant_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_or_provision_restaurant_owner() TO authenticated;

-- Actualizar activate_approved_restaurant_rpc para copiar también schedule_hours -> business_hours
CREATE OR REPLACE FUNCTION public.activate_approved_restaurant_rpc(p_application_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_app public.restaurant_applications%ROWTYPE;
  v_owner_email TEXT;
  v_owner_id UUID;
  v_base_slug TEXT;
  v_unique_slug TEXT;
  v_restaurant_id UUID;
  v_attempt INT;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_platform_admin(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes.');
  END IF;

  SELECT * INTO v_app
  FROM public.restaurant_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada.');
  END IF;

  IF v_app.status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La solicitud fue rechazada y no puede activarse.');
  END IF;

  IF v_app.activated_restaurant_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_activated', true,
      'tenantId', v_app.activated_restaurant_id,
      'message', 'La solicitud ya estaba activada.'
    );
  END IF;

  IF v_app.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La solicitud debe estar aprobada antes de activarse.');
  END IF;

  v_owner_email := lower(btrim(v_app.owner_email));

  SELECT u.id INTO v_owner_id
  FROM auth.users u
  WHERE lower(btrim(u.email)) = v_owner_email
  ORDER BY u.created_at DESC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'needs_invite', true);
  END IF;

  v_base_slug := regexp_replace(lower(btrim(v_app.restaurant_name)), '[^a-z0-9]+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '^-+|-+$', '', 'g');
  IF v_base_slug IS NULL OR v_base_slug = '' THEN
    v_base_slug := 'restaurante';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_unique_slug := v_base_slug || '-' || floor(random() * 90000 + 10000)::INT::TEXT;
    BEGIN
      INSERT INTO public.restaurants (
        owner_user_id,
        name,
        slug,
        category,
        description,
        address,
        status,
        is_open,
        accepting_orders,
        city_id,
        zone_id,
        phone,
        whatsapp,
        min_order,
        estimated_delivery_minutes,
        delivery_modes,
        delivery_fee,
        delivery_radius_km,
        logo_url,
        banner_url,
        business_hours
      ) VALUES (
        v_owner_id,
        btrim(v_app.restaurant_name),
        v_unique_slug,
        btrim(v_app.category),
        v_app.description,
        btrim(v_app.address),
        'active',
        FALSE,
        TRUE,
        v_app.city_id,
        v_app.zone_id,
        v_app.owner_phone,
        v_app.whatsapp,
        COALESCE(v_app.min_order, 0),
        v_app.estimated_delivery_minutes,
        COALESCE(v_app.delivery_modes, ARRAY['pickup', 'restaurant_delivery']::TEXT[]),
        COALESCE(v_app.delivery_fee, 0),
        COALESCE(v_app.delivery_radius_km, 5),
        NULLIF(btrim(v_app.logo_url), ''),
        NULLIF(btrim(v_app.banner_url), ''),
        v_app.schedule_hours
      )
      RETURNING id INTO v_restaurant_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_restaurant_id := NULL;
    END;
  END LOOP;

  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No fue posible generar un identificador único para el restaurante.');
  END IF;

  INSERT INTO public.restaurant_members (
    restaurant_id,
    user_id,
    email,
    role,
    status,
    accepted_at
  ) VALUES (
    v_restaurant_id,
    v_owner_id,
    v_owner_email,
    'owner',
    'active',
    NOW()
  )
  ON CONFLICT (restaurant_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET
    role = 'owner',
    status = 'active',
    accepted_at = COALESCE(public.restaurant_members.accepted_at, NOW()),
    email = EXCLUDED.email,
    updated_at = NOW();

  UPDATE public.profiles
  SET
    business_role = CASE
      WHEN platform_role = 'platform_admin' THEN 'platform_admin'
      ELSE 'restaurant_owner'
    END,
    tenant_id = v_restaurant_id,
    full_name = CASE
      WHEN full_name IS NULL OR btrim(full_name) = '' OR full_name LIKE '%@%'
        THEN COALESCE(NULLIF(btrim(v_app.owner_name), ''), full_name)
      ELSE full_name
    END,
    phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(btrim(v_app.owner_phone), '')),
    updated_at = NOW()
  WHERE id = v_owner_id;

  UPDATE public.restaurant_applications
  SET
    status = 'approved',
    reviewed_at = COALESCE(reviewed_at, NOW()),
    reviewed_by = COALESCE(reviewed_by, v_caller_id),
    activated_at = NOW(),
    activated_restaurant_id = v_restaurant_id,
    activated_by = v_caller_id,
    updated_at = NOW()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenantId', v_restaurant_id,
    'message', 'Restaurante activado y vinculado exitosamente a la cuenta del propietario.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_approved_restaurant_rpc(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_approved_restaurant_rpc(UUID) TO authenticated;


-- ============================================================================
-- 7. P1-06: RESTRICCIÓN DE public.ensure_colombia_city_and_zone
--    Revoca ejecución anónima y valida longitud y formato de entrada.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ensure_colombia_city_and_zone(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.ensure_colombia_city_and_zone(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.ensure_colombia_city_and_zone(
  p_city_name TEXT,
  p_department_name TEXT DEFAULT NULL,
  p_zone_name TEXT DEFAULT 'Centro'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_city TEXT;
  v_clean_dept TEXT;
  v_clean_zone TEXT;
  v_city_slug TEXT;
  v_zone_slug TEXT;
  v_city_id UUID;
  v_zone_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida para registrar o resolver ubicaciones.';
  END IF;

  v_clean_city := btrim(COALESCE(p_city_name, ''));
  v_clean_dept := NULLIF(btrim(COALESCE(p_department_name, '')), '');
  v_clean_zone := COALESCE(NULLIF(btrim(COALESCE(p_zone_name, '')), ''), 'Centro');

  IF length(v_clean_city) < 2 OR length(v_clean_city) > 80 THEN
    RAISE EXCEPTION 'El nombre del municipio debe tener entre 2 y 80 caracteres.';
  END IF;

  IF length(v_clean_zone) < 2 OR length(v_clean_zone) > 80 THEN
    RAISE EXCEPTION 'El nombre del barrio o zona debe tener entre 2 y 80 caracteres.';
  END IF;

  SELECT c.id, c.slug, COALESCE(c.department_name, v_clean_dept)
  INTO v_city_id, v_city_slug, v_clean_dept
  FROM public.cities c
  WHERE lower(btrim(c.name)) = lower(v_clean_city)
    AND (
      v_clean_dept IS NULL
      OR c.department_name IS NULL
      OR lower(btrim(c.department_name)) = lower(v_clean_dept)
    )
  ORDER BY (c.id = '00000000-0000-0000-0000-000000000001') DESC, c.created_at ASC
  LIMIT 1;

  IF v_city_id IS NULL THEN
    v_city_slug := regexp_replace(
      lower(v_clean_city || CASE WHEN v_clean_dept IS NOT NULL THEN '-' || v_clean_dept ELSE '' END),
      '[^a-z0-9]+', '-', 'g'
    );
    v_city_slug := regexp_replace(v_city_slug, '^-+|-+$', '', 'g');

    INSERT INTO public.cities (slug, name, department_name, country_code, currency_code, is_active)
    VALUES (v_city_slug, v_clean_city, COALESCE(v_clean_dept, 'Colombia'), 'CO', 'COP', TRUE)
    ON CONFLICT (slug) DO UPDATE
      SET is_active = TRUE,
          department_name = COALESCE(public.cities.department_name, EXCLUDED.department_name)
    RETURNING id, slug INTO v_city_id, v_city_slug;
  END IF;

  v_zone_slug := regexp_replace(lower(v_city_slug || '-' || v_clean_zone), '[^a-z0-9]+', '-', 'g');
  v_zone_slug := regexp_replace(v_zone_slug, '^-+|-+$', '', 'g');

  SELECT z.id INTO v_zone_id
  FROM public.zones z
  WHERE z.city_id = v_city_id
    AND (
      lower(btrim(z.name)) = lower(v_clean_zone)
      OR z.slug = v_zone_slug
    )
  LIMIT 1;

  IF v_zone_id IS NULL THEN
    INSERT INTO public.zones (city_id, slug, name, is_active)
    VALUES (v_city_id, v_zone_slug, v_clean_zone, TRUE)
    ON CONFLICT (city_id, slug) DO UPDATE
      SET is_active = TRUE
    RETURNING id INTO v_zone_id;
  END IF;

  RETURN jsonb_build_object(
    'city_id', v_city_id,
    'city_name', v_clean_city,
    'city_slug', v_city_slug,
    'department_name', COALESCE(v_clean_dept, 'Colombia'),
    'zone_id', v_zone_id,
    'zone_name', v_clean_zone,
    'zone_slug', v_zone_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_colombia_city_and_zone(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_colombia_city_and_zone(TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================================
-- 8. P1-09: SOPORTE PARA RESTAURANTES EN PEDIDOS, MÉTRICAS NULL-SAFE Y CSAT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_support_ticket_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_customer_id UUID;
  v_order_restaurant_id UUID;
  v_payment_order_id UUID;
  v_payment_customer_id UUID;
  v_payment_restaurant_id UUID;
BEGIN
  IF NEW.related_order_id IS NOT NULL THEN
    SELECT customer_id, restaurant_id
    INTO v_order_customer_id, v_order_restaurant_id
    FROM public.orders
    WHERE id = NEW.related_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El pedido seleccionado no existe.';
    END IF;

    IF v_order_customer_id IS DISTINCT FROM NEW.requester_user_id
       AND NOT public.is_restaurant_member(NEW.requester_user_id, v_order_restaurant_id)
       AND NOT public.is_platform_admin(NEW.requester_user_id) THEN
      RAISE EXCEPTION 'El pedido seleccionado no pertenece a este usuario ni a su restaurante.';
    END IF;

    IF NEW.restaurant_id IS NULL THEN
      NEW.restaurant_id := v_order_restaurant_id;
    END IF;
  END IF;

  IF NEW.related_payment_id IS NOT NULL THEN
    SELECT p.order_id, o.customer_id, o.restaurant_id
    INTO v_payment_order_id, v_payment_customer_id, v_payment_restaurant_id
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.id = NEW.related_payment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El pago seleccionado no existe.';
    END IF;

    IF v_payment_customer_id IS DISTINCT FROM NEW.requester_user_id
       AND NOT public.is_restaurant_member(NEW.requester_user_id, v_payment_restaurant_id)
       AND NOT public.is_platform_admin(NEW.requester_user_id) THEN
      RAISE EXCEPTION 'El pago seleccionado no pertenece a este usuario ni a su restaurante.';
    END IF;

    IF NEW.related_order_id IS NULL THEN
      NEW.related_order_id := v_payment_order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Sincronizar support_ticket_feedback con support_tickets.satisfaction_score
CREATE OR REPLACE FUNCTION public.sync_support_ticket_csat_from_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
  SET
    satisfaction_score = NEW.rating,
    satisfaction_comment = NEW.comment,
    updated_at = NOW()
  WHERE id = NEW.ticket_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_support_ticket_csat ON public.support_ticket_feedback;
CREATE TRIGGER trg_sync_support_ticket_csat
  AFTER INSERT OR UPDATE ON public.support_ticket_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_support_ticket_csat_from_feedback();

-- Actualizar get_support_metrics (conservando firma de 7 parámetros opcionales de 026 y
-- devolviendo valores numéricos nunca NULL + soporte de waiting_for_customer y platform_role)
DROP FUNCTION IF EXISTS public.get_support_metrics();
DROP FUNCTION IF EXISTS public.get_support_metrics(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_support_metrics(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_city_id UUID DEFAULT NULL,
  p_restaurant_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_priority TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_created INT := 0;
  v_total_open INT := 0;
  v_total_resolved INT := 0;
  v_total_closed INT := 0;
  v_unassigned INT := 0;
  v_urgent_open INT := 0;
  v_avg_first_response_sec NUMERIC := 0;
  v_avg_resolution_sec NUMERIC := 0;
  v_avg_rating NUMERIC := 0;
  v_total_ratings INT := 0;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can view support metrics.';
  END IF;

  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE t.status IN ('open', 'in_progress', 'in_review', 'waiting_for_customer', 'waiting_for_restaurant', 'waiting_for_payment_provider', 'escalated', 'reopened'))::INT,
    COUNT(*) FILTER (WHERE t.status = 'resolved')::INT,
    COUNT(*) FILTER (WHERE t.status = 'closed')::INT,
    COUNT(*) FILTER (WHERE t.assigned_to IS NULL AND t.status NOT IN ('resolved', 'closed'))::INT,
    COUNT(*) FILTER (WHERE t.priority IN ('urgent', 'critical') AND t.status NOT IN ('resolved', 'closed'))::INT,
    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.created_at))) FILTER (WHERE t.first_response_at IS NOT NULL), 1), 0),
    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))) FILTER (WHERE t.resolved_at IS NOT NULL), 1), 0),
    COALESCE(ROUND(AVG(COALESCE(t.satisfaction_score, f.rating))::NUMERIC, 2), 0),
    COUNT(COALESCE(t.satisfaction_score, f.rating))::INT
  INTO
    v_total_created,
    v_total_open,
    v_total_resolved,
    v_total_closed,
    v_unassigned,
    v_urgent_open,
    v_avg_first_response_sec,
    v_avg_resolution_sec,
    v_avg_rating,
    v_total_ratings
  FROM public.support_tickets t
  LEFT JOIN public.support_ticket_feedback f ON f.ticket_id = t.id
  WHERE
    (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
    AND (p_city_id IS NULL OR t.city_id = p_city_id)
    AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
    AND (p_category IS NULL OR t.category = p_category)
    AND (p_assigned_to IS NULL OR t.assigned_to = p_assigned_to)
    AND (p_priority IS NULL OR t.priority = p_priority);

  RETURN jsonb_build_object(
    'total_created', COALESCE(v_total_created, 0),
    'total_open', COALESCE(v_total_open, 0),
    'total_resolved', COALESCE(v_total_resolved, 0),
    'total_closed', COALESCE(v_total_closed, 0),
    'avg_first_response_seconds', COALESCE(v_avg_first_response_sec, 0),
    'avg_resolution_seconds', COALESCE(v_avg_resolution_sec, 0),
    'avg_rating', COALESCE(v_avg_rating, 0),
    'total_ratings', COALESCE(v_total_ratings, 0),
    'total_tickets', COALESCE(v_total_created, 0),
    'open_tickets', COALESCE(v_total_open, 0),
    'resolved_tickets', COALESCE(v_total_resolved + v_total_closed, 0),
    'unassigned_tickets', COALESCE(v_unassigned, 0),
    'urgent_open', COALESCE(v_urgent_open, 0),
    'avg_csat', COALESCE(v_avg_rating, 0),
    'total_csat_responses', COALESCE(v_total_ratings, 0),
    'avg_resolution_hours', COALESCE(ROUND((v_avg_resolution_sec / 3600.0)::NUMERIC, 1), 0),
    'avg_first_response_minutes', COALESCE(ROUND((v_avg_first_response_sec / 60.0)::NUMERIC, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_support_metrics(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_support_metrics(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, UUID, TEXT) TO authenticated;


-- ============================================================================
-- 9. P1-10: PERSISTENCIA EN BASE DE DATOS DE REPARTIDORES (restaurant_drivers)
--    Y CHECKLIST DE COCINA KDS (orders.driver_id, orders.kds_checked_items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle TEXT NOT NULL DEFAULT 'Moto',
  plate TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy', 'offline')),
  active_orders INTEGER NOT NULL DEFAULT 0 CHECK (active_orders >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_drivers_restaurant
  ON public.restaurant_drivers(restaurant_id, created_at DESC);

ALTER TABLE public.restaurant_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_drivers_select_member_or_admin" ON public.restaurant_drivers;
CREATE POLICY "restaurant_drivers_select_member_or_admin"
ON public.restaurant_drivers
FOR SELECT
TO authenticated
USING (
  public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

DROP POLICY IF EXISTS "restaurant_drivers_manage_member_or_admin" ON public.restaurant_drivers;
CREATE POLICY "restaurant_drivers_manage_member_or_admin"
ON public.restaurant_drivers
FOR ALL
TO authenticated
USING (
  public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
  public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.restaurant_drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone TEXT,
  ADD COLUMN IF NOT EXISTS kds_checked_items JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.assign_order_driver(
  p_order_id UUID,
  p_driver_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_restaurant_id UUID;
  v_driver RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida.';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe.';
  END IF;

  IF NOT (
    public.is_restaurant_member(v_uid, v_restaurant_id)
    OR public.is_platform_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'No tienes permisos para asignar repartidores en este restaurante.';
  END IF;

  IF p_driver_id IS NULL THEN
    UPDATE public.orders
    SET
      driver_id = NULL,
      driver_name = NULL,
      driver_phone = NULL,
      updated_at = NOW()
    WHERE id = p_order_id;
    RETURN TRUE;
  END IF;

  SELECT * INTO v_driver
  FROM public.restaurant_drivers
  WHERE id = p_driver_id
    AND restaurant_id = v_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El repartidor no existe o pertenece a otro restaurante.';
  END IF;

  UPDATE public.orders
  SET
    driver_id = v_driver.id,
    driver_name = v_driver.name,
    driver_phone = v_driver.phone,
    updated_at = NOW()
  WHERE id = p_order_id;

  UPDATE public.restaurant_drivers
  SET
    status = 'busy',
    updated_at = NOW()
  WHERE id = v_driver.id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_order_driver(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_order_driver(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_order_kds_items(
  p_order_id UUID,
  p_checked_items JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_restaurant_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida.';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe.';
  END IF;

  IF NOT (
    public.is_restaurant_member(v_uid, v_restaurant_id)
    OR public.is_platform_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'No tienes permisos para actualizar el checklist de cocina.';
  END IF;

  UPDATE public.orders
  SET
    kds_checked_items = COALESCE(p_checked_items, '{}'::jsonb),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_kds_items(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_kds_items(UUID, JSONB) TO authenticated;


-- ============================================================================
-- 10. P1-11: SUPRESIÓN COMPLETA DE DATOS DE USUARIO (delete_my_user_account)
--     Incluye anonimización de tickets/mensajes de soporte, limpieza de
--     storage.objects del usuario y devolución de media_urls.
-- ============================================================================

DROP FUNCTION IF EXISTS public.delete_my_user_account(TEXT);

CREATE OR REPLACE FUNCTION public.delete_my_user_account(
  p_confirm_text TEXT DEFAULT 'ELIMINAR MI CUENTA'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_active_orders INT := 0;
  v_owned_active_restaurants INT := 0;
  v_anonymized_orders INT := 0;
  v_request_id UUID;
  v_media_urls TEXT[] := ARRAY[]::TEXT[];
  v_avatar_url TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado: debes iniciar sesión para solicitar la supresión de tus datos.';
  END IF;

  IF upper(btrim(COALESCE(p_confirm_text, ''))) NOT IN ('ELIMINAR MI CUENTA', 'USER_REQUEST') THEN
    RAISE EXCEPTION 'Confirmación inválida: escribe exactamente ELIMINAR MI CUENTA para continuar.';
  END IF;

  SELECT COUNT(*) INTO v_owned_active_restaurants
  FROM public.restaurants r
  WHERE r.owner_user_id = v_uid
    AND COALESCE(r.status, 'active') != 'suspended';

  IF v_owned_active_restaurants > 0 THEN
    RAISE EXCEPTION 'Tienes un restaurante activo asociado a tu cuenta. Primero debes dar de baja el restaurante desde el Panel del Restaurante antes de eliminar tu cuenta personal.';
  END IF;

  SELECT COUNT(*) INTO v_active_orders
  FROM public.orders o
  WHERE o.customer_id = v_uid
    AND o.status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery');

  IF v_active_orders > 0 THEN
    RAISE EXCEPTION 'Tienes % pedido(s) activo(s) en curso. Espera a que finalicen o cancélalos antes de eliminar tu cuenta.', v_active_orders;
  END IF;

  SELECT avatar_url INTO v_avatar_url
  FROM public.profiles
  WHERE id = v_uid;

  SELECT ARRAY_REMOVE(
    ARRAY_CAT(
      ARRAY[v_avatar_url],
      ARRAY(
        SELECT rr.review_image_url
        FROM public.restaurant_reviews rr
        WHERE rr.user_id = v_uid AND rr.review_image_url IS NOT NULL
      )
    ),
    NULL
  ) INTO v_media_urls;

  INSERT INTO public.privacy_deletion_requests (
    requester_user_id,
    target_type,
    reason,
    status,
    completed_at
  ) VALUES (
    v_uid,
    'user_account',
    COALESCE(NULLIF(btrim(p_confirm_text), ''), 'ELIMINAR MI CUENTA'),
    'completed',
    NOW()
  ) RETURNING id INTO v_request_id;

  DELETE FROM public.saved_posts WHERE user_id = v_uid;
  DELETE FROM public.post_likes WHERE user_id = v_uid;
  DELETE FROM public.post_comments WHERE user_id = v_uid;

  UPDATE public.restaurant_reviews
  SET
    comment = '[Reseña anonimizada por solicitud de retiro del titular]',
    review_image_url = NULL,
    author_name = 'Usuario Eliminado',
    author_username = NULL,
    author_avatar_url = NULL,
    updated_at = NOW()
  WHERE user_id = v_uid;

  UPDATE public.orders
  SET
    customer_id = NULL,
    customer_name = 'Titular Suprimido (Ley 1581)',
    customer_phone = '0000000000',
    delivery_address = NULL,
    restaurant_notes = NULL,
    device_id = NULL,
    updated_at = NOW()
  WHERE customer_id = v_uid;

  GET DIAGNOSTICS v_anonymized_orders = ROW_COUNT;

  -- Anonimizar tickets y mensajes de soporte del usuario (P1-11)
  UPDATE public.support_tickets
  SET
    subject = 'Caso anonimizado por supresión de cuenta',
    description = '[Descripción suprimida por solicitud del titular - Ley 1581 de 2012]',
    satisfaction_comment = NULL,
    status = 'closed',
    closed_at = COALESCE(closed_at, NOW()),
    updated_at = NOW()
  WHERE requester_user_id = v_uid;

  UPDATE public.support_messages
  SET
    body = '[Mensaje suprimido por solicitud del titular - Ley 1581 de 2012]'
  WHERE author_user_id = v_uid
    AND COALESCE(is_internal, FALSE) = FALSE;

  DELETE FROM public.restaurant_members WHERE user_id = v_uid;

  -- Eliminar objetos de almacenamiento propios del usuario en gastro-media
  DELETE FROM storage.objects
  WHERE bucket_id = 'gastro-media'
    AND (
      owner = v_uid
      OR (
        (string_to_array(name, '/'))[1] IN ('avatars', 'reviews', 'general')
        AND (string_to_array(name, '/'))[2] = v_uid::TEXT
      )
    );

  DELETE FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'deleted_user_id', v_uid,
    'anonymized_orders', v_anonymized_orders,
    'media_urls', to_jsonb(COALESCE(v_media_urls, ARRAY[]::TEXT[])),
    'deleted_at', NOW(),
    'message', 'Tu cuenta y tus datos personales han sido eliminados y anonimizados conforme a la Ley 1581 de 2012.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_user_account(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_user_account(TEXT) TO authenticated;


-- ============================================================================
-- 11. P1-14: SINCRONIZACIÓN SEGURA restaurant_members -> profiles
--     Solo asigna tenant_id y business_role cuando status = 'active' y jamás
--     degrada platform_admin.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_from_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NOT NULL AND NEW.status = 'active' THEN
      UPDATE public.profiles
      SET
        business_role = CASE
          WHEN platform_role = 'platform_admin' THEN 'platform_admin'
          WHEN NEW.role = 'owner' THEN 'restaurant_owner'
          WHEN NEW.role = 'staff' THEN 'restaurant_staff'
          ELSE business_role
        END,
        tenant_id = NEW.restaurant_id,
        updated_at = NOW()
      WHERE id = NEW.user_id;
    ELSIF NEW.user_id IS NOT NULL AND NEW.status IN ('suspended', 'revoked') THEN
      UPDATE public.profiles
      SET
        business_role = CASE
          WHEN platform_role = 'platform_admin' THEN 'platform_admin'
          ELSE 'customer'
        END,
        tenant_id = NULL,
        updated_at = NOW()
      WHERE id = NEW.user_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.restaurant_members rm
          WHERE rm.user_id = NEW.user_id
            AND rm.status = 'active'
            AND rm.id <> NEW.id
        );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET
      business_role = CASE
        WHEN platform_role = 'platform_admin' THEN 'platform_admin'
        ELSE 'customer'
      END,
      tenant_id = NULL,
      updated_at = NOW()
    WHERE id = OLD.user_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.restaurant_members rm
        WHERE rm.user_id = OLD.user_id
          AND rm.status = 'active'
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ============================================================================
-- 12. P1-15: CONCILIACIÓN FINANCIERA AUDITADA (record_restaurant_settlement
--     Y record_restaurant_settlement_payment)
--     Los pagos reportados manualmente por el dueño del restaurante quedan en
--     estado pendiente de verificación ('pending_review' / 'pending') hasta que
--     un platform_admin los apruebe con admin_review_restaurant_settlement.
-- ============================================================================

DROP FUNCTION IF EXISTS public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.record_restaurant_settlement(
  p_restaurant_id UUID,
  p_settlement_type TEXT,
  p_net_amount_cop INTEGER,
  p_payment_channel TEXT DEFAULT 'transferencia_bancaria',
  p_reference_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_gross_sales_cop INTEGER DEFAULT 0,
  p_cash_sales_cop INTEGER DEFAULT 0,
  p_digital_sales_cop INTEGER DEFAULT 0,
  p_cash_commission_cop INTEGER DEFAULT 0,
  p_digital_commission_cop INTEGER DEFAULT 0,
  p_auto_offset_cop INTEGER DEFAULT 0,
  p_wompi_gateway_fee_cop INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
  v_status TEXT;
  v_confirmed_by UUID := NULL;
  v_confirmed_at TIMESTAMPTZ := NULL;
  v_settlement_id UUID;
BEGIN
  v_is_admin := public.is_platform_admin(v_uid);
  v_is_owner := public.is_restaurant_owner(v_uid, p_restaurant_id);

  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'No autorizado para registrar liquidaciones de este restaurante.';
  END IF;

  IF p_settlement_type NOT IN ('platform_payout_to_restaurant', 'restaurant_payment_to_platform', 'auto_netted_zero_cut') THEN
    RAISE EXCEPTION 'Tipo de liquidación inválido.';
  END IF;

  IF p_settlement_type = 'platform_payout_to_restaurant' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo el Administrador de Plataforma puede registrar dispersiones hacia el restaurante.';
  END IF;

  IF p_net_amount_cop < 0 THEN
    RAISE EXCEPTION 'El monto neto de liquidación no puede ser negativo.';
  END IF;

  -- P1-15: Solo SuperAdmin (o corte neto $0) queda 'completed' de inmediato.
  -- Los pagos reportados por el dueño quedan en 'pending_review' hasta conciliación.
  IF v_is_admin OR (p_settlement_type = 'auto_netted_zero_cut' AND p_net_amount_cop = 0) THEN
    v_status := 'completed';
    v_confirmed_by := v_uid;
    v_confirmed_at := NOW();
  ELSE
    v_status := 'pending_review';
  END IF;

  INSERT INTO public.restaurant_settlements (
    restaurant_id,
    settlement_type,
    gross_sales_cop,
    cash_sales_cop,
    digital_sales_cop,
    cash_commission_cop,
    digital_commission_cop,
    wompi_gateway_fee_cop,
    auto_offset_cop,
    net_amount_cop,
    payment_channel,
    reference_code,
    notes,
    status,
    period_end,
    created_by,
    confirmed_by,
    confirmed_at
  ) VALUES (
    p_restaurant_id,
    p_settlement_type,
    GREATEST(0, COALESCE(p_gross_sales_cop, 0)),
    GREATEST(0, COALESCE(p_cash_sales_cop, 0)),
    GREATEST(0, COALESCE(p_digital_sales_cop, 0)),
    GREATEST(0, COALESCE(p_cash_commission_cop, 0)),
    GREATEST(0, COALESCE(p_digital_commission_cop, 0)),
    GREATEST(0, COALESCE(p_wompi_gateway_fee_cop, 0)),
    GREATEST(0, COALESCE(p_auto_offset_cop, 0)),
    GREATEST(0, COALESCE(p_net_amount_cop, 0)),
    COALESCE(NULLIF(btrim(p_payment_channel), ''), 'transferencia_bancaria'),
    COALESCE(NULLIF(btrim(p_reference_code), ''), 'GS-LIQ-' || floor(extract(epoch from now()))::TEXT),
    NULLIF(btrim(p_notes), ''),
    v_status,
    NOW(),
    v_uid,
    v_confirmed_by,
    v_confirmed_at
  )
  RETURNING id INTO v_settlement_id;

  IF v_status = 'completed' THEN
    PERFORM public.evaluate_restaurant_cash_limit_lock(p_restaurant_id);
  END IF;

  RETURN v_settlement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_restaurant_settlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

DROP FUNCTION IF EXISTS public.record_restaurant_settlement_payment(UUID, INTEGER, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_restaurant_settlement_payment(
  p_restaurant_id UUID,
  p_amount_cop INTEGER,
  p_payment_method TEXT,
  p_reference_code TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_settlement_id UUID;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida.';
  END IF;

  v_is_admin := public.is_platform_admin(v_uid);

  IF NOT (public.is_restaurant_owner(v_uid, p_restaurant_id) OR v_is_admin) THEN
    RAISE EXCEPTION 'No tienes permisos para registrar pagos de liquidación en este restaurante.';
  END IF;

  IF COALESCE(p_amount_cop, 0) < 1000 THEN
    RAISE EXCEPTION 'El abono mínimo de liquidación es de $1.000 COP.';
  END IF;

  IF NULLIF(btrim(COALESCE(p_reference_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Debes ingresar el número de comprobante o referencia de pago.';
  END IF;

  v_status := CASE WHEN v_is_admin THEN 'completed' ELSE 'pending_review' END;

  INSERT INTO public.restaurant_settlements (
    restaurant_id,
    settlement_type,
    net_amount_cop,
    payment_channel,
    reference_code,
    notes,
    status,
    period_end,
    created_by,
    confirmed_by,
    confirmed_at
  ) VALUES (
    p_restaurant_id,
    'restaurant_payment_to_platform',
    p_amount_cop,
    COALESCE(NULLIF(btrim(p_payment_method), ''), 'transferencia_bancaria'),
    btrim(p_reference_code),
    NULLIF(btrim(p_notes), ''),
    v_status,
    NOW(),
    v_uid,
    CASE WHEN v_is_admin THEN v_uid ELSE NULL END,
    CASE WHEN v_is_admin THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_settlement_id;

  IF v_is_admin THEN
    PERFORM public.evaluate_restaurant_cash_limit_lock(p_restaurant_id);
  END IF;

  RETURN jsonb_build_object(
    'settlement_id', v_settlement_id,
    'restaurant_id', p_restaurant_id,
    'amount_cop', p_amount_cop,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_restaurant_settlement_payment(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_restaurant_settlement_payment(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_restaurant_settlement(
  p_settlement_id UUID,
  p_decision TEXT,
  p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settlement RECORD;
  v_next_status TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Solo un Administrador de Plataforma puede aprobar o rechazar liquidaciones.';
  END IF;

  IF p_decision NOT IN ('approved', 'completed', 'rejected') THEN
    RAISE EXCEPTION 'Decisión inválida: debe ser approved/completed o rejected.';
  END IF;

  v_next_status := CASE WHEN p_decision = 'rejected' THEN 'rejected' ELSE 'completed' END;

  SELECT * INTO v_settlement
  FROM public.restaurant_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El registro de liquidación no existe.';
  END IF;

  UPDATE public.restaurant_settlements
  SET
    status = v_next_status,
    notes = CASE
      WHEN p_review_note IS NOT NULL AND btrim(p_review_note) <> ''
        THEN COALESCE(notes || ' | ', '') || 'Revisión Admin: ' || btrim(p_review_note)
      ELSE notes
    END,
    confirmed_by = v_uid,
    confirmed_at = NOW()
  WHERE id = p_settlement_id;

  PERFORM public.evaluate_restaurant_cash_limit_lock(v_settlement.restaurant_id);

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'restaurant_id', v_settlement.restaurant_id,
    'status', v_next_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_restaurant_settlement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_restaurant_settlement(UUID, TEXT, TEXT) TO authenticated;

-- Impedir que dueños de restaurante se auto-aprueben liquidaciones por UPDATE directo en la tabla
DROP POLICY IF EXISTS "restaurant_settlements_update_admin" ON public.restaurant_settlements;
CREATE POLICY "restaurant_settlements_update_admin"
ON public.restaurant_settlements
FOR UPDATE
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));


-- ============================================================================
-- 13. P1-18: LIMPIEZA DE POLÍTICAS LEGACY EN restaurant_members Y
--     ENDURECIMIENTO DE PREFIJOS EN storage.objects (gastro-media)
-- ============================================================================

DROP POLICY IF EXISTS "members_select_own_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_write_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_insert_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_update_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_delete_owner_or_admin" ON public.restaurant_members;

-- Eliminar primero las políticas de Storage que referencian is_valid_submitted_application_folder
DROP POLICY IF EXISTS "gastro_media_update_application_assets" ON storage.objects;
DROP POLICY IF EXISTS "gastro_media_insert_application_assets" ON storage.objects;
DROP FUNCTION IF EXISTS public.is_valid_submitted_application_folder(TEXT);

-- Validar que cualquier subida a applications/{id}/ corresponda a una solicitud real recién creada
CREATE OR REPLACE FUNCTION public.is_valid_submitted_application_folder(p_app_id_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_id UUID;
BEGIN
  IF p_app_id_text IS NULL OR btrim(p_app_id_text) = '' THEN
    RETURN FALSE;
  END IF;

  BEGIN
    v_app_id := btrim(p_app_id_text)::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.restaurant_applications ra
    WHERE ra.id = v_app_id
      AND ra.status = 'submitted'
      AND ra.created_at > NOW() - INTERVAL '60 minutes'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_submitted_application_folder(TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.attach_application_media_urls(UUID, TEXT, TEXT);

-- RPC segura para asociar logo_url y banner_url a una solicitud recién creada en estado submitted
CREATE OR REPLACE FUNCTION public.attach_application_media_urls(
  p_application_id UUID,
  p_logo_url TEXT DEFAULT NULL,
  p_banner_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.restaurant_applications%ROWTYPE;
  v_clean_logo TEXT := NULLIF(btrim(COALESCE(p_logo_url, '')), '');
  v_clean_banner TEXT := NULLIF(btrim(COALESCE(p_banner_url, '')), '');
BEGIN
  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'p_application_id es obligatorio.';
  END IF;

  SELECT *
  INTO v_app
  FROM public.restaurant_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud indicada no existe.';
  END IF;

  IF v_app.status <> 'submitted' OR v_app.created_at <= NOW() - INTERVAL '60 minutes' THEN
    RAISE EXCEPTION 'La ventana para adjuntar imágenes a esta solicitud ha expirado.';
  END IF;

  IF v_clean_logo IS NOT NULL AND v_clean_logo !~* '^https?://.+/storage/v1/object/public/gastro-media/applications/' THEN
    RAISE EXCEPTION 'URL de logo no válida.';
  END IF;

  IF v_clean_banner IS NOT NULL AND v_clean_banner !~* '^https?://.+/storage/v1/object/public/gastro-media/applications/' THEN
    RAISE EXCEPTION 'URL de portada no válida.';
  END IF;

  UPDATE public.restaurant_applications
  SET
    logo_url = COALESCE(v_clean_logo, logo_url),
    banner_url = COALESCE(v_clean_banner, banner_url),
    updated_at = NOW()
  WHERE id = p_application_id;

  UPDATE public.restaurants
  SET
    logo_url = COALESCE(v_clean_logo, logo_url),
    banner_url = COALESCE(v_clean_banner, banner_url),
    updated_at = NOW()
  WHERE application_id = p_application_id;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'logo_url', COALESCE(v_clean_logo, v_app.logo_url),
    'banner_url', COALESCE(v_clean_banner, v_app.banner_url)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_application_media_urls(UUID, TEXT, TEXT) TO anon, authenticated;

-- Asegurar que storage.objects en gastro-media no permita escritura arbitraria ni UPDATE anónimo
CREATE POLICY "gastro_media_insert_application_assets"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'gastro-media'
  AND (storage.foldername(name))[1] = 'applications'
  AND array_length(string_to_array(name, '/'), 1) = 3
  AND public.is_valid_submitted_application_folder((string_to_array(name, '/'))[2])
);

DROP POLICY IF EXISTS "gastro_media_insert_authenticated" ON storage.objects;
CREATE POLICY "gastro_media_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gastro-media'
  AND (
    (
      (storage.foldername(name))[1] IN ('restaurants', 'stories', 'posts')
      AND array_length(string_to_array(name, '/'), 1) >= 3
      AND public.storage_is_restaurant_owner(((string_to_array(name, '/'))[2])::UUID)
    )
    OR (
      (storage.foldername(name))[1] IN ('avatars', 'reviews')
      AND array_length(string_to_array(name, '/'), 1) >= 3
      AND (string_to_array(name, '/'))[2] = auth.uid()::TEXT
    )
  )
);

NOTIFY pgrst, 'reload schema';

