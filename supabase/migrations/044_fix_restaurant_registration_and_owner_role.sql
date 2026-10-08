-- ============================================================================
-- GASTROSYNC - REPARACIÓN DE REGISTRO/ACTIVACIÓN DE RESTAURANTES Y ROL DE DUEÑO
-- Versión: 044_fix_restaurant_registration_and_owner_role.sql
-- Descripción:
--   1. Corrige public.restaurant_members donde approve_restaurant insertaba
--      filas de dueño con status = NULL y accepted_at = NULL (causando que
--      resolveSupabaseUserProfile no encontrara la membresía activa y el
--      restaurante iniciara sesión como cliente, ej. eclisse.axm@gmail.com).
--   2. Agrega DEFAULT 'active' y trigger BEFORE INSERT/UPDATE en
--      public.restaurant_members para garantizar status = 'active' y
--      accepted_at = NOW() siempre que user_id esté presente.
--   3. Sincroniza public.profiles (business_role, tenant_id, full_name, phone)
--      para todos los dueños de restaurantes existentes (incluyendo Eclisse).
--   4. Crea los RPCs SECURITY DEFINER:
--      - public.resolve_or_provision_restaurant_owner() para vincular/aprovisionar
--        automáticamente el restaurante del propietario al iniciar sesión o registrarse.
--      - public.activate_approved_restaurant_rpc(UUID) para activar solicitudes
--        aprobadas de forma atómica desde el panel de SuperAdmin.
-- ============================================================================

-- 1. ASEGURAR DEFAULT 'active' EN restaurant_members.status
ALTER TABLE public.restaurant_members
  ALTER COLUMN status SET DEFAULT 'active';

-- 2. TRIGGER BEFORE INSERT / UPDATE EN public.restaurant_members
-- Garantiza que cualquier inserción (incluso desde Edge Functions que omitan
-- status o accepted_at) quede con status = 'active' y accepted_at válido.
CREATE OR REPLACE FUNCTION public.normalize_restaurant_member_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  IF NEW.status IS NULL OR btrim(NEW.status) = '' THEN
    IF NEW.user_id IS NOT NULL THEN
      NEW.status := 'active';
    ELSE
      NEW.status := 'invited';
    END IF;
  END IF;

  IF NEW.status = 'active' AND NEW.accepted_at IS NULL THEN
    NEW.accepted_at := COALESCE(NEW.created_at, NOW());
  END IF;

  IF (NEW.email IS NULL OR btrim(NEW.email) = '') AND NEW.user_id IS NOT NULL THEN
    SELECT lower(btrim(u.email)) INTO v_user_email
    FROM auth.users u
    WHERE u.id = NEW.user_id;
    NEW.email := v_user_email;
  ELSIF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_restaurant_member ON public.restaurant_members;
CREATE TRIGGER trg_normalize_restaurant_member
  BEFORE INSERT OR UPDATE ON public.restaurant_members
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_restaurant_member_before_write();

-- 3. ACTUALIZAR TRIGGER DE SINCRONIZACIÓN restaurant_members -> profiles
CREATE OR REPLACE FUNCTION public.sync_profile_from_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NOT NULL AND (NEW.status = 'active' OR NEW.status IS NULL) THEN
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
        SELECT 1 FROM public.restaurant_members rm
        WHERE rm.user_id = OLD.user_id
          AND (rm.status = 'active' OR rm.status IS NULL)
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_on_member_change ON public.restaurant_members;
CREATE TRIGGER sync_profile_on_member_change
  AFTER INSERT OR UPDATE OR DELETE ON public.restaurant_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_member();

-- 4. REPARAR MEMBRESÍAS EXISTENTES (INCLUYENDO eclisse.axm@gmail.com)
UPDATE public.restaurant_members rm
SET
  status = 'active',
  accepted_at = COALESCE(rm.accepted_at, rm.created_at, NOW()),
  email = COALESCE(
    NULLIF(lower(btrim(rm.email)), ''),
    (SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id = rm.user_id)
  )
WHERE rm.user_id IS NOT NULL
  AND (rm.status IS NULL OR btrim(rm.status) = '' OR (rm.role = 'owner' AND rm.status = 'invited'));

