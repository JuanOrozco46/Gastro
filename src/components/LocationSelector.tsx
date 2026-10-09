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
      <div className={`gf-location-selector-compact ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 700, fontSize: '0.88rem' }}>
          <MapPin size={16} />
          <span>{activeCity ? activeCity.name : 'Seleccionar ciudad'}</span>
          {activeZone && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {activeZone.name}</span>}
        </div>
        <button
          type="button"
          onClick={handleGPSClick}
          aria-label="Usar mi ubicación GPS"
          title="Detectar ubicación automáticamente"
          style={{
            background: locationPreference === 'gps' ? 'var(--primary-glow, rgba(239, 68, 68, 0.15))' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            padding: '4px',
            color: 'var(--primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Navigation size={14} className={userLocationState.isResolving ? 'animate-spin' : ''} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`gf-location-selector ${className}`}
      style={{
        background: 'var(--bg-card, #ffffff)',
        border: '1px solid var(--border-color, #E5E7EB)',
        borderRadius: '16px',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}
    >
      {/* Privacy Explanation Modal / Banner */}
      {showPrivacyPrompt && (
        <div
          style={{
            background: 'var(--primary-glass-border, rgba(239, 68, 68, 0.08))',
            border: '1px solid var(--primary, #EF4444)',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '0.83rem',
            color: 'var(--text-main, #111827)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
          role="region"
          aria-label="Aviso de privacidad de ubicación"
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <Info size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
            <span>
              Usaremos tu ubicación aproximada para mostrarte restaurantes y publicaciones cercanos. Puedes elegir tu ciudad manualmente en cualquier momento.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '8px' }}
              onClick={() => setShowPrivacyPrompt(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: '8px', fontWeight: 700 }}
              onClick={confirmGPSRequest}
            >
              Permitir GPS
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: userLocationState.permission === 'granted'
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(239, 68, 68, 0.1)',
              color: userLocationState.permission === 'granted' ? '#10B981' : 'var(--primary, #EF4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {userLocationState.isResolving ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : userLocationState.permission === 'granted' ? (
              <Navigation size={18} />
            ) : (
              <MapPin size={20} />
            )}
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #6B7280)', fontWeight: 700, display: 'block' }}>
              {locationPreference === 'gps' ? 'Ubicación GPS' : 'Ubicación Manual'}
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main, #111827)' }}>
              {activeCity ? activeCity.name : 'Cargando ciudades...'}
              {activeZone ? ` · Zona ${activeZone.name}` : ' · Todas las zonas'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* GPS Button */}
          <button
            type="button"
            onClick={handleGPSClick}
            disabled={userLocationState.isResolving}
            aria-label="Usar mi ubicación GPS"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: 700,
              border: locationPreference === 'gps'
                ? '1px solid var(--primary, #EF4444)'
                : '1px solid var(--border-color, #E5E7EB)',
              background: locationPreference === 'gps'
                ? 'rgba(239, 68, 68, 0.08)'
                : 'var(--bg-subtle, #F3F4F6)',
              color: locationPreference === 'gps'
                ? 'var(--primary, #EF4444)'
                : 'var(--text-main, #111827)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Navigation size={14} className={userLocationState.isResolving ? 'animate-spin' : ''} />
            <span>{userLocationState.isResolving ? 'Detectando...' : 'Usar mi ubicación'}</span>
          </button>

          {/* City Selector */}
          <div style={{ position: 'relative' }}>
            <select
              value={selectedCityId}
              onChange={handleCityChange}
              aria-label="Seleccionar ciudad manualmente"
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                background: 'var(--bg-subtle, #F3F4F6)',
                border: '1px solid var(--border-color, #E5E7EB)',
                borderRadius: '10px',
                padding: '8px 32px 8px 12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--text-main, #111827)',
                cursor: 'pointer',
                outline: 'none'
              }}
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
            <ChevronDown
              size={14}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--text-muted, #6B7280)'
              }}
            />
          </div>

          {/* Zone Selector */}
          {cityZones.length > 0 && (
            <div style={{ position: 'relative' }}>
              <select
                value={selectedZoneId || 'all'}
                onChange={handleZoneChange}
                aria-label="Seleccionar zona manualmente"
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: 'var(--bg-subtle, #F3F4F6)',
                  border: '1px solid var(--border-color, #E5E7EB)',
                  borderRadius: '10px',
                  padding: '8px 32px 8px 12px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-main, #111827)',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="all">🇨🇴 Todas las zonas</option>
                {cityZones.map(zone => (
                  <option key={zone.id} value={zone.id}>
                    Zona {zone.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--text-muted, #6B7280)'
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Location Status Banner (Live region for accessibility) */}
      <div aria-live="polite">
        {userLocationState.isResolving && (
          <div style={{ fontSize: '0.78rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <RefreshCw size={12} className="animate-spin" />
            <span>Detectando ubicación GPS...</span>
          </div>
        )}

        {userLocationState.permission === 'denied' && (
          <div style={{ fontSize: '0.78rem', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>Permiso de ubicación bloqueado. Puedes seleccionar tu ciudad manualmente.</span>
            </div>
            <button
              type="button"
              onClick={switchToManualLocation}
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Elegir manualmente
            </button>
          </div>
        )}

        {userLocationState.error && userLocationState.permission !== 'denied' && (
          <div style={{ fontSize: '0.78rem', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>{userLocationState.error}</span>
            </div>
            <button
              type="button"
              onClick={switchToManualLocation}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Elegir manualmente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
