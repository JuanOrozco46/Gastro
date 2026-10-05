import type { City, Zone } from '../types';

export interface ResolvedLocationResult {
  cityId?: string;
  zoneId?: string;
  status: 'resolved' | 'out_of_coverage' | 'unavailable';
  confidence?: 'exact_zone' | 'city_default';
  message: string;
}

/**
 * Bounds & coordinates definition for known pilot cities.
 * Uses Haversine distance to match coordinates to cities without external API dependencies.
 */
interface CityBoundingCenter {
  cityId: string;
  lat: number;
  lng: number;
  radiusKm: number;
  zones?: Array<{
    zoneId: string;
    lat: number;
    lng: number;
    radiusKm: number;
  }>;
}

// Known coordinates for pilot cities (Armenia, Pereira)
const PILOT_CITY_COORDINATES: CityBoundingCenter[] = [
  {
    cityId: '00000000-0000-0000-0000-000000000001', // Armenia
    lat: 4.5339,
    lng: -75.6811,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000011', lat: 4.5320, lng: -75.6700, radiusKm: 3.5 }, // Centro
      { zoneId: '00000000-0000-0000-0000-000000000012', lat: 4.5550, lng: -75.6550, radiusKm: 4.0 }, // Norte
      { zoneId: '00000000-0000-0000-0000-000000000013', lat: 4.5100, lng: -75.6900, radiusKm: 4.0 }  // Sur
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000002', // Pereira
    lat: 4.8133,
    lng: -75.6961,
    radiusKm: 20.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000021', lat: 4.8080, lng: -75.6900, radiusKm: 3.5 }, // Circunvalar
      { zoneId: '00000000-0000-0000-0000-000000000022', lat: 4.8000, lng: -75.7400, radiusKm: 6.0 }, // Cerritos
      { zoneId: '00000000-0000-0000-0000-000000000023', lat: 4.8150, lng: -75.6950, radiusKm: 3.0 }  // Centro
    ]
  }
];

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Resolver implementation for GastroSync location resolution.
 * Matches GPS coordinates against registered active cities and zones.
 */
export function resolveLocationFromCoords(
  latitude: number,
  longitude: number,
  activeCities: City[],
  activeZones: Zone[]
): ResolvedLocationResult {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      status: 'unavailable',
      message: 'Coordenadas GPS no válidas.'
    };
  }

  let closestCityMatch: { city: City; distance: number; center: CityBoundingCenter } | null = null;

  for (const center of PILOT_CITY_COORDINATES) {
    const cityObj = activeCities.find(c => c.id === center.cityId && c.isActive);
    if (!cityObj) continue;

    const dist = calculateHaversineDistance(latitude, longitude, center.lat, center.lng);
    if (dist <= center.radiusKm) {
      if (!closestCityMatch || dist < closestCityMatch.distance) {
        closestCityMatch = { city: cityObj, distance: dist, center };
      }
    }
  }

  if (!closestCityMatch) {
    return {
      status: 'out_of_coverage',
      message: 'Tu ubicación actual está fuera de las ciudades con cobertura activa.'
    };
  }

  // City match found, check for matching zone
  let matchedZoneId: string | undefined = undefined;
  if (closestCityMatch.center.zones) {
    let closestZoneDist = Infinity;
    for (const zCenter of closestCityMatch.center.zones) {
      const zoneObj = activeZones.find(z => z.id === zCenter.zoneId && z.isActive);
      if (!zoneObj) continue;

      const zDist = calculateHaversineDistance(latitude, longitude, zCenter.lat, zCenter.lng);
      if (zDist <= zCenter.radiusKm && zDist < closestZoneDist) {
        closestZoneDist = zDist;
        matchedZoneId = zCenter.zoneId;
      }
    }
  }

  return {
    cityId: closestCityMatch.city.id,
    zoneId: matchedZoneId,
    status: 'resolved',
    confidence: matchedZoneId ? 'exact_zone' : 'city_default',
    message: `Ubicación detectada en ${closestCityMatch.city.name}${matchedZoneId ? ' (Zona identificada)' : ''}.`
  };
}
