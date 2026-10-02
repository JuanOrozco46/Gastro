-- ============================================================================
-- GASTROSYNC - CONFIGURACIÓN AVANZADA DE RESTAURANTES Y HORARIOS
-- Versión: 016_restaurant_configuration.sql
-- ============================================================================

-- 1. Ampliar tabla restaurants con campos de perfil, pausas y promesas de entrega
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS logo_emoji TEXT,
ADD COLUMN IF NOT EXISTS banner_url TEXT,
ADD COLUMN IF NOT EXISTS estimated_delivery_minutes INTEGER CHECK (estimated_delivery_minutes >= 0),
ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS accepting_orders BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Tabla de Horarios de Restaurante (Restaurant Hours)
-- Permite hasta 2 intervalos por día (ej. Mañana y Noche).
-- Los tiempos deben manejarse en America/Bogota o UTC mapeado a la aplicación.
CREATE TABLE IF NOT EXISTS public.restaurant_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Domingo, 1 = Lunes...
  interval_index INTEGER NOT NULL DEFAULT 1 CHECK (interval_index IN (1, 2)),
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, day_of_week, interval_index),
  CHECK (is_closed = TRUE OR (open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time))
);

-- Índices razonables
CREATE INDEX IF NOT EXISTS idx_restaurant_hours_restaurant_id ON public.restaurant_hours(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_hours_day_of_week ON public.restaurant_hours(day_of_week);

-- Habilitar RLS en Horarios
ALTER TABLE public.restaurant_hours ENABLE ROW LEVEL SECURITY;

-- Políticas Seguras e Idempotentes para Horarios
DROP POLICY IF EXISTS "Horarios visibles para todos" ON public.restaurant_hours;
CREATE POLICY "Horarios visibles para todos" ON public.restaurant_hours
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Dueños pueden insertar horarios" ON public.restaurant_hours;
CREATE POLICY "Dueños pueden insertar horarios" ON public.restaurant_hours
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_members rm 
      WHERE rm.restaurant_id = restaurant_hours.restaurant_id 
      AND rm.user_id = auth.uid() 
      AND rm.role = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "Dueños pueden actualizar horarios" ON public.restaurant_hours;
CREATE POLICY "Dueños pueden actualizar horarios" ON public.restaurant_hours
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_members rm 
      WHERE rm.restaurant_id = restaurant_hours.restaurant_id 
      AND rm.user_id = auth.uid() 
      AND rm.role = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "Dueños pueden eliminar horarios" ON public.restaurant_hours;
CREATE POLICY "Dueños pueden eliminar horarios" ON public.restaurant_hours
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_members rm 
      WHERE rm.restaurant_id = restaurant_hours.restaurant_id 
      AND rm.user_id = auth.uid() 
      AND rm.role = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'platform_admin'
    )
  );

-- Function and trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_restaurant_hours_updated_at ON public.restaurant_hours;
CREATE TRIGGER set_restaurant_hours_updated_at
BEFORE UPDATE ON public.restaurant_hours
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Forzar refresco de schema cache en PostgREST
NOTIFY pgrst, 'reload schema';
