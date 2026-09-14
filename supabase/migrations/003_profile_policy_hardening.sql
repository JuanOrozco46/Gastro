-- ============================================================================
-- GASTROSYNC - PARCHE DE PREVENCIÓN DE RECURSIÓN RLS EN PROFILES
-- Versión: 003_profile_policy_hardening.sql
-- Descripción: Elimina consultas directas a public.profiles dentro de políticas RLS
--              mediante la función SECURITY DEFINER public.get_platform_role(UUID).
-- ============================================================================

-- 1. FUNCIÓN SECURITY DEFINER PARA OBTENER EL PLATFORM_ROLE ACTUAL
CREATE OR REPLACE FUNCTION public.get_platform_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT platform_role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN v_role;
END;
$$;

-- 2. REEMPLAZO DE LA POLÍTICA DE ACTUALIZACIÓN DE PROFILES (SIN SUBQUERIES RECURSIVOS)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_update_own_or_admin" ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (
      id = auth.uid()
      AND platform_role = public.get_platform_role(auth.uid())
    )
  );
