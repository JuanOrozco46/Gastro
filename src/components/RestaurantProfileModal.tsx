import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { X, Star, MapPin, Clock, ShoppingBag, Eye, Heart, ShieldCheck, Phone, Navigation, Play } from 'lucide-react';

interface RestaurantProfileModalProps {
  tenantId: string;
  onClose: () => void;
  onOrderProduct: (productId: string, tenantSlug: string) => void;
}

export const RestaurantProfileModal: React.FC<RestaurantProfileModalProps> = ({
  tenantId,
  onClose,
  onOrderProduct
}) => {
  const { tenants, products, posts } = useApp();
  const [activeTab, setActiveTab] = useState<'content' | 'menu' | 'info'>('content');

  const tenant = tenants.find(t => t.id === tenantId) || tenants[0];
  const tenantProducts = products.filter(p => p.tenantId === tenant.id);
  const tenantPosts = posts.filter(p => p.tenantId === tenant.id);

  const totalViews = tenantPosts.reduce((acc, p) => acc + (p.viewCount || 0), 0);

  return (
    <div className="gf-profile-modal-overlay" onClick={onClose}>
      <div className="gf-profile-modal-container" onClick={e => e.stopPropagation()}>
        
        {/* Banner Header */}
        <div className="gf-profile-banner">
          <img src={tenant.bannerUrl} alt={tenant.name} className="gf-profile-banner-img" />
          <button className="gf-profile-close-btn" onClick={onClose} aria-label="Cerrar perfil de restaurante">
            <X size={20} />
          </button>
          
          <div className="gf-profile-avatar-badge">
            <span>{tenant.logoEmoji}</span>
          </div>
        </div>

        {/* Info Header */}
        <div className="gf-profile-header-info">
          <div className="gf-profile-title-row">
            <h2>{tenant.name}</h2>
            <span className="gf-profile-category-pill">{tenant.category}</span>
          </div>

          <p className="gf-profile-bio">{tenant.description}</p>

          <div className="gf-profile-meta-tags">
            <span className="gf-meta-tag"><Star size={13} fill="#E6942B" strokeWidth={0} /> {tenant.rating}</span>
            <span className="gf-meta-tag"><Clock size={13} /> {tenant.deliveryTime}</span>
            <span className="gf-meta-tag"><MapPin size={13} /> {tenant.address}</span>
            <span className="gf-meta-tag gf-verified-tag"><ShieldCheck size={13} /> Verificado en GastroSync</span>
          </div>

          {/* Key metrics bar */}
          <div className="gf-profile-stats-bar">
            <div className="gf-pstat">
              <strong>{tenantPosts.length}</strong>
              <span>Publicaciones</span>
            </div>
            <div className="gf-pstat-divider" />
            <div className="gf-pstat">
              <strong>{totalViews > 0 ? `${(totalViews/1000).toFixed(1)}k` : '1.2k'}</strong>
              <span>Vistas Contenido</span>
            </div>
            <div className="gf-pstat-divider" />
            <div className="gf-pstat">
              <strong>{tenant.salesWeekly}</strong>
              <span>Ventas/semana</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="gf-profile-tabs">
          <button
            className={`gf-profile-tab ${activeTab === 'content' ? 'active' : ''}`}
            onClick={() => setActiveTab('content')}
          >
            🎥 Contenido Visual ({tenantPosts.length})
          </button>
          <button
            className={`gf-profile-tab ${activeTab === 'menu' ? 'active' : ''}`}
            onClick={() => setActiveTab('menu')}
          >
            🍕 Menú Digital ({tenantProducts.length})
          </button>
          <button
            className={`gf-profile-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            📍 Ubicación e Info
          </button>
        </div>

        {/* Tab Contents */}
        <div className="gf-profile-tab-content">
          
          {/* TAB 1: CONTENT GRID */}
          {activeTab === 'content' && (
            <div className="gf-profile-grid">
              {tenantPosts.length === 0 ? (
                <div className="gf-empty-grid">
                  <p>Este restaurante aún no ha subido contenido visual.</p>
                </div>
              ) : (
                tenantPosts.map(post => (
                  <div key={post.id} className="gf-grid-card">
                    <img src={post.image} alt={post.dishName} className="gf-grid-img" />
                    
                    {post.mediaType === 'video' && (
                      <div className="gf-grid-video-badge">
                        <Play size={12} fill="white" /> VIDEO
                      </div>
                    )}

                    <div className="gf-grid-overlay">
                      <strong className="gf-grid-title">{post.dishName}</strong>
                      <div className="gf-grid-stats">
                        <span><Heart size={12} fill="white" /> {post.likes}</span>
                        <span><Eye size={12} /> {post.viewCount || 0}</span>
                      </div>
                      <button
                        className="gf-grid-order-btn"
                        onClick={() => {
                          onOrderProduct(post.productId, tenant.slug);
                          onClose();
                        }}
                      >
                        <ShoppingBag size={13} />
                        ${post.price.toLocaleString('es-CO')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: MENU */}
          {activeTab === 'menu' && (
            <div className="gf-profile-menu-list">
              {tenantProducts.map(p => (
                <div key={p.id} className="gf-menu-item-row">
                  <div className="gf-menu-item-emoji">{p.emoji}</div>
                  <div className="gf-menu-item-info">
                    <h4>{p.name}</h4>
                    <p>{p.desc}</p>
                    <strong className="gf-menu-price">${p.price.toLocaleString('es-CO')} COP</strong>
                  </div>
                  <button
                    className="gf-menu-add-btn"
                    onClick={() => {
                      onOrderProduct(p.id, tenant.slug);
                      onClose();
                    }}
                  >
                    <ShoppingBag size={14} /> Añadir
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: INFO */}
          {activeTab === 'info' && (
            <div className="gf-profile-info-block">
              <div className="gf-info-card">
                <h4><MapPin size={16} /> Ubicación Principal</h4>
                <p>{tenant.address}</p>
                <div className="gf-info-actions">
                  <button className="gf-info-btn"><Navigation size={14} /> Ver en Mapa</button>
                  <button className="gf-info-btn"><Phone size={14} /> Contactar Restaurante</button>
                </div>
              </div>

              {tenant.specialties && (
                <div className="gf-info-card">
                  <h4>✨ Especialidades de la casa</h4>
                  <div className="gf-spec-chips">
                    {tenant.specialties.map(s => <span key={s} className="gf-spec-chip">{s}</span>)}
                  </div>
                </div>
              )}

              <div className="gf-info-card">
                <h4>🛡️ Compromiso GastroSync</h4>
                <p>Este restaurante participa en el programa de <strong>Visibilidad Justa y Orgánica</strong>. No paga por posiciones destacadas; la calidad de sus platos y su contenido guían sus ventas.</p>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
