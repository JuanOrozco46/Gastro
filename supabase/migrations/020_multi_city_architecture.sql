-- Migration 018: Multi-city and multi-zone structural architecture
-- Safe, idempotent migration to enable multi-city operation across GastroSync.

-- 1. Ensure CITIES table schema and constraints
CREATE TABLE IF NOT EXISTS public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'CO',
  currency_code TEXT NOT NULL DEFAULT 'COP',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure ZONES table schema and constraints
CREATE TABLE IF NOT EXISTS public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_zones_city_slug UNIQUE (city_id, slug)
);

-- 3. Create Performance Indexes for Multi-City filtering
CREATE INDEX IF NOT EXISTS idx_cities_active ON public.cities (is_active);
CREATE INDEX IF NOT EXISTS idx_zones_city_active ON public.zones (city_id, is_active);
CREATE INDEX IF NOT EXISTS idx_restaurants_city_id ON public.restaurants (city_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_zone_id ON public.restaurants (zone_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_status_open ON public.restaurants (status, is_open);
CREATE INDEX IF NOT EXISTS idx_restaurant_apps_city ON public.restaurant_applications (city_id, status);

-- 4. Enable RLS on cities and zones
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

-- 5. Idempotent RLS Policies for Cities and Zones
DROP POLICY IF EXISTS "Cities are viewable by everyone" ON public.cities;
CREATE POLICY "Cities are viewable by everyone"
  ON public.cities FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Active zones are viewable by everyone" ON public.zones;
CREATE POLICY "Active zones are viewable by everyone"
  ON public.zones FOR SELECT
  USING (true);

-- 6. Idempotent Seed Data (Armenia - Piloto Inicial)
INSERT INTO public.cities (id, slug, name, country_code, currency_code, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'armenia-quindio', 'Armenia', 'CO', 'COP', TRUE)
ON CONFLICT (slug) DO UPDATE SET is_active = TRUE, name = EXCLUDED.name;

INSERT INTO public.zones (id, city_id, slug, name, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'armenia-centro', 'Centro', TRUE),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'armenia-norte', 'Norte', TRUE),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'armenia-sur', 'Sur', TRUE)
ON CONFLICT (city_id, slug) DO UPDATE SET is_active = TRUE, name = EXCLUDED.name;

-- 7. Secondary Seed Data for Multi-city Testing (Pereira, Risaralda)
INSERT INTO public.cities (id, slug, name, country_code, currency_code, is_active)
VALUES ('00000000-0000-0000-0000-000000000002', 'pereira-risaralda', 'Pereira', 'CO', 'COP', TRUE)
ON CONFLICT (slug) DO UPDATE SET is_active = TRUE, name = EXCLUDED.name;

INSERT INTO public.zones (id, city_id, slug, name, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000002', 'pereira-circunvalar', 'Circunvalar', TRUE),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000002', 'pereira-cerritos', 'Cerritos', TRUE),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000002', 'pereira-centro', 'Centro', TRUE)
ON CONFLICT (city_id, slug) DO UPDATE SET is_active = TRUE, name = EXCLUDED.name;
