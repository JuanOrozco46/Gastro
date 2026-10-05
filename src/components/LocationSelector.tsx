import React, { useContext } from 'react';
import { AppContext } from '../context/AppContextObject';
import { MapPin, ChevronDown } from 'lucide-react';

interface LocationSelectorProps {
  variant?: 'compact' | 'full' | 'header';
  className?: string;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  variant = 'full',
  className = ''
}) => {
  const context = useContext(AppContext);

  if (!context) {
    return null;
  }

  const {
    cities,
    zones,
    selectedCityId,
    selectedZoneId,
    setSelectedCity,
    setSelectedZone
  } = context;

  const activeCity = cities.find(c => c.id === selectedCityId) || cities[0];
  const cityZones = zones.filter(z => z.cityId === selectedCityId && z.isActive);
  const activeZone = cityZones.find(z => z.id === selectedZoneId);

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCityId = e.target.value;
    if (newCityId && newCityId !== selectedCityId) {
      setSelectedCity(newCityId);
    }
  };

  const handleZoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newZoneId = e.target.value;
    setSelectedZone(newZoneId === 'all' ? null : newZoneId);
  };

  if (variant === 'compact' || variant === 'header') {
    return (
      <div className={`gf-location-selector-compact ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 700, fontSize: '0.88rem' }}>
          <MapPin size={16} />
          <span>{activeCity ? activeCity.name : 'Seleccionar ciudad'}</span>
          {activeZone && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {activeZone.name}</span>}
        </div>
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
        padding: '12px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--primary, #EF4444)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <MapPin size={20} />
        </div>
        <div>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #6B7280)', fontWeight: 700, display: 'block' }}>
            Ubicación
          </span>
          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main, #111827)' }}>
            {activeCity ? activeCity.name : 'Cargando ciudades...'}
            {activeZone ? ` · Zona ${activeZone.name}` : ' · Todas las zonas'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* City Selector */}
        <div style={{ position: 'relative' }}>
          <select
            value={selectedCityId}
            onChange={handleCityChange}
            aria-label="Seleccionar ciudad"
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
            {cities.map(city => (
              <option key={city.id} value={city.id}>
                {city.name}
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

        {/* Zone Selector */}
        {cityZones.length > 0 && (
          <div style={{ position: 'relative' }}>
            <select
              value={selectedZoneId || 'all'}
              onChange={handleZoneChange}
              aria-label="Seleccionar zona"
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
  );
};
