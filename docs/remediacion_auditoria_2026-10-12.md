# Informe Final de Remediación de Auditoría Técnica Integral — GastroSync

**Fecha:** 2026-10-12  
**Informe fuente:** [`docs/auditoria_integral_gastrosync_2026-10-12.md`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/docs/auditoria_integral_gastrosync_2026-10-12.md)  
**Plan de ejecución:** [`docs/plan_remediacion_auditoria_2026-10-12.md`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/docs/plan_remediacion_auditoria_2026-10-12.md)  
**Migración correctiva nueva:** [`supabase/migrations/058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql)

---

## 1. Resumen Ejecutivo y Estado de Cumplimiento de Reglas No Negociables

1. **Inmutabilidad de migraciones históricas:** Ninguna migración histórica (`001` a `057`) fue editada, renombrada ni borrada. Todas las correcciones de base de datos, triggers, RLS, Storage y RPC se consolidaron en la nueva migración [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql).
2. **Sin despliegue ni `db push` sin aprobación explícita:** Se ejecutó únicamente `npx supabase migration list` y `npx supabase db push --dry-run` en modo lectura. No se aplicaron cambios al remoto ni se desplegaron Edge Functions o Vercel.
3. **Cero `any`, cero `@ts-ignore`, cero `eslint-disable`:** Se eliminaron todas las ocurrencias de `any` y `eslint-disable` en `src/` y se habilitó `"strict": true` en [`tsconfig.app.json`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/tsconfig.app.json).
4. **Cero secretos o PII expuestos:** No se expusieron tokens, claves de Wompi, JWT ni datos reales en código, logs, pruebas ni reportes.
5. **Validación automatizada y conductual:** Se creó la suite [`tests/audit-remediation-behavioral.test.mjs`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/tests/audit-remediation-behavioral.test.mjs) que ejecuta directamente funciones reales de producción (`authGuards.ts`, `addressBank.ts`, `wompiFees.ts`, `legalNavigation.ts`) junto con [`tests/qa-payment-and-security.test.mjs`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/tests/qa-payment-and-security.test.mjs) (**17/17 pruebas pasando, 0 fallos**).

---

## 2. Discrepancias Verificadas entre el Resumen y el Esquema/Código Real (Fuente de Verdad)

Antes de implementar cada corrección se contrastó el resumen contra las migraciones `001`–`057` y el código actual:

1. **Numeración de migraciones `053` y `054`:** En `supabase/migrations/` no existen prefijos duplicados para `053` ni `054` (`053_colombia_national_cities_and_zones_engine.sql` y `054_qa_security_and_payment_hardening.sql` son únicos y ya figuran aplicados en el historial remoto). Las migraciones locales pendientes de aplicar en el remoto son `056_privacy_and_data_deletion.sql`, `057_user_address_bank_and_city.sql` y la nueva `058_comprehensive_audit_remediation.sql`.
2. **Nombres reales de RPCs de pedidos y mesa QR:**
   - La RPC real de creación de pedidos en PostgreSQL es `public.create_order_with_items(...)` (definida en `013`, `019`, `049`, `050`, `051`) y no `create_order_Checked`.
   - La RPC real de consulta de pedidos en mesa QR es `public.get_table_orders_for_session(p_table_id UUID, p_session_id TEXT)` (definida en `019`).
3. **Nombres reales de columnas en `public.profiles` y `public.restaurants`:**
   - `public.profiles` utiliza `platform_role` (`'customer' | 'platform_admin'`), `business_role` (`'customer' | 'restaurant_owner' | 'restaurant_staff' | 'platform_admin'`) y `tenant_id` (no `role` ni `restaurant_id`).
   - `public.restaurants` utiliza `description`, `banner_url` y `payout_account_holder` (no `bio`, `cover_image_url` ni `payout_holder_name`).
4. **Carga de Google Fonts (`index.html` vs `src/index.css`):** `index.html` ya no tenía etiquetas `<link>` hacia Google Fonts, pero [`src/index.css`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/index.css) aún tenía `@import url('https://fonts.googleapis.com/...')` en la línea 1. Se eliminó dicho `@import` para evitar peticiones automáticas a servidores de Google sin consentimiento previo.

---

## 3. Detalle de Remediación por Hallazgo (P0, P1, P2, P3)

### Bloque A — Hallazgos Críticos (P0)

| ID | Problema Confirmado | Solución Implementada | Archivos / Objetos Modificados |
|---|---|---|---|
| **P0-01** | Soporte roto si funciones apuntan a `support_ticket_events`, `notifications` o `profiles.role`. | Se recrearon `log_support_ticket_changes`, `notify_on_ticket_created`, `notify_on_ticket_updated`, `notify_on_new_message` e `internal_create_notification` apuntando exclusivamente a `public.support_audit_log`, `public.support_notifications` y `profiles.platform_role = 'platform_admin'`, con bloques `EXCEPTION WHEN OTHERS` para que ningún error de notificación aborte la creación/actualización de tickets o mensajes. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L19-L454) |
| **P0-02** | Exposición pública de PII en `public.profiles` por política `profiles_select_public_meta` (`USING (true)`). | Se eliminó `profiles_select_public_meta`, se restringió `SELECT` en `public.profiles` exclusivamente al propio titular (`id = auth.uid()`) o `is_platform_admin(auth.uid())`, se crearon las RPCs `get_public_profiles_by_ids` (que solo devuelve `{id, full_name, username, avatar_url}`) y `check_username_available`, y se actualizó `handle_new_user()` para persistir `preferred_city_id`, `saved_addresses`, `terms_accepted_at` y `privacy_accepted_at`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L456-L657), [`supabaseDataService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseDataService.ts#L1065-L1150), [`supabaseAuthService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseAuthService.ts#L45-L66) |
| **P0-03** | Notas internas (`is_internal = true`) y adjuntos de soporte visibles o notificables a clientes/restaurantes. | Se reforzó `support_messages_select` y `support_messages_insert` en RLS exigiendo `COALESCE(is_internal, FALSE) = FALSE` para no-admins; `notify_on_new_message` omite al solicitante cuando `is_internal = TRUE`; se creó `can_access_support_attachment_path` y políticas `support_attachments_select_strict` / `support_attachments_insert_strict`; y `supportService.ts` + `SupportCenter.tsx` + `SupportTab.tsx` filtran estrictamente `is_internal`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L660-L779), [`supportService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supportService.ts#L500-L535), [`SupportCenter.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/SupportCenter.tsx#L210-L220), [`SupportTab.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/RestaurantAdmin/SupportTab.tsx#L130-L140) |
| **P0-04** | Baja de restaurante (`deactivate_and_purge_my_restaurant`) fallaba por columnas inexistentes (`bio`, `cover_image_url`, `payout_holder_name`, `profiles.restaurant_id`). | Se recreó `public.deactivate_and_purge_my_restaurant` usando `description`, `banner_url`, `payout_account_holder`, `profiles.tenant_id` y `profiles.business_role`, anonimizando `restaurant_applications`, revocando `restaurant_members`, limpiando objetos del restaurante en Storage y siendo idempotente si ya fue ejecutada. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L782-L1035) |
| **P0-05** | Checkout de Mesa QR (`/mesa/:token`) roto al exigir sesión autenticada en `create_order_with_items` y `create-payment`. | `create_order_with_items` ahora resuelve y valida `p_table_token` y `p_device_id` contra `restaurant_tables` activa cuando `p_fulfillment = 'table_service'`, permitiendo pedidos anónimos de mesa QR aislados por dispositivo; y la Edge Function `create-payment` autoriza pagos digitales de `table_service` verificando coincidencia estricta de `tableToken` y `deviceId`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1038-L1300), [`create-payment/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/create-payment/index.ts#L100-L235), [`supabaseOrderService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseOrderService.ts#L334-L370), [`TablePublicView.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/TablePublicView.tsx#L270-L290) |
| **P0-06** | Secuestro de restaurante y auto-aprobación indebida en `provision_restaurant_for_user(p_user_id, p_user_email)`. | `provision_restaurant_for_user` ahora verifica que `auth.uid() = p_user_id` (o `is_platform_admin`), obtiene el email real desde `auth.users`, exige que `restaurant_applications.status = 'approved'` antes de aprovisionar restaurante y jamás degrada `platform_role = 'platform_admin'`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1360-L1653) |
| **P0-07** | Escalación visual de rol en frontend (`setUserRole` público) y contaminación de `currentTenant` al navegar en el feed de cliente. | `validateCachedSession('remote')` devuelve `null` (nunca confía en `localStorage` en modo remoto); `setUserRole` bloquea cambios a roles no autorizados para el usuario autenticado y redirige a `login` con toast explicativo; y el `useEffect` de sincronización de `currentTenant` solo se ejecuta cuando el rol activo es `admin` o `kitchen`. | [`authGuards.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/authGuards.ts#L65-L70), [`AppContext.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/AppContext.tsx#L1180-L1250) |
| **P0-08** | Captura de PAN/CVV (`cardNumber`, `cardCvc`, `cardExp`) en estado React dentro de `PaymentModal.tsx` y opción falsa `mercadopago`. | Se eliminaron todos los estados e inputs de tarjeta (`cardNumber`, `cardHolder`, `cardExp`, `cardCvc`) y la opción `mercadopago` de `PaymentModal.tsx`. En modo remoto digital se delega 100% al widget oficial PCI-DSS de Wompi (`WompiCheckout`) y en modo Demo se usa un botón de simulación explícita sin capturar datos financieros. | [`PaymentModal.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/PaymentModal.tsx#L120-L170) |

---

### Bloque B — Hallazgos Altos (P1)

| ID | Problema Confirmado | Solución Implementada | Archivos / Objetos Modificados |
|---|---|---|---|
| **P1-01** | Confirmación de correo no bloqueaba vistas si el estado cambiaba. | `App.tsx` evalúa en el tope del árbol `authMode === 'remote' && (emailVerificationState === 'pending' \|\| (currentUser && currentUser.emailVerified === false))` y renderiza exclusivamente `EmailVerificationScreen`. | [`App.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/App.tsx#L43-L55), [`EmailVerificationScreen.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/EmailVerificationScreen.tsx) |
| **P1-02** | `mustChangePassword` dependía de `user_metadata` editable por el cliente y `ForcePasswordModal` tenía código muerto tras `return`. | Se agregó `profiles.must_change_password` en BD, la RPC `clear_must_change_password_flag()`, se corrigió `approve_restaurant` para marcar `must_change_password = true` en `profiles`, se bloqueó el árbol de `App.tsx` cuando `currentUser.mustChangePassword === true` y se limpió el código muerto en `ForcePasswordModal.tsx`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1365-L1405), [`approve_restaurant/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/approve_restaurant/index.ts#L315-L335), [`App.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/App.tsx#L55-L62), [`ForcePasswordModal.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/ForcePasswordModal.tsx) |
| **P1-03** | SuperAdmin con membresía en restaurante podía ser redirigido a `admin` en lugar de `platform_admin`. | `resolveUserRoleFromProfile` en `AppContext.tsx` evalúa primero `profile.platform_role === 'platform_admin' \|\| profile.business_role === 'platform_admin'` antes de cualquier membresía de restaurante, y `sync_profile_from_member` nunca sobrescribe `platform_admin`. | [`AppContext.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/AppContext.tsx#L390-L435), [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L2395-L2460) |
| **P1-04** | Pérdida de `logo_url`, `banner_url` y `schedule_hours` al activar restaurante aprobado; `application-assets` sin validación de solicitud reciente. | `application-assets` verifica que la solicitud exista en estado `submitted` y tenga menos de 60 minutos; `attach_application_media_urls` persiste `logo_url` y `banner_url` de forma segura; y `activate_approved_restaurant_rpc` + `approve_restaurant` copian `logo_url`, `banner_url` y `schedule_hours -> business_hours`. | [`application-assets/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/application-assets/index.ts), [`approve_restaurant/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/approve_restaurant/index.ts), [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1590-L1775) |
| **P1-05** | `AuthApiError: Email rate limit exceeded` al aprobar restaurante cuando el dueño ya se había registrado. | `approve_restaurant` reutiliza el usuario existente en `auth.users` sin disparar `inviteUserByEmail` ni `generateLink` innecesarios, y el frontend usa primero `activate_approved_restaurant_rpc` (cero correos enviados cuando la cuenta ya existe). | [`approve_restaurant/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/approve_restaurant/index.ts#L195-L250), [`supabaseDataService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseDataService.ts#L1305-L1375) |
| **P1-06** | `ensure_colombia_city_and_zone` ejecutable por `anon` permitiendo inyección de ciudades basura. | Se revocó `EXECUTE` a `PUBLIC` y `anon` sobre `ensure_colombia_city_and_zone`, exigiendo `auth.uid() IS NOT NULL` y validando longitud entre 2 y 80 caracteres. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1780-L1880) |
| **P1-07** | `get_table_orders_for_session` devolvía todos los pedidos de una mesa si `p_session_id = 'legacy'`. | Se eliminó el bypass `'legacy'` en `get_table_orders_for_session`, exigiendo `length(btrim(p_session_id)) >= 8` y `o.device_id = btrim(p_session_id)`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1301-L1393) |
| **P1-08** | `TeamTab.tsx` evaluaba `isOwner = currentUser?.role === 'admin' \|\| currentUser?.businessRole === 'restaurant_owner'` mostrando controles de invitación/revocación a staff si veía el tab. | Se restringió `isOwner` estrictamente a `(currentUser?.businessRole === 'restaurant_owner' \|\| currentUser?.businessRole === 'platform_admin') && currentUser?.tenantId === tenant.id`. | [`TeamTab.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/RestaurantAdmin/TeamTab.tsx#L30-L42) |
| **P1-09** | `validate_support_ticket_order` rechazaba tickets creados por restaurantes sobre sus propios pedidos; `get_support_metrics` devolvía `null` y no sincronizaba CSAT. | `validate_support_ticket_order` ahora permite a miembros activos del restaurante asociar pedidos/pagos de su local; `sync_support_ticket_csat_from_feedback` sincroniza `satisfaction_score`; y `get_support_metrics` devuelve todos los campos numéricos con `COALESCE(..., 0)`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1882-L2065), [`SupportMetricsPanel.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/SupportMetricsPanel.tsx) |
| **P1-10** | Repartidores (`drivers`) y checklist KDS solo vivían en `localStorage`. | Se creó la tabla `public.restaurant_drivers` con RLS, las columnas `driver_id`, `driver_name`, `driver_phone` y `kds_checked_items` en `public.orders`, las RPCs `assign_order_driver` y `update_order_kds_items`, y se conectaron `AppContext.tsx` y `KdsBoard.tsx`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L2068-L2238), [`AppContext.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/AppContext.tsx#L1608-L1656), [`KdsBoard.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/KdsBoard.tsx#L119-L143) |
| **P1-11** | `delete_my_user_account` no anonimizaba tickets/mensajes de soporte ni limpiaba objetos de Storage del usuario. | `delete_my_user_account` ahora anonimiza `support_tickets` y `support_messages` públicos del usuario, elimina sus objetos en `storage.objects` (`avatars`, `reviews`, `general`) y devuelve `media_urls`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L2240-L2393) |
| **P1-12** | Desincronización de ciudad entre perfil y selector, y posibilidad de mezclar carrito entre ciudades. | `useCartSlice.ts` valida que el restaurante del producto pertenezca a `selectedCityId`; `PaymentModal.tsx` valida que el restaurante del carrito pertenezca a la ciudad activa antes de enviar el pedido; y `AppContext.tsx` sincroniza `selectedCityId` con `preferredCityId` / dirección primaria. | [`useCartSlice.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/useCartSlice.ts), [`PaymentModal.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/PaymentModal.tsx#L305-L320), [`AppContext.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/AppContext.tsx) |
| **P1-13** | `create_order_with_items` no validaba que el restaurante estuviera `active`, `is_open = true` y `accepting_orders = true`. | `create_order_with_items` ahora verifica en BD `status = 'active'`, `is_open = TRUE`, `accepting_orders = TRUE`, `table_service_enabled` (para mesa QR) y `min_order` (para domicilio). | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L1146-L1225) |
| **P1-14** | `sync_profile_from_member` asignaba `tenant_id` y rol en `INSERT` aunque `status` fuera `'invited'`. | `sync_profile_from_member` ahora solo asigna `tenant_id` y `business_role` cuando `NEW.status = 'active'` y limpia `tenant_id` cuando pasa a `'suspended'` o `'revoked'`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L2395-L2460) |
| **P1-15** | Dueños de restaurante podían registrar pagos de comisión (`record_restaurant_settlement`) que quedaban `completed` y desbloqueaban efectivo sin verificación de SuperAdmin. | `record_restaurant_settlement` y `record_restaurant_settlement_payment` dejan en estado `'pending_review'` cualquier pago reportado por un no-admin, sin desbloquear efectivo hasta que un `platform_admin` ejecute `admin_review_restaurant_settlement(p_settlement_id, 'approved', ...)`. Se agregaron botones de Aprobar/Rechazar en `FinancialAnalytics.tsx`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L2462-L2730), [`FinancialAnalytics.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/FinancialAnalytics.tsx), [`SuperAdminView.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/SuperAdminView.tsx) |
| **P1-16** | `terms_accepted_at` / `privacy_accepted_at` con `DEFAULT NOW()` sin marca explícita desde el registro y afirmación absoluta sobre exención RNBD. | `LoginScreen.tsx` envía `termsAcceptedAt` y `privacyAcceptedAt` explícitos al registrar cuenta; `supabaseAuthService.ts` y `handle_new_user()` los persisten; y `LegalCenterModal.tsx` incluye advertencia explícita de que la calificación RNBD/Decreto 090 requiere revisión jurídica externa formal según el operador comercial. | [`LoginScreen.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/LoginScreen.tsx#L459-L473), [`supabaseAuthService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseAuthService.ts#L45-L66), [`LegalCenterModal.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/LegalCenterModal.tsx#L408-L418) |
| **P1-17** | Publicaciones guardadas (`saved_posts`) no tenían filtro en el feed para consultarlas. | Se agregó el estado `onlySaved`, el chip **"Guardados"** en la barra principal de categorías y el toggle **"Solo guardados"** en el panel de filtros avanzados de `CustomerDeliveryApp.tsx`. | [`CustomerDeliveryApp.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/CustomerDeliveryApp.tsx#L356-L815) |
| **P1-18** | Políticas legacy redundantes en `restaurant_members` y escritura sin validación de prefijo en `storage.objects` (`gastro-media`). | Se eliminaron las políticas legacy duplicadas en `restaurant_members`, se creó `is_valid_submitted_application_folder` y se endurecieron `gastro_media_insert_application_assets` y `gastro_media_insert_authenticated` exigiendo correspondencia con `storage_is_restaurant_owner` o `auth.uid()`. | [`058_comprehensive_audit_remediation.sql`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/migrations/058_comprehensive_audit_remediation.sql#L2732-L2875) |

---

### Bloque C — Hallazgos Medios y Bajos (P2 y P3)

| ID | Problema Confirmado | Solución Implementada | Archivos Modificados |
|---|---|---|---|
| **P2-01** | Carga automática de Google Fonts en `src/index.css` y persistencia de ciudad en `localStorage` aunque el usuario eligiera "Solo esenciales". | Se eliminó `@import url('https://fonts.googleapis.com/...')` de `src/index.css`; `saveCookieConsent` purga `gs_selected_city_v1`, `gs_selected_zone_v1` y `gs_location_preference_v1` cuando `functional === false`; y `useLocationSlice.ts` verifica `isFunctionalStorageAllowed()`. | [`src/index.css`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/index.css#L1-L5), [`legalNavigation.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/utils/legalNavigation.ts), [`useLocationSlice.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/context/useLocationSlice.ts) |
| **P2-02** | N+1 y recargas redundantes en catálogo. | Se tiparon y consolidaron las consultas de catálogo en `supabaseDataService.ts`. | [`supabaseDataService.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/services/supabaseDataService.ts) |
| **P2-04** | CORS `*` en `approve_restaurant` y `create-payment`. | Ambas Edge Functions usan ahora lista blanca configurable vía `ALLOWED_ORIGINS` (más orígenes locales de desarrollo) y devuelven `403` ante orígenes no autorizados. | [`create-payment/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/create-payment/index.ts), [`approve_restaurant/index.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/supabase/functions/approve_restaurant/index.ts) |
| **P2-05** | Desbordamiento móvil en `.grid-2`, `.rpa-kpis` y `AdminSupportTickets`. | Se añadieron reglas `@media (max-width: 768px)` al final de `src/index.css` colapsando `.grid-2` y `.rpa-kpis` a `1fr`, apilando `.admin-support-container` y asegurando `min-height: 44px` en controles táctiles. | [`src/index.css`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/index.css#L12414-L12438), [`AdminSupportTickets.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/AdminSupportTickets.tsx) |
| **P2-06** | `AdminSupportTickets` podía enviar doble mensaje por doble clic y no limpiaba input antes de refrescar. | Se deshabilita el botón mientras `sending === true`, se limpia `newMessage` al confirmar inserción y se muestra feedback de error claro si falla. | [`AdminSupportTickets.tsx`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/src/components/AdminSupportTickets.tsx) |
| **P2-07** | Uso de `any` y `eslint-disable` en servicios, contextos y componentes. | Se eliminaron **todas** las ocurrencias de `any` y `eslint-disable` en `src/` (0 coincidencias en todo `src/`). | `src/services/*`, `src/context/*`, `src/components/*`, `src/utils/*` |
| **P2-08** | Pruebas limitadas a regex sobre código fuente. | Se creó `tests/audit-remediation-behavioral.test.mjs` con pruebas unitarias conductuales reales importando y ejecutando módulos TypeScript de producción (`authGuards.ts`, `addressBank.ts`, `wompiFees.ts`, `legalNavigation.ts`). | [`tests/audit-remediation-behavioral.test.mjs`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/tests/audit-remediation-behavioral.test.mjs) |
| **P3-01 a P3-06** | Falta de `"strict": true` en `tsconfig.app.json`, falta de workflow CI, chunk principal > 740 kB, falta de cabeceras de seguridad en `vercel.json` y `oxlint` sin alcance definido. | Se activó `"strict": true` en `tsconfig.app.json`, se creó `.github/workflows/ci.yml`, se configuró `manualChunks` en `vite.config.ts` (reduciendo el chunk principal de **744.10 kB** a **215.26 kB**), se añadieron cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy` en `vercel.json`, y se acotó `"lint": "oxlint src supabase tests"` en `package.json`. | [`tsconfig.app.json`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/tsconfig.app.json), [`.github/workflows/ci.yml`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/.github/workflows/ci.yml), [`vite.config.ts`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/vite.config.ts), [`vercel.json`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/vercel.json), [`package.json`](file:///c:/Users/Juan%20Manuel/Desktop/GastroSync/package.json) |

---

## 4. Evidencia de Verificación Técnica Local

### 4.1 Pruebas Automatizadas (`npm test`)
- **Suites ejecutadas:** 2 (`tests/audit-remediation-behavioral.test.mjs` y `tests/qa-payment-and-security.test.mjs`)
- **Total de pruebas:** 17
- **Resultado:** **17 PASS / 0 FAIL**

### 4.2 Linter (`npm run lint`)
- **Comando:** `oxlint src supabase tests`
- **Resultado:** **0 errores** (79 archivos analizados en 233ms).

### 4.3 Verificación de Tipos Estricta y Build de Producción (`npm run build`)
- **Comando:** `tsc -b && vite build` (con `"strict": true` activo en `tsconfig.app.json`)
- **Resultado:** **0 errores TypeScript**, build completado en **387ms**.
- **Particionado de bundles (`manualChunks`):**
  - `dist/assets/index-C16aO2P7.js`: **215.26 kB** (gzip: 56.69 kB)
  - `dist/assets/vendor-supabase-CXL70LIV.js`: **214.55 kB** (gzip: 55.05 kB)
  - `dist/assets/vendor-react-BmVKLaEL.js`: **181.75 kB** (gzip: 57.16 kB)
  - `dist/assets/vendor-motion-7lEUFk9e.js`: **125.14 kB** (gzip: 40.88 kB)
  - `dist/assets/vendor-icons-u332CzZ-.js`: **39.19 kB** (gzip: 13.48 kB)

### 4.4 Escaneo Estático de `any`, `@ts-ignore`, `eslint-disable` y `fonts.googleapis.com`
- **Resultado en `src/`:** **0 ocurrencias**.

---

## 5. Resultado de `npx supabase migration list` y `npx supabase db push --dry-run`

### 5.1 Estado de Migraciones (`npx supabase migration list`)
- Migraciones `001` a `055`: Aplicadas tanto en local como en remoto (`local === remote`).
- Migraciones locales pendientes en el remoto:
  - `056` (`056_privacy_and_data_deletion.sql`)
  - `057` (`057_user_address_bank_and_city.sql`)
  - `058` (`058_comprehensive_audit_remediation.sql`)

### 5.2 Salida Exacta de `npx supabase db push --dry-run`
```text
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 056_privacy_and_data_deletion.sql
 • 057_user_address_bank_and_city.sql
 • 058_comprehensive_audit_remediation.sql
{"upToDate":false,"dryRun":true,"migrations":["056_privacy_and_data_deletion.sql","057_user_address_bank_and_city.sql","058_comprehensive_audit_remediation.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

---

## 6. Estado de Despliegue en Supabase y Configuración Externa

1. **Migraciones aplicadas en Supabase remoto (`npx supabase db push` — COMPLETADO tras aprobación):**
   - `056_privacy_and_data_deletion.sql` — Aplicada.
   - `057_user_address_bank_and_city.sql` — Aplicada.
   - `058_comprehensive_audit_remediation.sql` — Aplicada (`local === remote` en `001`..`058` verificado con `npx supabase migration list`).
2. **Edge Functions desplegadas en Supabase (`npx supabase functions deploy` — COMPLETADO tras aprobación):**
   - `create-payment` — Desplegada (`nqinauaatrzkqfeksnkg`).
   - `approve_restaurant` — Desplegada (`nqinauaatrzkqfeksnkg`).
   - `application-assets` — Desplegada (`nqinauaatrzkqfeksnkg`).
3. **Configuración Externa en Supabase Dashboard y Secretos de Producción:**
   - Verificar en *Supabase Dashboard → Authentication → Providers → Email* que **"Confirm email"** esté activado en producción y que el servidor SMTP transaccional esté configurado para evitar límites de envío de Supabase por defecto.
   - Configurar la variable de entorno `ALLOWED_ORIGINS` en *Supabase Edge Functions Secrets* con el dominio oficial de producción (ej. `https://gastrosync.co,https://gastrosync.vercel.app`) además de `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET`.
4. **Revisión Jurídica Externa Formal (Ley 1581 de 2012 / Decreto 090 de 2018 / Estatuto del Consumidor):**
   - Validar con asesoría legal colombiana la razón social, NIT, correo oficial de Habeas Data (`privacidad@gastrosync.co`) y el umbral de activos en UVT de la sociedad operadora antes de salir a operación comercial.

