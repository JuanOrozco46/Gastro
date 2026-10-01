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

-- ----------------------------------------------------------------------------
-- ESCENARIO 7: VALIDACIONES DEL CHECKOUT REMOTO (create_order_with_items)
-- ----------------------------------------------------------------------------
-- NOTA CRÍTICA DE PRUEBA: Estas pruebas no deben ejecutarse como superusuario 'postgres'
-- o 'service_role' porque estos roles pueden omitir las restricciones de seguridad.
-- Para probar adecuadamente, establece el rol en 'anon' o 'authenticated' según el caso.

-- Prueba 1: Llamada desde anon (espera fallo)
-- SET LOCAL role = 'anon';
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[]');
-- RESULTADO ESPERADO: Error de permisos de ejecución o 'Usuario no autenticado'.

-- Prueba 2: Llamada desde authenticated con p_items NULL (espera fallo)
-- SET LOCAL role = 'authenticated';
-- SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, NULL);
-- RESULTADO ESPERADO: Error 'p_items debe ser un array JSON'.

-- Prueba 3: p_items como objeto en vez de array (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '{"product_id": "1"}');
-- RESULTADO ESPERADO: Error 'p_items debe ser un array JSON'.

-- Prueba 4: Array vacío (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[]');
-- RESULTADO ESPERADO: Error 'El pedido debe contener al menos un producto'.

-- Prueba 5: Producto duplicado (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 1}, {"product_id": "123", "quantity": 2}]');
-- RESULTADO ESPERADO: Error 'Producto duplicado en el pedido...'.

-- Prueba 6: Cantidad decimal (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 1.5}]');
-- RESULTADO ESPERADO: Error 'quantity debe ser un número entero'.

-- Prueba 7: Cantidad 100 o superior (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 100}]');
-- RESULTADO ESPERADO: Error 'Cantidad superior al límite...'.

-- Prueba 8: Domicilio (restaurant_delivery) sin dirección (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'restaurant_delivery', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'restaurant_delivery requiere p_delivery_address...'.

-- Prueba 9: Servicio a mesa (table_service) sin número (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'table_service', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'table_service requiere p_table_number'.

-- Prueba 10: Pickup con mesa (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, 'Mesa 4', NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'pickup no debe incluir número de mesa'.

-- Prueba 11: Modalidad no soportada por el restaurante (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'table_service', 'Juan', '123', NULL, '4', NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'Modalidad de entrega no soportada por el restaurante'.

-- Prueba 12: Restaurante cerrado o inactivo (espera fallo)
-- SELECT public.create_order_with_items('22222222-2222-2222-2222-222222222222', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'Restaurante no disponible o inactivo'.

-- Prueba 13: Subtotal debajo de min_order (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'El subtotal no alcanza el pedido mínimo del restaurante'.

-- Prueba 14: Precio alterado en payload (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "123", "quantity": 1, "price": 100}]');
-- RESULTADO ESPERADO: Error 'No se permiten campos de precio en los ítems...'.

-- Prueba 15: Error de un ítem sin pedido parcial
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'pickup', 'Juan', '123', NULL, NULL, NULL, '[{"product_id": "1", "quantity": 1}, {"product_id": "2", "quantity": 0}]');
-- RESULTADO ESPERADO: Transacción completa cancelada (Rollback), nada se inserta.

-- Prueba 16: Domicilio con objeto vacío (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'restaurant_delivery', 'Juan', '123', '{}', NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'La dirección de entrega debe contener addressLine'.

-- Prueba 17: Domicilio sin addressLine (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'restaurant_delivery', 'Juan', '123', '{"notes": "Cerca al parque"}', NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'La dirección de entrega debe contener addressLine'.

-- Prueba 18: Domicilio con addressLine vacío (espera fallo)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'restaurant_delivery', 'Juan', '123', '{"addressLine": "   "}', NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: Error 'addressLine no puede estar vacío'.

-- Prueba 19: Domicilio válido (espera éxito)
-- SELECT public.create_order_with_items('11111111-1111-1111-1111-111111111111', 'restaurant_delivery', 'Juan', '123', '{"addressLine": "Calle 123", "label": "Casa"}', NULL, NULL, '[{"product_id": "123", "quantity": 1}]');
-- RESULTADO ESPERADO: UUID de la nueva orden insertada.

-- =========================================================================
-- PARTE 5: FASE 5A - Pruebas RPC update_order_status (KDS Remoto)
-- Ejecutar estas consultas como roles específicos para validar la RLS y lógica
-- =========================================================================

-- Prueba 20: Cliente intentando actualizar un pedido (espera fallo)
-- SET ROLE authenticated; -- Asumir sesión de cliente
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'accepted');
-- RESULTADO ESPERADO: Error 'No tienes permisos administrativos para actualizar pedidos.'

-- Prueba 21: Staff actualizando pending -> accepted (espera éxito)
-- SET ROLE authenticated; -- Asumir sesión de staff
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'accepted');
-- RESULTADO ESPERADO: true

-- Prueba 22: Staff intentando cancelar un pedido (espera fallo)
-- SET ROLE authenticated; -- Asumir sesión de staff
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'cancelled');
-- RESULTADO ESPERADO: Error 'Transición de estado no permitida para personal de cocina.'

-- Prueba 23: Staff intentando marcar delivered (espera fallo)
-- SET ROLE authenticated; -- Asumir sesión de staff
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'delivered');
-- RESULTADO ESPERADO: Error 'Transición de estado no permitida para personal de cocina.'

-- Prueba 24: Propietario actualizando estados permitidos (espera éxito)
-- SET ROLE authenticated; -- Asumir sesión de owner
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'out_for_delivery');
-- RESULTADO ESPERADO: true

-- Prueba 25: Propietario intentando transición inválida como pending -> ready (espera fallo)
-- SET ROLE authenticated; -- Asumir sesión de owner
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'ready');
-- RESULTADO ESPERADO: Error 'Transición de estado no válida para el propietario.'

