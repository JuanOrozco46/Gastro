# Arquitectura Multi-Ciudad y Multi-Zona de GastroSync

## 1. Auditoría de Dependencias de Armenia (Diagnóstico Inicial)

### 1.1. Estado previo y acoplamiento detectado
- **Cadenas Hardcodeadas**: Se identificaron más de 30 referencias rígidas a `"Armenia"`, `"Armenia, Quindío"`, `"Toda Armenia"`, `city_armenia_quindio`, `zone_armenia_centro`, `zone_armenia_norte`, `zone_armenia_sur` distribuidas en los componentes del cliente, formularios de solicitud, vistas administrativas y servicio de datos.
- **Identificadores Inconsistentes**:
  - En modo demo se utilizaba la cadena `'city_armenia_quindio'`.
  - En la base de datos PostgreSQL de Supabase (`001_initial_schema.sql`) la ciudad de Armenia fue registrada con el UUID `'00000000-0000-0000-0000-000000000001'`.
- **Filtros Estáticos en Componentes**: `CustomerDeliveryApp`, `PartnerApplicationModal` y `RestaurantDirectory` asumían por defecto la existencia única de Armenia y filtraban manualmente por claves de zona hardcodeadas.

---

## 2. Compatibilidad Existente

- **Esquema de Base de Datos**: Las tablas `cities`, `zones`, `restaurants` y `restaurant_applications` ya contenían las relaciones de clave foránea `city_id` y `zone_id`.
- **Tipos de Dominio**: Las interfaces `City` y `Zone` en `src/types/index.ts` y sus equivalentes `DbCity` y `DbZone` en `src/services/supabaseTypes.ts` estaban declaradas, requiriendo únicamente el atributo `slug` para estandarización de URLs y filtros.

---

## 3. Plan de Refactorización

### 3.1. Modelo de Datos y Migración (`020_multi_city_architecture.sql`)
- Creación idempotente e índices óptimos para `city_id`, `zone_id`, `is_active` y `status` en `restaurants`, `zones` y `cities`.
- Conservación e inserción idempotente de la ciudad piloto **Armenia** (`00000000-0000-0000-0000-000000000001`) con sus 3 zonas iniciales (`Centro`, `Norte`, `Sur`).
- Inserción de una segunda ciudad activa de prueba (**Pereira**, `00000000-0000-0000-0000-000000000002`) con zonas (`Circunvalar`, `Cerritos`, `Centro`) para probar el aislamiento multi-ciudad sin requerir datos reales.

### 3.2. Servicios Remotos Tipados (`supabaseDataService.ts`)
- `fetchLiveCities()`: Carga de ciudades activas desde Supabase sin `any`.
- `fetchLiveZones(cityId: string)`: Carga de zonas activas filtradas por `city_id`.
- `fetchLiveRestaurants(cityId: string, zoneId?: string | null)`: Carga de comercios filtrados por ciudad y zona.
- `fetchLivePosts(cityId: string, zoneId?: string | null)`: Filtrado dinámico de publicaciones del feed según la ubicación seleccionada.
- `updateRemoteRestaurantLocation(restaurantId, cityId, zoneId)`: Actualización remota segura de la ubicación de un comercio.

### 3.3. Estado Global y Persistencia (`AppContext`)
- Gestión centralizada de `selectedCityId` y `selectedZoneId`.
- Persistencia en `localStorage` con las claves versionadas `gs_selected_city_v1` y `gs_selected_zone_v1`.
- Validación defensiva al cargar desde `localStorage`: si la ciudad guardada no existe o está inactiva, se establece automáticamente la primera ciudad activa de la lista (Armenia por defecto de ordenamiento, sin string hardcodeado). Si la zona no pertenece a la ciudad, se resetea a `null` ("Todas las zonas").

### 3.4. Componente Reutilizable `LocationSelector.tsx`
- Selector accesible y responsivo para móvil y desktop.
- Desplegable de ciudades activas y filtro secundario de zonas ("Todas las zonas").

---

## 4. Riesgos de Compatibilidad y Mitigación

1. **Desalineación de IDs entre Demo y Remoto**:
   - *Solución*: Se homologan los IDs de Armenia (`00000000-0000-0000-0000-000000000001`) y sus zonas en los datos demo de `AppContext.tsx` para coincidir exactamente con los UUIDs reales de Supabase.
2. **Posts sin `city_id` directo en la tabla `posts`**:
   - *Solución*: En el servicio remoto se consultan los restaurantes de la ciudad/zona seleccionada y se filtran los posts pertenecientes a esos `restaurant_id`.
3. **Persistencia de `localStorage` corrupta**:
   - *Solución*: Implementación de validación estricta al deserializar en `AppContext.tsx`. Si el valor guardado no es un UUID válido activo, realiza fallback dinámico a la primera ciudad activa devuelta por la API/Demo.

---

## 5. Hoja de Ruta para GPS, Mapas y Cálculo de Distancias (Pendientes Futuros)

> [!NOTE]
> En la Fase 1 NO se implementó geolocalización por GPS ni mapas interactivos. La selección es 100% explícita por selector de ciudad/zona.

Para fases posteriores:
- **GPS / Geocoding**: Integración de la API de Geolocation del navegador para autoseleccionar la ciudad más cercana mediante bounding box o cálculo de Haversine.
- **Cálculo de Distancia Real**: Reemplazar la propiedad `distanceKm` simulada por distancia matemática entre coordenadas GPS de la dirección del usuario y la cocina del restaurante.
- **Cálculo de Domicilio Dinámico**: Matriz de tarifas de domicilio por zona o por kilómetro.
