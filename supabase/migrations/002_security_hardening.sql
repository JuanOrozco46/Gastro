-- ============================================================================
-- GASTROSYNC - PARCHE DE REFORZAMIENTO DE SEGURIDAD Y RLS MULTI-TENANT
-- Versión: 002_security_hardening.sql
-- Descripción: Elimina vulnerabilidades de sombreado de variables, recursión RLS,
--              escalado de roles y escrituras no validadas en pedidos.
-- ============================================================================

-- 1. EXTENSIONES DE SEGURIDAD
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. REEMPLAZO DE FUNCIONES DE NAVEGACIÓN Y PERMISOS DE SEGURIDAD SECURE
-- Se usan nombres de parámetros no ambiguos (p_user_id, p_restaurant_id)
-- Se configuran con STABLE, SECURITY DEFINER y SET search_path = public.

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

-- 3. REESTRUCTURACIÓN Y REFORZAMIENTO DE POLÍTICAS RLS

-- ── PROFILES ──
-- Previene que un usuario cambie su platform_role desde el cliente sin recursión RLS
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;

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
DROP POLICY IF EXISTS "restaurants_update_owner_or_admin" ON public.restaurants;

CREATE POLICY "restaurants_update_owner_or_admin" ON public.restaurants FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), id) OR public.is_platform_admin(auth.uid()));

-- ── RESTAURANT_MEMBERS ──
DROP POLICY IF EXISTS "members_write_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_insert_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_update_owner_or_admin" ON public.restaurant_members;
DROP POLICY IF EXISTS "members_delete_owner_or_admin" ON public.restaurant_members;

CREATE POLICY "members_insert_owner_or_admin" ON public.restaurant_members FOR INSERT
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "members_update_owner_or_admin" ON public.restaurant_members FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "members_delete_owner_or_admin" ON public.restaurant_members FOR DELETE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

-- ── PRODUCTS ──
DROP POLICY IF EXISTS "products_write_owner_or_admin" ON public.products;
DROP POLICY IF EXISTS "products_insert_owner_or_admin" ON public.products;
DROP POLICY IF EXISTS "products_update_owner_or_admin" ON public.products;
DROP POLICY IF EXISTS "products_delete_owner_or_admin" ON public.products;

CREATE POLICY "products_insert_owner_or_admin" ON public.products FOR INSERT
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "products_update_owner_or_admin" ON public.products FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "products_delete_owner_or_admin" ON public.products FOR DELETE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

-- ── POSTS ──
DROP POLICY IF EXISTS "posts_write_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_update_owner_or_admin" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_owner_or_admin" ON public.posts;

CREATE POLICY "posts_insert_owner_or_admin" ON public.posts FOR INSERT
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "posts_update_owner_or_admin" ON public.posts FOR UPDATE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "posts_delete_owner_or_admin" ON public.posts FOR DELETE
  USING (public.is_restaurant_owner(auth.uid(), restaurant_id) OR public.is_platform_admin(auth.uid()));

-- ── RESTAURANT_APPLICATIONS ──
DROP POLICY IF EXISTS "applications_insert_public" ON public.restaurant_applications;

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

-- ── ORDERS & ORDER_ITEMS ──
DROP POLICY IF EXISTS "orders_insert_client" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_authenticated_customer" ON public.orders;
DROP POLICY IF EXISTS "orders_update_member_or_admin" ON public.orders;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

-- Requerir usuario autenticado y coincidencia estricta de customer_id = auth.uid()
CREATE POLICY "orders_insert_authenticated_customer" ON public.orders FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND customer_id IS NOT NULL 
  AND customer_id = auth.uid()
);

-- Comentario explicativo: Se elimina la política de actualización directa de pedidos desde el cliente.
-- En el módulo posterior de pedidos, la actualización de estado se realizará mediante una función RPC
-- transaccional de servidor que validará la máquina de estados.

-- Comentario explicativo: Se elimina la política de inserción directa de order_items desde el cliente.
-- La inserción atómica de items de comanda se realizará a través de la RPC de checkout seguro.
