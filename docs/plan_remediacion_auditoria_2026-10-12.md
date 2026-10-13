# Plan de Remediación Integral — Auditoría Técnica GastroSync (2026-10-12)

**Fecha de elaboración**: 2026-10-12  
**Informe fuente**: [`docs/auditoria_integral_gastrosync_2026-10-12.md`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/docs/auditoria_integral_gastrosync_2026-10-12.md)  
**Rama Git base**: `main` (`2f7fb19`)  
**Estado Git inicial (`git status --short`)**: Únicamente `?? docs/auditoria_integral_gastrosync_2026-10-12.md` (árbol de trabajo limpio de cambios ajenos).

---

## 1. Revalidación de Línea Base y Discrepancias Documentadas (Fase 0)

Antes de modificar cualquier archivo de código, se verificó en modo lectura el estado real del repositorio y de las migraciones de Supabase (`Get-ChildItem supabase/migrations` y `npx supabase migration list`):

### 1.1 Estado Real de Migraciones (`001` a `057`)
- **Total de archivos en `supabase/migrations/`**: 57 archivos numerados consecutivamente desde `001_initial_schema.sql` hasta `057_user_address_bank_and_city.sql`.
- **Resolución de discrepancia sobre prefijos `053` y `054`**:
  - El resumen preliminar mencionaba la posible existencia de archivos duplicados (`053_fix_rls_linter_warnings_and_initplan.sql` y `054_reviews_rls_and_storage_buckets.sql`).
  - La inspección directa del directorio y la salida de `npx supabase migration list` demuestran que **no existen prefijos duplicados** en el repositorio ni en el historial remoto:
    - `053` corresponde únicamente a `053_colombia_national_cities_and_zones_engine.sql` (aplicada en local y remoto).
    - `054` corresponde únicamente a `054_qa_security_and_payment_hardening.sql` (aplicada en local y remoto).
    - `055` corresponde a `055_qa_round2_storage_and_feed_hardening.sql` (aplicada en local y remoto).
    - `056` (`056_privacy_and_data_deletion.sql`) y `057` (`057_user_address_bank_and_city.sql`) existen localmente y están pendientes de aplicarse en el remoto (`remote: ""`).
- **Siguiente versión libre para migración correctiva**: **`058`** (`supabase/migrations/058_comprehensive_audit_remediation.sql`).
- **Cumplimiento de Regla #1**: Ninguna migración histórica (`001`–`057`) será editada, renombrada, borrada ni reutilizada.

### 1.2 Discrepancias Técnicas Confirmadas entre migraciones `054`/`056` y el Esquema Real
1. **Esquema real de Soporte (`024`, `025`, `026`) vs `054`**:
   - Las tablas reales son `public.support_tickets`, `public.support_messages`, `public.support_audit_log` y `public.support_notifications`.
   - `public.support_ticket_events` y `public.notifications` (referenciadas en `054`) **no existen**.
   - En `public.support_tickets`, las columnas reales son `requester_user_id` y `assigned_to` (no `created_by_user_id`, `assigned_to_user_id` ni `ticket_number`).
   - En `public.support_messages`, la columna real del autor es `author_user_id` (no `sender_user_id` ni `sender_name`).
   - En `public.profiles`, el rol de plataforma es `platform_role = 'platform_admin'` (no `role = 'admin'`).
2. **Esquema real de Restaurantes y Perfiles (`001`, `015`, `028`, `050`) vs `056`**:
   - En `public.restaurants`, las columnas reales son `description`, `banner_url` y `payout_account_holder` (no `bio`, `cover_url` ni `payout_holder_name`).
   - En `public.profiles`, las columnas reales son `tenant_id` y `business_role` (no `restaurant_id` ni `role`).
