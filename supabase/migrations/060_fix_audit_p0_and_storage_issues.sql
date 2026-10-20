-- ============================================================================
-- 060_fix_audit_p0_and_storage_issues.sql
-- GastroSync: Correcciones de base de datos P0/P1
-- 1. Corrige attach_application_media_urls (elimina referencia a columna application_id inexistente en restaurants).
-- 2. Asegura la columna is_active en restaurant_drivers.
-- 3. Corrige el trigger notify_on_new_message para usar el estado 'in_review' permitido por el CHECK constraint.
-- 4. Extiende la política de Storage gastro_media_insert_authenticated para permitir subida a miembros del restaurante (staff/manager/owner).
-- ============================================================================

-- 1. CORREGIR RPC attach_application_media_urls
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

  -- Si la solicitud ya tiene un restaurante activado vinculado, actualizar el restaurante
  IF v_app.activated_restaurant_id IS NOT NULL THEN
    UPDATE public.restaurants
    SET
      logo_url = COALESCE(v_clean_logo, logo_url),
      banner_url = COALESCE(v_clean_banner, banner_url),
      updated_at = NOW()
    WHERE id = v_app.activated_restaurant_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'logo_url', COALESCE(v_clean_logo, v_app.logo_url),
    'banner_url', COALESCE(v_clean_banner, v_app.banner_url)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_application_media_urls(UUID, TEXT, TEXT) TO anon, authenticated;

-- 2. ASEGURAR COLUMNA is_active EN restaurant_drivers
ALTER TABLE public.restaurant_drivers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_restaurant_drivers_restaurant_active
  ON public.restaurant_drivers(restaurant_id, is_active, created_at DESC);

-- 3. CORREGIR TRIGGER notify_on_new_message (usar 'in_review' en lugar de 'in_progress' para respetar CHECK constraint)
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
        status = CASE WHEN status = 'waiting_for_customer' THEN 'in_review' ELSE status END,
        updated_at = NOW()
      WHERE id = NEW.ticket_id;
    END IF;

    -- REGLA CRÍTICA: Si es nota interna, JAMÁS notificar al solicitante
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
            'Nuevo mensaje en Ticket #' || v_short_id,
            'El usuario envió un mensaje en "' || COALESCE(v_ticket.subject, '') || '".'
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

-- 4. ACTUALIZAR TRIGGER notify_on_ticket_updated PARA MANEJAR ESTADOS VÁLIDOS
CREATE OR REPLACE FUNCTION public.notify_on_ticket_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_id TEXT;
  v_admin RECORD;
BEGIN
  BEGIN
    v_short_id := upper(substring(NEW.id::TEXT FROM 1 FOR 8));

    -- 1. Reasignación de ticket
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      PERFORM public.internal_create_notification(
        NEW.assigned_to,
        NEW.id,
        'ticket_assigned',
        'Ticket Asignado #' || v_short_id,
        'Se te ha asignado el ticket: ' || COALESCE(NEW.subject, '')
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
      ELSIF NEW.status IN ('in_review', 'closed') THEN
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

-- 5. STORAGE RLS: PERMITIR A PERSONAL DE RESTAURANTE (staff/manager/owner) SUBIR CONTENIDO MULTIMEDIA
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
      AND (
        public.storage_is_restaurant_owner(((string_to_array(name, '/'))[2])::UUID)
        OR public.is_restaurant_member(auth.uid(), ((string_to_array(name, '/'))[2])::UUID)
      )
    )
    OR (
      (storage.foldername(name))[1] IN ('avatars', 'reviews')
      AND array_length(string_to_array(name, '/'), 1) >= 3
      AND (string_to_array(name, '/'))[2] = auth.uid()::TEXT
    )
  )
);

NOTIFY pgrst, 'reload schema';
