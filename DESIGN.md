---
name: GastroSync
description: Warm editorial gastronomy system uniting local food discovery, table QR ordering, and real-time kitchen operations.
colors:
  terracotta-primary: "#C85A38"
  terracotta-deep: "#A84830"
  sage-secondary: "#6B8C6A"
  sage-deep: "#547053"
  bronze-tertiary: "#8B6F47"
  warm-paper: "#FAF7F2"
  pure-surface: "#FFFFFF"
  almond-surface: "#F5F0E8"
  sand-border: "#E8E2D8"
  stone-border: "#D0C8BC"
  espresso-dark: "#2C2520"
  warm-ivory: "#FAFAF8"
  warm-taupe: "#78706A"
  muted-sand: "#B0A89E"
  status-emerald: "#10B981"
  status-cobalt: "#3B82F6"
typography:
  display:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.3px"
  title:
    fontFamily: "'Figtree', system-ui, -apple-system, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Figtree', system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Figtree', system-ui, -apple-system, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.6px"
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  sheet: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.espresso-dark}"
    textColor: "{colors.warm-ivory}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "{colors.terracotta-primary}"
    textColor: "{colors.pure-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-inverted:
    backgroundColor: "{colors.almond-surface}"
    textColor: "{colors.espresso-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  card-surface:
    backgroundColor: "{colors.pure-surface}"
    textColor: "{colors.espresso-dark}"
    rounded: "{rounded.lg}"
    padding: "28px"
  input-field:
    backgroundColor: "{colors.pure-surface}"
    textColor: "{colors.espresso-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
  nav-tab-active:
    backgroundColor: "{colors.espresso-dark}"
    textColor: "{colors.warm-ivory}"
    rounded: "{rounded.xs}"
    padding: "7px 16px"
---

# Design System: GastroSync

## Overview

**Creative North Star: "La Mesa Editorial & El Pase de Cocina"**

GastroSync habita un mundo visual cálido, táctil y gastronómico donde la calidez de una carta impresa en papel algodón se encuentra con la precisión operativa de un pase de cocina profesional. En lugar de parecer una aplicación genérica de reparto llena de colores neón y cajas grises frías, el sistema utiliza superficies color crema cálido, acentos terracota horneado, salvia botánica y carbón espresso profundo para que la fotografía de los platos y la claridad de los precios en pesos colombianos (COP) sean los verdaderos protagonistas.

La densidad visual se adapta con intención al contexto físico del usuario: en el descubrimiento del comensal y el menú de mesa QR, el ritmo es aireado y apetitoso; en el panel administrativo del restaurante y el tablero KDS de cocina, la interfaz elimina cualquier ornamento superfluo para priorizar lectura a distancia, estados semánticos inequívocos y respuesta táctil inmediata. El sistema rechaza explícitamente los fondos azul pizarra fríos heredados (`#0F172A`), los rojos de alarma genéricos (`#EF4444`) como color de marca y el anidamiento innecesario de tarjetas dentro de tarjetas.

**Key Characteristics:**
- Paleta cálida sin negros ni grises puros: todos los neutros están entintados hacia el crema papel, almendra, arena y carbón espresso.
- Contraste tipográfico entre encabezados serifa editoriales (`Playfair Display`) para identidad y cuerpo funcional de alta legibilidad (`Figtree`) para precios, modificadores y métricas.
- Superficies táctiles delimitadas por bordes cálidos de `1px` y sombras ambientales suaves en lugar de divisores pesados.
- Adaptación nativa móvil mediante barra inferior con desenfoque translúcido y modales tipo *bottom-sheet* que respetan `safe-area-inset-bottom`.
- Codificación cromática estricta para los estados de comanda en el KDS (Pendiente, Aceptado, En preparación, Listo).

## Colors

La paleta de GastroSync está inspirada en materiales reales de gastronomía —arcilla terracota, hojas de salvia fresca, madera tostada, papel crema y café espresso—, garantizando que cada pantalla se sienta apetitosa y humana.