3. **Políticas RLS de `public.support_messages`**:
   - Aunque `024_support_tickets.sql` definió `is_internal = FALSE OR public.is_platform_admin(auth.uid())`, el servicio frontend `fetchSupportTicket` (`src/services/supportService.ts:106-110`) consulta `support_messages` sin filtrar `.eq('is_internal', false)` para usuarios no administradores y la UI (`SupportCenter.tsx` y `SupportTab.tsx`) renderiza todos los mensajes devueltos. Se reforzará tanto la política RLS en `058` como el filtro explícito en servicio y UI (defensa en profundidad).

---

## 2. Orden Exacto de Implementación

La remediación se ejecutará en cuatro fases secuenciales:

### Fase 1 — Capa de Base de Datos y Edge Functions (Bloques A y B de Backend)
1. **Crear migración `supabase/migrations/058_comprehensive_audit_remediation.sql`** que resuelve de forma atómica e idempotente:
   - **P0-01**: Reemplazo de `internal_create_notification`, `log_support_ticket_changes`, `notify_on_ticket_created`, `notify_on_ticket_updated` y `notify_on_new_message` apuntando a `public.support_audit_log`, `public.support_notifications` y `profiles.platform_role = 'platform_admin'`, con bloque `EXCEPTION WHEN OTHERS` para nunca abortar la creación de tickets/mensajes y sin notificar a clientes/restaurantes cuando `NEW.is_internal = TRUE`.
   - **P0-02**: Eliminación de `profiles_select_public_meta` (`USING (true)`), restricción de `SELECT` en `public.profiles` a `id = auth.uid() OR public.is_platform_admin(auth.uid())`, y creación de las RPC seguras `public.get_public_profiles_by_ids(UUID[])` y `public.check_username_available(TEXT, UUID)` que exponen únicamente `{ id, full_name, username, avatar_url }`.
   - **P0-03**: Endurecimiento de políticas RLS en `public.support_messages` (`SELECT` e `INSERT`) garantizando que `is_internal = true` sea exclusivo de `public.is_platform_admin(auth.uid())`.
   - **P0-04**: Reemplazo de `public.deactivate_and_purge_my_restaurant(UUID, TEXT)` usando las columnas reales (`description`, `banner_url`, `payout_account_holder`, `profiles.tenant_id`, `profiles.business_role`), anonimizando `restaurant_applications`, preservando órdenes/pagos/liquidaciones contables y asegurando idempotencia.
   - **P0-05 / P1-07 / P1-13**: Actualización de `public.create_order_with_items` para validar `r.status = 'active' AND r.is_open = TRUE AND r.accepting_orders = TRUE`, exigir `auth.uid() IS NOT NULL` en `pickup`/`restaurant_delivery`, permitir sesiones anónimas en `table_service` cuando `p_table_id`/`p_table_token` y `p_device_id` (longitud >= 8) sean válidos y `r.table_service_enabled = TRUE`, y actualización de `public.get_table_orders_for_session` eliminando el bypass `OR p_session_id = 'legacy'`.
   - **P0-06**: Endurecimiento de `public.provision_restaurant_for_user(UUID, TEXT)` y `public.resolve_or_provision_restaurant_owner()`: validación de `auth.uid()`, obtención del email real desde `auth.users`, prohibición de auto-aprobar solicitudes en estado `'submitted'` o `'reviewing'` (exigiendo `ra.status = 'approved'`), preservación de `platform_role` y `REVOKE ALL FROM PUBLIC, anon`.
   - **P1-04**: Actualización de `public.activate_approved_restaurant_rpc` y `public.provision_restaurant_for_user` para conservar `logo_url`, `banner_url` y `schedule_hours` de `restaurant_applications`.
   - **P1-06**: Revocación de `public.ensure_colombia_city_and_zone` para `anon`, restricción a `authenticated` con validaciones de longitud/caracteres y `SET search_path = public`.
   - **P1-09**: Corrección de `public.validate_support_ticket_order` (permitiendo también al dueño/miembro del restaurante del pedido), `public.get_support_metrics` (usando `platform_role = 'platform_admin'`, incluyendo `waiting_for_customer` en `open_tickets` y `COALESCE(..., 0)`), y sincronización de `satisfaction_score`/`satisfaction_comment` al enviar CSAT.
   - **P1-10**: Creación de tabla `public.restaurant_drivers` con RLS multi-tenant y columna `driver_id` + `kds_checked_items JSONB` en `public.orders`, más RPCs `assign_order_driver` y `update_order_kds_items`.
   - **P1-11**: Actualización de `public.delete_my_user_account` para anonimizar también textos/metadatos sensibles en `public.support_tickets` y `public.support_messages` y devolver las rutas de archivos en Storage para limpieza.
   - **P1-14**: Corrección de `public.sync_profile_from_member` para sincronizar únicamente cuando `NEW.status = 'active'` y nunca degradar `platform_admin`.
   - **P1-15**: Corrección de `public.record_restaurant_settlement_payment` y `public.record_restaurant_settlement` para que los pagos reportados por el dueño del restaurante se creen en estado `'pending'` / `'pending_review'` y solo descuenten deuda tras aprobación de `platform_admin` (`admin_review_restaurant_settlement` / `confirm_restaurant_settlement`).
   - **P1-18**: Eliminación de políticas legacy de `002` en `public.restaurant_members` (`members_insert_owner_or_admin`, `members_update_owner_or_admin`, `members_delete_owner_or_admin`) y endurecimiento de políticas de `storage.objects` en `gastro-media` por prefijo (`avatars/{uid}/...`, `reviews/{uid}/...`, `applications/...`, `restaurants/{restaurant_id}/...`).
