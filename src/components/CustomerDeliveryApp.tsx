import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { PaymentModal } from './PaymentModal';
import { RestaurantDirectory } from './RestaurantDirectory';
import { MyOrders } from './MyOrders';
import { StoriesBar } from './StoriesBar';
import { CommentsModal } from './CommentsModal';
import { RestaurantProfileModal } from './RestaurantProfileModal';
import { motion } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, ShoppingBag, Bike,
  TrendingUp, Star, MapPin, Trash2, Plus, Minus,
  Package, Play, Eye, X, ExternalLink, ChevronRight,
  Bookmark, Zap, Search, SlidersHorizontal, CheckCircle2, Building2, Clock
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toggleRemoteSave } from '../services/supabaseDataService';
import type { Post } from '../types';

/* ── Format numbers ──────────────────────────────────────── */
const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

/* ── Video Modal ─────────────────────────────────────────── */
const VideoModal: React.FC<{ post: Post; onClose: () => void; onOrder: () => void }> = ({ post, onClose, onOrder }) => (
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
          <video
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
          <img src={post.image} alt={post.dishName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>

      <div className="video-modal-footer">
        <div className="video-modal-info">
          <span className="video-modal-emoji">{post.tenantLogoEmoji}</span>
          <div>
            <h4>{post.dishName}</h4>
            <span>{post.tenantName}</span>
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
  post, onLike, onOrder, onPlayVideo, saved, onSave, onOpenComments, onOpenProfile, onShare
}) => {
  const [expanded, setExpanded] = useState(false);
  const isVideo = post.mediaType === 'video';

  return (
    <motion.article
      className="gf-post-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -4 }}
    >

      {/* ── Header ── */}
      <header className="gf-post-header">
        <div className="gf-post-author" onClick={() => onOpenProfile(post.tenantId)} style={{ cursor: 'pointer' }}>
          <div className="gf-author-avatar">{post.tenantLogoEmoji}</div>
          <div className="gf-author-meta">
            <div className="gf-author-top">
              <strong className="gf-author-name">{post.tenantName}</strong>
              {isVideo && <span className="gf-video-chip"><Play size={9} fill="currentColor" /> VIDEO</span>}
            </div>
            <div className="gf-author-sub">
              <span className="gf-category-pill">{post.tenantCategory}</span>
              {post.tenantAddress && (
                <span className="gf-address"><MapPin size={10} /> {post.tenantAddress}</span>
              )}
            </div>
          </div>
        </div>
        <div className="gf-post-time">{post.timeAgo}</div>
      </header>

      {/* ── Dish title ── */}
      <h3 className="gf-dish-title">{post.dishEmoji} {post.dishName}</h3>

      {/* ── Media ── */}
      <div className="gf-media-wrapper">
        <img src={post.image} alt={post.dishName} className="gf-media-img" loading="lazy" />

        {/* Video overlay */}
        {isVideo && (
          <button className="gf-play-overlay" onClick={() => onPlayVideo(post)}>
            <div className="gf-play-btn">
              <Play size={24} fill="white" />
            </div>
            {post.duration && (
              <span className="gf-video-duration">0:{post.duration}</span>
            )}
          </button>
        )}

        {/* Price overlay */}
        <div className="gf-price-overlay">
          <span className="gf-price-label">desde</span>
          <span className="gf-price-amount">${post.price.toLocaleString('es-CO')}</span>
          <span className="gf-price-cop">COP</span>
        </div>

        {/* Stats overlay top-left */}
        {post.viewCount && post.viewCount > 1000 && (
          <div className="gf-views-badge">
            <Eye size={11} /> {fmt(post.viewCount)} vistas
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="gf-actions-row">
        <div className="gf-actions-left">
          <button
            className={`gf-action-btn ${post.isLiked ? 'liked' : ''}`}
            onClick={() => onLike(post.id)}
          >
            <Heart size={22} fill={post.isLiked ? '#e11d48' : 'none'} strokeWidth={post.isLiked ? 0 : 2} />
            <span>{fmt(post.likes)}</span>
          </button>
          <button className="gf-action-btn" onClick={() => onOpenComments(post)}>
            <MessageCircle size={22} />
            <span>{post.commentsCount}</span>
          </button>
          <button className="gf-action-btn" onClick={() => onShare(post)}>
            <Share2 size={20} />
          </button>
        </div>
        <button
          className={`gf-action-btn ${saved ? 'saved' : ''}`}
          onClick={() => onSave(post.id)}
        >
          <Bookmark size={20} fill={saved ? 'var(--primary)' : 'none'} />
        </button>
      </div>

      {/* ── Caption ── */}
      <div className="gf-caption-block">
        {post.ordersFromPost && post.ordersFromPost > 10 && (
          <div className="gf-orders-badge">
            <Zap size={11} /> {post.ordersFromPost} personas pidieron esto hoy
          </div>
        )}

        <p className="gf-caption-text">
          <strong className="gf-handle" onClick={() => onOpenProfile(post.tenantId)} style={{ cursor: 'pointer' }}>
            @{post.tenantName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}{' '}
          </strong>
          {expanded ? post.desc : post.desc.slice(0, 100)}
          {post.desc.length > 100 && (
            <button className="gf-expand-btn" onClick={() => setExpanded(v => !v)}>
              {expanded ? ' ver menos' : '... más'}
            </button>
          )}
        </p>

        {post.hashtags && (
          <div className="gf-hashtags">
            {post.hashtags.map(h => <span key={h} className="gf-hashtag">{h}</span>)}
          </div>
        )}

        <button className="gf-view-comments" onClick={() => onOpenComments(post)}>
          {post.commentsCount > 0
            ? `Ver los ${post.commentsCount} comentarios`
            : 'Escribir el primer comentario'} <ChevronRight size={13} />
        </button>
      </div>

      {/* ── CTA ── */}
      <div className="gf-cta-block">
        <div className="gf-stars-row">
          {[1,2,3,4,5].map(i => <Star key={i} size={12} fill="#E6942B" strokeWidth={0} />)}
          <span className="gf-stars-label">· {post.commentsCount} reseñas</span>
        </div>
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

    </motion.article>
  );
};

/* ── Main Component ──────────────────────────────────────── */
export const CustomerDeliveryApp: React.FC = () => {
  const {
    cities, zones, tenants, posts, toggleLikePost, products,
    addToCart, removeFromCart, cart, setCurrentTenantBySlug, orders,
    isCatalogLoading, catalogError, showToast, currentUser, authMode
  } = useApp();

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'directory' | 'orders'>('feed');
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [videoPost, setVideoPost] = useState<Post | null>(null);
  const [selectedCommentsPost, setSelectedCommentsPost] = useState<Post | null>(null);
  const [selectedTenantProfile, setSelectedTenantProfile] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState<'all' | '$' | '$$' | '$$$'>('all');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyVideo, setOnlyVideo] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'price_low' | 'price_high'>('recent');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeCity = cities.find(c => c.name.includes('Armenia')) || cities[0];
  const activeZones = useMemo(() => {
    if (!activeCity) return [];
    return zones.filter(z => z.cityId === activeCity.id && z.isActive);
  }, [zones, activeCity]);

  const [selectedZone, setSelectedZone] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('gs_selected_zone_v1');
      if (!saved || saved === 'all') return 'all';
      const isValid = zones.some(z => z.id === saved && z.isActive && z.cityId === activeCity.id);
      return isValid ? saved : 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('gs_selected_zone_v1', selectedZone);
    } catch {}
  }, [selectedZone]);

  const tenantMap = useMemo(() => {
    return new Map(tenants.map(t => [t.id, t]));
  }, [tenants]);

  const zoneFilteredPosts = useMemo(() => {
    return posts.reduce<Post[]>((acc, post) => {
      const tenant = tenantMap.get(post.tenantId);
      if (!tenant || tenant.status !== 'active' || !activeCity || tenant.cityId !== activeCity.id) {
        return acc;
      }
      if (selectedZone !== 'all' && tenant.zoneId !== selectedZone) {
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
  }, [posts, tenantMap, selectedZone, activeCity]);

  const activeTenantsInZoneCount = useMemo(() => {
    return tenants.filter(t => {
      if (t.status !== 'active' || !activeCity || t.cityId !== activeCity.id) return false;
      if (selectedZone === 'all') return true;
      return t.zoneId === selectedZone;
    }).length;
  }, [tenants, selectedZone, activeCity]);

  const currentZoneObj = zones.find(z => z.id === selectedZone);
  const zoneInfoText = selectedZone === 'all'
    ? 'Descubre lo nuevo cerca de ti en Armenia.'
    : `Descubre restaurantes y platos en ${currentZoneObj?.name || 'esta zona'}.`;

  const cartTotal = cart.reduce((s, i) => s + (i.product?.price || 0) * i.quantity, 0);
  const cartQty   = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTenantId = cart[0]?.product?.tenantId;
  const cartTenant = cartTenantId ? tenantMap.get(cartTenantId) : null;
  const isCartTenantOpen = cartTenant?.isOpen ?? true;
  const activeOrdersCount = orders.filter(o =>
    o && o.status !== 'delivered' &&
    o.type && (o.type.toLowerCase().includes('domicilio') || o.type.toLowerCase().includes('mesa'))
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
    const prod = products.find(p => p.id === productId);
    if (prod) addToCart(prod);
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
        const matchDish = p.dishName.toLowerCase().includes(q);
        const matchDesc = p.desc.toLowerCase().includes(q);
        const matchTenant = p.tenantName.toLowerCase().includes(q);
        const matchCategory = p.tenantCategory.toLowerCase().includes(q);
        const matchHash = p.hashtags?.some(h => h.toLowerCase().includes(q)) ?? false;
        return matchDish || matchDesc || matchTenant || matchCategory || matchHash;
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
  }, [zoneFilteredPosts, searchQuery, filterCategory, priceFilter, onlyOpen, onlyVideo, sortBy, tenantMap]);

  return (
    <div className="tab-content active">

      {/* ── Top Nav Bar ── */}
      <div className="gf-top-bar">
        <div className="gf-top-left">
          <h2 className="gf-page-title">¿Qué se te antoja hoy?</h2>
          <p className="gf-page-sub">Explora sabores cerca de ti en Armenia</p>
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
        </div>
      </div>

      {activeTab === 'feed' && (
        <>
          {/* ── Zone Selector Bar ── */}
          <div 
            style={{
              background: 'var(--glass-light)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '0.85rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ 
                  background: 'var(--primary-glow)', 
                  color: 'var(--primary)', 
                  padding: '6px', 
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <MapPin size={16} />
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Armenia
                  </span>
                  <strong style={{ fontSize: '0.9rem', color: 'white', display: 'block', fontWeight: 800 }}>
                    {activeCity ? `${activeCity.name}, Quindío` : 'Armenia, Quindío'}
                  </strong>
                </div>
              </div>

              {/* Zone Chips Group */}
              <div 
                role="toolbar" 
                aria-label="Seleccionar zona de Armenia"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}
              >
                <button
                  type="button"
                  aria-pressed={selectedZone === 'all'}
                  onClick={() => setSelectedZone('all')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '12px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    border: selectedZone === 'all' ? '1px solid var(--primary)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: selectedZone === 'all' ? 'var(--primary-glass-border)' : 'rgba(255, 255, 255, 0.04)',
                    color: selectedZone === 'all' ? 'white' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  🇨🇴 Toda Armenia
                </button>

                {activeZones.map(zone => {
                  const isSelected = selectedZone === zone.id;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedZone(zone.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '12px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        border: isSelected ? '1px solid var(--primary)' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? 'var(--primary-glass-border)' : 'rgba(255, 255, 255, 0.04)',
                        color: isSelected ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      📍 Zona {zone.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Zone Info Bar */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              fontSize: '0.78rem', 
              color: 'var(--text-muted)',
              paddingTop: '6px',
              borderTop: '1px dashed rgba(255, 255, 255, 0.08)'
            }}>
              <span>{zoneInfoText}</span>
              <span style={{ fontWeight: 700, color: 'white' }}>
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
                    🚀 Pronto en GastroSync Armenia
                  </h3>
                  <p style={{ fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                    Aún no hay restaurantes aliados activos. Pronto podrás descubrir los mejores sabores de Armenia aquí.
                  </p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    ¿Tienes un restaurante o negocio gastronómico en Armenia?
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
                      setSelectedZone('all');
                      setFilterCategory('all');
                      setSearchQuery('');
                    }}
                  >
                    Ver toda Armenia
                  </button>
                </div>
              ) : (
                filtered.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={toggleLikePost}
                    onOrder={handleOrder}
                    onPlayVideo={setVideoPost}
                    saved={savedPosts.has(post.id)}
                    onSave={toggleSave}
                    onOpenComments={setSelectedCommentsPost}
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
                {posts.slice().sort((a, b) => b.likes - a.likes).slice(0, 4).map((p, i) => (
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
        <RestaurantDirectory selectedZone={selectedZone} onSelectTenantAndGoToFeed={() => setActiveTab('feed')} />
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
          <MyOrders />
        </div>
      )}

      {/* ── Video Modal ── */}
      {videoPost && (
        <VideoModal
          post={videoPost}
          onClose={() => setVideoPost(null)}
          onOrder={() => handleOrder(videoPost.productId, videoPost.tenantId)}
        />
      )}

      {/* ── Comments Modal ── */}
      {selectedCommentsPost && (
        <CommentsModal
          post={selectedCommentsPost}
          onClose={() => setSelectedCommentsPost(null)}
        />
      )}

      {/* ── Restaurant Profile Modal ── */}
      {selectedTenantProfile && (
        <RestaurantProfileModal
          tenantId={selectedTenantProfile}
          onClose={() => setSelectedTenantProfile(null)}
          onOrderProduct={handleOrder}
        />
      )}

      <PaymentModal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} orderType="Domicilio" />
    </div>
  );
};