### Primary
- **Baked Terracotta** (`#C85A38`): Acento principal de marca. Se utiliza en llamados a la acción de compra (agregar al carrito, confirmar pedido), indicadores activos en navegación móvil, cantidades de ítems en tickets de cocina y bordes de enfoque en formularios.
- **Roasted Terracotta** (`#A84830`): Estado hover/activo del acento principal y color de texto sobre fondos terracota translúcidos (`rgba(200, 90, 56, 0.10)`).

### Secondary
- **Botanical Sage** (`#6B8C6A`): Acento secundario orgánico. Se emplea para estados de frescura, órdenes listas para entregar en cocina (`.ticket-card.ready`), insignias de comercio verificado y confirmaciones positivas no estridentes.
- **Deep Sage** (`#547053`): Variante de alto contraste para texto de insignias secundarias y estados hover sobre píldoras salvia.

### Tertiary
- **Toasted Bronze** (`#8B6F47`): Acento cálido de soporte para temporizadores de cocina (`.ticket-timer`), órdenes en preparación (`.ticket-card.preparing`), etiquetas de especialidad gastronómica y detalles de rango o fidelidad.

### Neutral
- **Warm Paper** (`#FAF7F2`): Lienzo base de la aplicación (`body`). Sustituye el blanco clínico para reducir la fatiga visual y aportar calidez editorial.
- **Pure Porcelain** (`#FFFFFF`): Superficie elevada para tarjetas de restaurante, modales, tickets de cocina y campos de entrada de texto.
- **Almond Surface** (`#F5F0E8`): Superficie secundaria para contenedores de pestañas (`.nav-tabs`), píldoras interactivas (`.gf-glass-pill`) y bloques de resumen financiero.
- **Sand Border** (`#E8E2D8`): Borde estructural predeterminado (`1px solid`) para tarjetas, cabeceras y separadores suaves.
- **Stone Border** (`#D0C8BC`): Borde de mayor énfasis para divisores activos o contenedores seleccionados.
- **Espresso Charcoal** (`#2C2520`): Color principal de texto, contenedor del logotipo, botones primarios de alto contraste (`.btn-primary`) y pestañas activas.
- **Warm Ivory** (`#FAFAF8`): Color de texto claro sobre superficies `Espresso Charcoal`.
- **Warm Taupe** (`#78706A`): Texto secundario para descripciones de platos, subtítulos, tiempos de entrega y cabeceras de columnas KDS.
- **Muted Sand** (`#B0A89E`): Texto terciario para placeholders, marcas de tiempo pasadas y estados deshabilitados.
- **Status Emerald** (`#10B981`) & **Status Cobalt** (`#3B82F6`): Colores exclusivamente funcionales para estados operativos puntuales (ticket aceptado y ticket entrante pendiente en KDS).

### Named Rules
**The Tinted Neutral Rule.** Nunca uses negro puro (`#000000`), gris neutro frío (`#808080`) ni azul pizarra (`#0F172A`) en superficies, textos o fondos vidriados. Toda superficie oscura debe usar `Espresso Charcoal` (`#2C2520` o sus variantes translúcidas `rgba(44, 37, 32, 0.92)`).

**The Terracotta Restraint Rule.** `Baked Terracotta` (`#C85A38`) reserva su impacto para acciones de conversión (pedir, pagar, incrementar cantidad) y señales críticas de atención; los botones de navegación y acciones administrativas principales descansan sobre `Espresso Charcoal` (`#2C2520`) para evitar saturar la pantalla de naranja/rojo.

## Typography

**Display Font:** `'Playfair Display'`, con fallback a `Georgia, serif`
**Body Font:** `'Figtree'`, con fallback a `system-ui, -apple-system, sans-serif`

**Character:** La combinación equilibra el prestigio editorial de una revista gastronómica (`Playfair Display`) en encabezados de marca y nombres destacados con la claridad geométrica e inmediata de `Figtree` para leer precios en COP, listas de ingredientes, contadores de tiempo y tablas financieras.

