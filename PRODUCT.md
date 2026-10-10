# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Comensales Locales (Clientes B2C):** Personas en ciudades intermedias de Colombia (iniciando en Armenia y Pereira) que descubren restaurantes locales mediante historias/feed social o directorio, y realizan pedidos a domicilio (`restaurant_delivery`), para recoger en el local (`pickup`) o directamente desde la mesa escaneando un código QR (`table_service` en `/mesa/:slug`).
2. **Propietarios y Administradores de Restaurantes (`restaurant_owner`):** Dueños de restaurantes independientes (pizzerías, gastrobares, cafés, restaurantes de autor) que gestionan su catálogo, mesas con QR, horarios, equipo de trabajo, reseñas de clientes, soporte y liquidaciones financieras sin depender de comisiones abusivas.
3. **Personal de Cocina y Operación (`restaurant_staff` / KDS):** Cocineros y despachadores que operan el tablero KDS (*Kitchen Display System*) en tiempo real con manos ocupadas, pantallas táctiles o tablets en cocina, enfocándose exclusivamente en preparar y avanzar comandas de *Pendiente* a *Listo*.
4. **Administradores de la Plataforma (`platform_admin` / SuperAdmin):** Equipo operativo de GastroSync encargado de revisar solicitudes de restaurantes aliados (`RestaurantApplication`), activar comercios (`Tenant`), conciliar liquidaciones de efectivo vs. pagos digitales (Wompi) y atender tickets de soporte.

## Product Purpose

GastroSync es un ecosistema gastronómico multi-ciudad y multi-tenant que conecta comensales con restaurantes locales combinando descubrimiento social (feed e historias de platos reales), pedidos omnicanal (domicilio propio del restaurante, recogida en tienda y servicio en mesa por QR) y herramientas operativas integradas (KDS de cocina y analítica financiera).

El éxito del producto significa que un restaurante local puede recibir, preparar y liquidar pedidos digitales y en efectivo de extremo a extremo pagando una comisión justa del **3% por pedido**, mientras el comensal disfruta de una experiencia rápida, cálida y transparente sin sobrecostos ocultos.

## Positioning

A diferencia de las agregadoras tradicionales de delivery (que cobran entre 25% y 35% de comisión, ocultan la identidad del restaurante y fuerzan tarifas infladas al consumidor), **GastroSync opera bajo un modelo de alianza directa del 3% de comisión** con compensación automática (*auto-netting*) entre recaudo digital (Wompi) y recaudo en efectivo, integrando en una sola aplicación web el canal de descubrimiento social, el menú QR en mesa, el despacho a domicilio y el sistema KDS de cocina.

## Operating Context

- **Geografía y Moneda:** Ciudades de Colombia (piloto activo en **Armenia, Quindío** y **Pereira, Risaralda** con resolución por zonas urbanas y cálculo Haversine sin dependencia obligatoria de mapas de pago). Todos los valores monetarios operan en **Pesos Colombianos (COP)** sin decimales (ej. `$28.000`).
- **Entornos Físicos Contrastantes:**
  - *Comensal en móvil:* Uso con una sola mano en la calle, casa o sentado en la mesa del restaurante tras escanear un QR bajo condiciones variables de luz y conectividad móvil.
  - *Cocina (KDS):* Tablets o monitores vistos a 1–2 metros de distancia en ambientes de alta presión, vapor y ruido; requiere lectura instantánea del número de orden, modalidad (Mesa, Domicilio, Recoger), tiempo transcurrido y modificadores, con bloqueo estructural de acciones destructivas (el rol `kitchen` no puede cancelar ni marcar como entregado).
  - *Administración del Restaurante:* Uso en laptop o móvil por el dueño para abrir/cerrar el local con un toque, actualizar disponibilidad de platos, descargar códigos QR de mesas y revisar cortes de caja.
- **Pagos y Liquidación:** Integración con **Wompi** (tarjetas, PSE, Nequi) y pago en **Efectivo contra entrega**, con control de cupo máximo de comisión acumulada en efectivo (`cashCommissionLimitCop`).

## Capabilities and Constraints

