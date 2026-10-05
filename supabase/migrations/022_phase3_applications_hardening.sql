-- ============================================================================
-- GASTROSYNC - 022: ENDURECIMIENTO DE SOLICITUDES DE RESTAURANTES (FASE 3)
-- Idempotente y NO destructiva. Hallazgos de la auditoría remota:
--   1. RLS de applications_insert_public tenía `z.city_id = z.city_id`
--      (tautología): aceptaba una zona de OTRA ciudad.
--   2. No había protección de BD contra solicitudes pendientes duplicadas
--      (el pre-chequeo del frontend no funciona: anon no puede hacer SELECT).
--   3. El bucket 'restaurant-assets' que usaba el frontend NO existía y
--      'gastro-media' exige sesión: un visitante nunca pudo subir imágenes.
--   4. No se guardaba la aceptación de términos/comisión.
-- ============================================================================

-- ── 1. COLUMNAS NUEVAS ──────────────────────────────────────────────────────
ALTER TABLE public.restaurant_applications
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS commission_rate_accepted NUMERIC(5,4)
    CHECK (commission_rate_accepted IS NULL OR (commission_rate_accepted >= 0 AND commission_rate_accepted <= 1)),
  -- Rutas dentro del bucket PRIVADO 'application-assets'. Solo las escribe la
  -- Edge Function 'application-assets' (service role) tras validar los bytes.
  ADD COLUMN IF NOT EXISTS logo_path TEXT,
  ADD COLUMN IF NOT EXISTS banner_path TEXT;

-- ── 2. LÍMITES DE LONGITUD (NOT VALID: no revalida filas existentes) ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'restaurant_applications_field_limits'
      AND conrelid = 'public.restaurant_applications'::regclass
  ) THEN
    ALTER TABLE public.restaurant_applications
      ADD CONSTRAINT restaurant_applications_field_limits CHECK (
        char_length(owner_name) <= 120
        AND char_length(owner_email) <= 254
        AND owner_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        AND char_length(owner_phone) <= 30
        AND char_length(restaurant_name) <= 120
        AND char_length(category) <= 60
        AND char_length(address) <= 250
        AND (whatsapp IS NULL OR char_length(whatsapp) <= 30)
        AND (description IS NULL OR char_length(description) <= 1000)
        AND (schedule_hours IS NULL OR char_length(schedule_hours) <= 200)
        AND (notes IS NULL OR char_length(notes) <= 1000)
      ) NOT VALID;
  END IF;
END $$;

-- ── 3. ANTI-DUPLICADOS A NIVEL DE BASE DE DATOS ────────────────────────────
-- Una sola solicitud pendiente (submitted/reviewing) por correo y por
-- (ciudad, nombre de restaurante). Funciona aunque el visitante sea anónimo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_apps_pending_email
  ON public.restaurant_applications (lower(owner_email))
  WHERE status IN ('submitted', 'reviewing');

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_apps_pending_name_city
  ON public.restaurant_applications (city_id, lower(restaurant_name))
  WHERE status IN ('submitted', 'reviewing');

-- ── 4. TRIGGERS: marca de tiempo del servidor y transiciones de estado ─────
CREATE OR REPLACE FUNCTION public.restaurant_applications_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- La hora de aceptación la fija el servidor, el cliente no puede falsearla.
  IF NEW.commission_rate_accepted IS NOT NULL THEN
    NEW.terms_accepted_at := NOW();
  ELSE
    NEW.terms_accepted_at := NULL;
  END IF;
  NEW.owner_email := lower(btrim(NEW.owner_email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_restaurant_applications_before_insert ON public.restaurant_applications;
CREATE TRIGGER tr_restaurant_applications_before_insert
  BEFORE INSERT ON public.restaurant_applications
  FOR EACH ROW EXECUTE FUNCTION public.restaurant_applications_before_insert();

CREATE OR REPLACE FUNCTION public.restaurant_applications_guard_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Una decisión final (aprobada/rechazada) no se puede revertir ni
  -- sobrescribir (doble aprobación, aprobar algo ya rechazado, etc.).
  IF OLD.status IN ('approved', 'rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'La solicitud ya fue finalizada (%) y no puede cambiar de estado.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- Un restaurante ya activado no se puede re-vincular a otra solicitud.
  IF OLD.activated_restaurant_id IS NOT NULL
     AND NEW.activated_restaurant_id IS DISTINCT FROM OLD.activated_restaurant_id THEN
    RAISE EXCEPTION 'La solicitud ya fue activada y no puede re-vincularse.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_restaurant_applications_guard_update ON public.restaurant_applications;
CREATE TRIGGER tr_restaurant_applications_guard_update
  BEFORE UPDATE ON public.restaurant_applications
  FOR EACH ROW EXECUTE FUNCTION public.restaurant_applications_guard_update();

-- ── 5. POLÍTICA DE INSERCIÓN PÚBLICA (corrige la tautología de zona) ───────
DROP POLICY IF EXISTS "applications_insert_public" ON public.restaurant_applications;
CREATE POLICY "applications_insert_public" ON public.restaurant_applications FOR INSERT WITH CHECK (
  status = 'submitted'
  AND review_note IS NULL
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND activated_at IS NULL
  AND activated_restaurant_id IS NULL
  AND activated_by IS NULL
  -- Las imágenes solo las adjunta la Edge Function tras validarlas.
  AND logo_url IS NULL
  AND banner_url IS NULL
  AND logo_path IS NULL
  AND banner_path IS NULL
  -- Aceptación de términos/comisión obligatoria (terms_accepted_at lo fija el trigger).
  AND commission_rate_accepted IS NOT NULL
  AND terms_accepted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.cities c
    WHERE c.id = restaurant_applications.city_id AND c.is_active = TRUE
  )
  AND EXISTS (
    SELECT 1 FROM public.zones z
    WHERE z.id = restaurant_applications.zone_id
      AND z.city_id = restaurant_applications.city_id   -- << antes: z.city_id = z.city_id
      AND z.is_active = TRUE
  )
);

-- ── 6. BUCKET PRIVADO PARA ASSETS DE SOLICITUDES ───────────────────────────
-- Privado, 5 MB, solo JPG/PNG/WEBP. Storage aplica estos límites en el
-- servidor (no solo en el navegador). SIN políticas de INSERT para anon:
-- las subidas solo ocurren con URLs firmadas emitidas por la Edge Function.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'application-assets',
  'application-assets',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Solo el administrador de plataforma puede leer (para generar URLs firmadas de revisión).
DROP POLICY IF EXISTS "application_assets_admin_read" ON storage.objects;
CREATE POLICY "application_assets_admin_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'application-assets'
    AND public.is_platform_admin(auth.uid())
  );
