Gestión completa del login y registro (cliente + restaurante)

Decisiones confirmadas: pulir el diseño actual (tabs + tarjeta de restaurante), validación por campo, y el registro de restaurante crea cuenta con contraseña además de la solicitud.

## Contexto clave encontrado
- `approve_restaurant` (edge function) ya busca un usuario auth existente por `owner_email` al aprobar; solo invita si no existe. Por eso, si creamos la cuenta al enviar la solicitud, el enlace propietario→restaurante funciona sin cambios de backend ni migraciones.
- `signUpWithSupabase` (supabaseAuthService.ts:172) hace `auth.signUp` + upsert a `profiles` como customer; el rol de owner lo asigna la aprobación vía `restaurant_members`.
- `registerAccount` (AppContext.tsx:480) fuerza `role: client_delivery`; para el restaurante lo reutilizamos tal cual (el rol real llega al aprobar) tolerando el error "email ya registrado".

## Cambios

### 1. Utilidades compartidas de validación — `src/utils/formValidation.ts` (nuevo)
- `validateEmail`, `validateName`, `validatePhone` (formato CO), `evaluatePasswordStrength` (movida desde LoginScreen para reutilizarla en ambos formularios).
- Errores en español, retornando `string | null` por campo.

### 2. CSS de formularios — `src/index.css`
- Sección `.auth-*`: input con icono, focus ring visible (borde primary + sombra), estado error (borde rojo persistente), helper de error bajo el campo, botón submit con spinner. Reduce los estilos inline duplicados que hoy no tienen focus ring.

### 3. LoginScreen.tsx — pulir + validación por campo
- **Validación por campo**: estado `fieldErrors` separado por tab; valida `onBlur` y al enviar; el borde se pinta rojo solo tras tocar el campo; escribir limpia el error de ese campo. La caja global queda solo para errores del servidor.
- **Registro cliente**: nombre (mín. 2 palabras no exigido, solo no vacío y ≥3 chars), email válido, contraseña (score ≥3), confirmación coincide — mensajes específicos por campo bajo cada input.
- **Visual**: focus rings en inputs, botón submit con spinner durante carga (no solo texto), transición suave entre tabs, "¿Olvidaste tu contraseña?" mantiene email pre-rellenado, accesibilidad (`aria-invalid`, `aria-describedby` en errores).
- Reset password modal: mismos estilos de campo con focus ring y validación de email inline.

### 4. PartnerApplicationModal.tsx — solicitud + cuenta
- **Nueva sección "Tu cuenta de acceso"** (tras datos del responsable, solo si `authMode === 'remote'`): contraseña + confirmar contraseña con el medidor de fuerza reutilizado; score ≥3 requerido.
- **Flujo de envío**: 1) `registerAccount(ownerName, ownerEmail, password)`; si falla con "email ya registrado", continuar con la solicitud y mostrar aviso "Ya tienes una cuenta; la solicitud se vinculará a tu correo". 2) `submitRestaurantApplication(...)` como hoy. 3) Pantalla de éxito actualizada: menciona que la cuenta fue creada y que debe confirmar el correo (si aplica) y que al aprobar la solicitud quedará vinculado como propietario.
- **Validación por campo** también aquí (los `errors` por campo ya existen; añade onBlur touch y estados de borde para todos los campos requeridos, incluida la nueva contraseña).
- En modo demo: la sección de cuenta no aparece (no hay auth); la solicitud funciona como hoy.

### 5. Mensajes de error amigables — `supabaseAuthService.ts`
- Mapear errores comunes de Supabase en español: "User already registered" → "Ya existe una cuenta con este correo. Inicia sesión.", "Invalid login credentials" → "Correo o contraseña incorrectos.", "Email not confirmed" → "Confirma tu correo antes de entrar." (verificar cuáles ya existen y completar).

### 6. Verificación
- `tsc -b`, `oxlint`, `npm run build`.
- Prueba en navegador (dev server): login demo, validaciones por campo (provocar cada error), registro cliente completo, abrir modal de restaurante y verificar sección de cuenta + validación de contraseña. Como no hay Supabase local, la parte remote se valida por types/build; el flujo demo se prueba interactivo.

## Fuera de alcance
- Multi-paso del formulario de restaurante (se eligió pulir el diseño actual).
- Cambios en el edge function o migraciones (no son necesarios).
- Rediseño de EmailVerificationScreen (solo se reutilizan sus estados).