-- ============================================================================
-- Auditoría Fase 3: RLS de restaurant_applications y Storage como rol anónimo.
-- SEGURO PARA PRODUCCIÓN: todo corre en un bloque DO que termina con una
-- excepción deliberada, por lo que Postgres hace ROLLBACK. No persiste nada.
-- Ejecutar con:
--   npx supabase db query --linked -f supabase/tests/phase3-applications-rls-audit.sql
-- El resultado aparece en el mensaje de la excepción final "AUDIT_RESULT".
-- ============================================================================
DO $audit$
DECLARE
  v_report TEXT := '';
  v_arm_city CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  v_arm_zone CONSTANT UUID := 'c3dfc8d3-4849-4b5a-a6f1-fc1344c3c3e0';
  v_per_zone CONSTANT UUID := '00000000-0000-0000-0000-000000000023';
BEGIN
  SET LOCAL ROLE anon;

  -- A) Solicitud válida (Armenia / Centro)
  BEGIN
    INSERT INTO public.restaurant_applications
      (id, owner_name, owner_email, owner_phone, restaurant_name, category, city_id, zone_id, address, status)
    VALUES (gen_random_uuid(), 'AUDIT', 'audit-a@example.invalid', '3000000000', 'AUDIT A', 'Otra', v_arm_city, v_arm_zone, 'Calle 1', 'submitted');
    v_report := v_report || E'\nA valida (Armenia/Centro): PERMITIDA';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nA valida (Armenia/Centro): BLOQUEADA -> ' || SQLERRM;
  END;

  -- B) Zona de OTRA ciudad (ciudad Armenia + zona Pereira/Centro)
  BEGIN
    INSERT INTO public.restaurant_applications
      (id, owner_name, owner_email, owner_phone, restaurant_name, category, city_id, zone_id, address, status)
    VALUES (gen_random_uuid(), 'AUDIT', 'audit-b@example.invalid', '3000000000', 'AUDIT B', 'Otra', v_arm_city, v_per_zone, 'Calle 1', 'submitted');
    v_report := v_report || E'\nB zona de otra ciudad: PERMITIDA  <-- FALLO DE SEGURIDAD';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nB zona de otra ciudad: BLOQUEADA -> ' || SQLERRM;
  END;

  -- C) Ciudad inexistente
  BEGIN
    INSERT INTO public.restaurant_applications
      (id, owner_name, owner_email, owner_phone, restaurant_name, category, city_id, zone_id, address, status)
    VALUES (gen_random_uuid(), 'AUDIT', 'audit-c@example.invalid', '3000000000', 'AUDIT C', 'Otra', gen_random_uuid(), v_arm_zone, 'Calle 1', 'submitted');
    v_report := v_report || E'\nC ciudad invalida: PERMITIDA  <-- FALLO';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nC ciudad invalida: BLOQUEADA -> ' || SQLERRM;
  END;

  -- D) Intento de auto-aprobación
  BEGIN
    INSERT INTO public.restaurant_applications
      (id, owner_name, owner_email, owner_phone, restaurant_name, category, city_id, zone_id, address, status)
    VALUES (gen_random_uuid(), 'AUDIT', 'audit-d@example.invalid', '3000000000', 'AUDIT D', 'Otra', v_arm_city, v_arm_zone, 'Calle 1', 'approved');
    v_report := v_report || E'\nD status=approved: PERMITIDA  <-- FALLO';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nD status=approved: BLOQUEADA -> ' || SQLERRM;
  END;

  -- E) Duplicado pendiente (mismo correo dos veces)
  BEGIN
    INSERT INTO public.restaurant_applications
      (id, owner_name, owner_email, owner_phone, restaurant_name, category, city_id, zone_id, address, status)
    VALUES (gen_random_uuid(), 'AUDIT', 'audit-e@example.invalid', '3000000000', 'AUDIT E1', 'Otra', v_arm_city, v_arm_zone, 'Calle 1', 'submitted');
    INSERT INTO public.restaurant_applications
      (id, owner_name, owner_email, owner_phone, restaurant_name, category, city_id, zone_id, address, status)
    VALUES (gen_random_uuid(), 'AUDIT', 'AUDIT-E@example.invalid', '3000000000', 'AUDIT E2', 'Otra', v_arm_city, v_arm_zone, 'Calle 1', 'submitted');
    v_report := v_report || E'\nE duplicado pendiente (mismo correo): PERMITIDO  <-- sin proteccion en BD';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nE duplicado pendiente: BLOQUEADO -> ' || SQLERRM;
  END;

  -- F) Anónimo puede LEER solicitudes? (el pre-chequeo de duplicados del frontend depende de esto)
  BEGIN
    PERFORM 1 FROM public.restaurant_applications;
    v_report := v_report || E'\nF SELECT anonimo ejecutado (filas visibles por RLS: '
      || (SELECT count(*) FROM public.restaurant_applications) || ')';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nF SELECT anonimo: ' || SQLERRM;
  END;

  -- G) Anónimo subiendo a buckets de Storage
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'applications/x/logo.png');
    v_report := v_report || E'\nG upload anonimo restaurant-assets: PERMITIDO <-- FALLO';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nG upload anonimo restaurant-assets: BLOQUEADO -> ' || SQLERRM;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('gastro-media', 'applications/x/logo.png');
    v_report := v_report || E'\nH upload anonimo gastro-media: PERMITIDO <-- FALLO';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nH upload anonimo gastro-media: BLOQUEADO -> ' || SQLERRM;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('application-assets', 'applications/x/logo.png');
    v_report := v_report || E'\nI upload anonimo application-assets (directo): PERMITIDO <-- FALLO';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\nI upload anonimo application-assets (directo): BLOQUEADO -> ' || SQLERRM;
  END;

  RAISE EXCEPTION 'AUDIT_RESULT (rollback deliberado, nada persistido):%', v_report;
END
$audit$;