2. **Actualizar Edge Functions**:
   - [`supabase/functions/create-payment/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/create-payment/index.ts): Permitir pago digital en pedidos anónimos de mesa (`order.fulfillment === 'table_service' && order.customer_id === null`) validando `order.table_id !== null` y `order.device_id === body.deviceId` (longitud >= 8), manteniendo validación estricta de JWT para pedidos con `customer_id`.
   - [`supabase/functions/approve_restaurant/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/approve_restaurant/index.ts): Conservar `logo_url`/`banner_url` (o construir URL pública desde `logo_path`/`banner_path`), no degradar `platform_role` si el usuario es `platform_admin`, y devolver códigos HTTP 4xx/5xx semánticos en caso de error.

### Fase 2 — Remediación P0 en Servicios y Frontend (Bloque A)
1. **P0-02 (PII en perfiles)**: Actualizar [`src/services/supabaseDataService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseDataService.ts) y [`src/services/supabaseAuthService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseAuthService.ts) para usar `get_public_profiles_by_ids` y `check_username_available`.
2. **P0-03 (Notas internas de soporte)**: Filtrar `.eq('is_internal', false)` en [`src/services/supportService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supportService.ts) cuando el usuario no es `platform_admin`, y ocultar `is_internal` en [`src/components/SupportCenter.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/SupportCenter.tsx) y [`src/components/RestaurantAdmin/SupportTab.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/RestaurantAdmin/SupportTab.tsx).
3. **P0-05 (QR de mesa `/mesa/:token`)**: Desbloquear checkout anónimo de `table_service` en [`src/context/AppContext.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/AppContext.tsx), propagar `deviceId` a `createRemotePayment` en [`src/services/supabaseOrderService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseOrderService.ts) y [`src/components/TablePublicView.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/TablePublicView.tsx).
4. **P0-07 (Aislamiento sesión Demo vs Remote)**: En [`src/context/AppContext.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/AppContext.tsx) y [`src/utils/authGuards.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/utils/authGuards.ts), impedir que `gs_demo_session_v1` hidrate estado cuando `isSupabaseConfigured === true`, limpiar identidad cuando `getSession()` es `null` en modo remoto y bloquear vistas protegidas mientras `isInitializingAuth` esté activo.
5. **P0-08 (PCI-DSS en `PaymentModal.tsx`)**: Eliminar por completo captura de PAN, titular, expiración y CVC en [`src/components/PaymentModal.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/PaymentModal.tsx), y eliminar la opción ficticia de MercadoPago, dejando únicamente **Efectivo** (cuando esté habilitado) y **Pago Digital Seguro (Wompi — Tarjetas, PSE, Nequi, Bancolombia)**.

### Fase 3 — Remediación P1 en Frontend y Servicios (Bloque B)
1. **P1-01 y P1-02 (Verificación de correo y Recuperación de contraseña)**:
   - Corregir el orden de guardas en [`src/App.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/App.tsx) para renderizar `EmailVerificationScreen` cuando `emailVerificationState === 'pending'`.
   - Reescribir [`src/components/EmailVerificationScreen.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/EmailVerificationScreen.tsx) con el sistema de diseño real del proyecto (variables CSS de `index.css`).
   - Soportar `/reset-password` y el evento `PASSWORD_RECOVERY` de Supabase en [`src/context/AppContext.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/AppContext.tsx), [`src/App.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/App.tsx) y [`src/components/ForcePasswordModal.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/ForcePasswordModal.tsx).
