-- ============================================================================
-- MIGRACIÓN 053: COBERTURA NACIONAL COLOMBIA (CIUDADES, ZONAS Y CREACIÓN DINÁMICA DE MUNICIPIOS)
-- ============================================================================

-- 1. Sembrar las principales ciudades de Colombia de forma idempotente
INSERT INTO public.cities (id, slug, name, country_code, currency_code, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'armenia-quindio', 'Armenia', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000002', 'pereira-risaralda', 'Pereira', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000003', 'bogota-dc', 'Bogotá D.C.', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000004', 'medellin-antioquia', 'Medellín', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000005', 'cali-valle', 'Cali', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000006', 'barranquilla-atlantico', 'Barranquilla', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000007', 'cartagena-bolivar', 'Cartagena', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000008', 'bucaramanga-santander', 'Bucaramanga', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000009', 'manizales-caldas', 'Manizales', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000010', 'ibague-tolima', 'Ibagué', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000011', 'santa-marta-magdalena', 'Santa Marta', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000012', 'villavicencio-meta', 'Villavicencio', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000013', 'cucuta-norte-santander', 'Cúcuta', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000014', 'pasto-narino', 'Pasto', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000015', 'monteria-cordoba', 'Montería', 'CO', 'COP', TRUE),
  ('00000000-0000-0000-0000-000000000016', 'neiva-huila', 'Neiva', 'CO', 'COP', TRUE)
ON CONFLICT (slug) DO UPDATE
SET is_active = TRUE,
    name = EXCLUDED.name;

-- 2. Sembrar zonas gastronómicas principales para cada ciudad
INSERT INTO public.zones (id, city_id, slug, name, is_active)
VALUES
  -- Armenia
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'armenia-centro', 'Centro', TRUE),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'armenia-norte', 'Norte', TRUE),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'armenia-sur', 'Sur', TRUE),
  -- Pereira
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000002', 'pereira-circunvalar', 'Circunvalar', TRUE),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000002', 'pereira-cerritos', 'Cerritos', TRUE),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000002', 'pereira-centro', 'Centro', TRUE),
  -- Bogotá D.C.
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000003', 'bogota-chapinero-zona-t', 'Chapinero / Zona T', TRUE),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000003', 'bogota-usaquen-norte', 'Usaquén / Norte', TRUE),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000003', 'bogota-centro-teusaquillo', 'Centro / Teusaquillo', TRUE),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000003', 'bogota-occidente-salitre', 'Occidente / Salitre', TRUE),
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000003', 'bogota-sur', 'Sur', TRUE),
  -- Medellín
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', 'medellin-el-poblado', 'El Poblado', TRUE),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000004', 'medellin-laureles-estadio', 'Laureles / Estadio', TRUE),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000004', 'medellin-envigado-sabaneta', 'Envigado / Sabaneta', TRUE),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000004', 'medellin-centro-belen', 'Centro / Belén', TRUE),
  -- Cali
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000005', 'cali-granada-norte', 'Granada / Norte', TRUE),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000005', 'cali-ciudad-jardin-sur', 'Ciudad Jardín / Sur', TRUE),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000005', 'cali-peñon-san-antonio', 'El Peñón / San Antonio', TRUE),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000005', 'cali-centro-oriente', 'Centro / Oriente', TRUE),
  -- Barranquilla
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000006', 'barranquilla-norte-prado', 'Norte / Alto Prado', TRUE),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000006', 'barranquilla-buenavista', 'Buenavista / Villa Carolina', TRUE),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000006', 'barranquilla-centro-sur', 'Centro / Sur', TRUE),
  -- Cartagena
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000007', 'cartagena-centro-getsemani', 'Centro Histórico / Getsemaní', TRUE),
  ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000007', 'cartagena-bocagrande', 'Bocagrande / Castillogrande', TRUE),
  ('00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000007', 'cartagena-manga-norte', 'Manga / Zona Norte', TRUE),
  -- Bucaramanga
  ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000008', 'bucaramanga-cabecera', 'Cabecera / Sotomayor', TRUE),
  ('00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000008', 'bucaramanga-canaveral', 'Cañaveral / Floridablanca', TRUE),
  ('00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000008', 'bucaramanga-centro', 'Centro / Real de Minas', TRUE),
  -- Manizales
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000009', 'manizales-el-cable-milan', 'El Cable / Milán', TRUE),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000009', 'manizales-palermo', 'Palermo / Laureles', TRUE),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000009', 'manizales-centro-chipre', 'Centro / Chipre', TRUE),
  -- Ibagué
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'ibague-milla-de-oro', 'Milla de Oro / El Vergel', TRUE),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', 'ibague-centro', 'Centro / Cádiz', TRUE),
  -- Santa Marta
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000011', 'santa-marta-centro-historico', 'Centro Histórico / Parque de los Novios', TRUE),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000011', 'santa-marta-rodadero', 'El Rodadero / Pozos Colorados', TRUE),
  -- Villavicencio
  ('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0000-000000000012', 'villavicencio-el-buque', 'El Buque / Trapiche', TRUE),
  ('00000000-0000-0000-0000-000000000122', '00000000-0000-0000-0000-000000000012', 'villavicencio-centro', 'Centro / Barzal', TRUE),
  -- Cúcuta
  ('00000000-0000-0000-0000-000000000131', '00000000-0000-0000-0000-000000000013', 'cucuta-caobos-pinos', 'Caobos / Los Pinos', TRUE),
  ('00000000-0000-0000-0000-000000000132', '00000000-0000-0000-0000-000000000013', 'cucuta-centro', 'Centro / Quinta Vélez', TRUE),
  -- Pasto
  ('00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-000000000014', 'pasto-avenida-estudiantes', 'Av. Los Estudiantes / Norte', TRUE),
  ('00000000-0000-0000-0000-000000000142', '00000000-0000-0000-0000-000000000014', 'pasto-centro', 'Centro / Las Cuadras', TRUE),
  -- Montería
  ('00000000-0000-0000-0000-000000000151', '00000000-0000-0000-0000-000000000015', 'monteria-castellana-norte', 'La Castellana / Recreo', TRUE),
  ('00000000-0000-0000-0000-000000000152', '00000000-0000-0000-0000-000000000015', 'monteria-centro', 'Centro / Alamedas', TRUE),
  -- Neiva
  ('00000000-0000-0000-0000-000000000161', '00000000-0000-0000-0000-000000000016', 'neiva-altico-quirinal', 'Altico / Quirinal', TRUE),
  ('00000000-0000-0000-0000-000000000162', '00000000-0000-0000-0000-000000000016', 'neiva-centro-norte', 'Centro / Norte', TRUE)
