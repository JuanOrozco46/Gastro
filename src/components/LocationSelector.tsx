import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContextObject';
import { MapPin, ChevronDown, Navigation, AlertCircle, RefreshCw, Info } from 'lucide-react';

interface LocationSelectorProps {
  variant?: 'compact' | 'full' | 'header';
  className?: string;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  variant = 'full',
  className = ''
}) => {
  const context = useContext(AppContext);
  const [showPrivacyPrompt, setShowPrivacyPrompt] = useState(false);

  if (!context) {
    return null;
  }

  const {
    cities,
    zones,
    tenants,
    selectedCityId,
    selectedZoneId,
    userLocationState,
    locationPreference,
    setSelectedCity,
    setSelectedZone,
    requestUserLocation,
    switchToManualLocation
  } = context;

  const activeCity = cities.find(c => c.id === selectedCityId) || cities[0];
  const cityZones = zones.filter(z => z.cityId === selectedCityId && z.isActive);
  const activeZone = cityZones.find(z => z.id === selectedZoneId);

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCityId = e.target.value;
    if (newCityId && newCityId !== selectedCityId) {
      switchToManualLocation();
      setSelectedCity(newCityId);
    }
  };

  const handleZoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newZoneId = e.target.value;
    switchToManualLocation();
    setSelectedZone(newZoneId === 'all' ? null : newZoneId);
  };

  const handleGPSClick = () => {
    if (locationPreference === 'manual' && userLocationState.permission === 'unknown') {
      setShowPrivacyPrompt(true);
    } else {
      setShowPrivacyPrompt(false);
      requestUserLocation();
    }
  };

  const confirmGPSRequest = () => {
    setShowPrivacyPrompt(false);
    requestUserLocation();
  };

  if (variant === 'compact' || variant === 'header') {
    return (
      <div className={`gf-location-selector-compact ${className}`}>
        <div className="gs-loc-compact-text">
          <MapPin size={16} />
          <span>{activeCity ? activeCity.name : 'Seleccionar ciudad'}</span>
          {activeZone && <span className="gs-loc-compact-zone">· {activeZone.name}</span>}
        </div>
        <button
          type="button"
          onClick={handleGPSClick}
          aria-label="Usar mi ubicación GPS"
          title="Detectar ubicación automáticamente"
          className={`gs-loc-compact-gps-btn ${locationPreference === 'gps' ? 'is-active' : ''}`}
        >
          <Navigation size={14} className={userLocationState.isResolving ? 'animate-spin' : ''} />
        </button>
      </div>
    );
  }

  return (
    <div className={`gf-location-selector ${className}`}>
      {/* Privacy Explanation Modal / Banner */}
      {showPrivacyPrompt && (
        <div
          className="gs-loc-privacy-banner"
          role="region"
          aria-label="Aviso de privacidad de ubicación"
        >
          <div className="gs-loc-privacy-row">
            <Info size={18} className="gs-loc-privacy-icon" />
            <span>
              Usaremos tu ubicación aproximada para mostrarte restaurantes y publicaciones cercanos. Puedes elegir tu ciudad manualmente en cualquier momento.
            </span>
          </div>
          <div className="gs-loc-privacy-actions">
            <button
              type="button"
              className="btn btn-outline gs-loc-privacy-btn"
              onClick={() => setShowPrivacyPrompt(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary gs-loc-privacy-btn"
              onClick={confirmGPSRequest}
            >
              Permitir GPS
            </button>
          </div>
        </div>
      )}

      <div className="gs-loc-main-row">
        <div className="gs-loc-status-group">
          <div className={`gs-loc-icon-badge ${userLocationState.permission === 'granted' ? 'is-granted' : ''}`}>
            {userLocationState.isResolving ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : userLocationState.permission === 'granted' ? (
              <Navigation size={18} />
            ) : (
              <MapPin size={20} />
            )}
          </div>
          <div>
            <span className="gs-loc-eyebrow">
              {locationPreference === 'gps' ? 'Ubicación GPS' : 'Ubicación Manual'}
            </span>
            <span className="gs-loc-active-name">
              {activeCity ? activeCity.name : 'Cargando ciudades...'}
              {activeZone ? ` · Zona ${activeZone.name}` : ' · Todas las zonas'}
            </span>
          </div>
        </div>

        <div className="gs-loc-controls-group">
          {/* GPS Button */}
          <button
            type="button"
            onClick={handleGPSClick}
            disabled={userLocationState.isResolving}
            aria-label="Usar mi ubicación GPS"
            className={`gs-loc-gps-action-btn ${locationPreference === 'gps' ? 'is-active' : ''}`}
          >
            <Navigation size={14} className={userLocationState.isResolving ? 'animate-spin' : ''} />
            <span>{userLocationState.isResolving ? 'Detectando...' : 'Usar mi ubicación'}</span>
          </button>

          {/* City Selector */}
          <div className="gs-loc-select-wrap">
            <select
              value={selectedCityId}
              onChange={handleCityChange}
              aria-label="Seleccionar ciudad manualmente"
              className="gs-loc-select"
            >
              {cities.map(city => {
                const cityCount = tenants.filter(t => t.status === 'active' && t.cityId === city.id).length;
                return (
                  <option key={city.id} value={city.id}>
                    {city.name}{cityCount > 0 ? ` (${cityCount} ${cityCount === 1 ? 'local' : 'locales'})` : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown size={14} className="gs-loc-select-chevron" />
          </div>

          {/* Zone Selector */}
          {cityZones.length > 0 && (
            <div className="gs-loc-select-wrap">
              <select
                value={selectedZoneId || 'all'}
                onChange={handleZoneChange}
                aria-label="Seleccionar zona manualmente"
                className="gs-loc-select"
              >
                <option value="all">Todas las zonas</option>
                {cityZones.map(zone => (
                  <option key={zone.id} value={zone.id}>
                    Zona {zone.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="gs-loc-select-chevron" />
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Location Status Banner (Live region for accessibility) */}
      <div aria-live="polite">
        {userLocationState.isResolving && (
          <div className="gs-loc-live-feedback resolving">
            <RefreshCw size={12} className="animate-spin" />
            <span>Detectando ubicación GPS...</span>
          </div>
        )}

        {userLocationState.permission === 'denied' && (
          <div className="gs-loc-live-feedback denied">
            <div className="gs-loc-live-msg">
              <AlertCircle size={14} />
              <span>Permiso de ubicación bloqueado. Puedes seleccionar tu ciudad manualmente.</span>
            </div>
            <button
              type="button"
              onClick={switchToManualLocation}
              className="gs-loc-manual-link"
            >
              Elegir manualmente
            </button>
          </div>
        )}

        {userLocationState.error && userLocationState.permission !== 'denied' && (
          <div className="gs-loc-live-feedback warning">
            <div className="gs-loc-live-msg">
              <AlertCircle size={14} />
              <span>{userLocationState.error}</span>
            </div>
            <button
              type="button"
              onClick={switchToManualLocation}
              className="gs-loc-manual-link"
            >
              Elegir manualmente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
