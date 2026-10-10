---
target: src/components/LoginScreen.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Juan Manuel\\Desktop\\GastroSync\\src\\components\\LoginScreen.tsx"
target_fingerprint: "sha256:c4ca6d8382d729284342c8a0ca04ace4f52845f77b76029acd264e721fe22bb8"
target_path: "C:\\Users\\Juan Manuel\\Desktop\\GastroSync\\src\\components\\LoginScreen.tsx"
timestamp: 2026-10-10T18-16-07Z
slug: src-components-loginscreen-tsx
---
Method: dual-agent (A: 311aaea9-8404-43aa-b4f8-91b9e9b2345a · B: 03522d2d-36da-4ca5-9eff-493016d71fa7)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Las barras de fortaleza de contraseña (`.pam-strength-bar` en `LoginScreen.tsx:1025`) miden `0px` porque `index.css:6699` estiliza `.pam-strength-bars span`, y `.pam-checks` usa `<div className="pam-check">` en lugar de `<ul>/<li className="ok">`. Además, los 3 pilares izquierdos rotan cada 4.5s sin indicador ni pausa. |
| 2 | Match System / Real World | 3 | Gran tono editorial local (`Armenia · Pereira`, `Alianza Justa del 3%`, `Pase de acceso`), pero el badge superior expone jerga técnica (`Modo Local Activo` / `Conectado en Vivo`) y los 3 pilares izquierdos parecen botones interactivos aunque todo su texto ya está visible. |
| 3 | User Control and Freedom | 2 | El modal de recuperación (`.gs-reset-dialog`, `LoginScreen.tsx:1088-1181`) no cierra con `Escape` ni clic en el overlay, y tras enviar el enlace (`resetSuccessMessage`) oculta el formulario sin botón primario de `"Volver a iniciar sesión"`. |
| 4 | Consistency and Standards | 2 | Tres quiebres con `DESIGN.md`: (1) En Registro se cuelan clases `.urm-*` con gradientes dorados hardcodeados (`#d4a359`, `#b37d33` en `index.css:7110, 7153`); (2) dos media queries en conflicto (`max-width: 960px` vs `max-width: 900px`); (3) `.gs-reset-dialog` no usa el patrón *bottom-sheet* en `<= 640px`. |
| 5 | Error Prevention | 3 | Buena normalización de `@username` y validación `onBlur`, pero `"Continuar con Google"` queda deshabilitado en modo demo sin explicación y el registro exige `"Dirección habitual de entrega *"` obligatoria incluso a comensales de Mesa QR o Recogida. |
| 6 | Recognition Rather Than Recall | 2 | Amnesia de marca en móvil (`<= 900px`): `index.css:3928` oculta `.login-brand-panel` (`display: none`) y activa `.login-mobile-logo`, pero `.login-mobile-logo` fue eliminado de `LoginScreen.tsx`. En celulares no aparece ni el logo ni el nombre `"GastroSync"` arriba del formulario. |
| 7 | Flexibility and Efficiency | 3 | El selector demo de 1 clic (`gs-auth-demo-strip`) y el pre-llenado de `resetEmail` aceleran el flujo, pero `"Continuar con Google"` desaparece en `"Crear Cuenta"`, el `<input type="file">` del avatar (`display: none`) no es alcanzable con teclado, y `.pam-grid-2` comprime los campos de contraseña a ~130px útiles. |
| 8 | Aesthetic and Minimalist Design | 3 | Excelente limpieza del "card soup" mediante `.gs-register-ledger-section` y paleta cálida (`#FAF7F2`, `#2C2520`, `#C85A38`), pero en `"Crear Cuenta"` la tira de 4 cuentas Demo sigue fija arriba compitiendo con las 3 secciones del registro. |
| 9 | Error Recovery | 3 | Errores claros vinculados con `aria-invalid`, `aria-describedby` y `role="alert"`, preservando estado entre pestañas (`errorsByTab`), aunque el medidor `.pam-strength` roto en CSS impide ver qué requisito de contraseña falta. |
| 10 | Help and Documentation | 3 | Buen microcopy en `RegisterSectionHead`, pero el encabezado promete `"en un paso"` (`LoginScreen.tsx:532`) justo encima de un flujo de 3 pasos numerados (`1`, `2`, `3`). |
| **Total** | | **26/40** | **Acceptable** |

#### Design Specificity Verdict