### Hierarchy
- **Display** (`700`, `clamp(1.75rem, 3.5vw, 2.75rem)`, line-height `1.15`, letter-spacing `-0.02em`): Títulos principales de portada, nombre del restaurante en cabeceras de perfil y titulares de bienvenida.
- **Headline** (`700`, `1.25rem`, line-height `1.25`, letter-spacing `-0.3px`): Logotipo de marca en el header (`.logo-text h1`) y encabezados de modales o secciones principales.
- **Title** (`800`, `1.15rem`, line-height `1.3`, letter-spacing `-0.01em`): Títulos de tarjetas (`.card-title`), identificadores de orden en KDS (`.ticket-id` a `1.1rem`) y nombres de platos estrella.
- **Body** (`400` / `500` / `700`, `0.875rem` / `14px`, line-height `1.5`): Texto base de interfaz, ítems de comanda (`.ticket-item`), inputs de formulario (`11px 16px`), pestañas de navegación y botones (`.btn` con peso `700`).
- **Label** (`600`–`800`, `0.72rem` / `11.5px`, letter-spacing `0.6px`–`0.8px`, `uppercase`): Insignias de estado (`.badge`), subtítulo geográfico del logo (`0.7rem`) y etiquetas de navegación móvil (`0.67rem`).

### Named Rules
**The Single Font-Stack Rule.** Ningún componente debe declarar fuentes fuera del sistema (como `Outfit` o `Arial` en estilos inline). Todo título editorial usa `var(--font-display)` y toda interfaz operativa o numérica usa `var(--font-family)`.

**The Clean COP Currency Rule.** Los precios y montos en Pesos Colombianos deben presentarse siempre con peso `700` o `800`, sin centavos decimales y con separador de miles claro (ej. `$32.000`), asegurando que el precio nunca se parta en dos líneas (`white-space: nowrap`).

## Layout

El contenedor principal (`main`) está centrado con un ancho máximo de `1400px` y un padding base de `2.25rem 2rem` en escritorio (`1rem` en móvil), permitiendo que tanto el directorio de restaurantes como el tablero KDS de 4 columnas respiren con holgura.

- **Sistemas de Rejilla:**
  - `.grid-2` (`grid-template-columns: 1fr 1fr`, `gap: 2rem`) y `.grid-3` (`repeat(3, 1fr)`, `gap: 1.5rem`), colapsando a `1fr` por debajo de `992px`.
  - `.kds-columns`: Cuatro columnas iguales (`repeat(4, 1fr)`, `gap: 1.2rem`) en monitores amplios, pasando a `repeat(2, 1fr)` en `<= 1400px` y `1fr` en `<= 900px`.
  - `.rpa-kpis`: Tarjetas de indicadores del restaurante que se compactan automáticamente en una cuadrícula `2x2` (`repeat(2, minmax(0, 1fr))`, `gap: 8px`) en pantallas móviles.
- **Comportamiento Responsivo y Táctil (`<= 640px`):**
  - Las barras de pestañas (`.nav-tabs`, `.rpa-subtabs`, `.superadmin-tabs-bar`, `.kds-scroll-chips`) nunca se apilan en múltiples filas; mantienen `flex-wrap: nowrap` con desplazamiento horizontal táctil suave (`-webkit-overflow-scrolling: touch`) y barra de scroll oculta.
  - La navegación principal del comensal se traslada a una barra fija inferior de 5 columnas (`.gf-mobile-bottom-nav`) con soporte para `env(safe-area-inset-bottom)`.

## Elevation & Depth

GastroSync utiliza un modelo **híbrido de capas tonales cálidas y sombras ambientales de baja opacidad**. En reposo, la jerarquía se construye superponiendo tarjetas `Pure Porcelain` (`#FFFFFF`) o controles `Almond Surface` (`#F5F0E8`) sobre el fondo `Warm Paper` (`#FAF7F2`), asegurados siempre por un borde de `1px solid #E8E2D8`. Las sombras actúan como luz ambiental difusa y se intensifican únicamente al interactuar (hover, modales o barras fijas).

### Shadow Vocabulary
- **Card Rest** (`box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05)`): Elevación estándar para `.card` y contenedores de contenido principal.
- **Card Hover** (`box-shadow: 0 8px 28px rgba(0, 0, 0, 0.08)`): Elevación al pasar el cursor sobre tarjetas interactivas.
- **Terracotta Interactive Glow** (`box-shadow: 0 6px 18px rgba(216, 90, 56, 0.12)`): Sombra cálida reservada para tarjetas de restaurantes destacados al hacer hover (`.restaurant-rank-card:hover`).
- **KDS Ticket Depth** (`box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04)`): Sombra ligera para separar comandas dentro de las columnas del KDS.
- **Mobile Bottom Nav** (`box-shadow: 0 -8px 28px rgba(28, 25, 23, 0.08)`): Sombra superior suave combinada con `backdrop-filter: blur(18px)` sobre `rgba(250, 248, 245, 0.96)`.

