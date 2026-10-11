-- =============================================================================
-- Migración 057: Banco de Ubicaciones del Usuario y Ciudad Principal de Entrega
-- Permite persistir en `public.profiles` la ciudad principal (`preferred_city_id`)
-- y el banco de direcciones frecuentes (`saved_addresses` en formato JSONB).
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_city_id TEXT,
  ADD COLUMN IF NOT EXISTS saved_addresses JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.preferred_city_id IS
  'ID de la ciudad principal asignada por el cliente en el registro o en su perfil.';

COMMENT ON COLUMN public.profiles.saved_addresses IS
  'Banco de ubicaciones frecuentes del usuario (Casa, Oficina, etc.) con ciudad, zona y notas.';
