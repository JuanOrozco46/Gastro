# GastroSync - Pruebas de Contrato de Servicios (Service Contract Tests)

Esta suite documenta la validación del contrato de datos entre las definiciones TypeScript del frontend y las tablas PostgreSQL de Supabase.

## 1. Columnas SQL y Mapeos Usados por Servicio

### `supabaseDataService.ts`
* **`fetchLiveTenants` (Tabla: `restaurants`)**:
  - Consulta: `id`, `slug`, `name`, `category`, `description`, `address`, `phone`, `whatsapp`, `city_id`, `zone_id`, `status`, `is_open`, `delivery_modes`, `min_order`, `delivery_fee`, `delivery_radius_km`, `commission_rate`.
  - Mapeo: `DbRestaurant` -> `Tenant`. Campos inexistentes en DB como `salesWeekly`, `rating`, `logoEmoji` se mapean a valores seguros por defecto (ej. `0`, `'🍽️'`).

* **`fetchLiveProducts` (Tabla: `products`)**:
  - Consulta: `id`, `restaurant_id`, `name`, `description`, `category`, `price_cop`, `available`.
  - Mapeo: `DbProduct` -> `Product`.

* **`fetchLivePosts` (Tabla: `posts`)**:
  - Consulta: `id`, `restaurant_id`, `product_id`, `title`, `description`, `media_url`, `media_type`, `price_cop`, `is_published`, `created_at`.
  - Mapeo: `DbPost` -> `Post`. Campos como `likes`, `commentsCount` se inician en 0.

### `supabaseOrderService.ts`
* **Lectura de Pedidos (`fetchLiveOrdersForRestaurant`, `fetchLiveOrdersForCustomer`)**:
  - Tablas: `orders` y `order_items`.
  - Consulta: `id`, `restaurant_id`, `customer_id`, `fulfillment`, `status`, `subtotal_cop`, `delivery_fee_cop`, `total_cop`, etc.
  - Mapeo: `DbOrder` -> `Order`, `DbOrderItem` -> `OrderItem`.

## 2. Operaciones Deliberadamente Bloqueadas
- **`createLiveOrder`**: Ahora delega la creación del pedido a la RPC `create_order_with_items`. Los precios y totales calculados en cliente se descartan. La RPC valida modalidad, recalcula subtotales con datos de `products` e inserta `orders` y `order_items` atómicamente.
- **`updateLiveOrderStatus`**: Devuelve `false` y advierte en consola. Requiere RPC segura para aplicar máquina de estados.
- **Inserción de `order_items`**: La política `INSERT` fue eliminada. Solo se pueden insertar ítems atómicamente a través de la RPC de checkout (backend).
- **Inserción de pagos desde cliente**: Las políticas RLS en `payments` no permiten `INSERT` para roles `anon` ni `authenticated`.

## 3. Limitaciones Actuales
- La aplicación (`AppContext`) sigue usando datos locales simulados (localStorage).
- `supabaseAuthService` está listo pero no integrado como fuente primaria de estado de autenticación de la aplicación global (no interfiere con las cuentas simuladas).
- La subida de imágenes falla silenciosamente en local y usa Data URL solo si Supabase no está configurado. Si falla la subida real, ahora devuelve error explícito al frontend.