### Named Rules
**The Border-First Elevation Rule.** Ninguna tarjeta sobre el fondo crema debe depender únicamente de `box-shadow` para definir sus límites; siempre debe incluir `border: 1px solid var(--neutral-border)` (`#E8E2D8`).

## Shapes

El lenguaje de formas emplea radios progresivos y amigables que suavizan la interfaz sin perder estructura editorial:
- **Controles e Inputs Internos (`6px` – `8px`):** Botones (`.btn`), inputs de formulario y contenedores de pestañas usan `--radius-sm` (`8px`), mientras que las pestañas individuales (`.nav-tab`) e insignias (`.badge`) usan `6px` para encajar geométricamente dentro de sus contenedores con `4px` de padding.
- **Tarjetas Operativas y Tickets (`10px` – `14px`):** Los tickets de cocina y tarjetas de ranking usan `--radius-md` (`10px`); las tarjetas principales de sección (`.card`) y columnas KDS usan `--radius-lg` (`14px`).
- **Tarjetas de Feed y Modales Móviles (`18px` – `24px`):** Las publicaciones gastronómicas usan `--radius-xl` (`18px`), y los modales en smartphone se transforman en hojas inferiores (*bottom-sheets*) con esquinas superiores redondeadas de `24px 24px 0 0`.
- **Contadores y Handles (`999px`):** Reservado exclusivamente para avatares circulares, contadores de notificaciones y etiquetas de `@usuario`.

## Components

### Buttons
Acciones claras, táctiles y sin gradientes artificiales.
- **Shape:** Esquinas suavemente redondeadas (`8px` radius), altura compacta con padding `10px 18px`, tipografía `0.875rem` en peso `700` e íconos alineados con `gap: 8px`.
- **Primary (`.btn-primary`):** Fondo `Espresso Charcoal` (`#2C2520`) con texto `Warm Ivory` (`#FAFAF8`). En hover oscurece sutilmente a `#2A2522` y se eleva `transform: translateY(-1px)`.
- **Secondary / Brand CTA (`.btn-secondary`):** Fondo `Baked Terracotta` (`#C85A38`) con texto blanco (`#FFFFFF`), cambiando a `Roasted Terracotta` (`#A84830`) en hover.
- **Inverted (`.btn-inverted`) & Outline (`.btn-outline`):** `.btn-inverted` usa fondo `Almond Surface` (`#F5F0E8`) con borde `#E8E2D8`; `.btn-outline` usa fondo transparente con borde `1.5px solid #2C2520`, invirtiéndose a relleno oscuro en hover.

### Chips & Badges
Indicadores compactos para estado de pedidos, roles y categorías gastronómicas.
- **Style:** Padding `3px 10px`, radio de `6px`, fuente `0.72rem` (`600`), mayúsculas con tracking de `0.6px`.
- **State:** Cada variante combina un fondo translúcido al `10%–15%`, texto en el tono oscuro del mismo matiz y un borde al `25%–30%` de opacidad (`.badge-primary` en terracota, `.badge-secondary` en salvia, `.badge-tertiary` en bronce).

### Cards / Containers
Contenedores limpios que enmarcan contenido sin anidar cajas innecesarias.
- **Corner Style:** `14px` (`--radius-lg`) para paneles y tarjetas generales; `10px` (`--radius-md`) para ítems de lista y tickets.
- **Background:** `Pure Porcelain` (`#FFFFFF`).
- **Shadow Strategy:** `0 2px 12px rgba(0, 0, 0, 0.05)` en reposo; transición de `0.2s ease` en tarjetas interactivas.
- **Border:** `1px solid #E8E2D8` (cambiando a `#C85A38` en hover cuando la tarjeta es seleccionable).
- **Internal Padding:** `1.75rem` (`28px`) en tarjetas de escritorio; `1.1rem` (`17.6px`) en tarjetas compactas de lista y tickets.

