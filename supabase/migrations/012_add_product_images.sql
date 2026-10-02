-- ============================================================================
-- GASTROSYNC - ADICIÓN DE IMÁGENES A PRODUCTOS
-- Versión: 012_add_product_images.sql
-- Descripción: Agrega la columna image_url a la tabla products para permitir
--              subir fotos reales de los productos del menú.
-- ============================================================================

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Forzar refresco de schema cache en PostgREST
NOTIFY pgrst, 'reload schema';