- **Stack Técnico Confirmado:** Aplicación SPA en **React 19 + TypeScript + Vite**, animaciones con **Framer Motion**, iconografía con **Lucide React**, gráficas con **Recharts** y backend/autenticación/realtime en **Supabase** (con soporte de *Modo Demo Local* en `demoAccounts.ts` para demostraciones controladas sin latencia).
- **Rutas y Superficies Principales:**
  - `/`: Shell principal gobernado por rol (`client_delivery`, `kitchen`, `admin`, `table_qr`, `platform_admin`) y pantalla de acceso (`LoginScreen` + `PartnerLandingView`).
  - `/mesa/:slug`: Vista pública de pedido en mesa por QR (`TablePublicView`) sin requerir registro previo complejo.
  - `/auth/callback`: Retorno de verificación de sesión y correo electrónico.
- **Privacidad de Ubicación:** No se almacenan coordenadas GPS exactas (`latitude`/`longitude`) en `localStorage`; únicamente se persisten identificadores de ciudad y zona (`gs_selected_city_v1`, `gs_selected_zone_v1`, `gs_location_preference_v1`) con fallback inmediato a selección manual.
- **Idioma:** Toda la interfaz de usuario, mensajes de error, validaciones y estados de carga deben estar íntegramente en **Español (Colombia)**.

## Brand Commitments

- **Nombre de Marca:** GastroSync (y *GastroSync Partners* para el frente B2B de restaurantes aliados).
- **Voz y Personalidad:** Cálida, editorial, hospitalaria y directa. Habla el lenguaje de la gastronomía local y del restaurador independiente, evitando tanto la jerga corporativa fría como el tono infantil de las apps masivas de reparto.
- **Identidad Visual Base Comprometida (*Warm Gastronomy*):** Paleta fundamentada en terracota cálido (`#C85A38`), verde salvia orgánico (`#6B8C6A`), bronce/madera (`#8B6F47`), superficies crema papel (`#FAF7F2`) y carbón espresso (`#2C2520`), eliminando gradualmente los vestigios heredados de fondos azul pizarra fríos (`#0F172A`) y rojos neón (`#EF4444`) que aún persisten en estilos inline antiguos.

## Evidence on Hand

- **Datos de Piloto y Demo:** Catálogo, cuentas multi-rol, historias, reseñas y pedidos configurados en `src/context/defaultData.ts` y `src/context/demoAccounts.ts`.
- **Documentación Operativa:** Arquitectura geográfica en `docs/multi-city-architecture.md`, lista de chequeo para piloto real en `docs/pilot-readiness-checklist.md` y configuración de infraestructura en `docs/supabase-setup.md` y `VERCEL_SUPABASE_SETUP.md`.
- **Ausencias que no deben fabricarse:** No inventar logotipos de franquicias reales sin autorización, certificaciones bancarias inexistentes ni métricas de restaurantes que no provengan del estado de la aplicación o del modo demo declarado.

## Product Principles

1. **Hospitalidad Cálida en el Descubrimiento, Precisión Quirúrgica en la Cocina:** La vista del comensal debe despertar el apetito con fotografía protagonista y calidez editorial; el KDS y el panel administrativo deben priorizar legibilidad instantánea, contraste claro y cero distracciones ornamentales.
2. **Transparencia Financiera del 3%:** Cada pantalla que muestre precios, comisiones, tarifas de domicilio o liquidaciones entre Wompi y efectivo debe desglosar los montos en COP con claridad absoluta tanto para el cliente como para el dueño del restaurante.
3. **Resiliencia Local-First:** Ningún flujo crítico puede bloquearse por permisos denegados (como GPS) o fallos de red; siempre debe existir una alternativa manual inmediata y estados de retroalimentación claros.
4. **Aislamiento Estricto por Rol y Comercio (Multi-Tenant):** Cada usuario ve únicamente las acciones seguras para su rol (ej. cocina prepara pero nunca cancela ni cobra; cada restaurante administra exclusivamente su propio catálogo y mesas).

## Accessibility & Inclusion

- **Navegación Móvil y Áreas Táctiles:** Soporte completo para uso con una mano en smartphones (`<= 640px`), barra de navegación inferior fija con respeto por `safe-area-inset-bottom`, modales tipo *bottom-sheet* en móvil y botones táctiles amplios en el KDS de cocina.
- **Retroalimentación Accesible:** Uso de regiones `aria-live="polite"` para cambios de estado de ubicación, notificaciones de pedidos en tiempo real y validaciones de formularios.
