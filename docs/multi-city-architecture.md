# Arquitectura Multi-Ciudad y Ubicación Inteligente de GastroSync

## 1. Auditoría y Diagnóstico de Arquitectura Geográfica

### 1.1. Estado previo y desacoplamiento de Armenia
- **Fase 1 (Completada)**: Se eliminaron más de 30 referencias hardcodeadas a `"Armenia"` y `"city_armenia_quindio"` en componentes y servicios. El esquema de base de datos se migró con la versión `020_multi_city_architecture.sql`, soportando múltiples ciudades (Armenia, Pereira y futuras expansiones).
- **Fase 2 (Ubicación Inteligente)**: Se incorporó soporte opcional de GPS con resolución geográfica sin dependencias externas de pago ni mapas obligatorios.

---

## 2. Modelo de Ubicación Inteligente (Fase 2)

### 2.1. Tipado del Estado de Ubicación (`src/types/index.ts`)
```ts
export type LocationPermissionState =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type UserLocationState = {
  permission: LocationPermissionState;
  latitude?: number;
  longitude?: number;
  cityId?: string;
  zoneId?: string;
  isResolving: boolean;
  error?: string;
};
```

### 2.2. Módulo de Resolución Geográfica (`src/services/locationResolver.ts`)
- **Abstracción `LocationResolver`**: Módulo desacoplado que utiliza la fórmula de Haversine para mapear coordenadas GPS a las ciudades piloto activas (Armenia y Pereira) y sus zonas urbanas.
- **Aislamiento**: Si la coordenada detectada no coincide con ninguna ciudad cubierta (distancia > radio de cobertura de 18-20 km), devuelve `status: 'out_of_coverage'` permitiendo al usuario seleccionar manualmente sin romper la experiencia ni inventar ubicaciones ficticias.
- **Preparado para Geocodificación Externa**: En fases futuras, este módulo puede conectarse con OpenStreetMap (Nominatim) o Google Maps Geocoding API reemplazando únicamente la función interna de `locationResolver.ts` sin alterar `AppContext`.

---

## 3. Persistencia y Privacidad

### 3.1. Claves Versionadas en `localStorage`
- `gs_selected_city_v1`: ID de la ciudad seleccionada.
- `gs_selected_zone_v1`: ID de la zona seleccionada (o `null` para todas las zonas).
- `gs_location_preference_v1`: Preferencia del usuario (`'gps'` | `'manual'`).

### 3.2. Políticas de Privacidad y UX
- **No almacenamiento de coordenadas exactas**: No se guardan latitud/longitud en `localStorage`.
- **Aviso Informativo Previo**: Antes de solicitar el permiso GPS por primera vez en `LocationSelector.tsx`, se muestra un banner explicativo: *"Usaremos tu ubicación aproximada para mostrarte restaurantes cercanos. Puedes elegir tu ciudad manualmente."*
- **Acceso Directo a Selección Manual**: Si el permiso es denegado o falla la lectura GPS, la aplicación muestra una alerta amigable y ofrece el botón *"Elegir manualmente"*, conservando la operabilidad completa del feed, directorio y pedidos.

---

## 4. Componente Reutilizable `LocationSelector.tsx`

El componente `LocationSelector.tsx` soporta:
- Selección de ciudad y zona mediante dropdowns accesibles.
- Botón *"Usar mi ubicación"* con ícono dinámico y animación de carga.
- Estados de retroalimentación accesibles (`aria-live="polite"`):
  - *"Detectando ubicación GPS..."*
  - *"Permiso de ubicación bloqueado."*
  - *"Tu ubicación actual está fuera de las ciudades con cobertura activa."*
- Cambio instantáneo entre modo GPS y modo manual.

---

## 5. Hoja de Ruta para Fases Futuras

- **Fase 3: Geocodificación Externa y Mapas**:
  - Integración opcional de proveedor de geocodificación inversa (ej. OpenStreetMap Nominatim o Google Geocoding API).
  - Componente de Mapa interactivo para selección de punto de entrega en el Checkout.
- **Fase 4: Tarifas y Tiempos de Domicilio Dinámicos**:
  - Matriz de precios de envío basada en la distancia en kilómetros entre la cocina del comercio y la dirección del cliente.
