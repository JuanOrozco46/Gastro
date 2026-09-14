-- ============================================================================
-- GASTROSYNC - MIGRACIÓN INICIAL DE BASE DE DATOS MULTIUSUARIO (SUPABASE / POSTGRESQL)
-- Versión: 001_initial_schema.sql
-- Descripción: Esquema relacional, índices, triggers y políticas RLS reforzadas para GastroSync.
-- ============================================================================

-- 1. HABILITAR EXTENSIONES REQUERIDAS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREACIÓN DE TABLAS BASE

-- PROFILES (Perfiles de usuario vinculados a Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  platform_role TEXT NOT NULL DEFAULT 'customer' CHECK (platform_role IN ('customer', 'platform_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CITIES (Ciudades activas)
CREATE TABLE IF NOT EXISTS public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'CO',
  currency_code TEXT NOT NULL DEFAULT 'COP',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ZONES (Zonas urbanas por ciudad)
CREATE TABLE IF NOT EXISTS public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_zones_city_slug UNIQUE (city_id, slug)
);

-- RESTAURANTS (Comercios y restaurantes aliados)
CREATE TABLE IF NOT EXISTS public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  city_id UUID NOT NULL REFERENCES public.cities(id),
  zone_id UUID NOT NULL REFERENCES public.zones(id),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'active', 'suspended')),
  is_open BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_modes TEXT[] NOT NULL DEFAULT '{pickup,restaurant_delivery,table_service}',
  min_order INTEGER NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  delivery_fee INTEGER CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  delivery_radius_km NUMERIC(4,2) CHECK (delivery_radius_km IS NULL OR delivery_radius_km >= 0),
  commission_rate NUMERIC(4,3) NOT NULL DEFAULT 0.030 CHECK (commission_rate >= 0 AND commission_rate <= 1.000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RESTAURANT_MEMBERS (Roles de usuarios dentro de un restaurante: dueño u owner / staff)
CREATE TABLE IF NOT EXISTS public.restaurant_members (
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (restaurant_id, user_id)
);

-- PRODUCTS (Catálogo de productos/platos del menú)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price_cop INTEGER NOT NULL CHECK (price_cop >= 0),
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- POSTS (Publicaciones del feed gastronómico)
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT,
  media_type TEXT NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo', 'video')),
  price_cop INTEGER NOT NULL CHECK (price_cop >= 0),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RESTAURANT_APPLICATIONS (Solicitudes públicas de vinculación enviadas por nuevos comercios)
CREATE TABLE IF NOT EXISTS public.restaurant_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  category TEXT NOT NULL,
  city_id UUID NOT NULL REFERENCES public.cities(id),
  zone_id UUID NOT NULL REFERENCES public.zones(id),
  address TEXT NOT NULL,
  whatsapp TEXT,
  min_order INTEGER CHECK (min_order IS NULL OR min_order >= 0),
  delivery_fee INTEGER CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  delivery_radius_km NUMERIC(4,2) CHECK (delivery_radius_km IS NULL OR delivery_radius_km >= 0),
  delivery_modes TEXT[] NOT NULL DEFAULT '{pickup,restaurant_delivery,table_service}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  activated_at TIMESTAMPTZ,
  activated_restaurant_id UUID REFERENCES public.restaurants(id),
  activated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ORDERS (Pedidos de clientes)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup', 'restaurant_delivery', 'table_service')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address JSONB,
  table_number TEXT,
  restaurant_notes TEXT,
  cancellation_reason TEXT,
  subtotal_cop INTEGER NOT NULL CHECK (subtotal_cop >= 0),
  delivery_fee_cop INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_cop >= 0),
  total_cop INTEGER NOT NULL CHECK (total_cop >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ORDER_ITEMS (Ítems detallados de cada pedido)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price_cop INTEGER NOT NULL CHECK (unit_price_cop >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

-- PAYMENTS (Registro de transacciones de pago - Operado en backend/Edge Functions)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  amount_cop INTEGER NOT NULL CHECK (amount_cop >= 0),
  platform_fee_cop INTEGER NOT NULL CHECK (platform_fee_cop >= 0),
  restaurant_payout_cop INTEGER NOT NULL CHECK (restaurant_payout_cop >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ÍNDICES PARA ALTA EFICIENCIA EN CONSULTAS DE FEED, MENÚ Y PEDIDOS

CREATE INDEX IF NOT EXISTS idx_zones_city_id ON public.zones(city_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_city_zone_status ON public.restaurants(city_id, zone_id, status);
CREATE INDEX IF NOT EXISTS idx_products_restaurant_available ON public.products(restaurant_id, available);
CREATE INDEX IF NOT EXISTS idx_posts_restaurant_published ON public.posts(restaurant_id, is_published);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created ON public.orders(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_members_user ON public.restaurant_members(user_id);

-- 4. FUNCIONES AUXILIARES DE SEGURIDAD SECURE Y IDEMPOTENTES

-- Function: Actualización automática de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers with IDEMPOTENCY (DROP IF EXISTS before CREATE)
DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_restaurants_updated_at ON public.restaurants;
CREATE TRIGGER tr_restaurants_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_products_updated_at ON public.products;
CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_posts_updated_at ON public.posts;
CREATE TRIGGER tr_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_applications_updated_at ON public.restaurant_applications;
CREATE TRIGGER tr_applications_updated_at BEFORE UPDATE ON public.restaurant_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_orders_updated_at ON public.orders;
CREATE TRIGGER tr_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: Obtener platform_role actual sin recursión RLS
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

-- Function: Verificación segura de Administrador de Plataforma
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND platform_role = 'platform_admin'
  );
END;
$$;

-- Function: Verificación segura de pertenencia a un restaurante (Sin sombreado de variables)
CREATE OR REPLACE FUNCTION public.is_restaurant_member(p_user_id UUID, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.user_id = p_user_id AND rm.restaurant_id = p_restaurant_id
  );
END;
$$;

-- Function: Verificación segura de Dueño de un restaurante (Sin sombreado de variables)
CREATE OR REPLACE FUNCTION public.is_restaurant_owner(p_user_id UUID, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.restaurant_members rm
    WHERE rm.user_id = p_user_id AND rm.restaurant_id = p_restaurant_id AND rm.role = 'owner'
  );
END;
$$;

-- Function & Trigger: Creación automática de perfil básico al registrar usuario en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, platform_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Usuario GastroSync'),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. HABILITACIÓN Y POLÍTICAS DE ROW LEVEL SECURITY (RLS) REFORZADAS

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ── CITIES & ZONES ──
DROP POLICY IF EXISTS "cities_public_read" ON public.cities;
DROP POLICY IF EXISTS "cities_admin_write" ON public.cities;
DROP POLICY IF EXISTS "zones_public_read" ON public.zones;
DROP POLICY IF EXISTS "zones_admin_write" ON public.zones;

CREATE POLICY "cities_public_read" ON public.cities FOR SELECT USING (is_active = TRUE OR public.is_platform_admin(auth.uid()));
CREATE POLICY "zones_public_read" ON public.zones FOR SELECT USING (is_active = TRUE OR public.is_platform_admin(auth.uid()));
CREATE POLICY "cities_admin_write" ON public.cities FOR ALL USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "zones_admin_write" ON public.zones FOR ALL USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ── PROFILES ──
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (
      id = auth.uid()
      AND platform_role = public.get_platform_role(auth.uid())
    )
  );

-- ── RESTAURANTS ──
DROP POLICY IF EXISTS "restaurants_select_active_or_member" ON public.restaurants;
DROP POLICY IF EXISTS "restaurants_update_owner_or_admin" ON public.restaurants;
DROP POLICY IF EXISTS "restaurants_insert_admin" ON public.restaurants;
DROP POLICY IF EXISTS "restaurants_delete_admin" ON public.restaurants;

CREATE POLICY "restaurants_select_active_or_member" ON public.restaurants FOR SELECT USING (
  status = 'active'
  OR public.is_restaurant_member(auth.uid(), id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "restaurants_insert_admin" ON public.restaurants FOR INSERT WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "restaurants_update_owner_or_admin" ON public.restaurants FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "restaurants_delete_admin" ON public.restaurants FOR DELETE USING (public.is_platform_admin(auth.uid()));

-- ── RESTAURANT_MEMBERS ──
DROP POLICY IF EXISTS "members_select_own_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_write_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_insert_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_update_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_delete_owner_or_admin" ON public.restaurant_members;

CREATE POLICY "members_select_own_or_admin" ON public.restaurant_members FOR SELECT USING (
  user_id = auth.uid()
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "members_insert_owner_or_admin" ON public.restaurant_members FOR INSERT
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "members_update_owner_or_admin" ON public.restaurant_members FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "members_delete_owner_or_admin" ON public.restaurant_members FOR DELETE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

-- ── PRODUCTS ──
DROP POLICY IF EXISTS "products_select_public_or_member" ON public.products;
DROP POLICY IF EXISTS "products_write_owner_or_admin" ON public.products;
DROP POLICY IF EXISTS "products_insert_owner_or_admin" ON public.products;
DROP POLICY IF EXISTS "products_update_owner_or_admin" ON public.products;
DROP POLICY IF EXISTS "products_delete_owner_or_admin" ON public.products;

CREATE POLICY "products_select_public_or_member" ON public.products FOR SELECT USING (
  (available = TRUE AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.status = 'active'))
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "products_insert_owner_or_admin" ON public.products FOR INSERT
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "products_update_owner_or_admin" ON public.products FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "products_delete_owner_or_admin" ON public.products FOR DELETE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

-- ── POSTS ──
DROP POLICY IF EXISTS "posts_select_public_or_member" ON public.posts;
DROP POLICY IF EXISTS "posts_write_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_update_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_owner_or_admin" ON public.posts;

CREATE POLICY "posts_select_public_or_member" ON public.posts FOR SELECT USING (
  (is_published = TRUE AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.status = 'active'))
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "posts_insert_owner_or_admin" ON public.posts FOR INSERT
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "posts_update_owner_or_admin" ON public.posts FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "posts_delete_owner_or_admin" ON public.posts FOR DELETE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

-- ── RESTAURANT_APPLICATIONS ──
DROP POLICY IF EXISTS "applications_insert_public" ON public.restaurant_applications;
DROP POLICY IF EXISTS "applications_select_admin" ON public.restaurant_applications;
DROP POLICY IF EXISTS "applications_update_admin" ON public.restaurant_applications;
DROP POLICY IF EXISTS "applications_delete_admin" ON public.restaurant_applications;

CREATE POLICY "applications_insert_public" ON public.restaurant_applications FOR INSERT WITH CHECK (
  status = 'submitted'
  AND review_note IS NULL
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND activated_at IS NULL
  AND activated_restaurant_id IS NULL
  AND activated_by IS NULL
  AND EXISTS (SELECT 1 FROM public.cities c WHERE c.id = city_id AND c.is_active = TRUE)
  AND EXISTS (SELECT 1 FROM public.zones z WHERE z.id = zone_id AND z.city_id = city_id AND z.is_active = TRUE)
);

CREATE POLICY "applications_select_admin" ON public.restaurant_applications FOR SELECT USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "applications_update_admin" ON public.restaurant_applications FOR UPDATE USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "applications_delete_admin" ON public.restaurant_applications FOR DELETE USING (public.is_platform_admin(auth.uid()));

-- ── ORDERS & ORDER_ITEMS ──
DROP POLICY IF EXISTS "orders_insert_client" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_authenticated_customer" ON public.orders;
DROP POLICY IF EXISTS "orders_select_customer_or_member" ON public.orders;
DROP POLICY IF EXISTS "orders_update_member_or_admin" ON public.orders;
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

-- Creación de pedido requiere usuario autenticado y customer_id = auth.uid()
CREATE POLICY "orders_insert_authenticated_customer" ON public.orders FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND customer_id IS NOT NULL 
  AND customer_id = auth.uid()
);

-- Lectura de pedidos: Cliente que creó el pedido, personal del restaurante o platform_admin
CREATE POLICY "orders_select_customer_or_member" ON public.orders FOR SELECT USING (
  (customer_id IS NOT NULL AND customer_id = auth.uid())
  OR public.is_restaurant_member(auth.uid(), restaurant_id)
  OR public.is_platform_admin(auth.uid())
);

-- Nota de diseño: La actualización de estado de pedidos directa desde cliente ha sido eliminada.
-- Las transiciones de pedidos se realizarán de forma atómica y validada en un módulo posterior
-- mediante una función RPC transaccional que aplicará las reglas de negocio de la máquina de estados.

-- Order Items: Lectura restringida a usuarios con permiso de lectura en el pedido principal
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND (
      (o.customer_id IS NOT NULL AND o.customer_id = auth.uid())
      OR public.is_restaurant_member(auth.uid(), o.restaurant_id)
      OR public.is_platform_admin(auth.uid())
    )
  )
);
-- Nota de diseño: La inserción directa de order_items desde cliente ha sido bloqueada.
-- Se habilitará mediante la función RPC transaccional de checkout en el módulo de migración de pedidos.

-- ── PAYMENTS ──
DROP POLICY IF EXISTS "payments_select_owner_or_admin" ON public.payments;

CREATE POLICY "payments_select_owner_or_admin" ON public.payments FOR SELECT USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id 
      AND public.is_restaurant_owner(auth.uid(), o.restaurant_id)
  )
);
-- Sin políticas de INSERT/UPDATE/DELETE para 'anon' o 'authenticated'.

-- 6. SEMILLA MÍNIMA IDEMPOTENTE (ARMENIA, QUINDÍO)

INSERT INTO public.cities (id, slug, name, country_code, currency_code, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'armenia-quindio', 'Armenia', 'CO', 'COP', TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.zones (city_id, slug, name, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'armenia-centro', 'Centro', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'armenia-norte', 'Norte', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'armenia-sur', 'Sur', TRUE)
ON CONFLICT (city_id, slug) DO NOTHING;