### Inputs / Fields
Campos de formulario legibles con retroalimentación cálida.
- **Style:** Fondo `#FFFFFF`, borde `1.5px solid #E8E2D8`, radio de `8px` (`--radius-sm`), padding `11px 16px` y texto `0.875rem` en `#2C2520`.
- **Focus:** Elimina el outline nativo, cambia el borde a `Baked Terracotta` (`#C85A38`) y despliega un anillo cálido `0 0 0 3px rgba(200, 169, 126, 0.15)`.

### Navigation
Cabecera superior sticky en escritorio y barra de pestañas segmentada con soporte táctil móvil.
- **Header (`.header`):** Barra sticky superior con fondo `#FFFFFF`, borde inferior `1px solid #E8E2D8` y padding `0.875rem 2rem`.
- **Segmented Tabs (`.nav-tabs` / `.nav-tab`):** Riel en `Almond Surface` (`#F5F0E8`) con padding `4px` y borde `#E8E2D8`. Las pestañas inactivas tienen texto `#78706A`; al pasar el cursor toman fondo blanco, y la pestaña `.active` se fija en `Espresso Charcoal` (`#2C2520`) con texto `#FAFAF8`.
- **Mobile Bottom Bar (`.gf-mobile-bottom-nav`):** Barra fija de 5 columnas en móvil con `backdrop-filter: blur(18px)` sobre crema translúcido y pestaña activa resaltada con fondo `rgba(200, 90, 56, 0.10)` y texto `#C85A38`.

### KDS Order Ticket (Signature Component)
La unidad operativa central de la cocina (`.ticket-card`).
- **Estructura:** Tarjeta blanca (`#FFFFFF`) con radio de `10px`, borde perimetral `1px solid` que codifica el estado de la comanda: Azul Cobalto (`#3B82F6`) para `pending`, Esmeralda (`#10B981`) para `accepted`, Bronce (`#8B6F47`) para `preparing` y Verde Salvia (`#6B8C6A`) para `ready`.
- **Anatomía Interna:** Cabecera dividida por una línea punteada (`1px dashed #E8E2D8`) con el ID de la orden en `1.1rem` (`800`) a la izquierda y el tipo de entrega (`.ticket-type`) a la derecha; lista de platos con cantidades resaltadas en `Baked Terracotta` (`800`); y pie con temporizador en bronce y acciones táctiles.

## Do's and Don'ts

### Do:
- **Do** usar exclusivamente las variables semánticas de `:root` (`var(--primary)`, `var(--neutral-bg)`, `var(--neutral-surface)`, `var(--text-main)`) en todos los componentes nuevos y refactorizados.
- **Do** convertir los modales en hojas inferiores (*bottom-sheets* con `border-radius: 24px 24px 0 0` y `max-height: 92dvh`) en pantallas móviles (`<= 640px`).
- **Do** mantener las barras de pestañas con scroll horizontal fluido (`flex-wrap: nowrap; overflow-x: auto`) en móvil para no empujar el contenido principal hacia abajo.
- **Do** diferenciar el estado de los tickets del KDS mediante el borde izquierdo de `6px` más etiqueta textual e ícono, nunca solo por color de fondo.

### Don't:
- **Don't** usar estilos inline con colores heredados del tema oscuro frío (`#0F172A`, `#1E293B`, `#EF4444`, `#94A3B8`) como los que aún existen en vistas antiguas (`PartnerLandingView.tsx`, `Header.tsx` o `table-qr-mobile-sticky-bar`).
- **Don't** anidar tarjetas con borde y sombra dentro de otras tarjetas con borde y sombra (*cards in cards*); usa `Almond Surface` (`#F5F0E8`) sin sombra para agrupar elementos secundarios dentro de una `.card`.
- **Don't** declarar familias tipográficas ad-hoc como `fontFamily: 'Outfit, sans-serif'`; respeta la dupla `Playfair Display` + `Figtree`.
- **Don't** mostrar botones de cancelación o entrega final dentro de la vista del rol `kitchen` (KDS).
