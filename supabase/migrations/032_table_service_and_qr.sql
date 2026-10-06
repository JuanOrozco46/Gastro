-- 032_table_service_and_qr.sql
-- Fase 2 y 3: Modelo de Restaurantes y Mesas

-- 1. Añadir campos a restaurants
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS google_place_id TEXT NULL,
ADD COLUMN IF NOT EXISTS google_review_url TEXT NULL,
ADD COLUMN IF NOT EXISTS table_service_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Validar URL HTTPS
ALTER TABLE public.restaurants 
ADD CONSTRAINT google_review_url_check 
CHECK (google_review_url IS NULL OR google_review_url ~ '^https://');

-- 2. Crear tabla restaurant_tables
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL CHECK (trim(table_number) <> ''),
  display_name TEXT NULL,
  capacity INTEGER NULL CHECK (capacity > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  public_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ NULL,
  UNIQUE(restaurant_id, table_number)
);

-- 3. Modificar orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS table_id UUID NULL REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;

-- Indice para búsquedas
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_restaurant_id ON public.restaurant_tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_public_token ON public.restaurant_tables(public_token);

-- 4. RLS para restaurant_tables
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Dueños pueden administrar sus mesas
CREATE POLICY "Dueños administran mesas" 
ON public.restaurant_tables 
FOR ALL 
TO authenticated
USING (is_restaurant_member(auth.uid(), restaurant_id))
WITH CHECK (is_restaurant_member(auth.uid(), restaurant_id));

-- RPC para resolver la mesa por token de forma segura (Fase 5 base)
CREATE OR REPLACE FUNCTION public.resolve_table_by_token(p_token UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table record;
  v_restaurant record;
BEGIN
  -- Buscar la mesa
  SELECT * INTO v_table
  FROM public.restaurant_tables
  WHERE public_token = p_token
    AND is_active = TRUE
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  -- Buscar restaurante
  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_table.restaurant_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'restaurant_inactive');
  END IF;

  IF NOT v_restaurant.table_service_enabled THEN
    RETURN jsonb_build_object('error', 'table_service_disabled');
  END IF;

  RETURN jsonb_build_object(
    'table', jsonb_build_object(
      'id', v_table.id,
      'restaurant_id', v_table.restaurant_id,
      'table_number', v_table.table_number,
      'display_name', v_table.display_name,
      'capacity', v_table.capacity
    ),
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id,
      'name', v_restaurant.name,
      'slug', v_restaurant.slug,
      'logo_url', v_restaurant.logo_url,
      'banner_url', v_restaurant.banner_url,
      'logo_emoji', v_restaurant.logo_emoji,
      'is_open', v_restaurant.is_open,
      'accepting_orders', v_restaurant.accepting_orders
    )
  );
END;
$$;

-- RPC para regenerar token
CREATE OR REPLACE FUNCTION public.regenerate_table_token(p_table_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_new_token UUID;
BEGIN
  -- Validar pertenencia
  SELECT restaurant_id INTO v_restaurant_id
  FROM public.restaurant_tables
  WHERE id = p_table_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  IF NOT is_restaurant_member(auth.uid(), v_restaurant_id) AND NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_new_token := gen_random_uuid();

  UPDATE public.restaurant_tables
  SET public_token = v_new_token,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN v_new_token;
END;
$$;