**LLM assessment**: La aplicación del skill logró un salto notable en **colorimetría, tipografía y voz de marca**: reemplazó la estética fría de SaaS genérico (`#0F172A`) por el díptico cálido definido en `DESIGN.md` (*"La Mesa Editorial & El Pase de Cocina"*), combinando `Playfair Display` + `Figtree` + `JetBrains Mono`, superficies `Warm Paper` (`#FAF7F2`) / `Espresso Charcoal` (`#2C2520`) / `Baked Terracotta` (`#C85A38`), y eliminó las tarjetas anidadas en favor de secciones editoriales con filetes de `1px solid` (`.gs-register-ledger-section`). Sin embargo, se queda a mitad de camino en tres frentes:
1. **El escaparate izquierdo (`.login-brand-panel`) es 100% texto abstracto e íconos genéricos (`Compass`, `QrCode`, `ShieldCheck`)**: no muestra ni una sola evidencia gastronómica o artefacto operativo (un plato real con precio en COP o una comanda KDS/QR en vivo) que despierte el apetito como pide el Principio #1 de `PRODUCT.md`.
2. **En móvil (`<= 900px`) desaparece toda la personalidad e identidad de marca**: una regla heredada en `index.css:3928` oculta `.login-brand-panel` completo y busca un `.login-mobile-logo` que ya no existe en `LoginScreen.tsx`.
3. **Residuos de otro sistema visual en Registro**: las clases `.urm-*` para el avatar y `@usuario` conservan gradientes dorados hardcodeados (`#d4a359` → `#b37d33`) que contradicen `DESIGN.md`.

**Deterministic scan**: `impeccable detect --json src/components/LoginScreen.tsx` finalizó limpio con **0 hallazgos (`exit code 0`, `[]`)**. El archivo aprueba todas las reglas estáticas de anti-patrones (sin tarjetas anidadas, sin gradientes violeta/índigo de IA, con etiquetas `<label htmlFor>` y atributos ARIA en inputs). La inspección cruzada con `src/index.css` reveló los desajustes de selectores CSS/DOM (`.pam-strength-bar`, `.login-mobile-logo`, breakpoints `960px` vs `900px`) y de foco de teclado (`input[type="file"]` con `display: none`) que el analizador estático de TSX no marca por sí solo.

**Visual overlays**: No hay superposición visual activa en el navegador (`FALLBACK: browser_mutation_unavailable` — no hay herramienta de inyección mutable de scripts en el navegador expuesta en esta sesión).

#### Overall Impression

El nuevo `LoginScreen` tiene alma editorial, copy colombiano auténtico y una arquitectura escritorio B2C/B2B muy bien pensada, pero hoy sufre una desconexión crítica entre escritorio y móvil (donde desaparece el logo y el panel de marca) y un par de desajustes CSS/DOM en la pestaña `"Crear Cuenta"` que empañan el acabado artesanal. La mayor oportunidad es **llevar esa misma presencia editorial al móvil y reparar el flujo de `"Crear Cuenta"`** (medidor de contraseña, tokens `.urm-*` y campos opcionales de entrega).

#### What's Working

1. **Díptico Editorial + Colofón B2B en escritorio (`LoginScreen.tsx:435-511`, `index.css:2793-3047`)**: El panel izquierdo actúa como una portada gastronómica regional (`Armenia · Pereira · Colombia`) con titular en `Playfair Display` y separa limpiamente en el colofón inferior la conversión B2B (`¿Diriges un restaurante en la región?` → `Vincular restaurante` al 3%) sin contaminar el login del comensal.
2. **Estructura de "Libro Mayor" sin tarjetas anidadas (`LoginScreen.tsx:731-1048`, `index.css:3227-3278`)**: El uso de `.gs-register-ledger-section` con divisores de `1px solid var(--neutral-border)` en vez de sub-tarjetas con sombra aplica al pie de la letra la regla *"No Cards in Cards"* de `DESIGN.md`.
3. **Ergonomía inteligente en `@username` y recuperación de contraseña (`LoginScreen.tsx:212-230, 646-658`)**: La sugerencia automática de `@usuario` mientras escribes tu nombre (respetando ediciones manuales con `usernameTouched`) y el traspaso automático del correo al abrir `¿Olvidaste tu contraseña?` reducen fricción real.

#### Priority Issues

