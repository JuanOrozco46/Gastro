import { useState } from 'react';
import type { City, Zone, UserLocationState } from '../types';
import { fetchLiveCities, fetchLiveZones } from '../services/supabaseDataService';
import { resolveLocationFromCoords } from '../services/locationResolver';
import { DEFAULT_CITIES, DEFAULT_ZONES } from './defaultData';

/**
 * Slice de ubicación: ciudades, zonas, selección persistida y detección GPS.
 * Autocontenida — no depende de auth, carrito ni pedidos.
 */
export function useLocationSlice() {
  const [cities, setCities] = useState<City[]>(DEFAULT_CITIES);
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);

  const [selectedCityId, setSelectedCityIdState] = useState<string>(() => {
    try {
      const savedCity = localStorage.getItem('gs_selected_city_v1');
      if (savedCity && savedCity.trim()) {
        return savedCity;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CITIES[0].id;
  });

  const [selectedZoneId, setSelectedZoneIdState] = useState<string | null>(() => {
    try {
      const savedZone = localStorage.getItem('gs_selected_zone_v1');
      if (savedZone && savedZone !== 'null' && savedZone.trim()) {
        return savedZone;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const setSelectedCity = (cityId: string) => {
    setSelectedCityIdState(cityId);
    try {
      localStorage.setItem('gs_selected_city_v1', cityId);
    } catch { /* ignore */ }

    setSelectedZoneIdState(prevZoneId => {
      if (!prevZoneId) return null;
      const zoneBelongs = zones.some(z => z.id === prevZoneId && z.cityId === cityId && z.isActive);
      if (!zoneBelongs) {
        try { localStorage.removeItem('gs_selected_zone_v1'); } catch { /* ignore */ }
        return null;
      }
      return prevZoneId;
    });
  };

  const setSelectedZone = (zoneId: string | null) => {
    setSelectedZoneIdState(zoneId);
    try {
      if (zoneId) {
        localStorage.setItem('gs_selected_zone_v1', zoneId);
      } else {
        localStorage.removeItem('gs_selected_zone_v1');
      }
    } catch { /* ignore */ }
  };

  const refreshCities = async () => {
    const liveCities = await fetchLiveCities();
    if (liveCities.length > 0) {
      setCities(liveCities);
      setSelectedCityIdState(prev => {
        const exists = liveCities.some(c => c.id === prev && c.isActive);
        if (exists) return prev;
        const fallback = liveCities[0].id;
        try { localStorage.setItem('gs_selected_city_v1', fallback); } catch {}
        return fallback;
      });
    }
  };

  const refreshZones = async (cityId?: string) => {
    const liveZones = await fetchLiveZones(cityId);
    if (liveZones.length > 0) {
      setZones(prev => {
        const otherZones = prev.filter(z => cityId ? z.cityId !== cityId : false);
        return [...otherZones, ...liveZones];
      });
    }
  };

  const [locationPreference, setLocationPreference] = useState<'gps' | 'manual'>(() => {
    try {
      const saved = localStorage.getItem('gs_location_preference_v1');
      if (saved === 'gps' || saved === 'manual') return saved;
    } catch {}
    return 'manual';
  });

  const [userLocationState, setUserLocationState] = useState<UserLocationState>({
    permission: 'unknown',
    isResolving: false
  });

  const switchToManualLocation = () => {
    setLocationPreference('manual');
    try {
      localStorage.setItem('gs_location_preference_v1', 'manual');
    } catch { /* ignore */ }
    setUserLocationState(prev => ({ ...prev, isResolving: false }));
  };

  const clearUserLocation = () => {
    setUserLocationState({
      permission: 'unknown',
      isResolving: false
    });
  };

  const resolveCityFromCoordinates = async (latitude: number, longitude: number): Promise<boolean> => {
    const result = resolveLocationFromCoords(latitude, longitude, cities, zones);
    if (result.status === 'resolved' && result.cityId) {
      setSelectedCity(result.cityId);
      if (result.zoneId) {
        setSelectedZone(result.zoneId);
      }
      setUserLocationState(prev => ({
        ...prev,
        cityId: result.cityId,
        zoneId: result.zoneId,
        error: undefined
      }));
      return true;
    } else {
      setUserLocationState(prev => ({
        ...prev,
        error: result.message
      }));
      return false;
    }
  };

  const requestUserLocation = async (): Promise<void> => {
    setLocationPreference('gps');
    try {
      localStorage.setItem('gs_location_preference_v1', 'gps');
    } catch { /* ignore */ }

    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      setUserLocationState({
        permission: 'unavailable',
        isResolving: false,
        error: 'Tu navegador no soporta geolocalización por GPS.'
      });
      return;
    }

    setUserLocationState(prev => ({
      ...prev,
      permission: 'prompt',
      isResolving: true,
      error: undefined
    }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const resolution = resolveLocationFromCoords(latitude, longitude, cities, zones);

        if (resolution.status === 'resolved' && resolution.cityId) {
          setSelectedCity(resolution.cityId);
          if (resolution.zoneId) {
            setSelectedZone(resolution.zoneId);
          }
          setUserLocationState({
            permission: 'granted',
            latitude,
            longitude,
            cityId: resolution.cityId,
            zoneId: resolution.zoneId,
            isResolving: false,
            error: undefined
          });
        } else {
          setUserLocationState({
            permission: 'granted',
            latitude,
            longitude,
            isResolving: false,
            error: resolution.message
          });
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setUserLocationState({
            permission: 'denied',
            isResolving: false,
            error: 'Permiso de ubicación denegado por el usuario.'
          });
        } else {
          setUserLocationState({
            permission: 'unavailable',
            isResolving: false,
            error: 'No se pudo obtener la ubicación GPS en este momento.'
          });
        }
      },
      {
        timeout: 10000,
        enableHighAccuracy: false
      }
    );
  };

  return {
    cities,
    setCities,
    zones,
    setZones,
    selectedCityId,
    selectedZoneId,
    /** Acceso crudo para validaciones de sincronización en AppContext. */
    setSelectedCityIdState,
    setSelectedZoneIdState,
    setSelectedCity,
    setSelectedZone,
    refreshCities,
    refreshZones,
    locationPreference,
    userLocationState,
    switchToManualLocation,
    clearUserLocation,
    resolveCityFromCoordinates,
    requestUserLocation
  };
}
