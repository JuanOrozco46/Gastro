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

// Known coordinates for Colombian cities and gastronomic zones
const PILOT_CITY_COORDINATES: CityBoundingCenter[] = [
  {
    cityId: '00000000-0000-0000-0000-000000000001', // Armenia
    lat: 4.5339,
    lng: -75.6811,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000011', lat: 4.5320, lng: -75.6700, radiusKm: 3.5 },
      { zoneId: '00000000-0000-0000-0000-000000000012', lat: 4.5550, lng: -75.6550, radiusKm: 4.0 },
      { zoneId: '00000000-0000-0000-0000-000000000013', lat: 4.5100, lng: -75.6900, radiusKm: 4.0 }
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000002', // Pereira
    lat: 4.8133,
    lng: -75.6961,
    radiusKm: 20.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000021', lat: 4.8080, lng: -75.6900, radiusKm: 3.5 },
      { zoneId: '00000000-0000-0000-0000-000000000022', lat: 4.8000, lng: -75.7400, radiusKm: 6.0 },
      { zoneId: '00000000-0000-0000-0000-000000000023', lat: 4.8150, lng: -75.6950, radiusKm: 3.0 }
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000003', // Bogotá D.C.
    lat: 4.6533,
    lng: -74.0836,
    radiusKm: 32.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000031', lat: 4.6660, lng: -74.0530, radiusKm: 5.5 }, // Chapinero / Zona T
      { zoneId: '00000000-0000-0000-0000-000000000032', lat: 4.7110, lng: -74.0350, radiusKm: 8.0 }, // Usaquén / Norte
      { zoneId: '00000000-0000-0000-0000-000000000033', lat: 4.6200, lng: -74.0720, radiusKm: 6.0 }, // Centro / Teusaquillo
      { zoneId: '00000000-0000-0000-0000-000000000034', lat: 4.6580, lng: -74.1150, radiusKm: 7.5 }, // Occidente / Salitre
      { zoneId: '00000000-0000-0000-0000-000000000035', lat: 4.5750, lng: -74.1250, radiusKm: 8.0 }  // Sur
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000004', // Medellín
    lat: 6.2442,
    lng: -75.5812,
    radiusKm: 25.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000041', lat: 6.2088, lng: -75.5658, radiusKm: 4.5 }, // El Poblado
      { zoneId: '00000000-0000-0000-0000-000000000042', lat: 6.2464, lng: -75.5950, radiusKm: 4.5 }, // Laureles / Estadio
      { zoneId: '00000000-0000-0000-0000-000000000043', lat: 6.1660, lng: -75.5920, radiusKm: 6.5 }, // Envigado / Sabaneta
      { zoneId: '00000000-0000-0000-0000-000000000044', lat: 6.2350, lng: -75.5800, radiusKm: 5.5 }  // Centro / Belén
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000005', // Cali
    lat: 3.4516,
    lng: -76.5320,
    radiusKm: 22.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000051', lat: 3.4620, lng: -76.5330, radiusKm: 4.5 }, // Granada / Norte
      { zoneId: '00000000-0000-0000-0000-000000000052', lat: 3.3680, lng: -76.5350, radiusKm: 6.0 }, // Ciudad Jardín / Sur
      { zoneId: '00000000-0000-0000-0000-000000000053', lat: 3.4480, lng: -76.5410, radiusKm: 3.5 }, // El Peñón / San Antonio
      { zoneId: '00000000-0000-0000-0000-000000000054', lat: 3.4380, lng: -76.5150, radiusKm: 5.5 }  // Centro / Oriente
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000006', // Barranquilla
    lat: 10.9685,
    lng: -74.7813,
    radiusKm: 20.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000061', lat: 11.0010, lng: -74.8050, radiusKm: 4.5 }, // Norte / Alto Prado
      { zoneId: '00000000-0000-0000-0000-000000000062', lat: 11.0150, lng: -74.8250, radiusKm: 4.5 }, // Buenavista
      { zoneId: '00000000-0000-0000-0000-000000000063', lat: 10.9650, lng: -74.7850, radiusKm: 6.0 }  // Centro / Sur
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000007', // Cartagena
    lat: 10.3910,
    lng: -75.4794,
    radiusKm: 20.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000071', lat: 10.4236, lng: -75.5476, radiusKm: 3.0 }, // Centro Histórico
      { zoneId: '00000000-0000-0000-0000-000000000072', lat: 10.4025, lng: -75.5550, radiusKm: 3.5 }, // Bocagrande
      { zoneId: '00000000-0000-0000-0000-000000000073', lat: 10.4150, lng: -75.5300, radiusKm: 6.0 }  // Manga / Norte
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000008', // Bucaramanga
    lat: 7.1193,
    lng: -73.1227,
    radiusKm: 20.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000081', lat: 7.1180, lng: -73.1100, radiusKm: 3.5 }, // Cabecera
      { zoneId: '00000000-0000-0000-0000-000000000082', lat: 7.0680, lng: -73.1050, radiusKm: 5.0 }, // Cañaveral
      { zoneId: '00000000-0000-0000-0000-000000000083', lat: 7.1150, lng: -73.1280, radiusKm: 4.5 }  // Centro
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000009', // Manizales
    lat: 5.0689,
    lng: -75.5174,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000091', lat: 5.0560, lng: -75.4860, radiusKm: 3.5 }, // El Cable / Milán
      { zoneId: '00000000-0000-0000-0000-000000000092', lat: 5.0600, lng: -75.4950, radiusKm: 3.0 }, // Palermo
      { zoneId: '00000000-0000-0000-0000-000000000093', lat: 5.0690, lng: -75.5180, radiusKm: 4.0 }  // Centro / Chipre
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000010', // Ibagué
    lat: 4.4389,
    lng: -75.2322,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000101', lat: 4.4350, lng: -75.2020, radiusKm: 5.0 }, // Milla de Oro
      { zoneId: '00000000-0000-0000-0000-000000000102', lat: 4.4420, lng: -75.2380, radiusKm: 4.5 }  // Centro
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000011', // Santa Marta
    lat: 11.2408,
    lng: -74.1990,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000111', lat: 11.2420, lng: -74.2120, radiusKm: 4.0 }, // Centro Histórico
      { zoneId: '00000000-0000-0000-0000-000000000112', lat: 11.2020, lng: -74.2260, radiusKm: 5.5 }  // El Rodadero
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000012', // Villavicencio
    lat: 4.1420,
    lng: -73.6266,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000121', lat: 4.1320, lng: -73.6380, radiusKm: 4.5 }, // El Buque
      { zoneId: '00000000-0000-0000-0000-000000000122', lat: 4.1480, lng: -73.6290, radiusKm: 4.5 }  // Centro
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000013', // Cúcuta
    lat: 7.8939,
    lng: -72.5078,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000131', lat: 7.8860, lng: -72.4960, radiusKm: 4.5 }, // Caobos
      { zoneId: '00000000-0000-0000-0000-000000000132', lat: 7.8940, lng: -72.5080, radiusKm: 4.5 }  // Centro
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000014', // Pasto
    lat: 1.2136,
    lng: -77.2811,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000141', lat: 1.2240, lng: -77.2830, radiusKm: 4.0 }, // Av. Los Estudiantes
      { zoneId: '00000000-0000-0000-0000-000000000142', lat: 1.2130, lng: -77.2790, radiusKm: 4.5 }  // Centro
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000015', // Montería
    lat: 8.7479,
    lng: -75.8814,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000151', lat: 8.7650, lng: -75.8680, radiusKm: 4.5 }, // La Castellana
      { zoneId: '00000000-0000-0000-0000-000000000152', lat: 8.7510, lng: -75.8820, radiusKm: 4.5 }  // Centro
    ]
  },
  {
    cityId: '00000000-0000-0000-0000-000000000016', // Neiva
    lat: 2.9273,
    lng: -75.2819,
    radiusKm: 18.0,
    zones: [
      { zoneId: '00000000-0000-0000-0000-000000000161', lat: 2.9310, lng: -75.2800, radiusKm: 4.0 }, // Altico / Quirinal
      { zoneId: '00000000-0000-0000-0000-000000000162', lat: 2.9420, lng: -75.2880, radiusKm: 5.0 }  // Centro / Norte
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
