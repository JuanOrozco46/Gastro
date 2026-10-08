import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  fetchRestaurantReviews,
  submitRestaurantReview,
  deleteRestaurantReview
} from '../services/supabaseDataService';
import {
  resolveTenantBannerUrl,
  resolveTenantLogoUrl,
  getCategoryFallbackBanner
} from '../utils/tenantHelpers';
import type { RestaurantReview } from '../types';
import {
  X, Star, MapPin, Clock, ShoppingBag, Eye, Heart, ShieldCheck,
  Phone, Navigation, Play, Calendar, Truck, MessageSquare, Trash2, CheckCircle2, Send
} from 'lucide-react';

interface RestaurantProfileModalProps {
  tenantId: string;
  onClose: () => void;
  onOrderProduct: (productId: string, tenantSlug: string) => void;
  initialTab?: 'content' | 'menu' | 'reviews' | 'info';
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

const REVIEW_QUICK_TAGS = [
  '🔥 Excelente sabor',
  '⚡ Entrega rápida',
  '📦 Buena porción',
  '🧼 Buena presentación',
  '💚 Atención amable',
  '💎 Súper recomendado'
];

const RATING_LABELS: Record<number, string> = {
  1: 'Muy malo',
  2: 'Regular',
  3: 'Bueno',
  4: 'Muy bueno',
  5: '¡Excelente!'
};

export const RestaurantProfileModal: React.FC<RestaurantProfileModalProps> = ({
  tenantId,
  onClose,
  onOrderProduct,
  initialTab,
  onOpenCart
}) => {
  const {
    tenants,
    products,
    posts,
    cart,
    orders,
    currentUser,
    authMode,
    showToast,
    syncTenantRating
  } = useApp();

  const tenant = tenants.find(t => t.id === tenantId || t.slug === tenantId) || tenants[0];
  const tenantProducts = products.filter(p => tenant && p.tenantId === tenant.id && !p.isArchived);
  const tenantPosts = posts.filter(p => tenant && p.tenantId === tenant.id);

  const [activeTab, setActiveTab] = useState<'content' | 'menu' | 'reviews' | 'info'>(() => {
    if (initialTab) return initialTab;
    return 'menu';
  });

  const [brokenBannerId, setBrokenBannerId] = useState<string | null>(null);
  const [brokenLogoId, setBrokenLogoId] = useState<string | null>(null);

  const [liveIsOpen, setLiveIsOpen] = useState(tenant?.isOpen ?? false);
  const [liveAcceptingOrders, setLiveAcceptingOrders] = useState(tenant?.acceptingOrders !== false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [hours, setHours] = useState<DBHour[]>([]);

  // Reviews state
  const [reviews, setReviews] = useState<RestaurantReview[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [ratingInput, setRatingInput] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [customOrderId, setCustomOrderId] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);

  // Pedidos del cliente en este restaurante
  const myTenantOrders = useMemo(() => {
    if (!tenant || !currentUser) return [];
    return orders.filter(o => o.tenantId === tenant.id);
  }, [orders, tenant, currentUser]);

  const defaultOrderId = useMemo(() => {
    if (myTenantOrders.length === 0) return '';
    const reviewedOrderIds = new Set(reviews.map(r => r.orderId).filter(Boolean));
    const unreviewedOrder = myTenantOrders.find(o => !reviewedOrderIds.has(o.id));
    return unreviewedOrder ? unreviewedOrder.id : myTenantOrders[0].id;
  }, [myTenantOrders, reviews]);

  const selectedOrderId = customOrderId !== null ? customOrderId : defaultOrderId;

  useEffect(() => {
    let mounted = true;
    const checkLiveStatusAndReviews = async () => {
      if (!tenant?.id) return;

      if (!isSupabaseConfigured || !supabase || authMode === 'demo') {
        try {
          const saved = localStorage.getItem(`gs_reviews_${tenant.id}`);
          if (saved && mounted) {
            setReviews(JSON.parse(saved));
          }
        } catch {}
        return;
      }

      setIsCheckingStatus(true);
      setIsLoadingReviews(true);
      try {
        const [{ data, error }, { data: hoursData, error: hoursError }, loadedReviews] = await Promise.all([
          supabase.from('restaurants').select('is_open, accepting_orders').eq('id', tenant.id).single(),
          supabase.from('restaurant_hours').select('*').eq('restaurant_id', tenant.id).order('day_of_week', { ascending: true }),
          fetchRestaurantReviews(tenant.id)
        ]);

        if (mounted) {
          if (!error && data) {
            setLiveIsOpen(data.is_open);
            setLiveAcceptingOrders(data.accepting_orders !== false);
          }
          if (!hoursError && hoursData) {
            setHours(hoursData);
          }
          setReviews(loadedReviews);
        }
      } catch (err) {
        if (mounted) console.warn('Error fetching live status and reviews', err);
      } finally {
        if (mounted) {
          setIsCheckingStatus(false);
          setIsLoadingReviews(false);
        }
      }
    };
    checkLiveStatusAndReviews();
    return () => { mounted = false; };
  }, [tenant?.id, authMode]);

  if (!tenant) return null;

  const brokenBanner = brokenBannerId === tenant.id;
  const brokenLogo = brokenLogoId === tenant.id;

  const resolvedBanner = brokenBanner
    ? getCategoryFallbackBanner(tenant.category)
    : resolveTenantBannerUrl(tenant, posts, products);

  const resolvedLogo = !brokenLogo
    ? resolveTenantLogoUrl(tenant, posts, products)
    : undefined;

  const totalViews = tenantPosts.reduce((acc, p) => acc + (p.viewCount || 0), 0);
  const isOpenNow = liveIsOpen && liveAcceptingOrders && tenant.status === 'active';

  const cartQty = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + (i.product?.price || 0) * i.quantity, 0);

  const effectiveReviewsCount = reviews.length > 0 ? reviews.length : (tenant.reviewsCount || 0);
  const effectiveRatingAvg = reviews.length > 0
    ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
    : Number((tenant.rating || 5.0).toFixed(1));

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const canDeleteReview = (review: RestaurantReview): boolean => {
    if (!currentUser) return false;
    const isAuthor = Boolean(
      (currentUser.id && review.userId === currentUser.id) ||
      (currentUser.email && review.userId === currentUser.email)
    );
    const isOwnerOrStaff = Boolean(
      currentUser.tenantId === tenant.id &&
      (currentUser.businessRole === 'restaurant_owner' ||
        currentUser.businessRole === 'restaurant_staff' ||
        currentUser.role === 'admin' ||
        currentUser.role === 'kitchen')
    );
    const isAdmin = currentUser.businessRole === 'platform_admin';
    return isAuthor || isOwnerOrStaff || isAdmin;
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('⚠️ Inicia sesión para calificar este restaurante.');
      return;
    }
    if (!commentInput.trim() && selectedTags.length === 0) {
      showToast('⚠️ Escribe un comentario o selecciona al menos una etiqueta para tu reseña.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const finalComment = commentInput.trim() || selectedTags.join(' · ');

      if (authMode === 'demo' || !isSupabaseConfigured) {
        const demoReview: RestaurantReview = {
          id: `rev_${Date.now()}`,
          restaurantId: tenant.id,
          orderId: selectedOrderId || undefined,
          userId: currentUser.id || currentUser.email,
          userName: currentUser.name,
          userHandle: currentUser.username,
          userAvatarUrl: currentUser.avatarUrl,
          rating: ratingInput,
          comment: finalComment,
          tags: selectedTags,
          createdAt: new Date().toISOString(),
          timeAgo: 'Hace un momento'
        };
        const next = [demoReview, ...reviews.filter(r => !(selectedOrderId && r.orderId === selectedOrderId))];
        setReviews(next);
        try { localStorage.setItem(`gs_reviews_${tenant.id}`, JSON.stringify(next)); } catch {}
        const avg = next.reduce((acc, r) => acc + r.rating, 0) / next.length;
        syncTenantRating(tenant.id, avg, next.length);
        setCommentInput('');
        setSelectedTags([]);
        showToast('⭐ ¡Gracias por calificar al restaurante!');
        return;
      }

      const res = await submitRestaurantReview({
        restaurantId: tenant.id,
        orderId: selectedOrderId || undefined,
        userId: currentUser.id || currentUser.email,
        rating: ratingInput,
        comment: finalComment,
        tags: selectedTags,
        authorFallback: {
          name: currentUser.name,
          username: currentUser.username,
          avatarUrl: currentUser.avatarUrl
        }
      });

      if (!res.success || !res.review) {
        showToast(`⚠️ ${res.error || 'No se pudo publicar la reseña.'}`);
        return;
      }

      const savedReview = res.review;
      setReviews(prev => {
        const filtered = prev.filter(r => r.id !== savedReview.id && !(savedReview.orderId && r.orderId === savedReview.orderId));
        return [savedReview, ...filtered];
      });

      syncTenantRating(tenant.id, res.ratingAvg, res.ratingCount);
      setCommentInput('');
      setSelectedTags([]);
      showToast('⭐ ¡Tu calificación y reseña fueron publicadas!');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!currentUser) return;
    setDeletingReviewId(reviewId);
    try {
      if (authMode === 'demo' || !isSupabaseConfigured) {
        const next = reviews.filter(r => r.id !== reviewId);
        setReviews(next);
        try { localStorage.setItem(`gs_reviews_${tenant.id}`, JSON.stringify(next)); } catch {}
        const avg = next.length > 0 ? next.reduce((acc, r) => acc + r.rating, 0) / next.length : 5.0;
        syncTenantRating(tenant.id, avg, next.length);
        showToast('🗑️ Reseña eliminada.');
        return;
      }

      const res = await deleteRestaurantReview(reviewId, tenant.id);
      if (!res.success) {
        showToast(`⚠️ ${res.error || 'No se pudo eliminar la reseña.'}`);
        return;
      }
      setReviews(prev => prev.filter(r => r.id !== reviewId));
      syncTenantRating(tenant.id, res.ratingAvg, res.ratingCount);
      showToast('🗑️ Reseña eliminada correctamente.');
    } finally {
      setDeletingReviewId(null);
    }
  };

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
        <div
          className="gf-profile-banner"
          style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            position: 'relative'
          }}
        >
          <img
            loading="lazy"
            decoding="async"
            src={resolvedBanner}
            alt={tenant.name}
            className="gf-profile-banner-img"
            onError={() => {
              if (!brokenBanner) setBrokenBannerId(tenant.id);
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 50%, rgba(15,23,42,0.75) 100%)',
              pointerEvents: 'none'
            }}
          />
          <button className="gf-profile-close-btn" onClick={onClose} aria-label="Cerrar perfil de restaurante">
            <X size={20} />
          </button>
          
          <div
            className="gf-profile-avatar-badge"
            style={{
              backgroundColor: '#0F172A',
              overflow: 'hidden',
              padding: resolvedLogo ? 0 : '10px',
              border: '3px solid var(--neutral-surface, #1E293B)'
            }}
          >
            {resolvedLogo ? (
              <img
                loading="lazy"
                decoding="async"
                src={resolvedLogo}
                alt={tenant.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setBrokenLogoId(tenant.id)}
              />
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
            <button
              type="button"
              className="gf-meta-tag"
              onClick={() => setActiveTab('reviews')}
              style={{
                cursor: 'pointer',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#FBBF24',
                fontWeight: 800
              }}
              title="Ver reseñas y calificaciones"
            >
              <Star size={13} fill="#F59E0B" strokeWidth={0} /> {effectiveRatingAvg.toFixed(1)} ({effectiveReviewsCount} reseña{effectiveReviewsCount !== 1 ? 's' : ''})
            </button>
            <span className="gf-meta-tag"><Clock size={13} /> {tenant.estimatedDeliveryMinutes ? `${tenant.estimatedDeliveryMinutes} min` : (tenant.deliveryTime || '20-30 min')}</span>
            <span className="gf-meta-tag"><MapPin size={13} /> {tenant.address}</span>
            <span className="gf-meta-tag gf-verified-tag"><ShieldCheck size={13} /> Verificado</span>
          </div>

          {/* Key metrics bar */}
          <div className="gf-profile-stats-bar">
            <div className="gf-pstat" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('menu')}>
              <strong>{tenantProducts.length}</strong>
              <span>Platos en Menú</span>
            </div>
            <div className="gf-pstat-divider" />
            <div className="gf-pstat" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('reviews')}>
              <strong>⭐ {effectiveRatingAvg.toFixed(1)}</strong>
              <span>{effectiveReviewsCount} Reseña{effectiveReviewsCount !== 1 ? 's' : ''}</span>
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
            🎥 Posts ({tenantPosts.length})
          </button>
          <button
            className={`gf-profile-tab ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            ⭐ Reseñas ({effectiveReviewsCount})
          </button>
          <button
            className={`gf-profile-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            📍 Info
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

          {/* TAB 3: REVIEWS */}
          {activeTab === 'reviews' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
              {/* Rating Summary Card */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.09)',
                  borderRadius: '18px',
                  padding: '18px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '20px',
                  alignItems: 'center'
                }}
              >
                <div style={{ textAlign: 'center', minWidth: '110px' }}>
                  <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#FBBF24', lineHeight: 1 }}>
                    {effectiveRatingAvg.toFixed(1)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '3px', margin: '6px 0' }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={14}
                        fill={star <= Math.round(effectiveRatingAvg) ? '#F59E0B' : 'none'}
                        color="#F59E0B"
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {effectiveReviewsCount} {effectiveReviewsCount === 1 ? 'calificación' : 'calificaciones'}
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {[5, 4, 3, 2, 1].map(star => {
                    const countForStar = reviews.filter(r => Math.round(r.rating) === star).length;
                    const pct = reviews.length > 0 ? Math.round((countForStar / reviews.length) * 100) : (star === 5 ? 100 : 0);
                    return (
                      <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem' }}>
                        <span style={{ width: '28px', color: 'var(--text-muted)', fontWeight: 700 }}>{star} ★</span>
                        <div style={{ flex: 1, height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: '999px',
                              background: 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                            }}
                          />
                        </div>
                        <span style={{ width: '26px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {countForStar}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Write Review Form */}
              {currentUser && (
                <form
                  onSubmit={handleSubmitReview}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(245, 158, 11, 0.24)',
                    borderRadius: '18px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: '#0F172A',
                          border: '1px solid rgba(255,255,255,0.14)',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          color: 'white'
                        }}
                      >
                        {currentUser.avatarUrl ? (
                          <img src={currentUser.avatarUrl} alt={currentUser.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span>{currentUser.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'white', display: 'block' }}>
                          Califica tu experiencia en {tenant.name}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Publicando como {currentUser.username ? `@${currentUser.username}` : currentUser.name}
                        </span>
                      </div>
                    </div>

                    {myTenantOrders.length > 0 && (
                      <select
                        value={selectedOrderId}
                        onChange={e => setCustomOrderId(e.target.value)}
                        style={{
                          background: 'rgba(15, 23, 42, 0.85)',
                          color: '#10B981',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: '10px',
                          padding: '6px 10px',
                          fontSize: '0.76rem',
                          fontWeight: 700
                        }}
                      >
                        {myTenantOrders.map(o => (
                          <option key={o.id} value={o.id}>
                            ✓ Pedido #{o.id.slice(0, 6)} (${o.total.toLocaleString('es-CO')})
                          </option>
                        ))}
                        <option value="">Reseña general</option>
                      </select>
                    )}
                  </div>

                  {/* Interactive Stars */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 4, 5].map(star => {
                        const active = star <= (hoverRating || ratingInput);
                        return (
                          <button
                            key={star}
                            type="button"
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => setRatingInput(star)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: '2px',
                              cursor: 'pointer',
                              transform: active ? 'scale(1.08)' : 'scale(1)',
                              transition: 'transform 0.15s ease'
                            }}
                            aria-label={`Calificar con ${star} estrellas`}
                          >
                            <Star
                              size={26}
                              fill={active ? '#F59E0B' : 'none'}
                              color={active ? '#F59E0B' : '#64748B'}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#FBBF24' }}>
                      {RATING_LABELS[hoverRating || ratingInput]}
                    </span>
                  </div>

                  {/* Quick Tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {REVIEW_QUICK_TAGS.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: isSelected ? '1px solid #F59E0B' : '1px solid rgba(255,255,255,0.12)',
                            background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.04)',
                            color: isSelected ? '#FBBF24' : 'var(--text-muted)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  {/* Comment Input */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <textarea
                      rows={2}
                      value={commentInput}
                      onChange={e => setCommentInput(e.target.value)}
                      placeholder="Cuéntale a otros clientes qué tal estuvo la comida, el tiempo de entrega y el servicio..."
                      maxLength={600}
                      style={{
                        flex: 1,
                        background: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        color: 'white',
                        fontSize: '0.85rem',
                        resize: 'vertical'
                      }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmittingReview}
                      style={{
                        borderRadius: '12px',
                        padding: '10px 16px',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexShrink: 0
                      }}
                    >
                      <Send size={15} />
                      {isSubmittingReview ? 'Enviando...' : 'Publicar'}
                    </button>
                  </div>
                </form>
              )}

              {/* Reviews Feed */}
              {isLoadingReviews ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Cargando reseñas de clientes...
                </div>
              ) : reviews.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2.2rem 1.5rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.12)',
                    borderRadius: '16px',
                    color: 'var(--text-muted)'
                  }}
                >
                  <MessageSquare size={32} style={{ color: '#F59E0B', margin: '0 auto 8px' }} />
                  <strong style={{ display: 'block', color: 'white', marginBottom: '4px' }}>
                    Sé el primero en dejar una reseña
                  </strong>
                  <span style={{ fontSize: '0.83rem' }}>
                    Las calificaciones verificadas ayudan a toda la comunidad a descubrir los mejores sabores locales.
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {reviews.map(review => (
                    <div
                      key={review.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.035)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              background: '#0F172A',
                              border: '1px solid rgba(255,255,255,0.14)',
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              color: 'white',
                              flexShrink: 0
                            }}
                          >
                            {review.userAvatarUrl ? (
                              <img src={review.userAvatarUrl} alt={review.userName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span>{(review.userName || 'C').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.9rem', color: 'white' }}>{review.userName}</strong>
                              {review.userHandle && (
                                <span style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 700 }}>
                                  @{review.userHandle}
                                </span>
                              )}
                              {review.orderId && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: '999px',
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10B981',
                                    border: '1px solid rgba(16, 185, 129, 0.3)'
                                  }}
                                >
                                  <CheckCircle2 size={11} /> Pedido verificado
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <div style={{ display: 'flex', gap: '2px' }}>
                                {[1, 2, 3, 4, 5].map(star => (
                                  <Star
                                    key={star}
                                    size={12}
                                    fill={star <= review.rating ? '#F59E0B' : 'none'}
                                    color={star <= review.rating ? '#F59E0B' : '#475569'}
                                  />
                                ))}
                              </div>
                              <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                · {review.timeAgo}
                              </span>
                            </div>
                          </div>
                        </div>

                        {canDeleteReview(review) && (
                          <button
                            type="button"
                            disabled={deletingReviewId === review.id}
                            onClick={() => handleDeleteReview(review.id)}
                            title="Eliminar reseña"
                            style={{
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#F87171',
                              borderRadius: '8px',
                              padding: '5px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {review.tags && review.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {review.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: '#FBBF24',
                                fontWeight: 700
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {review.comment && (
                        <p style={{ margin: 0, fontSize: '0.88rem', color: '#E2E8F0', lineHeight: 1.5 }}>
                          {review.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: INFO */}
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

