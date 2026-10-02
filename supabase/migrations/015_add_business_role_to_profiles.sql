-- ============================================================================
-- GASTROSYNC - AGREGAR BUSINESS_ROLE Y TENANT_ID A PROFILES
-- Versión: 015_add_business_role_to_profiles.sql
-- Descripción: Agrega columnas necesarias para el sistema KDS y permisos de restaurante
-- ============================================================================

-- Problema identificado:
-- El RPC update_order_status esperaba business_role y tenant_id en profiles,
-- pero la tabla solo tenía platform_role desde la migración inicial.

-- Solución:
-- 1. Agregar columna business_role (rol de negocio: customer, restaurant_owner, restaurant_staff, platform_admin)
-- 2. Agregar columna tenant_id (restaurante al que pertenece el usuario)
-- 3. Migrar datos existentes de restaurant_members a profiles
-- 4. Actualizar trigger de creación de perfiles

-- ============================================================================
-- 1. AGREGAR COLUMNAS A PROFILES
-- ============================================================================

-- Agregar business_role (con DEFAULT derivado de platform_role)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS business_role TEXT;

-- Agregar tenant_id (restaurante asociado)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL;

-- Constraint para business_role
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_business_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_business_role_check 
CHECK (business_role IN ('customer', 'restaurant_owner', 'restaurant_staff', 'platform_admin'));

-- ============================================================================
-- 2. MIGRAR DATOS EXISTENTES
-- ============================================================================

-- Establecer business_role basado en platform_role para perfiles existentes sin business_role
UPDATE public.profiles
SET business_role = CASE
  WHEN platform_role = 'platform_admin' THEN 'platform_admin'
  ELSE 'customer'
END
WHERE business_role IS NULL;

-- Migrar membresías de restaurant_members a profiles
-- Si el usuario es owner, establecer business_role = 'restaurant_owner'
-- Si el usuario es staff, establecer business_role = 'restaurant_staff'
UPDATE public.profiles p
SET 
  business_role = CASE 
    WHEN rm.role = 'owner' THEN 'restaurant_owner'
    WHEN rm.role = 'staff' THEN 'restaurant_staff'
    ELSE p.business_role
  END,
  tenant_id = rm.restaurant_id
FROM public.restaurant_members rm
WHERE p.id = rm.user_id
  AND rm.restaurant_id IS NOT NULL;

-- Establecer business_role NOT NULL con valor por defecto
ALTER TABLE public.profiles
ALTER COLUMN business_role SET DEFAULT 'customer',
ALTER COLUMN business_role SET NOT NULL;

-- ============================================================================
-- 3. ACTUALIZAR TRIGGER DE CREACIÓN DE PERFILES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, platform_role, business_role, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Usuario GastroSync'),
    'customer',
    'customer',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recrear el trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 4. CREAR FUNCIÓN HELPER PARA SINCRONIZAR MEMBERS → PROFILES
-- ============================================================================

-- Esta función mantiene profiles.business_role y profiles.tenant_id
-- sincronizados cuando se actualizan restaurant_members
CREATE OR REPLACE FUNCTION public.sync_profile_from_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.profiles
    SET 
      business_role = CASE 
        WHEN NEW.role = 'owner' THEN 'restaurant_owner'
        WHEN NEW.role = 'staff' THEN 'restaurant_staff'
        ELSE business_role
      END,
      tenant_id = NEW.restaurant_id
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Si se elimina la membresía, revertir a customer
    UPDATE public.profiles
    SET 
      business_role = 'customer',
      tenant_id = NULL
    WHERE id = OLD.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.restaurant_members
        WHERE user_id = OLD.user_id
      );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Crear trigger para sincronización automática
DROP TRIGGER IF EXISTS sync_profile_on_member_change ON public.restaurant_members;
CREATE TRIGGER sync_profile_on_member_change
  AFTER INSERT OR UPDATE OR DELETE ON public.restaurant_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_member();

-- ============================================================================
-- 5. CREAR ÍNDICES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_business_role ON public.profiles(business_role);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_business_tenant ON public.profiles(business_role, tenant_id);

-- ============================================================================
-- 6. COMENTARIOS PARA DOCUMENTACIÓN
-- ============================================================================

COMMENT ON COLUMN public.profiles.business_role IS 'Rol de negocio: customer (cliente), restaurant_owner (dueño), restaurant_staff (personal), platform_admin (admin plataforma)';
COMMENT ON COLUMN public.profiles.tenant_id IS 'ID del restaurante al que pertenece el usuario (NULL para customers y platform_admins)';
COMMENT ON COLUMN public.profiles.platform_role IS 'Rol legacy de plataforma (mantener para compatibilidad)';

-- ============================================================================
-- 7. VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================================

DO $$
DECLARE
  profiles_without_business_role integer;
  members_without_sync integer;
BEGIN
  -- Verificar que todos los profiles tienen business_role
  SELECT COUNT(*) INTO profiles_without_business_role
  FROM public.profiles
  WHERE business_role IS NULL;
  
  IF profiles_without_business_role > 0 THEN
    RAISE WARNING 'Quedan % perfiles sin business_role. Revisar manualmente.', profiles_without_business_role;
  ELSE
    RAISE NOTICE '✅ Todos los profiles tienen business_role asignado.';
  END IF;
  
  -- Verificar que los members están sincronizados con profiles
  SELECT COUNT(*) INTO members_without_sync
  FROM public.restaurant_members rm
  LEFT JOIN public.profiles p ON p.id = rm.user_id
  WHERE p.tenant_id != rm.restaurant_id
     OR (p.business_role NOT IN ('restaurant_owner', 'restaurant_staff'));
  
  IF members_without_sync > 0 THEN
    RAISE WARNING 'Quedan % membresías sin sincronizar con profiles.', members_without_sync;
  ELSE
    RAISE NOTICE '✅ Todas las membresías están sincronizadas con profiles.';
  END IF;
END $$;