2. **P1-03 (Historias 24h)**:
   - Excluir `#story24h` del feed general en `supabaseDataService.ts` y `CustomerDeliveryApp.tsx`.
   - Filtrar historias con más de 24 horas de antigüedad (`created_at >= now - 24h`).
   - Hacer que `deleteStoryItem` invoque `deleteLivePost` y limpie el archivo de Storage en modo remoto.
3. **P1-04 (Logos/Banners en registro de restaurante)**:
   - En `AppContext.tsx` / `supabaseApplicationService.ts`, subir `logoFile` y `bannerFile` antes de insertar la solicitud o actualizar la solicitud inmediatamente con `logo_url` y `banner_url`.
4. **P1-08 (Autorización `isOwner` en panel de restaurante)**:
   - En [`src/components/RestaurantAdmin/TeamTab.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/RestaurantAdmin/TeamTab.tsx) y [`src/components/RestaurantAdmin.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/RestaurantAdmin.tsx), usar `currentUser?.businessRole === 'restaurant_owner' || currentUser?.platformRole === 'platform_admin'` en modo remoto en lugar de `userRole === 'admin'`.
5. **P1-09 (Soporte para restaurantes y métricas null-safe)**:
   - Soportar tickets de restaurante asociados a pedidos y proteger `.toFixed()` con `(val ?? 0).toFixed(1)` en [`src/components/SupportMetricsPanel.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/SupportMetricsPanel.tsx).
6. **P1-10 (Persistencia de repartidores y checklist KDS)**:
   - Conectar `DriversAndQrTab.tsx`, `OrdersTab.tsx`, `KitchenScreen.tsx` y `AppContext.tsx` con `public.restaurant_drivers` y las columnas `driver_id` / `kds_checked_items` en modo remoto (manteniendo fallback local solo en modo demo).
7. **P1-12 (UUID de Armenia y protección de carrito entre ciudades)**:
   - Corregir el fallback `'city-armenia'` por el UUID real `'00000000-0000-0000-0000-000000000001'` en `AppContext.tsx` y validar que el carrito pertenezca a un restaurante de la ciudad activa al cambiar de ciudad o abrir checkout.
8. **P1-16 y P1-17 (Cumplimiento legal Ley 1581, fuentes locales y transparencia RNBD)**:
   - Enviar timestamps explícitos de aceptación (`terms_accepted_at`, `privacy_accepted_at`, `data_processing_accepted_at`) desde `LoginScreen.tsx` hacia `signUpWithSupabase`.
   - Eliminar la carga automática de Google Fonts desde `index.html` sin consentimiento (usando pila tipográfica local/sistema o carga condicionada al consentimiento) y actualizar `LegalCenterModal.tsx` con información veraz sobre proveedores y estado RNBD.

### Fase 4 — Remediación P2 y P3 (Bloque C) + Pruebas y Verificación
1. **P2-01**: Añadir filtro/pestaña "Guardados" en `CustomerDeliveryApp.tsx`.
2. **P2-02**: Invocar `deleteMediaFile` al borrar publicaciones o productos con imagen/video en Storage.
3. **P2-03**: Revertir `locationPreference` a `'manual'` cuando falle `navigator.geolocation`.
4. **P2-06**: Desuscribir canales Realtime con `supabase.removeChannel(channel)` y evitar recreación por renders.
5. **P2-07**: Configurar `build.rollupOptions.output.manualChunks` en `vite.config.ts` y carga diferida (`React.lazy`) de modales pesados (`UserProfileModal`, `LegalCenterModal`) para bajar el chunk principal por debajo de 500 kB.
6. **P2-08**: Añadir cabeceras de seguridad HTTP (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`) en `vercel.json`.
7. **P2-09**: Activar `"strict": true` en `tsconfig.app.json` y asegurar 0 errores de compilación sin usar `any`.
8. **P2-10 a P2-14 y P3-01 a P3-06**: Corregir desbordamiento horizontal móvil en tablas de administración, ancho fluido en `.phone-frame`, `safe-area-inset-bottom` en `CookieConsentBanner`, bloqueo de scroll y cierre con `Escape` en modales, reemplazo de `window.confirm`/`alert` críticos, touch targets mínimos de 44×44px, `aria-label` en botones de solo ícono, limpieza de código muerto/`console.log` y creación de `.github/workflows/ci.yml`.
9. **Suite de Pruebas Reales**: Reemplazar aserciones estáticas frágiles por pruebas unitarias, de integración simulada y de guardas de seguridad/autorización para todos los hallazgos P0 y P1.