-- Prueba 26: Usuario de otro restaurante intentando actualizar (espera fallo)
-- SET ROLE authenticated; -- Asumir sesión de owner/staff de otro tenant
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'accepted');
-- RESULTADO ESPERADO: Error 'No tienes autorización para modificar pedidos de este restaurante.'

-- Prueba 27: Usuario no autenticado intentando actualizar (espera fallo)
-- SET ROLE anon; 
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'accepted');
-- RESULTADO ESPERADO: Error de permisos (no puede ejecutar la función)

-- Prueba 28: Pedido inexistente (espera fallo)
-- SET ROLE authenticated;
-- SELECT public.update_order_status('00000000-0000-0000-0000-000000000000', 'accepted');
-- RESULTADO ESPERADO: Error 'El pedido especificado no existe.'

-- Prueba 29: Transición inválida para staff accepted -> ready (espera fallo)
-- SET ROLE authenticated;
-- SELECT public.update_order_status('UUID_DEL_PEDIDO', 'ready');
-- RESULTADO ESPERADO: Error 'Transición de estado no permitida para personal de cocina.'

-- Prueba 30: Pedido cancelado intentando reabrirse (espera fallo)
-- SET ROLE authenticated;
-- SELECT public.update_order_status('UUID_PEDIDO_CANCELADO', 'pending');
-- RESULTADO ESPERADO: Error 'No se puede cambiar el estado de un pedido finalizado o cancelado.'

-- =========================================================================
-- PARTE 6: FASE 5B - Pruebas RLS para Pagos (Payments)
-- Garantizar que React no puede insertar, actualizar o eliminar pagos.
-- =========================================================================

-- Prueba 31: Cliente intentando insertar un pago desde frontend (espera fallo)
-- SET ROLE authenticated;
-- INSERT INTO public.payments (order_id, provider, provider_reference, amount_cop, platform_fee_cop, restaurant_payout_cop, status)
-- VALUES ('UUID_ORDEN', 'sandbox', 'ref_123', 10000, 300, 9700, 'pending');
-- RESULTADO ESPERADO: Error de RLS (new row violates row-level security policy)

-- Prueba 32: Cliente intentando actualizar un pago existente para 'approved' (espera fallo)
-- SET ROLE authenticated;
-- UPDATE public.payments SET status = 'approved' WHERE id = 'UUID_PAGO';
-- RESULTADO ESPERADO: Error (0 rows affected o permiso denegado por falta de política de UPDATE)

-- Prueba 33: Cliente intentando borrar un pago (espera fallo)
-- SET ROLE authenticated;
-- DELETE FROM public.payments WHERE id = 'UUID_PAGO';
-- RESULTADO ESPERADO: Error (0 rows affected o permiso denegado por falta de política de DELETE)

-- Prueba 34: Consulta de pagos propios por el cliente (espera éxito)
-- SET ROLE authenticated; -- Asumiendo auth.uid() es el dueño del pedido
-- SELECT * FROM public.payments;
-- RESULTADO ESPERADO: Devuelve únicamente los pagos asociados a sus órdenes.

-- Prueba 35: Consulta de pagos de otro cliente (espera vacío)
-- SET ROLE authenticated; -- Asumiendo auth.uid() NO es el dueño de la orden ni restaurante
-- SELECT * FROM public.payments WHERE id = 'UUID_PAGO_AJENO';
-- RESULTADO ESPERADO: 0 rows (invisible)

