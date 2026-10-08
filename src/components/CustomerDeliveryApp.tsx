import React, { useState, useCallback, useMemo, lazy, Suspense, useEffect, useRef } from 'react';
import { useApp } from '../context/useApp';
import { RestaurantDirectory } from './RestaurantDirectory';
import { MyOrders } from './MyOrders';
import { StoriesBar } from './StoriesBar';
import { FloatingCartButton } from './FloatingCartButton';
import { LocationSelector } from './LocationSelector';
import { NotificationBell } from './NotificationBell';
import { motion } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, ShoppingBag, Bike,
  TrendingUp, MapPin, Trash2, Plus, Minus,
  Package, Play, Eye, X, ExternalLink,
  Bookmark, Zap, Search, SlidersHorizontal, CheckCircle2, Building2, Clock
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toggleRemoteSave, fetchRemoteSavedPosts } from '../services/supabaseDataService';
import type { Post, Tenant, Product } from '../types';

const PaymentModal = lazy(() => import('./PaymentModal').then(m => ({ default: m.PaymentModal })));
const SupportCenter = lazy(() => import('./SupportCenter').then(m => ({ default: m.SupportCenter })));
const CartModal = lazy(() => import('./CartModal').then(m => ({ default: m.CartModal })));
const RestaurantProfileModal = lazy(() => import('./RestaurantProfileModal').then(m => ({ default: m.RestaurantProfileModal })));
const CommentsModal = lazy(() => import('./CommentsModal').then(m => ({ default: m.CommentsModal })));

