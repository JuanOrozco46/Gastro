import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { X, Star, MapPin, Clock, ShoppingBag, Eye, Heart, ShieldCheck, Phone, Navigation, Play, Calendar, Truck } from 'lucide-react';

interface RestaurantProfileModalProps {
  tenantId: string;
  onClose: () => void;
  onOrderProduct: (productId: string, tenantSlug: string) => void;
  initialTab?: 'content' | 'menu' | 'info';
  onOpenCart?: () => void;
}

interface DBHour {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  interval_name: string | null;
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const RestaurantProfileModal: React.FC<RestaurantProfileModalProps> = ({
  tenantId,
  onClose,
  onOrderProduct,
  initialTab,
  onOpenCart
}) => {
  const { tenants, products, posts, cart } = useApp();

  const tenant = tenants.find(t => t.id === tenantId || t.slug === tenantId) || tenants[0];
  const tenantProducts = products.filter(p => tenant && p.tenantId === tenant.id && !p.isArchived);
  const tenantPosts = posts.filter(p => tenant && p.tenantId === tenant.id);

  const [activeTab, setActiveTab] = useState<'content' | 'menu' | 'info'>(() => {
    if (initialTab) return initialTab;
    if (tenantPosts.length === 0 && tenantProducts.length > 0) return 'menu';
    return 'menu';
  });

  const [liveIsOpen, setLiveIsOpen] = useState(tenant?.isOpen ?? false);
  const [liveAcceptingOrders, setLiveAcceptingOrders] = useState(tenant?.acceptingOrders !== false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [hours, setHours] = useState<DBHour[]>([]);
  
  useEffect(() => {
    let mounted = true;
    const checkLiveStatus = async () => {
      if (!isSupabaseConfigured || !supabase || !tenant?.id) return;
      setIsCheckingStatus(true);
      try {
        const [{ data, error }, { data: hoursData, error: hoursError }] = await Promise.all([
          supabase.from('restaurants').select('is_open, accepting_orders').eq('id', tenant.id).single(),
          supabase.from('restaurant_hours').select('*').eq('restaurant_id', tenant.id).order('day_of_week', { ascending: true })
        ]);

        if (mounted) {
          if (!error && data) {
            setLiveIsOpen(data.is_open);
            setLiveAcceptingOrders(data.accepting_orders !== false);
          }
          if (!hoursError && hoursData) {
            setHours(hoursData);
          }
        }
      } catch (err) {
        if (mounted) console.warn('Error fetching live status', err);
      } finally {
        if (mounted) setIsCheckingStatus(false);
      }
    };
    checkLiveStatus();
    return () => { mounted = false; };
  }, [tenant?.id]);

  if (!tenant) return null;

  const totalViews = tenantPosts.reduce((acc, p) => acc + (p.viewCount || 0), 0);

  const isOpenNow = liveIsOpen && liveAcceptingOrders && tenant.status === 'active';

  const cartQty = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + (i.product?.price || 0) * i.quantity, 0);

  const renderHours = () => {
    if (hours.length === 0) return <p style={{ color: 'var(--text-muted)' }}>No hay horarios registrados.</p>;
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
        {DAYS.map((dayName, idx) => {
          const dayHours = hours.filter(h => h.day_of_week === idx);
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--neutral-border)' }}>
              <span style={{ fontWeight: 600 }}>{dayName}</span>
              <span>
                {dayHours.length === 0 ? 'Cerrado' : dayHours.map((h, i) => {
                  if (h.is_closed || !h.open_time || !h.close_time) return <span key={i} style={{ color: '#EF4444' }}>Cerrado</span>;
                  return <span key={i} style={{ display: 'block' }}>{h.interval_name ? `${h.interval_name}: ` : ''}{h.open_time.slice(0, 5)} - {h.close_time.slice(0, 5)}</span>;
                })}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="gf-profile-modal-overlay" onClick={onClose}>
      <div className="gf-profile-modal-container" onClick={e => e.stopPropagation()}>
        
        {/* Banner Header */}
        <div className="gf-profile-banner" style={{ background: tenant.bannerUrl ? 'transparent' : 'linear-gradient(135deg, var(--primary-color), #FFB75E)' }}>
          {tenant.bannerUrl && <img loading="lazy" decoding="async" src={tenant.bannerUrl} alt={tenant.name} className="gf-profile-banner-img" />}
          <button className="gf-profile-close-btn" onClick={onClose} aria-label="Cerrar perfil de restaurante">
            <X size={20} />
          </button>
          
          <div className="gf-profile-avatar-badge" style={{ backgroundColor: tenant.logoUrl ? 'transparent' : 'var(--surface-color)', overflow: 'hidden', padding: tenant.logoUrl ? 0 : '10px' }}>
            {tenant.logoUrl ? (
              <img loading="lazy" decoding="async" src={tenant.logoUrl} alt={tenant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span>{tenant.logoEmoji || '🍽️'}</span>
            )}
          </div>
        </div>

        {/* Info Header */}
        <div className="gf-profile-header-info">
          <div className="gf-profile-title-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2>{tenant.name || 'Restaurante'}</h2>
              {isCheckingStatus ? (
                <span style={{ background: 'var(--glass-medium)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600 }}>
                  Verificando estado...
                </span>
              ) : isOpenNow ? (
                <span style={{ background: '#10B981', color: 'white', padding: '2px 8px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>
                  ABIERTO AHORA
                </span>
              ) : (
                <span style={{ background: '#EF4444', color: 'white', padding: '2px 8px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>
                  {liveIsOpen && !liveAcceptingOrders ? 'PAUSADO (No recibe pedidos)' : 'CERRADO'}
                </span>
              )}
            </div>
            <span className="gf-profile-category-pill">{tenant.category}</span>
          </div>

          <p className="gf-profile-bio">{tenant.description || 'Sin descripción disponible.'}</p>

          <div className="gf-profile-meta-tags">
            <span className="gf-meta-tag"><Star size={13} fill="#E6942B" strokeWidth={0} /> {tenant.rating || 5.0}</span>
            <span className="gf-meta-tag"><Clock size={13} /> {tenant.estimatedDeliveryMinutes ? `${tenant.estimatedDeliveryMinutes} min` : (tenant.deliveryTime || '20-30 min')}</span>
            <span className="gf-meta-tag"><MapPin size={13} /> {tenant.address}</span>
            <span className="gf-meta-tag gf-verified-tag"><ShieldCheck size={13} /> Verificado</span>
          </div>

          {/* Key metrics bar */}
          <div className="gf-profile-stats-bar">
            <div className="gf-pstat">
              <strong>{tenantProducts.length}</strong>
              <span>Platos en Menú</span>
            </div>
            <div className="gf-pstat-divider" />
            <div className="gf-pstat">
              <strong>{tenantPosts.length}</strong>
              <span>Publicaciones</span>
            </div>
            <div className="gf-pstat-divider" />
            <div className="gf-pstat">
              <strong>{totalViews > 0 ? `${(totalViews / 1000).toFixed(1)}k` : 'Directo'}</strong>
              <span>Comisión 3%</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="gf-profile-tabs">
          <button
            className={`gf-profile-tab ${activeTab === 'menu' ? 'active' : ''}`}
            onClick={() => setActiveTab('menu')}
          >
            🍕 Menú ({tenantProducts.length})
          </button>
          <button
            className={`gf-profile-tab ${activeTab === 'content' ? 'active' : ''}`}
            onClick={() => setActiveTab('content')}
          >
            🎥 Publicaciones ({tenantPosts.length})
          </button>
          <button
            className={`gf-profile-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            📍 Horarios e Info
          </button>
        </div>

        {/* Tab Contents */}
        <div className="gf-profile-tab-content">
          
          {/* TAB 1: MENU */}
          {activeTab === 'menu' && (
            <div className="gf-profile-menu-list">
              {tenantProducts.length === 0 ? (
                <div className="gf-empty-grid" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                    Este restaurante aún no ha registrado platos activos en su menú digital.
                  </p>
                </div>
              ) : (
                tenantProducts.map(p => (
                  <div key={p.id} className="gf-menu-item-row" style={{ opacity: p.available ? 1 : 0.6 }}>
                    {p.image ? (
                      <img loading="lazy" decoding="async" src={p.image} alt={p.name} className="gf-menu-item-img" style={{ width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div className="gf-menu-item-emoji">{p.emoji || '🍽️'}</div>
                    )}
                    <div className="gf-menu-item-info">
                      <h4>{p.name}</h4>
                      {p.desc && <p>{p.desc}</p>}
                      <strong className="gf-menu-price">${p.price.toLocaleString('es-CO')} COP</strong>
                    </div>
                    <button
                      className="gf-menu-add-btn"
                      disabled={!isOpenNow || !p.available}
                      style={{ opacity: (!isOpenNow || !p.available) ? 0.5 : 1, cursor: (!isOpenNow || !p.available) ? 'not-allowed' : 'pointer' }}
                      onClick={() => {
                        onOrderProduct(p.id, tenant.slug);
                      }}
                    >
                      <ShoppingBag size={14} /> {!p.available ? 'Agotado' : !isOpenNow ? 'Cerrado' : 'Añadir'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: CONTENT GRID */}
          {activeTab === 'content' && (
            <div className="gf-profile-grid">
              {tenantPosts.length === 0 ? (
                <div className="gf-empty-grid" style={{ gridColumn: '1 / -1', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 12px', color: 'var(--text-muted)' }}>
                    Este restaurante aún no ha subido publicaciones al Feed, pero puedes pedir directamente desde su menú.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ borderRadius: '10px', fontWeight: 800 }}
                    onClick={() => setActiveTab('menu')}
                  >
                    🍕 Ver Menú del Restaurante ({tenantProducts.length})
                  </button>
                </div>
              ) : (
                tenantPosts.map(post => (
                  <div key={post.id} className="gf-grid-card">
                    <img loading="lazy" decoding="async" src={post.image} alt={post.dishName} className="gf-grid-img" />
                    
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
                      {post.productId && (
                        <button
                          className="gf-grid-order-btn"
                          disabled={!isOpenNow}
                          onClick={() => {
                            onOrderProduct(post.productId, tenant.slug);
                          }}
                        >
                          <ShoppingBag size={13} />
                          ${post.price.toLocaleString('es-CO')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: INFO */}
          {activeTab === 'info' && (
            <div className="gf-profile-info-block">
              <div className="gf-info-card">
                <h4><MapPin size={16} /> Ubicación Principal</h4>
                <p>{tenant.address}</p>
                <div className="gf-info-actions">
                  <button
                    type="button"
                    className="gf-info-btn"
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tenant.name} ${tenant.address}`)}`, '_blank')}
                  >
                    <Navigation size={14} /> Ver en Mapa
                  </button>
                  {tenant.phone && <button type="button" className="gf-info-btn"><Phone size={14} /> {tenant.phone}</button>}
                </div>
              </div>

              <div className="gf-info-card">
                <h4><Calendar size={16} /> Horarios de Atención</h4>
                {renderHours()}
              </div>
              
              <div className="gf-info-card">
                <h4><Truck size={16} /> Condiciones de Entrega</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pedido Mínimo</span>
                    <strong style={{ display: 'block' }}>{tenant.minOrder ? `$${tenant.minOrder.toLocaleString('es-CO')}` : 'Sin mínimo'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Costo Domicilio</span>
                    <strong style={{ display: 'block' }}>{tenant.deliveryFee ? `$${tenant.deliveryFee.toLocaleString('es-CO')}` : 'Gratis'}</strong>
                  </div>
                </div>
              </div>

              <div className="gf-info-card">
                <h4>🛡️ Compromiso GastroSync</h4>
                <p>Este restaurante participa en el programa de <strong>Visibilidad Justa y Orgánica</strong>. No paga por posiciones destacadas; la calidad de sus platos y su contenido guían sus ventas.</p>
              </div>
            </div>
          )}

        </div>

        {/* Sticky Cart Footer inside Modal when items are in cart */}
        {cartQty > 0 && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--neutral-border)',
              background: 'var(--neutral-surface-alt)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>
                {cartQty} producto{cartQty !== 1 ? 's' : ''} en tu carrito
              </span>
              <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                ${cartTotal.toLocaleString('es-CO')} COP
              </strong>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ borderRadius: '12px', fontWeight: 800, padding: '10px 18px' }}
              onClick={() => {
                if (onOpenCart) {
                  onOpenCart();
                } else {
                  onClose();
                }
              }}
            >
              <ShoppingBag size={16} /> Ver Carrito y Pagar
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
