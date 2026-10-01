# Guía de Configuración, Seguridad e Infraestructura Supabase — GastroSync

Esta documentación detalla la arquitectura de base de datos PostgreSQL, la configuración del cliente pasivo Vite, las políticas de Row Level Security (RLS) reforzadas y las guías de verificación de seguridad para GastroSync Armenia.

---

## 1. Alcance de este Módulo

### 🛠️ Lo que incluye este módulo:
* **Cliente Pasivo Vite-Ready (`src/lib/supabase.ts`)**: Exporta `isSupabaseConfigured` y `supabase`. Si no se configuran variables de entorno públicas, la aplicación continúa operando mediante `localStorage` sin lanzar errores ni interrumpir la demo actual.
* **Esquema SQL Versionado (`supabase/migrations/001_initial_schema.sql`)**: Define las 11 tablas del dominio con llaves foráneas UUID, tipos, constraints `CHECK`, índices optimizados, triggers `updated_at` e instalación automática de perfiles.
* **Parche de Reforzamiento de Seguridad (`supabase/migrations/002_security_hardening.sql`)**: Corrige vulnerabilidades de sombreado de variables en funciones SQL, previene recursión RLS, bloquea la autoelevación de roles en perfiles, restringe la inserción de solicitudes de restaurantes a ciudades/zonas activas y deshabilita la escritura directa de pedidos desvalidados desde el cliente.
* **Batería de Pruebas de Humo RLS (`supabase/tests/rls-smoke-tests.sql`)**: Consultas e instrucciones paso a paso para simular ataques y verificar el aislamiento multi-tenant en el SQL Editor de Supabase.
* **Plantilla de Entorno (`.env.example`) y Gitignore (`.gitignore`)**: Garantizan que archivos `.env.local` o credenciales nunca se suban al repositorio.

### ⛔ Lo que NO se migra aún:
* La interfaz de usuario (`App.tsx`, `AppContext.tsx`, `LoginScreen.tsx`, `SuperAdminView.tsx`, `RestaurantAdmin.tsx`) continúa funcionando 100% con `localStorage` y cuentas demo locales.
* La creación de pedidos e ítems directos desde el cliente se mantendrá simulada hasta implementar la función RPC transaccional de checkout en el siguiente módulo.
* No se han migrado las cuentas demo ni contraseñas temporales a Supabase Auth.
* No se han habilitado pasarelas ni cobros reales.

---

## 2. Pasos Manuales en el Supabase Dashboard

Para desplegar o actualizar el esquema en Supabase, sigue estos pasos:

### Paso 1: Crear un Proyecto en Supabase
1. Ingresa a [https://database.new](https://database.new) e inicia sesión.
2. Crea un proyecto asignando un nombre (ej. `gastrosync-armenia-dev`) y una contraseña segura para la base de datos.
3. Selecciona la región geográfica más cercana (ej. `South America (São Paulo)`).

### Paso 2: Ejecutar las Migraciones SQL en Orden
1. En el panel lateral del Dashboard de Supabase, abre **SQL Editor**.
2. **Si es un proyecto nuevo**: Ejecuta las siguientes migraciones en orden:
   * [`supabase/migrations/001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql)
   * [`supabase/migrations/002_security_hardening.sql`](../supabase/migrations/002_security_hardening.sql)
   * [`supabase/migrations/003_profile_policy_hardening.sql`](../supabase/migrations/003_profile_policy_hardening.sql)
3. **Si ya habías ejecutado las versiones anteriores**: Puedes ejecutar directamente los parches `002_security_hardening.sql` y `003_profile_policy_hardening.sql` para actualizar las funciones y políticas sin afectar la estructura ni los datos existentes.

### Paso 3: Copiar Credenciales Públicas
1. Ve a **Project Settings** -> **API** (o presiona el botón **Connect**).
2. Copia los valores públicos:
   * **Project URL**: Ejemplo `https://xyzcompany.supabase.co`
   * **Publishable / Anon Key**: La clave pública que empieza con `eyJ...`

### Paso 4: Crear el Archivo de Variables Local (`.env.local`)
En la raíz de tu proyecto local, crea el archivo `.env.local` a partir de `.env.example`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Paso 5: Desplegar Secretos de Edge Functions (Wompi)
Para la integración de pasarela de pagos con Wompi, configura los siguientes secretos en el backend de Supabase (usando Supabase CLI o el Dashboard en Edge Functions Secrets):
```bash
# Variables de entorno requeridas en el backend para crear intención de pago y validar webhook
supabase secrets set WOMPI_PUBLIC_KEY="pub_test_..." 
supabase secrets set WOMPI_PRIVATE_KEY="prv_test_..." 
supabase secrets set WOMPI_INTEGRITY_SECRET="test_integrity_..." 
supabase secrets set WOMPI_EVENTS_SECRET="test_events_..." 
supabase secrets set WEBHOOK_SECRET="mi_secreto_local_webhook"
```

### Paso 6: Reiniciar el Servidor de Desarrollo
Ejecuta en tu terminal:
```bash
npm run dev
```

### Paso 7: Asignar el Primer Administrador de Plataforma
1. Registra tu usuario en Supabase Auth.
2. En el Dashboard, ve a **Authentication** -> **Users** y copia el **User UID** asignado.
3. Abre el **SQL Editor** y ejecuta:

```sql
UPDATE public.profiles
SET platform_role = 'platform_admin'
WHERE id = 'AQUÍ_TU_USER_UID';
```

---

## 3. Principios de Seguridad y Aclaración de RLS

> [!WARNING]
> **ACLARACIÓN DE SEGURIDAD SOBRE RLS**
> * Row Level Security (RLS) **NO garantiza seguridad por sí solo** si las políticas no se prueban exhaustivamente o si el desarrollador expone la clave secreta `service_role` en el cliente.
> * RLS **reduce la superficie de exposición de datos únicamente** cuando:
>   1. Se evalúa con funciones `STABLE SECURITY DEFINER` con `search_path = public` y sin sombreado de parámetros.
>   2. Se configuran cláusulas `WITH CHECK` estrictas en mutaciones `INSERT` y `UPDATE`.
>   3. El cliente de React usa **exclusivamente** la clave pública `publishable` / `anon`.

> [!CAUTION]
> **REGLA DE SEGURIDAD ESTRICTA**
> **Jamás** pegues ni expongas la clave `service_role` en archivos frontend o variables de Vite. La clave `service_role` omite todas las políticas RLS.

---

## 4. Verificación y Pruebas de Humo RLS (`rls-smoke-tests.sql`)

Para verificar que las políticas RLS aíslan correctamente la información entre restaurantes y clientes:

1. Abre el archivo local [`supabase/tests/rls-smoke-tests.sql`](../supabase/tests/rls-smoke-tests.sql).
2. En el **SQL Editor** de Supabase, simula sesiones de distintos usuarios mediante `SET LOCAL request.jwt.claim.sub` y `SET LOCAL role`.
3. Ejecuta cada escenario para verificar que:
   * Un cliente no pueda leer pedidos de otro cliente.
   * El dueño del Restaurante A no pueda leer ni modificar productos o pedidos del Restaurante B.
   * El personal staff de cocina no pueda alterar los precios ni el menú del restaurante.
   * Un usuario común no pueda autoelevarse a `platform_admin`.
   * Un usuario anónimo no pueda crear pedidos ni pagos directos.
   * Las solicitudes de nuevos restaurantes permanezcan invisibles para clientes y comercios.

---

## 5. Estado Actual y Plan de Migración por Módulos (Roadmap)

### 📌 Estado Actual (Fase Preparatoria)
- **Fuente de Verdad**: El frontend todavía usa `localStorage` como fuente principal a través de `AppContext`.
- **Servicios Preparados**: Los servicios de Supabase (`Data`, `Auth`, `Order`, `Storage`) están preparados con tipos canónicos, pero no están conectados globalmente.
- **Bloqueos Preventivos**:
  - El checkout remoto (`createLiveOrder`) invoca la RPC transaccional (`create_order_with_items`) que valida los precios en servidor y crea la orden atómicamente, rechazando cualquier precio enviado desde el cliente. El flujo local por defecto sigue intacto.
  - Los ítems de pedido (`order_items`) están bloqueados para escritura directa desde el navegador por diseño.
  - Los pagos (`payments`) no pueden escribirse desde el navegador por políticas RLS.
  - Storage remoto ahora falla explícitamente devolviendo errores amigables si hay un problema, sin fallbacks silenciosos engañosos si Supabase está activo.
- **Seguridad**: Las claves secretas y Service Role Keys solo se usan en backend/Edge Functions.

### 🗺️ Próximos Módulos / Fases
1. **Fase 1 (Completado)**: Fundación Supabase, cliente pasivo Vite, esquema PostgreSQL versionado, pruebas RLS, y tipado estricto de servicios.
2. **Fase 2 (Completado)**: Integración progresiva de Supabase Auth en `AppContext` y `LoginScreen`, manteniendo fallback local seguro.
3. **Fase 3 (Completado)**: Lectura remota progresiva de restaurantes, productos y publicaciones desde Supabase con manejo de estados de carga y error (`isCatalogLoading`, `catalogError`), deshabilitando escrituras remotas.
4. **Fase 4 (Completado)**: Integración progresiva del checkout con la RPC segura `create_order_with_items`.
5. **Fase 5 (Completado)**: Actualización de estados del pedido con Supabase Realtime y KDS Panel remoto.
6. **Fase 6 (Completado)**: Pasarela de pagos Wompi Sandbox, con carga asíncrona segura, Webhooks y cálculo de Checksum backend.

---

## 6. Estado Real de Pruebas (Matriz de Verificación)

Con el fin de mantener un registro honesto del progreso del proyecto, este es el estatus exacto de las validaciones de la integración Wompi:

### Pruebas Estáticas y de Arquitectura (Verificadas 100%)
* ✅ **Construcción y Linter:** Cero (0) Warnings, Cero (0) Errores comprobado usando `oxlint` y `tsc -b && vite build`.
* ✅ **Seguridad del Frontend:** Carga asíncrona de widget limpiada con `isMounted`, ningún secreto incrustado en VITE, deshabilitación de declaración de pago exitoso desde cliente.
* ✅ **Cálculo de Checksum (Webhook):** Algoritmo programado de acuerdo con la norma Wompi `timestamp` + `signature.properties` + `eventsSecret` con SHA-256.
* ✅ **Idempotencia (Edge Functions):** Flujo y bloqueos previniendo repetición de órdenes o colisiones de intentos si la orden ya está pagada.

### Pruebas Simuladas Localmente (Flujo Demo - Verificado 100%)
* ✅ **Compatibilidad:** El modo Demo Local por localStorage se mantiene 100% funcional. Las cuentas demo navegan por Checkout, Carrito y Modal de Pago falso sin fallos. 
* ✅ **Fallback Visual:** La UI sabe manejar perfectamente los estados de "Pendiente" e informar reintentos dentro de `PaymentModal.tsx`.

### Pruebas End-to-End en Nube (Fase 7 - Bloqueadas por Credenciales)
Dado que **no se configuraron credenciales Sandbox Reales de Wompi ni se enlazó el proyecto de Supabase en `.env.local`**, el flujo E2E ha sido **BLOQUEADO**.

**Matriz de Pruebas Fase 7:**

| Prueba | Modo | Resultado | Evidencia | Pendiente |
|---|---|---|---|---|
| Construcción sin secretos (Lint/Build) | Local | **APROBADA** | 0 warnings, 0 errors, build OK (459ms). | Ninguno. |
| Exclusión de .env.local | Git | **APROBADA** | `.env.local` y `*.local` presentes en `.gitignore`. | Ninguno. |
| Validar falta de secrets VITE_* | Codebase | **APROBADA** | `grep` en `src/` confirma que solo existe `VITE_SUPABASE_URL` y `ANON_KEY`. | Ninguno. |
| Pago Aprobado (Flujo Remoto) | Remoto | **NO EJECUTADA** | N/A (Faltan credenciales Supabase/Wompi). | Inyectar keys, ejecutar y validar webhook status. |
| Pago Rechazado / Fallido | Remoto | **NO EJECUTADA** | N/A (Faltan credenciales Supabase/Wompi). | Probar transacciones declinadas. |
| Reintento de Pago (Retry) | Remoto | **NO EJECUTADA** | N/A (Faltan credenciales Supabase/Wompi). | Probar llamada a `retryRemotePayment`. |
| Webhook Duplicado / Firma Inválida | Remoto | **NO EJECUTADA** | N/A (Faltan credenciales Supabase/Wompi). | Simular POST a Edge Function con firmas inválidas. |
| Supabase Realtime (KDS/MyOrders) | Remoto | **NO EJECUTADA** | N/A (Faltan credenciales Supabase/Wompi). | Verificar que la UI reacciona a los updates en PostgreSQL. |

**Nota técnica:** Las migraciones 001 a 010 están validadas estáticamente, al igual que las Edge Functions. Sin embargo, **el sistema AÚN NO ESTÁ LISTO PARA PRODUCCIÓN** sin ejecutar el grupo de pruebas "NO EJECUTADA" con tokens de sandbox en un entorno live.