- **[P1] What**: **Amputación total de la marca y del CTA de restaurantes aliados en móvil (`<= 900px`) y colisión de breakpoints (`960px` vs `900px`)**
  - **Why it matters**: En `src/index.css:3928`, `@media (max-width: 900px)` aplica `.login-brand-panel { display: none; }` esperando mostrar `.login-mobile-logo`, pero `.login-mobile-logo` fue eliminado de `LoginScreen.tsx`. En cualquier celular el usuario aterriza en una tarjeta blanca que solo dice `"Pase de acceso"` sin logo, sin nombre `"GastroSync"`, sin contexto de ciudad y sin el bloque `"Vincular restaurante"`. Además, entre `901px` y `960px` (`index.css:2784`), el panel izquierdo de `640px` de alto se apila completo sobre el formulario.
  - **Fix**: Unificar el media query en `@media (max-width: 960px)` en `src/index.css`, eliminar la regla huérfana `.login-brand-panel { display: none; }` (o ocultar únicamente `.gs-auth-pillars` en móvil) para que `.login-brand-panel` se transforme en un cabezote editorial compacto arriba del formulario con el sello de GastroSync, las ciudades y el acceso a `"Vincular restaurante"`.
  - **Suggested command**: `/impeccable adapt`

- **[P1] What**: **Medidor de fortaleza de contraseña y cabeceras de sección con selectores CSS rotos en `"Crear Cuenta"`**
  - **Why it matters**: En `LoginScreen.tsx:1020-1046`, `.pam-strength` renderiza `<div className="pam-strength-bar">`, `<div className="pam-strength-meta">` y `<div className="pam-check">`, pero `src/index.css:6698-6728` estiliza `.pam-strength-bars span`, `.pam-strength-row` y `ul.pam-checks > li.ok`. Como resultado, las barras de fortaleza miden `0px` (son invisibles), `"Nivel de seguridad"` y `"Débil/Fuerte"` salen pegados sin espacio (`Nivel de seguridadDébil`) y el check `'✓'` se aplasta dentro de un punto gris de `6px`.
  - **Fix**: Alinear el marcado de `.pam-strength` en `LoginScreen.tsx:1020-1046` con los selectores de `src/index.css:6698-6728` (o declarar `.pam-strength-bar`, `.pam-strength-meta` y `.pam-check` en `src/index.css`) y alinear `RegisterSectionHead` (`h3.pam-section-title`) con `.pam-section-head h4`.
  - **Suggested command**: `/impeccable polish`

- **[P2] What**: **Sobrecarga cognitiva, dirección obligatoria prematura y campos de contraseña comprimidos en `"Crear Cuenta"`**
  - **Why it matters**: Al pasar a `"Crear Cuenta"`, siguen visibles los 4 botones de Demo arriba (`gs-auth-demo-strip`), se exige `"Dirección habitual de entrega *"` obligatoria incluso a usuarios que pedirán en Mesa QR o para recoger, y `.pam-grid-2` (`LoginScreen.tsx:786, 957`) deja solo ~130px de ancho útil para escribir contraseñas.
  - **Fix**: Mostrar `.gs-auth-demo-strip` solo cuando `tab === 'login'`, apilar los campos de contraseña en 1 columna (o usar un único campo con toggle `Eye/EyeOff`), hacer opcional/colapsable la sección de dirección de entrega en el registro inicial, y permitir `"Continuar con Google"` también en `"Crear Cuenta"`.
  - **Suggested command**: `/impeccable distill`

- **[P2] What**: **Falsa interactividad y bajo contraste (3.33:1) en los 3 pilares auto-rotativos del panel izquierdo**
  - **Why it matters**: En `LoginScreen.tsx:273-276, 467-491`, los 3 pilares son `<button>` que rotan solos cada 4.5s (`setInterval`) sin pausarse al interactuar ni respetar `prefers-reduced-motion`, pero su contenido ya está siempre visible (hacer clic no revela nada y añade 3 paradas vacías de `Tab`). Además, `.gs-auth-pillar-tag` (`#C85A38` a `11.5px` sobre `#2C2520`, `index.css:2985`) tiene un contraste de **3.33:1**, por debajo del mínimo WCAG AA (4.5:1).
  - **Fix**: Convertir `.gs-auth-pillars` en una lista semántica `<ul className="gs-auth-pillars"><li>` (o vincular cada pilar a una tarjeta-espécimen visual real que cambie al seleccionarlo, pausando la rotación al interactuar) y aclarar `.gs-auth-pillar-tag` a `#F0A483` sobre `rgba(200, 90, 56, 0.22)` (>4.8:1).
  - **Suggested command**: `/impeccable bolder`