-- Asegurar que todo restaurante con owner_user_id tenga su fila activa en restaurant_members
INSERT INTO public.restaurant_members (restaurant_id, user_id, email, role, status, accepted_at)
SELECT
  r.id,
  r.owner_user_id,
  (SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id = r.owner_user_id),
  'owner',
  'active',
  NOW()
FROM public.restaurants r
WHERE r.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.restaurant_id = r.id
      AND rm.user_id = r.owner_user_id
  );

-- Sincronizar public.profiles con restaurant_members y enriquecer nombre/teléfono desde restaurant_applications
UPDATE public.profiles p
SET
  business_role = CASE
    WHEN p.platform_role = 'platform_admin' THEN 'platform_admin'
    WHEN rm.role = 'owner' THEN 'restaurant_owner'
    ELSE 'restaurant_staff'
  END,
  tenant_id = rm.restaurant_id,
  updated_at = NOW()
FROM public.restaurant_members rm
WHERE p.id = rm.user_id
  AND rm.status = 'active';

UPDATE public.profiles p
SET
  full_name = CASE
    WHEN p.full_name IS NULL OR btrim(p.full_name) = '' OR p.full_name LIKE '%@%'
      THEN COALESCE(NULLIF(btrim(ra.owner_name), ''), p.full_name)
    ELSE p.full_name
  END,
  phone = COALESCE(NULLIF(btrim(p.phone), ''), NULLIF(btrim(ra.owner_phone), '')),
  default_address = COALESCE(NULLIF(btrim(p.default_address), ''), NULLIF(btrim(ra.address), '')),
  updated_at = NOW()
FROM auth.users u
JOIN public.restaurant_applications ra
  ON lower(btrim(ra.owner_email)) = lower(btrim(u.email))
WHERE p.id = u.id;