---

## 3. Matriz de Dependencias, Capas y Pruebas por Hallazgo P0 / P1

| ID | Hallazgo | Capas Afectadas | Migración / Archivos Clave | Prueba de Verificación |
| :--- | :--- | :--- | :--- | :--- |
| **P0-01** | Triggers de soporte rotos por `054` | SQL / Triggers | `058_comprehensive_audit_remediation.sql` | Test de esquema/contratos SQL + test unitario de servicio de soporte verificando uso de `support_audit_log`, `support_notifications`, `platform_role = 'platform_admin'` y manejo de excepciones. |
| **P0-02** | Exposición pública de PII en `profiles` | RLS / RPC / Service | `058_...sql`, `supabaseDataService.ts`, `supabaseAuthService.ts` | Test de seguridad verificando eliminación de `profiles_select_public_meta`, proyección mínima `{id, full_name, username, avatar_url}` en RPC y ausencia de `select('*')` público. |
| **P0-03** | Fuga de notas internas (`is_internal`) | RLS / Service / UI | `058_...sql`, `supportService.ts`, `SupportCenter.tsx`, `SupportTab.tsx` | Test unitario de `fetchSupportTicket` y filtrado de mensajes internos para roles `customer` y `restaurant_owner` vs `platform_admin`. |
| **P0-04** | `deactivate_and_purge_my_restaurant` roto | SQL / RPC | `058_...sql` | Test de contrato SQL verificando columnas reales (`description`, `banner_url`, `payout_account_holder`, `tenant_id`, `business_role`) e idempotencia. |
| **P0-05** | QR de mesa `/mesa/:token` bloqueado sin login | Frontend / RPC / Edge Function | `058_...sql`, `AppContext.tsx`, `TablePublicView.tsx`, `create-payment/index.ts` | Test unitario del guard de checkout anónimo (`table_service` con `tableId` + `deviceId` permitido; `pickup`/`delivery` anónimo rechazado) y validación en `create-payment`. |
| **P0-06** | Secuestro de tenant en `provision_restaurant_for_user` | SQL / RPC | `058_...sql` | Test de autorización verificando `p_user_id = auth.uid()`, lectura de email desde `auth.users`, exigencia de `status = 'approved'` y `REVOKE FROM PUBLIC, anon`. |
| **P0-07** | Sesión Demo contamina modo Remote | Frontend / Auth | `AppContext.tsx`, `authGuards.ts` | Test unitario verificando que `gs_demo_session_v1` se ignora cuando `authMode === 'remote'` y que `session === null` limpia `currentUser` y `userRole`. |
| **P0-08** | Captura de PAN/CVV y MercadoPago falso | Frontend / UI | `PaymentModal.tsx` | Test de componente/DOM verificando ausencia total de inputs de tarjeta (`cardNumber`, `cardCvc`, `cardExpiry`) y de `mercadopago`. |
| **P1-01** | `EmailVerificationScreen` bloqueada y sin estilos | Frontend / UI | `App.tsx`, `EmailVerificationScreen.tsx` | Test de orden de guardas en `App.tsx` y renderizado con clases del sistema de diseño. |
| **P1-02** | Recuperación de contraseña sin pantalla de cambio | Frontend / Auth | `AppContext.tsx`, `App.tsx`, `ForcePasswordModal.tsx` | Test de detección de ruta `/reset-password` y evento `PASSWORD_RECOVERY`. |
| **P1-03** | Historias 24h en feed, sin expiración ni borrado remoto | Service / Frontend | `supabaseDataService.ts`, `AppContext.tsx`, `CustomerDeliveryApp.tsx` | Test unitario de filtrado de `#story24h`, expiración a las 24h e invocación de `deleteLivePost`. |
| **P1-04** | Pérdida de logo/banner/horarios al activar restaurante | Service / Edge / RPC | `058_...sql`, `approve_restaurant/index.ts`, `AppContext.tsx` | Test de preservación de `logo_url`, `banner_url` y `schedule_hours` en flujo de solicitud y activación. |
| **P1-06** | `ensure_colombia_city_and_zone` abierta a `anon` | SQL / RPC | `058_...sql` | Test de permisos SQL verificando `REVOKE EXECUTE FROM anon, PUBLIC`. |
| **P1-07** | Bypass `'legacy'` en `get_table_orders_for_session` | SQL / RPC | `058_...sql` | Test de contrato SQL verificando comparación estricta `o.device_id = p_session_id`. |
| **P1-08** | `TeamTab` y `RestaurantAdmin` usan `userRole === 'admin'` | Frontend | `TeamTab.tsx`, `RestaurantAdmin.tsx` | Test de autorización de UI para `businessRole === 'restaurant_owner'` vs `'restaurant_staff'`. |
| **P1-09** | Soporte de restaurante con pedido, métricas NULL y CSAT | SQL / Service / UI | `058_...sql`, `SupportMetricsPanel.tsx` | Test de formateo null-safe en `SupportMetricsPanel` y contrato SQL de `validate_support_ticket_order` y `get_support_metrics`. |
| **P1-10** | Repartidores y KDS solo en `localStorage` | SQL / Service / UI | `058_...sql`, `DriversAndQrTab.tsx`, `KitchenScreen.tsx`, `AppContext.tsx` | Test de servicio y sincronización con `restaurant_drivers` y columnas de `orders`. |
| **P1-11** | `delete_my_user_account` no limpia soporte ni Storage | SQL / Service | `058_...sql`, `supabaseAuthService.ts` | Test de contrato SQL verificando anonimización de `support_tickets` y `support_messages`. |
| **P1-12** | Fallback `'city-armenia'` no UUID y carrito cruzado | Frontend | `AppContext.tsx`, `CustomerDeliveryApp.tsx` | Test unitario de UUID por defecto `'00000000-0000-0000-0000-000000000001'` y validación de ciudad del carrito. |
| **P1-13** | `create_order_with_items` no valida restaurante abierto/activo | SQL / RPC | `058_...sql` | Test de contrato SQL verificando `r.status = 'active' AND r.is_open = TRUE AND r.accepting_orders = TRUE`. |
| **P1-14** | `sync_profile_from_member` asigna tenant a invitados | SQL / Trigger | `058_...sql`, `approve_restaurant/index.ts` | Test de contrato SQL verificando `NEW.status = 'active'` y preservación de `platform_admin`. |
| **P1-15** | Auto-aprobación de abonos en `record_restaurant_settlement_payment` | SQL / RPC | `058_...sql` | Test de contrato SQL verificando que pagos de dueño entren como `'pending'`/`'pending_review'` hasta revisión de `platform_admin`. |
| **P1-16** | Consentimiento legal con `NOW()` y Google Fonts sin permiso | Frontend / Legal | `LoginScreen.tsx`, `supabaseAuthService.ts`, `index.html`, `LegalCenterModal.tsx` | Test unitario verificando envío explícito de timestamps de consentimiento y ausencia de carga externa no consentida. |
| **P1-18** | Políticas legacy en `restaurant_members` y `gastro-media` | RLS / Storage | `058_...sql` | Test de contrato SQL verificando `DROP POLICY` de políticas legacy y validación de prefijos en `storage.objects`. |

