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

### Paso 5: Reiniciar el Servidor de Desarrollo
Ejecuta en tu terminal:
```bash
npm run dev
```

### Paso 6: Asignar el Primer Administrador de Plataforma
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

## 5. Plan de Migración por Módulos (Roadmap)

1. **Módulo 1 (Completado)**: Fundación Supabase, cliente pasivo Vite, esquema PostgreSQL versionado, parche de seguridad `002_security_hardening.sql` y pruebas RLS.
2. **Módulo 2 (Siguiente)**: Integración de Supabase Auth en `AppContext` para login/registro real de clientes, dueños y cocina.
3. **Módulo 3**: Migración e integración del feed gastronómico, restaurantes por zonas de Armenia y catálogos de menú.
4. **Módulo 4**: Creación atómica de pedidos mediante función RPC transaccional e integración de comanda KDS en tiempo real.
5. **Módulo 5**: Supabase Storage para carga de fotos de platos, banners y logos de restaurantes.
6. **Módulo 6**: Edge Functions de Supabase para procesamiento de pagos y confirmación webhooks sin exponer secretos en el cliente.