-- 5. RPC PARA RESOLVER Y APROVISIONAR AUTOMÁTICAMENTE LA CUENTA DE RESTAURANTE AL INICIAR SESIÓN
CREATE OR REPLACE FUNCTION public.resolve_or_provision_restaurant_owner()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_member_restaurant_id UUID;
  v_member_role TEXT;
  v_app public.restaurant_applications%ROWTYPE;
  v_base_slug TEXT;
  v_unique_slug TEXT;
  v_attempt INT;
  v_full_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_member', false);
  END IF;

  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  -- A) Si existe una invitación por correo en restaurant_members para este usuario, activarla y vincular user_id
  IF v_email IS NOT NULL THEN
    UPDATE public.restaurant_members
    SET
      user_id = v_uid,
      status = CASE WHEN status IS NULL OR status = 'invited' THEN 'active' ELSE status END,
      accepted_at = COALESCE(accepted_at, NOW())
    WHERE lower(btrim(email)) = v_email
      AND (user_id IS NULL OR user_id = v_uid)
      AND (status IS NULL OR status IN ('invited', 'active'));
  END IF;

  -- B) Normalizar cualquier membresía propia con status NULL
  UPDATE public.restaurant_members
  SET
    status = 'active',
    accepted_at = COALESCE(accepted_at, created_at, NOW()),
    email = COALESCE(email, v_email)
  WHERE user_id = v_uid
    AND (status IS NULL OR btrim(status) = '');

  -- C) Verificar si ya tiene membresía activa en restaurant_members
  SELECT rm.restaurant_id, rm.role
  INTO v_member_restaurant_id, v_member_role
  FROM public.restaurant_members rm
  WHERE rm.user_id = v_uid
    AND rm.status = 'active'
  ORDER BY CASE WHEN rm.role = 'owner' THEN 0 ELSE 1 END, rm.created_at DESC
  LIMIT 1;

  -- D) Si aún no aparece en restaurant_members, verificar si es owner_user_id en public.restaurants
  IF v_member_restaurant_id IS NULL THEN
    SELECT r.id, 'owner'
    INTO v_member_restaurant_id, v_member_role
    FROM public.restaurants r
    WHERE r.owner_user_id = v_uid
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_member_restaurant_id IS NOT NULL THEN
      INSERT INTO public.restaurant_members (restaurant_id, user_id, email, role, status, accepted_at)
      VALUES (v_member_restaurant_id, v_uid, v_email, 'owner', 'active', NOW())
      ON CONFLICT (restaurant_id, user_id) WHERE user_id IS NOT NULL
      DO UPDATE SET status = 'active', role = 'owner', accepted_at = COALESCE(public.restaurant_members.accepted_at, NOW());
    END IF;
  END IF;

  -- E) Si aún no tiene restaurante pero registró una solicitud en public.restaurant_applications (no rechazada),
  --    vincular o aprovisionar el restaurante automáticamente para que entre como restaurante.
  IF v_member_restaurant_id IS NULL AND v_email IS NOT NULL THEN
    SELECT * INTO v_app
    FROM public.restaurant_applications ra
    WHERE lower(btrim(ra.owner_email)) = v_email
      AND ra.status <> 'rejected'
    ORDER BY ra.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_app.activated_restaurant_id IS NOT NULL THEN
        v_member_restaurant_id := v_app.activated_restaurant_id;
        v_member_role := 'owner';

        UPDATE public.restaurants
        SET owner_user_id = COALESCE(owner_user_id, v_uid),
            status = 'active'
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
              banner_url
            ) VALUES (
              v_uid,
              btrim(v_app.restaurant_name),
              v_unique_slug,
              btrim(v_app.category),
              v_app.description,
              btrim(v_app.address),
              'active',
              true,
              true,
              v_app.city_id,
              v_app.zone_id,
              v_app.owner_phone,
              v_app.whatsapp,
              COALESCE(v_app.min_order, 0),
              v_app.estimated_delivery_minutes,
              COALESCE(v_app.delivery_modes, ARRAY['pickup', 'restaurant_delivery']::TEXT[]),
              COALESCE(v_app.delivery_fee, 0),
              COALESCE(v_app.delivery_radius_km, 5),
              v_app.logo_url,
              v_app.banner_url
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
            status = 'approved',
            reviewed_at = COALESCE(reviewed_at, NOW()),
            activated_at = COALESCE(activated_at, NOW()),
            activated_restaurant_id = v_member_restaurant_id
          WHERE id = v_app.id;
        END IF;
      END IF;

      IF v_member_restaurant_id IS NOT NULL THEN
        INSERT INTO public.restaurant_members (restaurant_id, user_id, email, role, status, accepted_at)
        VALUES (v_member_restaurant_id, v_uid, v_email, 'owner', 'active', NOW())
        ON CONFLICT (restaurant_id, user_id) WHERE user_id IS NOT NULL
        DO UPDATE SET
          role = 'owner',
          status = 'active',
          accepted_at = COALESCE(public.restaurant_members.accepted_at, NOW()),
          email = EXCLUDED.email;
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
      updated_at = NOW()
    WHERE p.id = v_uid
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

GRANT EXECUTE ON FUNCTION public.resolve_or_provision_restaurant_owner() TO authenticated;

-- 6. RPC ATÓMICO PARA ACTIVAR RESTAURANTES APROBADOS DESDE SUPERADMIN
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

  -- Si el usuario aún no existe en auth.users, indicar que debe usarse la Edge Function para enviarle invitación por correo
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'needs_invite', true);
  END IF;

  v_base_slug := regexp_replace(
    lower(btrim(v_app.restaurant_name)),
    '[^a-z0-9]+', '-', 'g'
  );
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
        banner_url
      ) VALUES (
        v_owner_id,
        btrim(v_app.restaurant_name),
        v_unique_slug,
        btrim(v_app.category),
        v_app.description,
        btrim(v_app.address),
        'active',
        false,
        true,
        v_app.city_id,
        v_app.zone_id,
        v_app.owner_phone,
        v_app.whatsapp,
        COALESCE(v_app.min_order, 0),
        v_app.estimated_delivery_minutes,
        COALESCE(v_app.delivery_modes, ARRAY['pickup', 'restaurant_delivery']::TEXT[]),
        COALESCE(v_app.delivery_fee, 0),
        COALESCE(v_app.delivery_radius_km, 5),
        v_app.logo_url,
        v_app.banner_url
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
    email = EXCLUDED.email;

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
    activated_by = v_caller_id
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenantId', v_restaurant_id,
    'message', 'Restaurante activado y vinculado exitosamente a la cuenta del propietario.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_approved_restaurant_rpc(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
