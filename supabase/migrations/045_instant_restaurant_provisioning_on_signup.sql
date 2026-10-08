-- =============================================================================
-- MIGRACIÓN 045: APROVISIONAMIENTO INSTANTÁNEO Y ATÓMICO AL REGISTRAR RESTAURANTE
-- Garantiza que al registrar un restaurante nuevo (en signUp o en el primer login),
-- PostgreSQL cree y vincule el restaurante de forma inmediata y sin condiciones
-- de carrera (pg_advisory_xact_lock).
-- =============================================================================

-- 1. FUNCIÓN CENTRALIZADA CON BLOQUEO TRANSACCIONAL (EVITA CONDICIONES DE CARRERA)
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

  IF p_user_email IS NOT NULL AND btrim(p_user_email) <> '' THEN
    v_email := lower(btrim(p_user_email));
  ELSE
    SELECT lower(btrim(u.email)) INTO v_email
    FROM auth.users u
    WHERE u.id = p_user_id;
  END IF;

  -- Bloqueo transaccional por usuario/correo para evitar que llamadas concurrentes
  -- (ej. onAuthStateChange + signInWithPassword + trigger) dupliquen el restaurante.
  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(v_email, p_user_id::text)));

  -- A) Si existe una invitación por correo en restaurant_members para este usuario, activarla y vincular user_id
  IF v_email IS NOT NULL THEN
    UPDATE public.restaurant_members
    SET
      user_id = p_user_id,
      status = CASE WHEN status IS NULL OR status = 'invited' THEN 'active' ELSE status END,
      accepted_at = COALESCE(accepted_at, NOW())
    WHERE lower(btrim(email)) = v_email
      AND (user_id IS NULL OR user_id = p_user_id)
      AND (status IS NULL OR status IN ('invited', 'active'));
  END IF;

  -- B) Normalizar cualquier membresía propia con status NULL
  UPDATE public.restaurant_members
  SET
    status = 'active',
    accepted_at = COALESCE(accepted_at, created_at, NOW()),
    email = COALESCE(email, v_email)
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
        email = COALESCE(EXCLUDED.email, public.restaurant_members.email);
    END IF;
  END IF;

  -- E) Si aún no tiene restaurante pero registró una solicitud en public.restaurant_applications (no rechazada),
  --    vincular o aprovisionar el restaurante automáticamente.
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
        SET owner_user_id = COALESCE(owner_user_id, p_user_id),
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
              p_user_id,
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
        VALUES (v_member_restaurant_id, p_user_id, v_email, 'owner', 'active', NOW())
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
          THEN COALESCE(NULLIF(btrim(v_app.owner_name), ''), p.full_name)
        ELSE p.full_name
      END,
      phone = COALESCE(NULLIF(btrim(p.phone), ''), NULLIF(btrim(v_app.owner_phone), '')),
      default_address = COALESCE(NULLIF(btrim(p.default_address), ''), NULLIF(btrim(v_app.address), '')),
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

-- 2. ACTUALIZAR RPC resolve_or_provision_restaurant_owner PARA DELEGAR EN LA FUNCIÓN CON BLOQUEO
CREATE OR REPLACE FUNCTION public.resolve_or_provision_restaurant_owner()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.provision_restaurant_for_user(auth.uid(), NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_or_provision_restaurant_owner() TO authenticated;

-- 3. ACTUALIZAR TRIGGER handle_new_user() EN auth.users PARA APROVISIONAR EL RESTAURANTE EN EL MISMO INSTANTE DEL SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_username TEXT;
  v_clean_username TEXT;
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

  INSERT INTO public.profiles (
    id,
    full_name,
    username,
    avatar_url,
    phone,
    default_address,
    default_delivery_notes,
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
    updated_at = NOW();

  -- Si el correo que se está registrando tiene una solicitud de restaurante o invitación pendiente,
  -- aprovisionar el restaurante y asignar business_role = 'restaurant_owner' inmediatamente.
  PERFORM public.provision_restaurant_for_user(NEW.id, NEW.email);

  RETURN NEW;
END;
$$;
