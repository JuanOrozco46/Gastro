# Expediente de Cumplimiento Legal, Privacidad y Seguridad — GastroSync Colombia

**Versión de Política:** `2026.1`  
**Jurisdicción:** República de Colombia  
**Marco Normativo:** Ley Estatutaria 1581 de 2012 (Habeas Data), Decreto 1377 de 2013, Decreto 090 de 2018 (RNBD — SIC), Ley 1480 de 2011 (Estatuto del Consumidor) y Ley 527 de 1999 (Comercio Electrónico).

---

## 1. ¿Hay que registrar la Base de Datos ante la SIC (RNBD)? — Explicación Legal Clara

Una duda frecuente al lanzar una plataforma tecnológica en Colombia es si existe obligación de inscribir las bases de datos en el **Registro Nacional de Bases de Datos (RNBD)** de la Superintendencia de Industria y Comercio (SIC).

### La regla vigente (Decreto 090 del 18 de enero de 2018)
Originalmente, el artículo 25 de la Ley 1581 de 2012 obligaba a todas las empresas del país a registrar sus bases en la SIC. Sin embargo, el Gobierno Nacional expidió el **Decreto 090 de 2018** (que modificó el Decreto Único Reglamentario 1074 de 2015) y **limitó la obligación de inscripción en el portal RNBD únicamente a:**
1. **Sociedades y entidades sin ánimo de lucro con activos totales superiores a 100.000 UVT** (Unidades de Valor Tributario, equivalentes a aprox. **$4.979 millones COP en 2025 / $5.230 millones COP en 2026**).
2. **Personas jurídicas de naturaleza pública.**

### ¿Qué significa esto para GastroSync?
* **Si los activos totales de la empresa o persona natural operadora son inferiores a 100.000 UVT:** **NO estás obligado a realizar el cargue en el portal web del RNBD de la SIC.**
* **Lo que SÍ es 100% obligatorio para cualquier empresa o aplicación en Colombia (sin importar su tamaño):**
  1. Tener publicada y accesible la **Política de Tratamiento de Datos Personales** (`LegalCenterModal.tsx`).
  2. Recolectar **autorización previa, expresa e informada** del titular en cada formulario donde se capturen datos (`LoginScreen.tsx`, `PartnerApplicationModal.tsx`, `PaymentModal.tsx`) y conservar prueba de dicha autorización (`profiles.terms_accepted_at`, `profiles.privacy_accepted_at`).
  3. Garantizar canales efectivos para ejercer el **Derecho de Supresión ("Derecho al Olvido") y revocatoria** (`UserProfileModal.tsx`, `RestaurantAdmin/ProfileTab.tsx` y RPCs en `056_privacy_and_data_deletion.sql`).
  4. Mantener un **Inventario Interno de Bases de Datos** bajo el Principio de Responsabilidad Demostrada (*Accountability*).

### Inventario Interno de Bases de Datos de GastroSync (Listo para RNBD)
| Código | Nombre de la Base | Tablas en Supabase (PostgreSQL) | Titulares | Finalidad Principal |
| :--- | :--- | :--- | :--- | :--- |
| **BD-01** | Usuarios y Perfiles | `auth.users`, `public.profiles` | Comensales y usuarios registrados | Autenticación, perfil `@usuario`, direcciones de entrega y trazabilidad de consentimiento Ley 1581. |
| **BD-02** | Comercios Aliados | `restaurants`, `restaurant_applications`, `restaurant_members` | Propietarios y personal de restaurantes | Vinculación comercial B2B, exhibición de catálogo y dispersión bancaria del 97%. |
| **BD-03** | Pedidos y Pagos | `orders`, `order_items`, `payments` | Compradores y comercios | Despacho de pedidos (Domicilio / Recogida / Mesa QR), conciliación Wompi y soporte contable/tributario. |
| **BD-04** | Interacción Social | `posts`, `post_comments`, `post_likes`, `restaurant_reviews` | Comunidad GastroSync | Reseñas gastronómicas verificadas, favoritos y feed multimedia. |

---

## 2. Auditoría de Claves y Contraseñas en el Código

Se realizó un escaneo completo sobre todos los archivos `.ts`, `.tsx`, `.sql`, `.mjs`, `.json` y configuraciones de entorno:

1. **Sin claves privadas ni `service_role` en el cliente:** El frontend solo lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` desde variables de entorno (`import.meta.env`), protegidas por Row Level Security (RLS) en PostgreSQL.
2. **Secretos de Wompi aislados en Edge Functions:** `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` solo se leen mediante `Deno.env.get(...)` dentro de `supabase/functions/create-payment` y `supabase/functions/payment-webhook`.
3. **Contraseñas de cuentas Demo blindadas en producción:** En `src/context/demoAccounts.ts`, `COMMON_DEMO_PASSWORD` se evalúa como `import.meta.env.DEV ? 'GastroSyncDemo2026!' : ''`, por lo que Vite elimina la cadena del bundle de producción.
4. **Sanitización de logs de depuración:** Se endureció `src/utils/debugSupabase.ts` para que solo se ejecute en `import.meta.env.DEV` y **nunca imprima fragmentos ni prefijos (`substring`)** de la clave de Supabase en la consola del navegador.
5. **Protección en Git (`.gitignore`):** Todos los archivos `.env` y `.env.*` están ignorados, manteniendo únicamente la plantilla segura `!.env.example`.

---

## 3. Consentimiento Informado en Formularios (Ley 1581 de 2012)

* **Registro de Clientes (`src/components/LoginScreen.tsx`):** Casilla obligatoria de verificación previa antes de crear la cuenta con enlaces directos a *Términos y Condiciones* y *Política de Privacidad y Habeas Data (Ley 1581 de 2012)*.
* **Solicitud de Vinculación de Restaurante Aliado (`src/components/PartnerApplicationModal.tsx`):** Casilla obligatoria que incorpora aceptación expresa de la comisión del 3%, términos de aliados y autorización de tratamiento de datos personales y comerciales.
* **Confirmación de Pedido y Pago (`src/components/PaymentModal.tsx`):** Aviso explícito de consentimiento informado al confirmar la orden para compartir los datos de entrega con el restaurante seleccionado.

---

## 4. Funciones de Supresión de Datos ("Derecho al Olvido")

Implementadas en la migración `supabase/migrations/056_privacy_and_data_deletion.sql`, en `src/services/supabaseDataService.ts` y en `src/context/AppContext.tsx`:

1. **Supresión de Cuenta de Usuario (`public.delete_my_user_account`):**
   * Accesible desde **Mi Perfil &rarr; Privacidad, Habeas Data y Baja de Cuenta**.
   * Verifica que el usuario escriba `ELIMINAR MI CUENTA` y que no tenga pedidos activos en curso ni restaurantes activos sin dar de baja.
   * Elimina comentarios, likes, guardados, reseñas, membresías, archivos en Storage (`avatars`, `reviews`) y la fila en `public.profiles`.
   * **Anonimiza las órdenes históricas** (`customer_id = NULL`, `customer_name = 'Titular Suprimido (Ley 1581)'`, `customer_phone = '0000000000'`, `delivery_address = NULL`) cumpliendo simultáneamente con el Derecho de Supresión del titular y el deber de conservación contable/tributaria del comercio (Art. 10 Ley 1581 de 2012).
2. **Baja Voluntaria y Purga de Restaurante (`public.deactivate_and_purge_my_restaurant`):**
   * Accesible para dueños de restaurante desde **Panel Admin &rarr; Perfil &rarr; Privacidad, Datos Comerciales y Baja del Restaurante**.
   * Verifica titularidad, ausencia de pedidos en curso y confirmación `ELIMINAR RESTAURANTE`.
   * Elimina publicaciones del feed, horarios, mesas QR, miembros de equipo, archivos de Storage y productos sin historial contable.
   * Suspende el restaurante y **purga todos los datos personales y bancarios del propietario** (`phone`, `whatsapp`, `address`, `payout_account_number`, `payout_document_number`, `owner_user_id`).

---

## 5. Auditoría de Licencias de Tipografías, Iconografía y Fotografías

| Activo | Fuente / Proveedor | Licencia | Uso Comercial |
| :--- | :--- | :--- | :--- |
| **Playfair Display** | Google Fonts | **SIL Open Font License (OFL) v1.1** | Permitido sin regalías ni límite de vistas |
| **Figtree** | Google Fonts | **SIL Open Font License (OFL) v1.1** | Permitido sin regalías ni límite de vistas |
| **JetBrains Mono** | Google Fonts | **SIL Open Font License (OFL) v1.1** | Permitido sin regalías ni límite de vistas |
| **Lucide Icons (`lucide-react`)** | Lucide Contributors | **ISC / MIT License** | Permitido para uso comercial ilimitado |
| **Fotografías del carrusel y catálogo demo** | Unsplash (`images.unsplash.com`) | **Unsplash License** | Uso comercial y no comercial gratuito mundial |