ON CONFLICT (city_id, slug) DO UPDATE
SET is_active = TRUE,
    name = EXCLUDED.name;

-- 3. RPC para registrar o asegurar en caliente cualquier municipio/ciudad y zona del país
-- Permite que si un restaurante de un municipio nuevo (ej. Rionegro, Chía, Tuluá, Tunja, Valledupar)
-- se postula o el SuperAdmin lo crea, se habilite automáticamente su ciudad y su zona sin tocar código.
CREATE OR REPLACE FUNCTION public.ensure_colombia_city_and_zone(
  p_city_name TEXT,
  p_zone_name TEXT DEFAULT 'Centro'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_city TEXT;
  v_clean_zone TEXT;
  v_city_slug TEXT;
  v_zone_slug TEXT;
  v_city_id UUID;
  v_zone_id UUID;
BEGIN
  v_clean_city := btrim(COALESCE(p_city_name, ''));
  v_clean_zone := btrim(COALESCE(NULLIF(p_zone_name, ''), 'Centro'));

  IF length(v_clean_city) < 2 THEN
    RAISE EXCEPTION 'Debes ingresar un nombre de ciudad o municipio válido.';
  END IF;

  v_city_slug := regexp_replace(
    lower(
      translate(v_clean_city, 'áéíóúäëïöüñÁÉÍÓÚÄËÏÖÜÑ', 'aeiouaeiounAEIOUAEIOUN')
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  );
  v_city_slug := btrim(v_city_slug, '-');

  -- Buscar ciudad existente por nombre o slug
  SELECT id, name INTO v_city_id, v_clean_city
  FROM public.cities
  WHERE lower(name) = lower(v_clean_city)
     OR slug = v_city_slug
  LIMIT 1;

  IF v_city_id IS NULL THEN
    INSERT INTO public.cities (slug, name, country_code, currency_code, is_active)
    VALUES (v_city_slug, v_clean_city, 'CO', 'COP', TRUE)
    ON CONFLICT (slug) DO UPDATE
      SET is_active = TRUE
    RETURNING id, name INTO v_city_id, v_clean_city;
  ELSE
    UPDATE public.cities SET is_active = TRUE WHERE id = v_city_id;
  END IF;

  v_zone_slug := v_city_slug || '-' || regexp_replace(
    lower(
      translate(v_clean_zone, 'áéíóúäëïöüñÁÉÍÓÚÄËÏÖÜÑ', 'aeiouaeiounAEIOUAEIOUN')
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  );
  v_zone_slug := btrim(v_zone_slug, '-');

  SELECT id, name INTO v_zone_id, v_clean_zone
  FROM public.zones
  WHERE city_id = v_city_id
    AND (lower(name) = lower(v_clean_zone) OR slug = v_zone_slug)
  LIMIT 1;

  IF v_zone_id IS NULL THEN
    INSERT INTO public.zones (city_id, slug, name, is_active)
    VALUES (v_city_id, v_zone_slug, v_clean_zone, TRUE)
    ON CONFLICT (city_id, slug) DO UPDATE
      SET is_active = TRUE
    RETURNING id, name INTO v_zone_id, v_clean_zone;
  ELSE
    UPDATE public.zones SET is_active = TRUE WHERE id = v_zone_id;
  END IF;

  -- Si la ciudad recién creada no tenía zona "Centro" adicional, asegurar al menos Centro
  INSERT INTO public.zones (city_id, slug, name, is_active)
  VALUES (v_city_id, v_city_slug || '-centro', 'Centro', TRUE)
  ON CONFLICT (city_id, slug) DO NOTHING;

  RETURN jsonb_build_object(
    'city_id', v_city_id,
    'city_name', v_clean_city,
    'zone_id', v_zone_id,
    'zone_name', v_clean_zone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_colombia_city_and_zone(TEXT, TEXT) TO anon, authenticated;