const FallbackLoader: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
    <div style={{ width: '24px', height: '24px', border: '2px solid', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
    {message}
  </div>
);

/* ── Format numbers ──────────────────────────────────────── */
const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

/* ── Video Modal ─────────────────────────────────────────── */
const VideoModal: React.FC<{ post: Post; tenant?: Tenant; onClose: () => void; onOrder: () => void }> = ({ post, tenant, onClose, onOrder }) => (
  <motion.div
    className="video-modal-overlay"
    onClick={onClose}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <motion.div
      className="video-modal-container"
      onClick={e => e.stopPropagation()}
      initial={{ scale: 0.9, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.9, y: 20 }}
    >
      <button className="video-modal-close" onClick={onClose}><X size={20} /></button>

      <div className="video-modal-player">
        {post.mediaUrl ? (
          <video preload="none" poster={post.image}
            src={post.mediaUrl}
            controls
            autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
          />
        ) : post.legacyExternalYoutubeId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#111', color: '#94a3b8', flexDirection: 'column', gap: '10px' }}>
            <p>Este video antiguo ya no está disponible en la plataforma.</p>
          </div>
        ) : (
          <img loading="lazy" decoding="async" src={post.image} alt={post.dishName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>

      <div className="video-modal-footer">
        <div className="video-modal-info">
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: tenant?.logoUrl ? 'transparent' : 'var(--surface-color)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {tenant?.logoUrl ? (
              <img loading="lazy" decoding="async" src={tenant.logoUrl} alt={tenant?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="video-modal-emoji" style={{ margin: 0 }}>{tenant?.logoEmoji || post.tenantLogoEmoji || '🍽️'}</span>
            )}
          </div>
          <div>
            <h4>{post.dishName}</h4>
            <span>{tenant?.name || post.tenantName}</span>
          </div>
        </div>
        <motion.button
          className="video-modal-order-btn"
          onClick={() => { onOrder(); onClose(); }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ShoppingBag size={16} />
          Pedir · ${post.price.toLocaleString('es-CO')}
        </motion.button>
      </div>
    </motion.div>
  </motion.div>
);

/* ── Single Post Card ────────────────────────────────────── */
interface PostCardProps {
  post: Post;
  tenant?: Tenant;
  product?: Product;
  onLike: (id: string) => void;
  onOrder: (productId: string, tenantSlug: string) => void;
  onPlayVideo: (post: Post) => void;
  saved: boolean;
  onSave: (id: string) => void;
  onOpenComments: (post: Post) => void;
  onOpenProfile: (tenantId: string) => void;
  onShare: (post: Post) => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post, tenant, product, onLike, onOrder, onPlayVideo, saved, onSave, onOpenComments, onOpenProfile, onShare
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const lastTapRef = useRef(0);
  const heartTimerRef = useRef<number | null>(null);
  const isVideo = post.mediaType === 'video';

  // Doble tap sobre la media = like (patrón Instagram), con animación de corazón.
  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!post.isLiked) onLike(post.id);
      setShowHeartBurst(true);
      if (heartTimerRef.current) window.clearTimeout(heartTimerRef.current);
      heartTimerRef.current = window.setTimeout(() => setShowHeartBurst(false), 900);
    } else {
      lastTapRef.current = now;
    }
  };

  const handle = `@${post.tenantName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;

  return (
    <motion.article
      className="gf-post-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >

      {/* ── Header (autor con anillo de historias) ── */}
      <header className="gf-post-header">
        <div className="gf-post-author" onClick={() => onOpenProfile(post.tenantId)} style={{ cursor: 'pointer' }}>
          <div className="gf-story-ring">
            <div className="gf-author-avatar" style={{ backgroundColor: tenant?.logoUrl ? 'transparent' : 'var(--surface-color)', overflow: 'hidden' }}>
              {tenant?.logoUrl ? (
                <img loading="lazy" decoding="async" src={tenant.logoUrl} alt={tenant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span>{tenant?.logoEmoji || post.tenantLogoEmoji || '🍽️'}</span>
              )}
            </div>
          </div>
          <div className="gf-author-meta">
            <div className="gf-author-top">
              <strong className="gf-author-name">{tenant?.name || post.tenantName}</strong>
              <span className="gf-author-sep">·</span>
              <span className="gf-post-time">{post.timeAgo}</span>
              {isVideo && <span className="gf-video-chip"><Play size={8} fill="currentColor" /> VIDEO</span>}
            </div>
            <div className="gf-author-sub">
              <span className="gf-category-pill">{tenant?.category || post.tenantCategory}</span>
              {(tenant?.address || post.tenantAddress) && (
                <span className="gf-address"><MapPin size={10} /> {tenant?.address || post.tenantAddress}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Media cuadrada a sangrado completo, doble tap = like ── */}
      <div
        className="gf-media-wrapper"
        style={{ aspectRatio: post.width && post.height ? `${post.width} / ${post.height}` : '4 / 5' }}
        onClick={handleMediaTap}
      >
        <img loading="lazy" decoding="async" src={post.image} alt={post.dishName} className="gf-media-img" />

        {/* Video overlay */}
        {isVideo && (
          <button
            className="gf-play-overlay"
            onClick={(e) => { e.stopPropagation(); onPlayVideo(post); }}
          >
            <div className="gf-play-btn">
              <Play size={24} fill="white" />
            </div>
            {post.duration && (
              <span className="gf-video-duration">0:{post.duration}</span>
            )}
          </button>
        )}

        {/* Heart burst (doble tap) */}
        <AnimatePresence>
          {showHeartBurst && (
            <motion.div
              className="gf-heart-burst"
              initial={{ scale: 0, opacity: 0.9 }}
              animate={{ scale: 1.15, opacity: 1 }}
              exit={{ scale: 1.3, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 16 }}
            >
              <Heart size={96} fill="white" strokeWidth={0} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats overlay top-left */}
        {post.viewCount && post.viewCount > 1000 && (
          <div className="gf-views-badge">
            <Eye size={11} /> {fmt(post.viewCount)} vistas
          </div>
        )}
      </div>

      {/* ── Actions: solo iconos, como Instagram ── */}
      <div className="gf-actions-row">
        <div className="gf-actions-left">
          <button
            className={`gf-action-btn gf-action-icon ${post.isLiked ? 'liked' : ''}`}
            onClick={() => onLike(post.id)}
            aria-label="Me gusta"
          >
            <Heart size={24} fill={post.isLiked ? '#e11d48' : 'none'} strokeWidth={post.isLiked ? 0 : 1.8} />
          </button>
          <button className="gf-action-btn gf-action-icon" onClick={() => onOpenComments(post)} aria-label="Comentar">
            <MessageCircle size={24} strokeWidth={1.8} />
          </button>
          <button className="gf-action-btn gf-action-icon" onClick={() => onShare(post)} aria-label="Compartir">
            <Share2 size={22} strokeWidth={1.8} />
          </button>
        </div>
        <button
          className={`gf-action-btn gf-action-icon ${saved ? 'saved' : ''}`}
          onClick={() => onSave(post.id)}
          aria-label="Guardar"
        >
          <Bookmark size={22} fill={saved ? 'var(--text-main)' : 'none'} strokeWidth={1.8} />
        </button>
      </div>

      {/* ── Likes + Caption ── */}
      <div className="gf-caption-block">
        <div className="gf-likes-count">{fmt(post.likes)} Me gusta</div>

        {post.ordersFromPost && post.ordersFromPost > 10 && (
          <div className="gf-orders-badge">
            <Zap size={11} /> {post.ordersFromPost} personas pidieron esto hoy
          </div>
        )}

        <p className="gf-caption-text">
          <strong className="gf-handle" onClick={() => onOpenProfile(post.tenantId)} style={{ cursor: 'pointer' }}>
            {handle}{' '}
          </strong>
          <span className="gf-caption-dish">{post.dishEmoji} {post.dishName}</span>{' — '}
          {expanded ? post.desc : post.desc.slice(0, 100)}
          {post.desc.length > 100 && (
            <button className="gf-expand-btn" onClick={() => setExpanded(v => !v)}>
              {expanded ? ' ver menos' : '... más'}
            </button>
          )}
        </p>

        {post.hashtags && post.hashtags.length > 0 && (
          <p className="gf-hashtags-inline">
            {post.hashtags.map(h => <span key={h} className="gf-hashtag">{h}</span>)}
          </p>
        )}

        <button className="gf-view-comments" onClick={() => onOpenComments(post)}>
          {post.commentsCount > 0
            ? `Ver los ${post.commentsCount} comentarios`
            : 'Escribir el primer comentario'}
        </button>
      </div>

      {/* ── CTA ── */}
      {(!post.productId || post.productId === post.id) ? (
        <div className="gf-cta-block">
          <div style={{
            padding: '12px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '12px', fontSize: '0.8rem', color: '#F59E0B', textAlign: 'center', fontWeight: 600
          }}>
            📋 Solo para referencia - No disponible para pedido
          </div>
        </div>
      ) : !product ? (
        <div className="gf-cta-block">
          <div style={{
            padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px', fontSize: '0.8rem', color: '#EF4444', textAlign: 'center', fontWeight: 600
          }}>
            🚫 Este producto ya no está disponible
          </div>
        </div>
      ) : !product.available ? (
        <div className="gf-cta-block">
          <div style={{
            padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px', fontSize: '0.8rem', color: '#EF4444', textAlign: 'center', fontWeight: 600
          }}>
            ⚠️ Agotado temporalmente
          </div>
        </div>
      ) : (
        <div className="gf-cta-block">
          <button
            className="gf-order-btn"
            onClick={() => onOrder(post.productId, post.tenantId)}
          >
            <ShoppingBag size={16} />
            <span>Añadir al Carrito</span>
            <span className="gf-order-price">${post.price.toLocaleString('es-CO')}</span>
          </button>
          {isVideo && (
            <button className="gf-watch-btn" onClick={() => onPlayVideo(post)}>
              <Play size={14} fill="currentColor" /> Ver video del plato
            </button>
          )}
        </div>
      )}

    </motion.article>
  );
};

/* ── Main Component ──────────────────────────────────────── */
export const CustomerDeliveryApp: React.FC = () => {
  const {
    cities, zones, selectedCityId, selectedZoneId, setSelectedZone,
    tenants, posts, toggleLikePost, products,
    addToCart, removeFromCart, cart, setCurrentTenantBySlug, orders,
    isCatalogLoading, catalogError, showToast, currentUser, authMode,
    remotePosts
  } = useApp();

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'directory' | 'orders' | 'support'>('feed');
  const [supportInitialOrder, setSupportInitialOrder] = useState<string | null>(null);
  const [supportInitialTicketId, setSupportInitialTicketId] = useState<string | null>(null);
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [videoPost, setVideoPost] = useState<Post | null>(null);
  const [selectedCommentsPostId, setSelectedCommentsPostId] = useState<string | null>(null);
  const [selectedTenantProfile, setSelectedTenantProfile] = useState<string | null>(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState<'all' | '$' | '$$' | '$$$'>('all');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyVideo, setOnlyVideo] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'price_low' | 'price_high'>('recent');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // --- Saved posts hydration (persist across filter/sort changes) ---
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    (async () => {
      const ids = await fetchRemoteSavedPosts(userId);
      setSavedPosts(new Set(ids));
    })();
  }, [currentUser]);

  const activeCity = cities.find(c => c.id === selectedCityId) || cities[0];

  const tenantMap = useMemo(() => {
    const map = new Map<string, Tenant>();
    tenants.forEach(t => {
      map.set(t.id, t);
      map.set(t.slug, t);
    });
    return map;
  }, [tenants]);

  // Use remotePosts when in remote mode for accurate like/comment counts
  const activePosts = authMode === 'remote' ? remotePosts : posts;

  const zoneFilteredPosts = useMemo(() => {
      const city = activeCity ?? cities.find(c => c.isActive) ?? cities[0] ?? { id: 'fallback-city', name: 'Fallback', slug: 'fallback', countryCode: 'CO', currencyCode: 'COP', isActive: true };
      const hasTenantsInCity = Array.from(tenantMap.values()).some(t => t.status === 'active' && t.cityId === city.id);

      return activePosts.reduce<Post[]>((acc, post) => {
        const tenant = tenantMap.get(post.tenantId);
        if (!tenant || tenant.status !== 'active') {
          return acc;
        }
        if (city && hasTenantsInCity && tenant.cityId !== city.id) {
          return acc;
        }
        if (selectedZoneId && tenant.zoneId !== selectedZoneId) {
          return acc;
        }
        acc.push({
          ...post,
          tenantName: tenant.name,
          tenantCategory: tenant.category,
          tenantLogoEmoji: tenant.logoEmoji || '🍽️'
        });
        return acc;
      }, []);
    }, [activePosts, tenantMap, selectedZoneId, activeCity, cities]);

  const activeTenantsInZoneCount = useMemo(() => {
    const hasTenantsInCity = activeCity ? tenants.some(t => t.status === 'active' && t.cityId === activeCity.id) : false;
    return tenants.filter(t => {
      if (t.status !== 'active') return false;
      if (activeCity && hasTenantsInCity && t.cityId !== activeCity.id) return false;
      if (!selectedZoneId) return true;
      return t.zoneId === selectedZoneId;
    }).length;
  }, [tenants, selectedZoneId, activeCity]);

  const currentZoneObj = zones.find(z => z.id === selectedZoneId);
  const zoneInfoText = !selectedZoneId
    ? `Descubre lo nuevo cerca de ti en ${activeCity ? activeCity.name : 'tu ciudad'}.`
    : `Descubre restaurantes y platos en Zona ${currentZoneObj?.name || ''}.`;

  const cartTotal = cart.reduce((s, i) => s + (i.product?.price || 0) * i.quantity, 0);
  const cartQty   = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTenantId = cart[0]?.product?.tenantId;
  const cartTenant = cartTenantId ? tenantMap.get(cartTenantId) : null;
  const isCartTenantOpen = cartTenant?.isOpen ?? true;
  const activeOrdersCount = orders.filter(o =>
    o &&
    o.status !== 'delivered' &&
    o.status !== 'cancelled' &&
    Boolean(currentUser) &&
    ((Boolean(currentUser?.id) && o.customerId === currentUser?.id) ||
      (Boolean(currentUser?.email) && o.customerId === currentUser?.email))
  ).length;

  const handleOrder = useCallback((productId: string, tenantIdOrSlug: string) => {
    const targetTenant = tenants.find(t => t.id === tenantIdOrSlug || t.slug === tenantIdOrSlug);
    if (targetTenant) {
      if (!targetTenant.isOpen) {
        showToast('❌ Este restaurante está cerrado temporalmente y no acepta pedidos.');
        return;
      }
      setCurrentTenantBySlug(targetTenant.slug);
    } else {
      setCurrentTenantBySlug(tenantIdOrSlug);
    }
    
    // Find product in catalog
    const prod = products.find(p => p.id === productId);
    if (!prod) {
      showToast('⚠️ Este producto no está disponible en el catálogo actual.');
      console.warn(`Producto no encontrado: ${productId}`);
      return;
    }
    
    addToCart(prod);
  }, [tenants, products, addToCart, setCurrentTenantBySlug, showToast]);

  const toggleSave = async (id: string) => {
    if (authMode === 'remote' && currentUser?.id) {
      await toggleRemoteSave(id, currentUser.id);
    }
    setSavedPosts(prev => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  };

  const handleShare = useCallback(async (post: Post) => {
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${post.tenantName} - ${post.dishName}`,
          text: `¡Mira esta delicia de ${post.tenantName} en GastroSync!`,
          url
        });
        return;
      } catch {
        // user canceled or error
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado al portapapeles');
    } catch {
      showToast('Publicación lista para compartir: ' + url);
    }
  }, [showToast]);

  // Category filter chips
  const CATEGORIES = ['all', 'Italiana', 'Hamburguesas', 'Asiática', 'Típica', 'Mexicana'];

  const hasActiveFilters = searchQuery.trim() !== '' || filterCategory !== 'all' || priceFilter !== 'all' || onlyOpen || onlyVideo || sortBy !== 'recent';

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterCategory('all');
    setPriceFilter('all');
    setOnlyOpen(false);
    setOnlyVideo(false);
    setSortBy('recent');
  }, []);

  const filtered = useMemo(() => {
    let result = zoneFilteredPosts;

    // 1. Text search
    const q = searchQuery.trim().toLowerCase();
    if (q !== '') {
      result = result.filter(p => {
        const tenant = tenantMap.get(p.tenantId);
        const zoneName = zones.find((z: { id: string; name: string }) => z.id === tenant?.zoneId)?.name.toLowerCase() || '';
        const cityName = activeCity?.name.toLowerCase() || '';

        const matchDish = p.dishName.toLowerCase().includes(q);
        const matchDesc = p.desc.toLowerCase().includes(q);
        const matchTenant = p.tenantName.toLowerCase().includes(q);
        const matchCategory = p.tenantCategory.toLowerCase().includes(q);
        const matchHash = p.hashtags?.some(h => h.toLowerCase().includes(q)) ?? false;
        
        const qTerms = q.split(/\s+/).filter(t => t.length > 2);
        const matchZone = zoneName.includes(q) || qTerms.some(term => zoneName.includes(term));
        const matchCity = cityName.includes(q) || qTerms.some(term => cityName.includes(term));

        return matchDish || matchDesc || matchTenant || matchCategory || matchHash || matchZone || matchCity;
      });
    }

    // 2. Category filter
    if (filterCategory !== 'all') {
      result = result.filter(p => p.tenantCategory && p.tenantCategory.includes(filterCategory));
    }

    // 3. Price range filter
    if (priceFilter !== 'all') {
      result = result.filter(p => {
        const tenant = tenantMap.get(p.tenantId);
        return tenant?.priceRange === priceFilter;
      });
    }

    // 4. Only open
    if (onlyOpen) {
      result = result.filter(p => {
        const tenant = tenantMap.get(p.tenantId);
        return tenant?.isOpen === true;
      });
    }

    // 5. Only video
    if (onlyVideo) {
      result = result.filter(p => p.mediaType === 'video');
    }

    // 6. Sorting
    if (sortBy !== 'recent') {
      result = [...result].sort((a, b) => {
        switch (sortBy) {
          case 'popular': return b.likes - a.likes;
          case 'price_low': return a.price - b.price;
          case 'price_high': return b.price - a.price;
          default: return 0;
        }
      });
    }

    return result;
  }, [zoneFilteredPosts, searchQuery, filterCategory, priceFilter, onlyOpen, onlyVideo, sortBy, tenantMap, activeCity, zones]);

  return (
    <div className="tab-content active">

      {/* ── Top Nav Bar ── */}
      <div className="gf-top-bar">
        <div className="gf-top-left">
          <h2 className="gf-page-title">¿Qué se te antoja hoy?</h2>
          <p className="gf-page-sub">Explora sabores cerca de ti en {activeCity ? activeCity.name : 'tu ciudad'}</p>
        </div>
        <div className="gf-tab-pills">
          <button className={`gf-tab-pill ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>
            <Zap size={15} /> Feed
          </button>
          <button className={`gf-tab-pill ${activeTab === 'directory' ? 'active' : ''}`} onClick={() => setActiveTab('directory')}>
            <MapPin size={15} /> Locales
          </button>
          <button className={`gf-tab-pill ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')} style={{ position: 'relative' }}>
            <Package size={15} /> Pedidos
            {activeOrdersCount > 0 && <span className="tab-orders-badge">{activeOrdersCount}</span>}
          </button>
          <button className={`gf-tab-pill ${activeTab === 'support' ? 'active' : ''}`} onClick={() => setActiveTab('support')}>
            <MessageCircle size={15} /> Soporte
          </button>
        </div>
        <NotificationBell onOpenTicket={(ticketId) => {
          setSupportInitialTicketId(ticketId);
          setActiveTab('support');
        }} />
      </div>

      {activeTab === 'feed' && (
        <>
          {/* ── Location Selector Bar ── */}
          <div style={{ marginBottom: '1.25rem' }}>
            <LocationSelector variant="full" />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              padding: '8px 12px 0 12px'
            }}>
              <span>{zoneInfoText}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                {activeTenantsInZoneCount} local{activeTenantsInZoneCount !== 1 ? 'es' : ''} · {zoneFilteredPosts.length} post{zoneFilteredPosts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* ── Dynamic Reels & Stories Bar ── */}
          <StoriesBar onOrderProduct={handleOrder} />

          {/* ── Search & Advanced Filters ── */}
          <div className="gf-search-wrapper">
            {/* Search input row */}
            <div className="gf-search-input-row">
              <div className="gf-search-field">
                <Search size={16} className="gf-search-icon" />
                <input
                  type="text"
                  className="gf-search-input"
                  placeholder="Buscar plato, restaurante, tipo de cocina..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="gf-search-clear" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                className={`gf-toggle-advanced ${showAdvanced ? 'open' : ''}`}
                onClick={() => setShowAdvanced(v => !v)}
                aria-label="Alternar filtros avanzados"
                aria-expanded={showAdvanced}
              >
                <SlidersHorizontal size={14} />
                Filtros
              </button>
            </div>

            {/* Advanced filters panel */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  className="gf-advanced-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: 'hidden' }}
                >
                  {/* Price range */}
                  <div className="gf-filter-group">
                    <span className="gf-filter-group-label">Precio</span>
                    {(['all', '$', '$$', '$$$'] as const).map(p => (
                      <button
                        key={p}
                        className={`gf-price-chip ${priceFilter === p ? 'active' : ''}`}
                        onClick={() => setPriceFilter(p)}
                      >
                        {p === 'all' ? 'Todos' : p}
                      </button>
                    ))}
                  </div>

                  <div className="gf-filter-divider" />

                  {/* Toggles */}
                  <button
                    className={`gf-toggle-btn ${onlyOpen ? 'active' : ''}`}
                    onClick={() => setOnlyOpen(v => !v)}
                  >
                    <CheckCircle2 size={13} />
                    Solo abiertos
                  </button>

                  <button
                    className={`gf-toggle-btn ${onlyVideo ? 'active' : ''}`}
                    onClick={() => setOnlyVideo(v => !v)}
                  >
                    <Play size={13} />
                    Solo video
                  </button>

                  <div className="gf-filter-divider" />

                  {/* Sort */}
                  <div className="gf-sort-wrapper">
                    <span className="gf-filter-group-label">Ordenar</span>
                    <select
                      className="gf-sort-select"
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as 'recent' | 'popular' | 'price_low' | 'price_high')}
                    >
                      <option value="recent">⏱️ Más reciente</option>
                      <option value="popular">❤️ Más popular</option>
                      <option value="price_low">💰 Precio ↑</option>
                      <option value="price_high">💎 Precio ↓</option>
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results bar */}
            {hasActiveFilters && (
              <div className="gf-results-bar">
                <span className="gf-results-count">
                  <strong>{filtered.length}</strong> resultado{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
                </span>
                <button className="gf-clear-all-btn" onClick={clearAllFilters}>
                  <X size={12} /> Limpiar filtros
                </button>
              </div>
            )}
          </div>

          {/* ── Category Filter ── */}
          <div className="gf-filter-bar">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`gf-filter-chip ${filterCategory === cat ? 'active' : ''}`}
                onClick={() => setFilterCategory(cat)}
              >
                {cat === 'all' ? '✨ Todo' : cat}
              </button>
            ))}
          </div>

          {/* ── Feed + Cart layout ── */}
          <div className="gf-feed-layout">

            {/* Posts column */}
            <div className="gf-posts-column">
              {isCatalogLoading ? (
                <div 
                  style={{
                    textAlign: 'center',
                    padding: '3.5rem 2rem',
                    background: 'var(--glass-light)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '24px',
                    color: 'var(--text-muted)',
                    margin: '1rem 0'
                  }}
                >
                  <div className="gf-spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px', border: '3px solid var(--primary-glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <h3 style={{ fontSize: '1.2rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
                    Cargando catálogo...
                  </h3>
                  <p style={{ fontSize: '0.88rem' }}>Estamos preparando las mejores opciones gastronómicas para ti.</p>
                </div>
              ) : catalogError ? (
                <div 
                  style={{
                    textAlign: 'center',
                    padding: '3.5rem 2rem',
                    background: 'var(--glass-light)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '24px',
                    color: 'var(--text-muted)',
                    margin: '1rem 0'
                  }}
                >
                  <X size={48} style={{ color: '#EF4444', margin: '0 auto 1rem' }} />
                  <h3 style={{ fontSize: '1.2rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
                    Oops, algo salió mal
                  </h3>
                  <p style={{ fontSize: '0.88rem' }}>{catalogError}</p>
                </div>
              ) : tenants.length === 0 ? (
                <div 
                  style={{
                    textAlign: 'center',
                    padding: '3.5rem 2rem',
                    background: 'var(--glass-light)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid var(--primary-glass-border)',
                    borderRadius: '24px',
                    color: 'var(--text-muted)',
                    margin: '1rem 0'
                  }}
                >
                  <Building2 size={48} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                  <h3 style={{ fontSize: '1.3rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
                    🚀 Pronto en GastroSync {activeCity ? activeCity.name : ''}
                  </h3>
                  <p style={{ fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                    Aún no hay restaurantes aliados activos en esta zona. Pronto podrás descubrir los mejores sabores de {activeCity ? activeCity.name : 'tu ciudad'} aquí.
                  </p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    ¿Tienes un restaurante o negocio gastronómico en {activeCity ? activeCity.name : 'tu ciudad'}?
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ borderRadius: '12px', fontWeight: 800, padding: '10px 22px' }}
                    onClick={() => {
                      const btn = document.querySelector('.gf-partner-apply-btn') as HTMLButtonElement | null;
                      if (btn) btn.click();
                    }}
                  >
                    🤝 Únete como Restaurante Aliado
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div 
                  style={{
                    textAlign: 'center',
                    padding: '3.5rem 2rem',
                    background: 'var(--glass-light)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '24px',
                    color: 'var(--text-muted)',
                    margin: '1rem 0'
                  }}
                >
                  <MapPin size={48} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                  <h3 style={{ fontSize: '1.3rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
                    No hay publicaciones disponibles en esta zona
                  </h3>
                  <p style={{ fontSize: '0.88rem', maxWidth: '420px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                    No encontramos platillos para el filtro actual. Explora la oferta gastronómica de toda la ciudad.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ borderRadius: '12px', fontWeight: 800, padding: '10px 20px' }}
                    onClick={() => {
                      setSelectedZone(null);
                      setFilterCategory('all');
                      setSearchQuery('');
                    }}
                  >
                    Ver toda {activeCity ? activeCity.name : 'la ciudad'}
                  </button>
                </div>
              ) : (
                filtered.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    tenant={tenants.find(t => t.id === post.tenantId)}
                    product={products.find(p => p.id === post.productId)}
                    onLike={toggleLikePost}
                    onOrder={handleOrder}
                    onPlayVideo={setVideoPost}
                    saved={savedPosts.has(post.id)}
                    onSave={toggleSave}
                    onOpenComments={(post) => setSelectedCommentsPostId(post.id)}
                    onOpenProfile={setSelectedTenantProfile}
                    onShare={handleShare}
                  />
                ))
              )}
            </div>

            {/* ── Sticky Sidebar ── */}
            <aside className="gf-sidebar">

              {/* Cart */}
              <div className="gf-cart-card">
                <div className="gf-cart-head">
                  <div className="gf-cart-title"><ShoppingBag size={18} /> Mi Carrito</div>
                  {cartQty > 0 && <span className="gf-cart-qty">{cartQty}</span>}
                </div>

                <div className="gf-cart-body">
                  {cart.length === 0 ? (
                    <div className="gf-cart-empty">
                      <ShoppingBag size={32} style={{ color: '#CBD5E1', marginBottom: 8 }} />
                      <p>Tu carrito está vacío</p>
                      <span>Añade platillos desde el feed</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: '0 1rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Restaurante actual: <strong style={{ color: 'var(--primary)' }}>{cartTenant?.name}</strong>
                      </div>
                      <div className="gf-cart-items">
                        {cart.map((item, i) => (
                          <div key={i} className="gf-cart-item">
                            <div className="gf-ci-emoji">{item.product.emoji}</div>
                            <div className="gf-ci-info">
                              <span className="gf-ci-name">{item.product.name}</span>
                              <span className="gf-ci-price">${item.product.price.toLocaleString('es-CO')} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(x{item.quantity})</span></span>
                            </div>
                            <div className="gf-ci-controls">
                              <button className="gf-ci-btn" onClick={() => removeFromCart(item.product.id)}>
                                {item.quantity === 1 ? <Trash2 size={11} /> : <Minus size={11} />}
                              </button>
                              <span>{item.quantity}</span>
                              <button className="gf-ci-btn add" onClick={() => addToCart(item.product)}><Plus size={11} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div style={{ padding: '10px 15px' }}>
                        <button 
                          className="btn btn-outline" 
                          style={{ width: '100%', fontSize: '0.8rem', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          onClick={() => {
                            if (cartTenant) {
                              setCurrentTenantBySlug(cartTenant.slug);
                              setActiveTab('directory');
                              setSelectedTenantProfile(cartTenant.id);
                            }
                          }}
                        >
                          <Plus size={14} /> Agregar bebidas y acompañamientos
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="gf-cart-footer">
                    <div className="gf-cart-rows">
                      <div className="gf-cart-row"><span>Subtotal</span><span>${cartTotal.toLocaleString('es-CO')}</span></div>
                      <div className="gf-cart-row"><span>🛵 Domicilio</span><span className="gf-free">Gratis</span></div>
                    </div>
                    <div className="gf-cart-total">
                      <span>Total</span>
                      <strong>${cartTotal.toLocaleString('es-CO')} COP</strong>
                    </div>
                    {isCartTenantOpen ? (
                      <button className="gf-checkout-btn" onClick={() => setIsPaymentOpen(true)}>
                        <Bike size={17} /> Pagar a Domicilio
                      </button>
                    ) : (
                      <button className="gf-checkout-btn" disabled style={{ background: 'rgba(255, 255, 255, 0.1)', cursor: 'not-allowed', color: 'var(--text-muted)' }}>
                        <Clock size={17} /> Restaurante Cerrado
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Trending */}
              <div className="gf-trending-card">
                <div className="gf-card-section-title"><TrendingUp size={15} /> En Tendencia</div>
                {activePosts.slice().sort((a, b) => b.likes - a.likes).slice(0, 4).map((p, i) => (
                  <div key={p.id} className="gf-trending-row">
                    <span className="gf-trend-rank">#{i + 1}</span>
                    <span className="gf-trend-emoji">{p.dishEmoji}</span>
                    <div className="gf-trend-info">
                      <span className="gf-trend-name">{p.dishName}</span>
                      <span className="gf-trend-by">{p.tenantName}</span>
                    </div>
                    <span className="gf-trend-likes">❤️ {fmt(p.likes)}</span>
                  </div>
                ))}
              </div>

              {/* No ads banner */}
              <div className="gf-no-ads-card">
                <div className="gf-no-ads-icon">🚫📢</div>
                <p><strong>Contenido real de restaurantes.</strong> Lo que ves aquí son publicaciones directas de los locales aliados en Armenia.</p>
                <a href="#" className="gf-no-ads-link">¿Eres restaurante? Únete <ExternalLink size={11} /></a>
              </div>

            </aside>
          </div>
        </>
      )}

      {activeTab === 'directory' && (
        <RestaurantDirectory
          selectedZone={selectedZoneId || 'all'}
          onOpenTenantProfile={(tenantId) => setSelectedTenantProfile(tenantId)}
          onSelectTenantAndGoToFeed={(slug) => {
            const targetTenant = tenants.find(t => t.slug === slug || t.id === slug);
            if (targetTenant) {
              setSearchQuery(targetTenant.name);
            }
            setActiveTab('feed');
          }}
        />
      )}

      {activeTab === 'orders' && (
        <div className="my-orders-wrapper">
          <div className="my-orders-page-header">
            <div>
              <h2 className="feed-page-title">📦 Mis Pedidos</h2>
              <p className="feed-page-subtitle">Sigue el estado de tus pedidos en tiempo real</p>
            </div>
            {activeOrdersCount > 0 && (
              <div className="active-orders-alert">
                <span className="alert-dot" />
                {activeOrdersCount} pedido{activeOrdersCount > 1 ? 's' : ''} en camino
              </div>
            )}
          </div>
          <MyOrders onNeedHelp={(orderId) => {
            setSupportInitialOrder(orderId);
            setActiveTab('support');
          }} />
        </div>
      )}

      {activeTab === 'support' && (
      <Suspense fallback={<FallbackLoader message="Cargando soporte..." />}>
        <SupportCenter initialOrderId={supportInitialOrder} initialTicketId={supportInitialTicketId} />
      </Suspense>
      )}

      {/* ── Video Modal ── */}
      {videoPost && (
        <VideoModal
          post={videoPost}
          tenant={tenants.find(t => t.id === videoPost.tenantId)}
          onClose={() => setVideoPost(null)}
          onOrder={() => handleOrder(videoPost.productId, videoPost.tenantId)}
        />
      )}

      {/* ── Comments Modal ── */}
      {selectedCommentsPostId && (
        (() => {
          const selectedCommentsPost = activePosts.find(p => p.id === selectedCommentsPostId);
          if (!selectedCommentsPost) return null;
          return (
          <Suspense fallback={null}>
            <CommentsModal
              post={selectedCommentsPost}
              tenant={tenants.find(t => t.id === selectedCommentsPost.tenantId)}
              onClose={() => setSelectedCommentsPostId(null)}
            />
          </Suspense>
          );
        })()
      )}

      {/* ── Restaurant Profile Modal ── */}
      {selectedTenantProfile && (
        <Suspense fallback={<FallbackLoader message="Cargando local..." />}>
          <RestaurantProfileModal
            tenantId={selectedTenantProfile}
            initialTab="menu"
            onClose={() => setSelectedTenantProfile(null)}
            onOrderProduct={handleOrder}
            onOpenCart={() => {
              setSelectedTenantProfile(null);
              setIsMobileCartOpen(true);
            }}
          />
        </Suspense>
      )}

      <FloatingCartButton 
        isVisible={!isMobileCartOpen && !isPaymentOpen}
        onOpen={() => setIsMobileCartOpen(true)}
      />

      {isMobileCartOpen && (
        <Suspense fallback={null}>
          <CartModal
            isOpen={isMobileCartOpen}
            onClose={() => setIsMobileCartOpen(false)}
            onCheckout={() => setIsPaymentOpen(true)}
            onContinueShopping={() => {
              const cartTenantId = cart.length > 0 ? cart[0].product.tenantId : null;
              const cartTenant = cartTenantId ? tenants.find(t => t.id === cartTenantId) : null;
              if (cartTenant) {
                setCurrentTenantBySlug(cartTenant.slug);
                setActiveTab('directory');
                setSelectedTenantProfile(cartTenant.id);
              }
            }}
          />
        </Suspense>
      )}

      <Suspense fallback={<FallbackLoader message="Cargando pago..." />}>
        {isPaymentOpen && <PaymentModal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} orderType="Domicilio" />}
      </Suspense>
    </div>
  );
};