- **[P2] What**: **Gradientes dorados fuera de sistema en `.urm-*` y brechas de accesibilidad/teclado en avatar y modal de recuperación**
  - **Why it matters**: `.urm-avatar-preview`, `.urm-avatar-btn` y `.urm-at-prefix` (`index.css:7104-7190`) usan gradientes dorados hardcodeados (`#d4a359`, `#b37d33`) ajenos a `DESIGN.md`; el `<input type="file" style={{ display: 'none' }}>` (`LoginScreen.tsx:755`) impide subir avatar con teclado; y `.gs-reset-dialog` (`LoginScreen.tsx:1089`) carece de `role="dialog"`, `aria-modal="true"`, cierre con `Escape`, botón de retorno tras el éxito y adaptación *bottom-sheet* en `<= 640px`.
  - **Fix**: Migrar `.urm-*` a tokens `:root` (`var(--primary)`, `var(--primary-light)`, `var(--neutral-dark)`), cambiar `display: none` del input de archivo por `.sr-only` con `:focus-within` en `.urm-avatar-btn`, y añadir semántica de diálogo, listener de `Escape`, CTA `"Volver a iniciar sesión"` y soporte *bottom-sheet* a `.gs-reset-dialog`.
  - **Suggested command**: `/impeccable harden`

#### Persona Red Flags

**Jordan (Confused First-Timer)**:
- Ve `"Modo Local Activo"` en la esquina superior derecha (`LoginScreen.tsx:537`) y no sabe si se refiere a entregas en su barrio o a una base de datos local.
- Hace clic en los botones `"Carta Viva & Descubrimiento Local"` y `"Mesa QR, Recogida y Domicilio"` (`LoginScreen.tsx:471`) esperando ver un ejemplo, pero solo parpadea el borde y a los 4.5 segundos salta solo al siguiente.
- Lee *"en un paso"* (`LoginScreen.tsx:532`), entra a `"Crear Cuenta"` y encuentra 3 pasos numerados con dirección física obligatoria y un medidor de contraseña visualmente roto.

**Sam (Accessibility-Dependent User)**:
- No puede enfocar ni activar el botón `"Subir foto"` del avatar con el teclado porque el `<input type="file">` tiene `style={{ display: 'none' }}` (`LoginScreen.tsx:755`).
- Las etiquetas `.gs-auth-pillar-tag` (`#C85A38` sobre `#2C2520`) caen a **3.33:1** de contraste (y **<3.0:1** en estado `.active`).
- Al abrir `¿Olvidaste tu contraseña?`, `.gs-reset-dialog` no anuncia `role="dialog"` ni `aria-modal="true"`, y presionar `Escape` no cierra el modal.

**Casey (Distracted Mobile User)**:
- En su teléfono (`<= 900px`), `.login-brand-panel` desaparece y aterriza en una pantalla sin logo ni nombre de app.
- Áreas táctiles por debajo de `44×44px` en `.gs-auth-demo-pill` (~29px de alto), `.forgot-link` (~16px de alto) y `.field-toggle-pw` (`24×24px`).
- Quiere registrarse con 1 toque desde el celular, pero en la pestaña `"Crear Cuenta"` desaparece el botón `"Continuar con Google"` y debe teclear dirección completa con una mano.

**Camila (Dueña de Restaurante Independiente en Armenia/Pereira)**:
- En escritorio ve claramente el bloque `"¿Diriges un restaurante en la región? → Vincular restaurante"`, pero cuando abre el enlace desde su celular en el local (`<= 900px`), ese bloque desaparece con `.login-brand-panel` y queda reducido a un texto de `11.5px` al fondo del formulario.

#### Minor Observations

- **Nombre de clase con mayúscula accidental**: `.gs-auth-editorial-Lead` (`LoginScreen.tsx:454`, `index.css:2880`) mezcla camelCase y kebab-case.
- **Atributos `autoComplete` ausentes**: Añadir `autoComplete="email"`, `autoComplete="current-password"`, `autoComplete="new-password"`, `autoComplete="name"` y `autoComplete="tel"` activará el autocompletado nativo de iOS/Android/gestores de claves.
- **CSS heredado sin uso en `src/index.css` (`líneas 3578-3954`)**: Clases del login antiguo (`.login-mobile-logo`, `.form-panel-header`, `.login-tab-switcher`, `.role-selector`, `.demo-account-card`) siguen en la hoja de estilos y su `@media (max-width: 900px)` interfiere con el layout actual.

#### Questions to Consider

- ¿Qué pasaría si el escaparate izquierdo mostrara un espécimen gastronómico vivo (una tarjeta real del feed con precio en `$ COP` + estado de cocina/QR) en lugar de 3 botones de texto que rotan solos?
- ¿Necesita realmente un comensal escribir su dirección física y notas de portería antes de siquiera entrar a ver el menú de un restaurante?
- ¿Cómo debería sentirse el primer segundo en un teléfono móvil cuando hoy el 100% del manifiesto editorial sólo existe en pantallas de más de `900px`?
