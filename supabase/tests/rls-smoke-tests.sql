-- ============================================================================
-- GASTROSYNC - SMOKE TESTS MANUALES DE POLÍTICAS RLS (SQL EDITOR / TESTING)
-- Archivo: supabase/tests/rls-smoke-tests.sql
-- Descripción: Guía de pruebas manuales para verificar aislamiento multi-tenant
--              y prevención de ataques comunes mediante imitación de roles en Supabase.
-- ============================================================================
-- NOTA IMPORTANTE: Este archivo NO se ejecuta de forma automática en compilación.
-- Para probar estas consultas, copia y ejecuta cada escenario individualmente en el
-- SQL Editor de Supabase configurando el contexto de usuario simulado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ESCENARIO 1: AISLAMIENTO ENTRE CLIENTES (UN CLIENTE NO LEE PEDIDOS DE OTRO)
-- ----------------------------------------------------------------------------
-- Paso A: Simular autenticación como Cliente 1 (User ID: '11111111-1111-1111-1111-111111111111')
-- SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- SET LOCAL role = 'authenticated';

-- Intento de leer pedidos pertenecientes al Cliente 2 ('22222222-2222-2222-2222-222222222222'):
-- SELECT * FROM public.orders WHERE customer_id = '22222222-2222-2222-2222-222222222222';
-- RESULTADO ESPERADO: 0 filas devueltas (bloqueado por RLS orders_select_customer_or_member).


-- ----------------------------------------------------------------------------
-- ESCENARIO 2: AISLAMIENTO MULTI-TENANT (RESTAURANTE A NO ACCEDE A RESTAURANTE B)
-- ----------------------------------------------------------------------------
-- Paso A: Simular autenticación como Dueño del Restaurante A (User ID: '33333333-3333-3333-3333-333333333333')
-- SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
-- SET LOCAL role = 'authenticated';

-- Intento 1: Modificar precio de producto perteneciente al Restaurante B (Rest ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
-- UPDATE public.products
-- SET price_cop = 5000
-- WHERE restaurant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- RESULTADO ESPERADO: 0 filas actualizadas (bloqueado por RLS products_update_owner_or_admin).

-- Intento 2: Mover un producto propio hacia el Restaurante B
-- UPDATE public.products
-- SET restaurant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
-- WHERE restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- RESULTADO ESPERADO: Error de violación de política CHECK (products_update_owner_or_admin exige pertenecer al nuevo restaurant_id).


-- ----------------------------------------------------------------------------
-- ESCENARIO 3: RESTRICCIÓN DE STAFF (PERSONAL DE COCINA NO MODIFICA MENÚ)
-- ----------------------------------------------------------------------------
-- Paso A: Simular autenticación como Personal Staff de Cocina (User ID: '44444444-4444-4444-4444-444444444444')
-- (Role = 'staff' en restaurant_members para Restaurante A)
-- SET LOCAL request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
-- SET LOCAL role = 'authenticated';

-- Intento 1: Crear un nuevo plato en el menú
-- INSERT INTO public.products (restaurant_id, name, category, price_cop, available)
-- VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Plato No Autorizado', 'Entradas', 15000, TRUE);
-- RESULTADO ESPERADO: Error RLS / 0 filas insertadas (products_insert_owner_or_admin exige rol 'owner').

-- Intento 2: Eliminar una publicación del feed
-- DELETE FROM public.posts WHERE restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- RESULTADO ESPERADO: 0 filas eliminadas (posts_delete_owner_or_admin exige rol 'owner').


-- ----------------------------------------------------------------------------
-- ESCENARIO 4: ACTUALIZACIÓN DE PROFILE Y PREVENCIÓN DE ESCALADO DE PRIVILEGIOS
-- ----------------------------------------------------------------------------
-- NOTA CRÍTICA DE PRUEBA: Estas consultas DEBEN ejecutarse con un contexto simulado
-- de usuario (role = 'authenticated' o 'anon'). NO ejecutarlas como superusuario 'postgres'
-- o 'service_role', ya que los administradores de base de datos omiten el motor RLS.
--
-- Paso A: Simular autenticación como Cliente Normal (User ID: '55555555-5555-5555-5555-555555555555')
-- SET LOCAL request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
-- SET LOCAL role = 'authenticated';

-- Intento A (VÁLIDO): Actualizar su propio nombre completo conservando su platform_role
-- UPDATE public.profiles
-- SET full_name = 'María Fernanda Gómez'
-- WHERE id = '55555555-5555-5555-5555-555555555555';
-- RESULTADO ESPERADO: 1 fila actualizada correctamente.

-- Intento B (MALICIOSO / INVALIDO): Intentar cambiar platform_role a 'platform_admin'
-- UPDATE public.profiles
-- SET platform_role = 'platform_admin'
-- WHERE id = '55555555-5555-5555-5555-555555555555';
-- RESULTADO ESPERADO: Error RLS (profiles_update_own_or_admin exige platform_role = get_platform_role(auth.uid())).


-- ----------------------------------------------------------------------------
-- ESCENARIO 5: VISITANTE ANÓNIMO NO PUEDE CREAR PEDIDOS NI PAGOS DIRECTOS
-- ----------------------------------------------------------------------------
-- Paso A: Simular rol anónimo (Sin token JWT o anon)
-- SET LOCAL role = 'anon';

-- Intento 1: Crear pedido directo como anónimo
-- INSERT INTO public.orders (restaurant_id, fulfillment, status, customer_name, customer_phone, subtotal_cop, total_cop)
-- VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pickup', 'pending', 'Hacker Anon', '000000', 10000, 10000);
-- RESULTADO ESPERADO: Error RLS (orders_insert_authenticated_customer exige auth.role() = 'authenticated').

-- Intento 2: Inserción directa de registro de pago
-- INSERT INTO public.payments (order_id, provider, amount_cop, platform_fee_cop, restaurant_payout_cop, status)
-- VALUES ('99999999-9999-9999-9999-999999999999', 'fake_stripe', 50000, 1500, 48500, 'approved');
-- RESULTADO ESPERADO: Error RLS (La tabla payments no posee políticas INSERT para rol anon).


-- ----------------------------------------------------------------------------
-- ESCENARIO 6: PROTECCIÓN DE SOLICITUDES DE ALIADOS
-- ----------------------------------------------------------------------------
-- Paso A: Simular autenticación como Dueño o Cliente
-- SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- SET LOCAL role = 'authenticated';

-- Intento 1: Listar todas las solicitudes enviadas por restaurantes interesados
-- SELECT * FROM public.restaurant_applications;
-- RESULTADO ESPERADO: 0 filas devueltas (Solo platform_admin tiene permiso SELECT).

-- Intento 2: Inserción pública de solicitud con campos de aprobación adulterados
-- INSERT INTO public.restaurant_applications (
--   owner_name, owner_email, owner_phone, restaurant_name, category,
--   city_id, zone_id, address, status, review_note
-- ) VALUES (
--   'Trap Rest', 'trap@fake.com', '123456', 'Trap Pizza', 'Italiana',
--   '00000000-0000-0000-0000-000000000001', 'id_zona_valida', 'Calle 10 # 5',
--   'approved', 'Auto Aprobado'
-- );
-- RESULTADO ESPERADO: Error RLS (applications_insert_public exige status='submitted' y review_note NULL).