---

## 4. Riesgos y Mitigaciones

1. **Riesgo de romper flujos públicos al cerrar `profiles_select_public_meta` (P0-02)**:
   - *Mitigación*: Antes de eliminar la política abierta, la migración `058` crea las funciones `get_public_profiles_by_ids(UUID[])` y `check_username_available(TEXT, UUID)` con `SECURITY DEFINER` y `SET search_path = public`, devolviendo exclusivamente `id`, `full_name`, `username` y `avatar_url`. Todos los consumidores en `supabaseDataService.ts` y `supabaseAuthService.ts` se actualizan simultáneamente.
2. **Riesgo de afectar el historial contable al desactivar un restaurante (P0-04)**:
   - *Mitigación*: `deactivate_and_purge_my_restaurant` anonimiza los datos personales del propietario y despublica el catálogo, pero **no borra** filas de `orders`, `order_items`, `payments` ni `restaurant_settlements`.
3. **Riesgo de abuso en pedidos anónimos de mesa QR (P0-05)**:
   - *Mitigación*: Tanto el RPC `create_order_with_items` como la Edge Function `create-payment` exigen que `fulfillment = 'table_service'`, que la mesa exista y esté activa (`is_active = true AND archived_at IS NULL`), que el restaurante tenga `table_service_enabled = true`, `is_open = true`, `accepting_orders = true` y `status = 'active'`, y que el cliente presente un `device_id` válido (`length >= 8`) que coincida exactamente con el pedido.

---

## 5. Acciones que Requieren Aprobación Explícita o Configuración Externa

De acuerdo con la **Regla No Negociable #3 y #11**:
1. **Aplicación de migraciones en Supabase remoto (`npx supabase db push`)**:
   - No se ejecutará `supabase db push` sin flag. Se ejecutará únicamente `npx supabase db push --dry-run`, se mostrará la lista exacta de migraciones pendientes (`056`, `057`, `058`) y se esperará aprobación explícita del usuario.
2. **Despliegue de Edge Functions (`supabase functions deploy create-payment` / `approve_restaurant`)**:
   - Quedará listo en código local y verificado, esperando aprobación explícita para desplegarse.
3. **Push a GitHub y despliegue en Vercel**:
   - No se ejecutará `git push` ni `vercel deploy` sin autorización explícita.
4. **Revisión jurídica / configuración externa**:
   - El estado de inscripción en el Registro Nacional de Bases de Datos (RNBD — SIC) y los datos societarios definitivos del responsable del tratamiento se dejan claramente señalizados en `LegalCenterModal.tsx` como sujetos a validación jurídica/societaria del titular, sin afirmar falsamente un número de radicado inexistente.
