-- Migración para añadir soporte de dimensiones reales a imágenes y videos en publicaciones (feed)
-- Evita recortes forzados y deformaciones.

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS media_width integer,
ADD COLUMN IF NOT EXISTS media_height integer,
ADD COLUMN IF NOT EXISTS aspect_ratio numeric;

-- Opcionalmente añadir constraints:
-- CHECK (media_width > 0 AND media_height > 0 AND aspect_ratio > 0)
ALTER TABLE public.posts
ADD CONSTRAINT check_media_width_positive CHECK (media_width IS NULL OR media_width > 0),
ADD CONSTRAINT check_media_height_positive CHECK (media_height IS NULL OR media_height > 0),
ADD CONSTRAINT check_aspect_ratio_positive CHECK (aspect_ratio IS NULL OR aspect_ratio > 0);
