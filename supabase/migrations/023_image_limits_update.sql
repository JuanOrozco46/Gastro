-- ============================================================================
-- GASTROSYNC - 023: ACTUALIZACIÓN DE LÍMITES DE ALMACENAMIENTO (FASE 3.2)
-- Idempotente. Ajusta los límites máximos permitidos en buckets.
-- ============================================================================

-- Actualizamos el límite del bucket de aplicaciones a 12 MB (para permitir banners)
-- y limitamos los formatos a nivel de Storage.
UPDATE storage.buckets
SET file_size_limit = 12582912, -- 12 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'application-assets';
