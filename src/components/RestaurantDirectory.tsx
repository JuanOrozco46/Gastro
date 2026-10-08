import React, { useState, useMemo } from 'react';
import { useApp } from '../context/useApp';
import type { Tenant } from '../types';
import { resolveTenantBannerUrl, resolveTenantLogoUrl, getCategoryFallbackBanner } from '../utils/tenantHelpers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Search, Star, MapPin, Clock, ShoppingBag, Info, CheckCircle2,
  X, LayoutGrid, List, ShieldCheck, Flame, Plus, MessageSquare
} from 'lucide-react';

interface RestaurantDirectoryProps {
  selectedZone?: string;
  onSelectTenantAndGoToFeed: (slug: string) => void;
  onOpenTenantProfile?: (tenantId: string, initialTab?: 'menu' | 'content' | 'reviews' | 'info') => void;
}

export const RestaurantDirectory: React.FC<RestaurantDirectoryProps> = ({
  selectedZone,
  onSelectTenantAndGoToFeed,
  onOpenTenantProfile
}) => {
  const { tenants, products, posts, cities, zones, selectedCityId, selectedZoneId, addToCart, setCurrentTenantBySlug, isCatalogLoading, catalogError } = useApp();

  const activeCity = cities.find(c => c.id === selectedCityId) || cities[0];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [priceRange, setPriceRange] = useState<'all' | '$' | '$$' | '$$$'>('all');
  const [sortBy, setSortBy] = useState<'rating' | 'distance' | 'time'>('rating');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTenantForModal, setSelectedTenantForModal] = useState<Tenant | null>(null);
  const [brokenLogos, setBrokenLogos] = useState<Record<string, boolean>>({});
  const [brokenBanners, setBrokenBanners] = useState<Record<string, boolean>>({});

  // Extract unique categories from tenants
  const categories = useMemo(() => {
    const set = new Set(tenants.map(t => t.category));
    return ['Todas', ...Array.from(set)];
  }, [tenants]);

  // Filter & Sort logic
  const filteredTenants = useMemo(() => {
    const hasTenantsInActiveCity = activeCity
      ? tenants.some(t => t.status === 'active' && t.cityId === activeCity.id)
      : false;

    return tenants
      .filter(t => {
        if (t.status !== 'active') return false;
        if (activeCity && hasTenantsInActiveCity && t.cityId !== activeCity.id) return false;
        const zoneFilter = selectedZone || selectedZoneId;
        if (zoneFilter && zoneFilter !== 'all' && t.zoneId !== zoneFilter) {
          return false;
        }
        if (selectedCategory !== 'Todas' && t.category !== selectedCategory) {
          return false;
        }
        if (onlyOpen && !t.isOpen) {
          return false;
        }
        if (priceRange !== 'all' && t.priceRange !== priceRange) {
          return false;
        }
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const activeCity = cities.find(c => c.id === t.cityId);
          const zoneName = zones.find(z => z.id === t.zoneId)?.name.toLowerCase() || '';
          const cityName = activeCity?.name.toLowerCase() || '';

          const matchName = t.name.toLowerCase().includes(q);
          const matchCategory = t.category.toLowerCase().includes(q);
          const matchDesc = t.description?.toLowerCase().includes(q) ?? false;
          const matchAddress = t.address?.toLowerCase().includes(q) ?? false;
          const matchSpecialty = t.specialties?.some(s => s.toLowerCase().includes(q)) ?? false;
          const matchProduct = products.some(
            p => p.tenantId === t.id && p.name.toLowerCase().includes(q)
          );
          
          const qTerms = q.split(/\s+/).filter(term => term.length > 2);
          const matchZone = zoneName.includes(q) || qTerms.some(term => zoneName.includes(term));
          const matchCity = cityName.includes(q) || qTerms.some(term => cityName.includes(term));

          return matchName || matchCategory || matchDesc || matchAddress || matchSpecialty || matchProduct || matchZone || matchCity;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'distance') return a.distanceKm - b.distanceKm;
        if (sortBy === 'time') {
          const getMinTime = (timeStr?: string) => {
            if (!timeStr) return 99;
            const match = timeStr.match(/\d+/);
            return match ? parseInt(match[0], 10) : 99;
          };
          return getMinTime(a.deliveryTime) - getMinTime(b.deliveryTime);
        }
        return 0;
      });
  }, [tenants, products, selectedCategory, onlyOpen, priceRange, searchQuery, sortBy, selectedZone, selectedZoneId, activeCity, cities, zones]);

  // Tenant featured hero
  const featuredTenant = useMemo(() => {
    return tenants.find(t => t.status === 'active' && t.isOpen && t.rating >= 4.8) || tenants.find(t => t.status === 'active');
  }, [tenants]);

  // Get products for modal tenant
  const modalProducts = useMemo(() => {
    if (!selectedTenantForModal) return [];
    return products.filter(p => p.tenantId === selectedTenantForModal.id);
  }, [products, selectedTenantForModal]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="directory-container"
    >
      {/* Hero Banner Section */}
      <div 
        className="directory-hero"
        style={{
          background: 'linear-gradient(135deg, var(--glass-dark), rgba(30, 41, 59, 0.95))',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '32px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div className="directory-hero-content">
          <div className="directory-hero-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10B981' }}>
            <ShieldCheck size={16} /> PEDIDOS DIRECTOS · COMISIÓN JUSTA DEL 3%
          </div>
          <h2 className="directory-hero-title" style={{ fontFamily: "var(--font-heading)", fontWeight: 900 }}>
            Restaurantes en {activeCity ? activeCity.name : 'tu ciudad'}
          </h2>
          <p className="directory-hero-subtitle">
            Explora las cocinas independientes de tu ciudad. Tu compra apoya directamente al comercio local.
          </p>
          <div className="directory-hero-stats">
            <div className="hero-stat-item">
              <span className="stat-value">{tenants.length}</span>
              <span className="stat-label">Restaurantes</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat-item">
              <span className="stat-value">⭐ 4.8</span>
              <span className="stat-label">Calificación</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat-item">
              <span className="stat-value">3%</span>
              <span className="stat-label">Comisión</span>
            </div>
          </div>
        </div>

        {featuredTenant && !isCatalogLoading && !catalogError && (
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="hero-spotlight-card"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '24px'
            }}
          >
            <div className="spotlight-tag" style={{ color: 'var(--primary)' }}>
              <Flame size={15} /> Recomendado del Día
            </div>
            <div className="spotlight-body">
              <div className="spotlight-header">
                <span className="spotlight-emoji" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {resolveTenantLogoUrl(featuredTenant, posts, products) && !brokenLogos[featuredTenant.id] ? (
                    <img
                      src={resolveTenantLogoUrl(featuredTenant, posts, products)}
                      alt={featuredTenant.name}
                      style={{ width: '44px', height: '44px', borderRadius: '12px', objectFit: 'cover' }}
                      onError={() => setBrokenLogos(prev => ({ ...prev, [featuredTenant.id]: true }))}
                    />
                  ) : (
                    featuredTenant.logoEmoji || '🍽️'
                  )}
                </span>
                <div>
                  <h4 className="spotlight-title">{featuredTenant.name}</h4>
                  <span className="spotlight-sub">{featuredTenant.category} • {featuredTenant.address}</span>
                </div>
              </div>
              <p className="spotlight-desc">{featuredTenant.description}</p>
              <div className="spotlight-footer">
                <span className="spotlight-rating">
                  ⭐ {Number(featuredTenant.rating || 5).toFixed(1)}
                  {featuredTenant.reviewsCount ? ` (${featuredTenant.reviewsCount})` : ''}
                </span>
                <span className="spotlight-time">⏱️ {featuredTenant.deliveryTime || '20-30 min'}</span>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="btn btn-primary btn-sm"
                  style={{ borderRadius: '10px', fontWeight: 800 }}
                  onClick={() => {
                    setCurrentTenantBySlug(featuredTenant.slug);
                    if (onOpenTenantProfile) {
                      onOpenTenantProfile(featuredTenant.id, 'menu');
                    } else {
                      setSelectedTenantForModal(featuredTenant);
                    }
                  }}
                >
                  Ver Menú <ShoppingBag size={14} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div 
        className="directory-controls-card"
        style={{
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px'
        }}
      >
        {/* Search Bar & View Mode Toggles */}
        <div className="controls-row-top">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Buscar local, especialidad (ej. pizza, burger, sushi, taco)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="controls-right-group">
            {/* Sort Dropdown */}
            <div className="sort-wrapper">
              <span className="sort-label">Ordenar:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rating' | 'distance' | 'time')}
                className="sort-select"
              >
                <option value="rating">⭐ Mejor Valorados</option>
                <option value="distance">📍 Más Cercanos</option>
                <option value="time">⚡ Más Rápidos</option>
              </select>
            </div>

            {/* View Grid/List Buttons */}
            <div className="view-mode-tabs">
              <button
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Vista de Tarjetas"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="Vista de Lista Compacta"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Category Pills & Quick Filter Toggles */}
        <div className="controls-row-bottom">
          <div className="category-pills">
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'Todas' && '🍽️ '}
                {cat === 'Italiana' && '🍕 '}
                {cat === 'Hamburguesas' && '🍔 '}
                {cat === 'Típica' && '🥟 '}
                {cat === 'Asiática' && '🍣 '}
                {cat === 'Mexicana' && '🌮 '}
                {cat}
              </button>
            ))}
          </div>

          {/* Price Range Chips */}
          <div className="gf-filter-group" style={{ marginTop: '6px' }}>
            <span className="gf-filter-group-label">Precio</span>
            {(['all', '$', '$$', '$$$'] as const).map(p => (
              <button
                key={p}
                className={`dir-price-chip ${priceRange === p ? 'active' : ''}`}
                onClick={() => setPriceRange(p)}
              >
                {p === 'all' ? 'Todos' : p}
              </button>
            ))}
          </div>

          <div className="filter-switches">
            <button
              className={`toggle-filter-btn ${onlyOpen ? 'active' : ''}`}
              onClick={() => setOnlyOpen(!onlyOpen)}
            >
              <span className={`status-dot ${onlyOpen ? 'dot-open' : ''}`} />
              Solo Abiertos
            </button>
          </div>
        </div>

        {/* Results counter */}
        <div className="dir-results-count">
          <strong>{filteredTenants.length}</strong> restaurante{filteredTenants.length !== 1 ? 's' : ''} encontrado{filteredTenants.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Directory Content List/Grid */}
      {isCatalogLoading ? (
        <div 
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: 'var(--glass-light)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            color: 'var(--text-muted)'
          }}
        >
          <div className="gf-spinner" style={{ margin: '0 auto 1rem', width: '36px', height: '36px', border: '3px solid var(--primary-glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <h3 style={{ fontSize: '1.4rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
            Cargando el directorio...
          </h3>
          <p style={{ fontSize: '0.92rem' }}>Explorando las mejores cocinas independientes para ti.</p>
        </div>
      ) : catalogError ? (
        <div 
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: 'var(--glass-light)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '24px',
            color: 'var(--text-muted)'
          }}
        >
          <X size={54} style={{ color: '#EF4444', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.4rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
            No fue posible cargar los restaurantes
          </h3>
          <p style={{ fontSize: '0.92rem' }}>{catalogError}</p>
        </div>
      ) : tenants.length === 0 ? (
        <div className="directory-empty-state" style={{ background: 'var(--glass-light)', borderColor: 'var(--primary-glass-border)', color: 'var(--text-muted)', padding: '3.5rem 2rem' }}>
          <Store size={52} className="empty-icon" style={{ color: 'var(--primary)' }} />
          <h3 style={{ color: 'white', marginTop: '1rem', fontWeight: 900 }}>Aún no hay restaurantes registrados</h3>
          <p style={{ maxWidth: '460px', margin: '0.5rem auto 1.5rem', lineHeight: 1.5 }}>
            ¡Sé el primero en registrar tu restaurante! Empieza a recibir pedidos directos y gestiona tu menú digital.
          </p>
          <button
            className="btn btn-primary"
            style={{ borderRadius: '12px', padding: '12px 24px', fontWeight: 900 }}
            onClick={() => {
              const btn = document.querySelector('.gf-partner-apply-btn') as HTMLButtonElement | null;
              if (btn) btn.click();
            }}
          >
            🤝 Registrar Mi Restaurante Ahora
          </button>
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="directory-empty-state" style={{ background: 'var(--glass-light)', borderColor: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)' }}>
          <Store size={48} className="empty-icon" style={{ color: 'var(--primary)' }} />
          <h3 style={{ color: 'white', marginTop: '1rem' }}>No encontramos restaurantes con ese criterio</h3>
          <p>Intenta buscando con otro término o seleccionando la categoría "Todas".</p>
          <button
            className="btn btn-outline"
            style={{ marginTop: '1rem', borderRadius: '12px' }}
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('Todas');
              setOnlyOpen(false);
              setPriceRange('all');
            }}
          >
            Restablecer Filtros
          </button>
        </div>
      ) : (
        <motion.div 
          layout
          className={viewMode === 'grid' ? 'tenant-grid' : 'tenant-list'}
        >
          <AnimatePresence>
            {filteredTenants.map(tenant => {
              const resolvedBanner = brokenBanners[tenant.id]
                ? getCategoryFallbackBanner(tenant.category)
                : resolveTenantBannerUrl(tenant, posts, products);
              const resolvedLogo = !brokenLogos[tenant.id]
                ? resolveTenantLogoUrl(tenant, posts, products)
                : undefined;

              return (
              <motion.div 
                layout
                key={tenant.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className={`tenant-card ${!tenant.isOpen ? 'tenant-closed' : ''}`}
                style={{
                  background: 'var(--glass-medium)',
                  backdropFilter: 'blur(20px)',
                  borderColor: 'rgba(255, 255, 255, 0.09)',
                  borderRadius: '24px'
                }}
              >
                {/* Card Banner Image Header */}
                <div className="tenant-card-header">
                  <div className="tenant-banner-frame">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={resolvedBanner}
                      alt={tenant.name}
                      className="tenant-banner-img"
                      onError={() => {
                        if (!brokenBanners[tenant.id]) {
                          setBrokenBanners(prev => ({ ...prev, [tenant.id]: true }));
                        }
                      }}
                    />
                    <div className="tenant-header-overlay" />
                  </div>

                  {/* Status Badge */}
                  <div className="tenant-header-badges-left">
                    <span className={`tenant-status-pill ${tenant.isOpen ? 'open' : 'closed'}`}>
                      <span className="pulse-dot" />
                      {tenant.isOpen ? 'ABIERTO' : 'CERRADO'}
                    </span>
                    {tenant.promotionBadge && (
                      <span className="tenant-promo-pill">
                        {tenant.promotionBadge}
                      </span>
                    )}
                  </div>

                  {/* Distance & Price Badges */}
                  <div className="tenant-header-badges-right">
                    <span className="header-info-chip">
                      <MapPin size={12} /> {tenant.distanceKm} km
                    </span>
                    {tenant.priceRange && (
                      <span className="header-info-chip price-chip">
                        {tenant.priceRange}
                      </span>
                    )}
                  </div>

                  {/* Logo Emoji Floating Avatar */}
                  <div className="tenant-logo-avatar" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {resolvedLogo ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={resolvedLogo}
                        alt={tenant.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => setBrokenLogos(prev => ({ ...prev, [tenant.id]: true }))}
                      />
                    ) : (
                      <span>{tenant.logoEmoji || '🏪'}</span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="tenant-card-body">
                  <div className="tenant-title-row">
                    <div>
                      <h3 className="tenant-name" style={{ color: 'white', fontWeight: 900 }}>
                        {tenant.name}
                        <span title="Local Verificado"><CheckCircle2 size={16} className="verified-icon" /></span>
                      </h3>
                      <span className="tenant-category-tag">{tenant.category}</span>
                    </div>

                    <button
                      type="button"
                      className="tenant-rating-box"
                      style={{ cursor: 'pointer', border: '1px solid rgba(245, 158, 11, 0.28)' }}
                      title="Ver reseñas del restaurante"
                      onClick={() => {
                        setCurrentTenantBySlug(tenant.slug);
                        if (onOpenTenantProfile) {
                          onOpenTenantProfile(tenant.id, 'reviews');
                        } else {
                          setSelectedTenantForModal(tenant);
                        }
                      }}
                    >
                      <Star size={14} className="star-icon" fill="#F59E0B" />
                      <span className="rating-num" style={{ color: '#F59E0B' }}>
                        {Number(tenant.rating || 5).toFixed(1)}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        ({tenant.reviewsCount || 0})
                      </span>
                    </button>
                  </div>

                  <p className="tenant-description">
                    {tenant.description || 'Restaurante local aliado ofreciendo los mejores platos tradicionales.'}
                  </p>

                  {/* Specs Pill Row */}
                  <div className="tenant-specs-row">
                    <span className="spec-item">
                      <Clock size={14} /> {tenant.deliveryTime || '20-30 min'}
                    </span>
                    <span className="spec-dot">•</span>
                    <span className="spec-item">
                      📍 {tenant.address || 'Zona Local'}
                    </span>
                    {tenant.minOrder && (
                      <>
                        <span className="spec-dot">•</span>
                        <span className="spec-item">
                          Min. ${(tenant.minOrder / 1000).toFixed(0)}k
                        </span>
                      </>
                    )}
                  </div>

                  {/* Specialty Tags */}
                  {tenant.specialties && tenant.specialties.length > 0 && (
                    <div className="tenant-specialties-chips">
                      {tenant.specialties.map((spec, i) => (
                        <span key={i} className="specialty-chip" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                          {spec}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer Buttons */}
                  <div className="tenant-card-actions">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="btn btn-primary tenant-btn-primary"
                      style={{ borderRadius: '12px', fontWeight: 800 }}
                      onClick={() => {
                        setCurrentTenantBySlug(tenant.slug);
                        if (onOpenTenantProfile) {
                          onOpenTenantProfile(tenant.id, 'menu');
                        } else {
                          setSelectedTenantForModal(tenant);
                        }
                      }}
                    >
                      <ShoppingBag size={16} /> Ver Local & Menú
                    </motion.button>

                    <button
                      type="button"
                      className="btn btn-outline tenant-btn-info"
                      style={{ borderRadius: '12px', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#FBBF24', gap: '5px', padding: '0 12px' }}
                      onClick={() => {
                        setCurrentTenantBySlug(tenant.slug);
                        if (onOpenTenantProfile) {
                          onOpenTenantProfile(tenant.id, 'reviews');
                        } else {
                          setSelectedTenantForModal(tenant);
                        }
                      }}
                      title="Ver calificaciones y reseñas"
                    >
                      <MessageSquare size={15} />
                      <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>Reseñas</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline tenant-btn-info"
                      style={{ borderRadius: '12px', borderColor: 'rgba(255,255,255,0.15)', color: 'white' }}
                      onClick={() => {
                        if (onOpenTenantProfile) {
                          onOpenTenantProfile(tenant.id, 'info');
                        } else {
                          setSelectedTenantForModal(tenant);
                        }
                      }}
                      title="Ver detalles y horarios del comercio"
                    >
                      <Info size={16} />
                    </button>
                  </div>
                </div>

              </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Modal Popup with Restaurant Details & Menu */}
      {selectedTenantForModal && (
        <div className="modal-backdrop" onClick={() => setSelectedTenantForModal(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="modal-content tenant-modal" 
            style={{
              background: 'var(--glass-dark)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '28px',
              color: 'white'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-banner-header">
              <img loading="lazy" decoding="async"
                src={resolveTenantBannerUrl(selectedTenantForModal, posts, products)}
                alt={selectedTenantForModal.name}
                className="modal-banner-img"
              />
              <div className="modal-banner-overlay" />
              <button
                className="modal-close-btn"
                onClick={() => setSelectedTenantForModal(null)}
              >
                <X size={20} />
              </button>

              <div className="modal-logo-box" style={{ background: '#0F172A', border: '3px solid rgba(255,255,255,0.14)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {resolveTenantLogoUrl(selectedTenantForModal, posts, products) ? (
                  <img src={resolveTenantLogoUrl(selectedTenantForModal, posts, products)} alt={selectedTenantForModal.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  selectedTenantForModal.logoEmoji || '🏪'
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className="modal-body-container">
              <div className="modal-title-bar">
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white' }}>{selectedTenantForModal.name}</h2>
                  <p className="modal-subtitle">
                    {selectedTenantForModal.category} • {selectedTenantForModal.address}
                  </p>
                </div>

                <span className={`tenant-status-pill ${selectedTenantForModal.isOpen ? 'open' : 'closed'}`}>
                  <span className="pulse-dot" />
                  {selectedTenantForModal.isOpen ? 'ABIERTO AHORA' : 'CERRADO'}
                </span>
              </div>

              {/* Direct payment info */}
              <div className="ethical-commission-banner" style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10B981', borderRadius: '16px' }}>
                <ShieldCheck size={24} style={{ color: '#10B981', flexShrink: 0 }} />
                <div>
                  <strong>Compra directa</strong>
                  <p style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
                    Con GastroSync, <strong>el 97% de tu compra</strong> va directamente al restaurante.
                  </p>
                </div>
              </div>

              <div className="modal-details-grid" style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '16px' }}>
                <div className="detail-item">
                  <Star size={18} style={{ color: '#F59E0B' }} />
                  <div>
                    <span className="detail-label">Calificación</span>
                    <strong style={{ color: 'white' }}>{selectedTenantForModal.rating} / 5.0 ⭐</strong>
                  </div>
                </div>

                <div className="detail-item">
                  <Clock size={18} style={{ color: 'var(--primary)' }} />
                  <div>
                    <span className="detail-label">Tiempo Estimado</span>
                    <strong style={{ color: 'white' }}>{selectedTenantForModal.deliveryTime || '20-30 min'}</strong>
                  </div>
                </div>

                <div className="detail-item">
                  <MapPin size={18} style={{ color: '#10B981' }} />
                  <div>
                    <span className="detail-label">Distancia</span>
                    <strong style={{ color: 'white' }}>{selectedTenantForModal.distanceKm} km de ti</strong>
                  </div>
                </div>
              </div>

              {/* Menu Section inside Modal */}
              <div className="modal-menu-section">
                <h3 style={{ color: 'white', fontWeight: 900 }}>🍽️ Menú Destacado de {selectedTenantForModal.name}</h3>

                {modalProducts.length === 0 ? (
                  <p className="no-products-msg">No hay productos registrados por el momento.</p>
                ) : (
                  <div className="modal-products-grid">
                    {modalProducts.map(product => (
                      <div key={product.id} className="modal-product-card" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="product-emoji-container" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {product.image ? (
                            <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }} />
                          ) : (
                            product.emoji
                          )}
                        </div>
                        <div className="product-info flex-1">
                          <h4 className="product-name" style={{ color: 'white' }}>{product.name}</h4>
                          <p className="product-desc">{product.desc}</p>
                          <div className="product-price">
                            ${product.price.toLocaleString('es-CO')} COP
                          </div>
                        </div>

                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="btn btn-primary btn-sm add-cart-btn"
                          disabled={!selectedTenantForModal.isOpen || !product.available}
                          style={{ borderRadius: '10px', fontWeight: 800 }}
                          onClick={() => addToCart(product)}
                        >
                          <Plus size={16} /> Añadir
                        </motion.button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-actions-footer">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn btn-primary btn-full"
                  disabled={!selectedTenantForModal.isOpen}
                  style={{ borderRadius: '14px', fontWeight: 900, padding: '14px' }}
                  onClick={() => {
                    setCurrentTenantBySlug(selectedTenantForModal.slug);
                    setSelectedTenantForModal(null);
                    onSelectTenantAndGoToFeed(selectedTenantForModal.slug);
                  }}
                >
                  <ShoppingBag size={18} /> Ir al Feed Completo & Pedir
                </motion.button>
              </div>

            </div>

          </motion.div>
        </div>
      )}

    </motion.div>
  );
};
