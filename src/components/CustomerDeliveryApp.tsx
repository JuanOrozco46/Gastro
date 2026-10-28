import React, { useState, useCallback, useMemo, Suspense, useEffect, useRef } from 'react';
import { useApp } from '../context/useApp';
import { RestaurantDirectory } from './RestaurantDirectory';
import { MyOrders } from './MyOrders';
import { StoriesBar } from './StoriesBar';
import { FloatingCartButton } from './FloatingCartButton';
import { NotificationBell } from './NotificationBell';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { getPrimarySavedAddress, loadUserAddressBank } from '../utils/addressBank';
import { motion } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, ShoppingBag,
  TrendingUp, MapPin, Trash2, Plus, Minus,
  Package, Play, Eye, X, ExternalLink,
  Bookmark, Zap, Search, SlidersHorizontal, CheckCircle2, Building2, Clock, User,
  AlertCircle, Info, ShieldCheck, ChevronDown, LogOut, Volume2, VolumeX, Maximize2
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toggleRemoteSave, fetchRemoteSavedPosts } from '../services/supabaseDataService';
import type { Post, Tenant, Product } from '../types';

const PaymentModal = lazyWithRetry(() => import('./PaymentModal').then(m => ({ default: m.PaymentModal })));
const SupportCenter = lazyWithRetry(() => import('./SupportCenter').then(m => ({ default: m.SupportCenter })));
const CartModal = lazyWithRetry(() => import('./CartModal').then(m => ({ default: m.CartModal })));
const RestaurantProfileModal = lazyWithRetry(() => import('./RestaurantProfileModal').then(m => ({ default: m.RestaurantProfileModal })));
const CommentsModal = lazyWithRetry(() => import('./CommentsModal').then(m => ({ default: m.CommentsModal })));
const UserProfileModal = lazyWithRetry(() => import('./UserProfileModal').then(m => ({ default: m.UserProfileModal })));

const FallbackLoader: React.FC<{ message: string }> = ({ message }) => (
  <div className="gf-fallback-loader">
    <div className="gf-fallback-spinner" />
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
      <button className="video-modal-close" onClick={onClose} aria-label="Cerrar video"><X size={20} /></button>

      <div className="video-modal-player">
        {post.mediaUrl ? (
          <video
            preload="none"
            poster={post.image}
            src={post.mediaUrl}
            controls
            autoPlay
            className="video-modal-media"
          />
        ) : post.legacyExternalYoutubeId ? (
          <div className="video-modal-legacy">
            <p>Este video antiguo ya no está disponible en la plataforma.</p>
          </div>
        ) : (
          <img loading="lazy" decoding="async" src={post.image} alt={post.dishName} className="video-modal-media" />
        )}
      </div>

      <div className="video-modal-footer">
        <div className="video-modal-info">
          <div className="video-modal-logo">
            {tenant?.logoUrl ? (
              <img loading="lazy" decoding="async" src={tenant.logoUrl} alt={tenant?.name} />
            ) : (
              <span className="video-modal-emoji">{tenant?.logoEmoji || post.tenantLogoEmoji || '🍽️'}</span>
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
  hasActiveStory?: boolean;
  onLike: (id: string) => void;
  onOrder: (productId: string, tenantSlug: string) => void;
  onPlayVideo: (post: Post) => void;
  saved: boolean;
  onSave: (id: string) => void;
  onOpenComments: (post: Post) => void;
  onOpenProfile: (tenantId: string) => void;
  onShare: (post: Post) => void;
  onQuickComment?: (postId: string, text: string) => Promise<boolean>;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  tenant,
  product,
  hasActiveStory = false,
  onLike,
  onOrder,
  onPlayVideo,
  saved,
  onSave,
  onOpenComments,
  onOpenProfile,
  onShare,
  onQuickComment
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [isInlineMuted, setIsInlineMuted] = useState(true);
  const [quickComment, setQuickComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const lastTapRef = useRef(0);
  const heartTimerRef = useRef<number | null>(null);
  const mediaWrapperRef = useRef<HTMLDivElement | null>(null);
  const inlineVideoRef = useRef<HTMLVideoElement | null>(null);

  const isVideo = post.mediaType === 'video';
  const hasInlineVideo = Boolean(isVideo && post.mediaUrl);
  const canDirectOrder = Boolean(
    post.productId && post.productId !== post.id && product && product.available
  );

  // Autoplay inline video when 60% visible in viewport (Instagram Feed / Reels pattern)
  useEffect(() => {
    if (!hasInlineVideo) return;
    const containerEl = mediaWrapperRef.current;
    const videoEl = inlineVideoRef.current;
    if (!containerEl || !videoEl || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            videoEl.play().catch(() => {});
          } else {
            videoEl.pause();
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );

    observer.observe(containerEl);
    return () => observer.disconnect();
  }, [hasInlineVideo]);

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

  const handleQuickCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickComment.trim();
    if (!trimmed || !onQuickComment || isSubmittingComment) return;
    setIsSubmittingComment(true);
    const ok = await onQuickComment(post.id, trimmed);
    if (ok) {
      setQuickComment('');
    }
    setIsSubmittingComment(false);
  };

  const handle = `@${post.tenantName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
  const recentComments = (post.comments || []).slice(-2);

  return (
    <motion.article
      className="gf-post-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >

      {/* ── Header (autor con anillo estilo Instagram) ── */}
      <header className="gf-post-header">
        <div className="gf-post-author" onClick={() => onOpenProfile(post.tenantId)}>
          <div className={`gf-post-avatar-ring ${hasActiveStory ? 'has-story' : ''}`}>
            <div className={`gf-author-avatar ${tenant?.logoUrl ? 'has-logo' : ''}`}>
              {tenant?.logoUrl ? (
                <img loading="lazy" decoding="async" src={tenant.logoUrl} alt={tenant.name} className="gf-author-avatar-img" />
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
              {isVideo && <span className="gf-video-chip"><Play size={8} fill="currentColor" /> REEL</span>}
            </div>
            <div className="gf-author-sub">
              <span className="gf-category-pill">{tenant?.category || post.tenantCategory}</span>
              {(post.tenantAddress || tenant?.address) && (
                <span className="gf-address"><MapPin size={10} /> {post.tenantAddress || tenant?.address}</span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="gf-post-header-action"
          onClick={() => onOpenProfile(post.tenantId)}
          aria-label={`Ver carta de ${tenant?.name || post.tenantName}`}
        >
          Ver carta
        </button>
      </header>

      {/* ── Media 4:5 a sangrado completo, video inline autoplay y doble tap = like ── */}
      <div ref={mediaWrapperRef} className="gf-media-wrapper" onClick={handleMediaTap}>
        {hasInlineVideo ? (
          <>
            <video
              ref={inlineVideoRef}
              poster={post.image}
              src={post.mediaUrl}
              muted={isInlineMuted}
              loop
              playsInline
              preload="metadata"
              onLoadedData={() => setIsMediaLoaded(true)}
              className={`gf-media-img ${isMediaLoaded ? 'is-loaded' : ''}`}
            />
            <button
              type="button"
              className="gf-inline-audio-btn"
              onClick={e => {
                e.stopPropagation();
                setIsInlineMuted(m => !m);
              }}
              aria-label={isInlineMuted ? 'Activar sonido' : 'Silenciar video'}
              title={isInlineMuted ? 'Activar sonido' : 'Silenciar video'}
            >
              {isInlineMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <button
              type="button"
              className="gf-inline-expand-btn"
              onClick={e => {
                e.stopPropagation();
                onPlayVideo(post);
              }}
              aria-label={`Abrir video de ${post.dishName} en pantalla completa`}
              title="Expandir video"
            >
              <Maximize2 size={14} />
            </button>
          </>
        ) : (
          <>
            <img
              loading="lazy"
              decoding="async"
              src={post.image}
              alt={post.dishName}
              onLoad={() => setIsMediaLoaded(true)}
              className={`gf-media-img ${isMediaLoaded ? 'is-loaded' : ''}`}
            />
            {isVideo && (
              <button
                className="gf-play-overlay"
                onClick={(e) => { e.stopPropagation(); onPlayVideo(post); }}
                aria-label={`Reproducir video de ${post.dishName}`}
              >
                <div className="gf-play-btn">
                  <Play size={24} fill="currentColor" />
                </div>
                {post.duration && (
                  <span className="gf-video-duration">0:{post.duration}</span>
                )}
              </button>
            )}
          </>
        )}

        {/* Etiqueta flotante estilo Instagram Shopping */}
        {canDirectOrder && (
          <button
            type="button"
            className="gf-ig-shop-tag"
            onClick={e => {
              e.stopPropagation();
              onOrder(post.productId, post.tenantId);
            }}
            aria-label={`Pedir ${post.dishName} por $${post.price.toLocaleString('es-CO')}`}
          >
            <span className="gf-ig-shop-icon">
              <ShoppingBag size={13} />
            </span>
            <span className="gf-ig-shop-copy">
              <strong>{post.dishName}</strong>
              <span>${post.price.toLocaleString('es-CO')} · Pedir</span>
            </span>
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
              <Heart size={96} fill="currentColor" strokeWidth={0} />
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

      {/* ── Actions Row (Instagram Icon Bar) ── */}
      <div className="gf-actions-row">
        <div className="gf-actions-left">
          <button
            className={`gf-action-btn gf-action-icon ${post.isLiked ? 'liked' : ''}`}
            onClick={() => onLike(post.id)}
            aria-label="Me gusta"
          >
            <Heart size={24} fill={post.isLiked ? 'currentColor' : 'none'} strokeWidth={post.isLiked ? 0 : 1.8} />
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
          <Bookmark size={22} fill={saved ? 'currentColor' : 'none'} strokeWidth={1.8} />
        </button>
      </div>

      {/* ── Likes + Caption + Inline Comments Preview ── */}
      <div className="gf-caption-block">
        <div className="gf-likes-meta-row">
          <span className="gf-likes-count">{fmt(post.likes)} Me gusta</span>
          {post.ordersFromPost && post.ordersFromPost > 10 && (
            <span className="gf-orders-badge">
              <Zap size={11} /> {post.ordersFromPost} pedidos hoy
            </span>
          )}
        </div>

        <p className="gf-caption-text">
          <strong className="gf-handle" onClick={() => onOpenProfile(post.tenantId)}>
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

        {recentComments.length > 0 && (
          <div className="gf-inline-comments-preview">
            {recentComments.map(c => (
              <p key={c.id} className="gf-inline-comment-line">
                <strong>{c.userHandle ? `@${c.userHandle}` : c.userName}</strong>{' '}
                <span>{c.text}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ── CTA ── */}
      {(!post.productId || post.productId === post.id) ? (
        <div className="gf-cta-block">
          <div className="gf-post-status-notice reference">
            <Info size={14} />
            <span>Publicación editorial — Explora el menú del restaurante para pedir</span>
          </div>
        </div>
      ) : !product ? (
        <div className="gf-cta-block">
          <div className="gf-post-status-notice closed">
            <AlertCircle size={14} />
            <span>Este producto ya no está disponible</span>
          </div>
        </div>
      ) : !product.available ? (
        <div className="gf-cta-block">
          <div className="gf-post-status-notice warning">
            <Clock size={14} />
            <span>Agotado temporalmente</span>
          </div>
        </div>
      ) : (
        <div className="gf-cta-block">
          <button
            className="gf-order-btn"
            onClick={() => onOrder(post.productId, post.tenantId)}
          >
            <span className="gf-order-btn-label">
              <ShoppingBag size={16} />
              <span>Añadir al Carrito</span>
            </span>
            <span className="gf-order-price">${post.price.toLocaleString('es-CO')}</span>
          </button>
          {isVideo && (
            <button className="gf-watch-btn" onClick={() => onPlayVideo(post)}>
              <Play size={14} fill="currentColor" /> Ver video del plato
            </button>
          )}
        </div>
      )}

      {/* ── Inline Comment Input (Instagram Bottom Row) ── */}
      {onQuickComment && (
        <form className="gf-inline-comment-form" onSubmit={handleQuickCommentSubmit}>
          <input
            type="text"
            className="gf-inline-comment-input"
            placeholder="Agrega un comentario..."
            value={quickComment}
            onChange={e => setQuickComment(e.target.value)}
            maxLength={400}
          />
          {quickComment.trim().length > 0 && (
            <button
              type="submit"
              className="gf-inline-comment-submit"
              disabled={isSubmittingComment}
            >
              {isSubmittingComment ? '...' : 'Publicar'}
            </button>
          )}
        </form>
      )}

    </motion.article>
  );
};

/* ── Main Component ──────────────────────────────────────── */
export const CustomerDeliveryApp: React.FC = () => {
  const {
    cities, zones, selectedCityId, selectedZoneId, setSelectedZone,
    tenants, posts, stories, toggleLikePost, addComment, products,
    addToCart, removeFromCart, cart, setCurrentTenantBySlug, orders,
    isCatalogLoading, catalogError, showToast, currentUser, authMode,
    remotePosts, logout
  } = useApp();

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileModalSection, setProfileModalSection] = useState<'identity' | 'addresses'>('identity');
  const [activeTab, setActiveTab] = useState<'feed' | 'directory' | 'orders' | 'support'>('feed');
  const [supportInitialOrder, setSupportInitialOrder] = useState<string | null>(null);
  const [supportInitialTicketId, setSupportInitialTicketId] = useState<string | null>(null);
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [videoPost, setVideoPost] = useState<Post | null>(null);
  const [selectedCommentsPostId, setSelectedCommentsPostId] = useState<string | null>(null);
  const [selectedTenantProfile, setSelectedTenantProfile] = useState<string | null>(null);
  const [selectedTenantInitialTab, setSelectedTenantInitialTab] = useState<'menu' | 'content' | 'reviews' | 'info'>('menu');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState<'all' | '$' | '$$' | '$$$'>('all');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyVideo, setOnlyVideo] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'price_low' | 'price_high'>('recent');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const openProfileModal = useCallback((section: 'identity' | 'addresses' = 'identity') => {
    setProfileModalSection(section);
    setIsProfileModalOpen(true);
  }, []);

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
  const currentZoneObj = zones.find(z => z.id === selectedZoneId);

  const userAddressBank = useMemo(() => {
    if (currentUser?.savedAddresses && currentUser.savedAddresses.length > 0) {
      return currentUser.savedAddresses;
    }
    return loadUserAddressBank(currentUser);
  }, [currentUser]);

  const primarySavedAddress = useMemo(
    () => getPrimarySavedAddress(userAddressBank),
    [userAddressBank]
  );

  const activeAddressHeadline =
    primarySavedAddress?.address ||
    currentUser?.defaultAddress ||
    'Configurar dirección de entrega';
  const activeAddressLabel = primarySavedAddress?.label || 'Casa';

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

    return activePosts.reduce<Post[]>((acc, post) => {
      const tenant = tenantMap.get(post.tenantId);
      if (!tenant || tenant.status !== 'active') {
        return acc;
      }
      if (city && tenant.cityId !== city.id) {
        return acc;
      }
      if (selectedZoneId && tenant.zoneId !== selectedZoneId) {
        return acc;
      }
      const tCityName = cities.find(c => c.id === tenant.cityId)?.name;
      const tZoneName = zones.find(z => z.id === tenant.zoneId)?.name;
      const enrichedLocation = [
        tCityName,
        tZoneName ? `Zona ${tZoneName}` : null,
        tenant.address
      ]
        .filter(Boolean)
        .join(' · ');

      acc.push({
        ...post,
        tenantName: tenant.name,
        tenantCategory: tenant.category,
        tenantLogoEmoji: tenant.logoEmoji || '🍽️',
        tenantAddress: enrichedLocation || post.tenantAddress
      });
      return acc;
    }, []);
  }, [activePosts, tenantMap, selectedZoneId, activeCity, cities, zones]);

  const hasTenantsInActiveCity = activeCity ? tenants.some(t => t.status === 'active' && t.cityId === activeCity.id) : false;

  const cartTotal = cart.reduce((s, i) => s + (i.product?.price || 0) * i.quantity, 0);
  const cartQty   = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTenantId = cart[0]?.product?.tenantId;
  const cartTenant = cartTenantId ? tenantMap.get(cartTenantId) : null;
  const isCartTenantOpen = (cartTenant?.isOpen ?? true) && cartTenant?.acceptingOrders !== false;
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
        showToast('Este restaurante está cerrado temporalmente y no acepta pedidos.');
        return;
      }
      setCurrentTenantBySlug(targetTenant.slug);
    } else {
      setCurrentTenantBySlug(tenantIdOrSlug);
    }
    
    // Find product in catalog
    const prod = products.find(p => p.id === productId);
    if (!prod) {
      showToast('Este producto no está disponible en el catálogo actual.');
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

  const hasActiveFilters = searchQuery.trim() !== '' || filterCategory !== 'all' || priceFilter !== 'all' || onlyOpen || onlyVideo || onlySaved || sortBy !== 'recent';

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterCategory('all');
    setPriceFilter('all');
    setOnlyOpen(false);
    setOnlyVideo(false);
    setOnlySaved(false);
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

    // 5b. Only saved posts
    if (onlySaved) {
      result = result.filter(p => savedPosts.has(p.id));
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
  }, [zoneFilteredPosts, searchQuery, filterCategory, priceFilter, onlyOpen, onlyVideo, onlySaved, savedPosts, sortBy, tenantMap, activeCity, zones]);

  return (
    <div className="tab-content active">

      {/* ── Top Nav Bar (Rappi-style Address Trigger + Navigation + Actions + Logout) ── */}
      <div className="gf-top-bar gs-customer-top-bar">
        <button
          type="button"
          className="gs-rappi-address-trigger"
          onClick={() => openProfileModal('addresses')}
          title="Cambiar dirección de entrega o ciudad principal"
          aria-label="Cambiar dirección de entrega o ciudad principal"
        >
          <span className="gs-rappi-address-icon">
            <MapPin size={17} />
          </span>
          <span className="gs-rappi-address-copy">
            <span className="gs-rappi-address-street">{activeAddressHeadline}</span>
            <span className="gs-rappi-address-meta">
              <strong>{activeAddressLabel}</strong>
              <span>· {activeCity ? activeCity.name : 'Colombia'}{currentZoneObj ? ` (${currentZoneObj.name})` : ''}</span>
              <ChevronDown size={14} />
            </span>
          </span>
        </button>

        <div className="gf-tab-pills">
          <button className={`gf-tab-pill ${activeTab === 'feed' && !isProfileModalOpen ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>
            <Zap size={15} /> Feed
          </button>
          <button className={`gf-tab-pill ${activeTab === 'directory' && !isProfileModalOpen ? 'active' : ''}`} onClick={() => setActiveTab('directory')}>
            <MapPin size={15} /> Locales
          </button>
          <button className={`gf-tab-pill ${activeTab === 'orders' && !isProfileModalOpen ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
            <Package size={15} /> Pedidos
            {activeOrdersCount > 0 && <span className="tab-orders-badge">{activeOrdersCount}</span>}
          </button>
          <button className={`gf-tab-pill ${activeTab === 'support' && !isProfileModalOpen ? 'active' : ''}`} onClick={() => setActiveTab('support')}>
            <MessageCircle size={15} /> Soporte
          </button>
          <button
            type="button"
            className={`gf-tab-pill gs-desktop-profile-pill ${isProfileModalOpen ? 'active' : ''}`}
            onClick={() => openProfileModal('identity')}
            title="Editar mi perfil y Banco de Ubicaciones"
            aria-label="Abrir mi perfil"
          >
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="gs-top-profile-avatar"
              />
            ) : (
              <User size={15} />
            )}
            <span>{currentUser?.username ? `@${currentUser.username}` : 'Mi Perfil'}</span>
          </button>
        </div>

        <div className="gs-top-actions-cluster">
          <NotificationBell
            variant="light"
            onOpenTicket={ticketId => {
              setSupportInitialTicketId(ticketId);
              setActiveTab('support');
            }}
            onNavigate={dest => {
              if (dest === 'orders' || dest === 'support' || dest === 'directory') {
                setActiveTab(dest);
              }
            }}
          />

          <button
            type="button"
            className="gs-top-logout-btn"
            onClick={logout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={15} />
            <span className="gs-top-logout-label">Salir</span>
          </button>
        </div>
      </div>

      {activeTab === 'feed' && (
        <>
          {/* ── Dynamic Reels & Stories Bar (Restaurantes de tu ciudad) ── */}
          <StoriesBar onOrderProduct={handleOrder} />

          {/* ── Search & Advanced Filters (Compact single-row capsule) ── */}
          <div className="gf-search-wrapper">
            {/* Search input row */}
            <div className="gf-search-input-row">
              <div className="gf-search-field">
                <Search size={16} className="gf-search-icon" />
                <input
                  type="text"
                  className="gf-search-input"
                  placeholder={`¿Qué quieres pedir hoy en ${activeCity ? activeCity.name : 'tu ciudad'}?`}
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
                <span>Filtros</span>
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

                  <button
                    className={`gf-toggle-btn ${onlySaved ? 'active' : ''}`}
                    onClick={() => setOnlySaved(v => !v)}
                  >
                    <Bookmark size={13} />
                    Solo guardados
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
                      <option value="recent">Más reciente</option>
                      <option value="popular">Más popular</option>
                      <option value="price_low">Menor precio</option>
                      <option value="price_high">Mayor precio</option>
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
                className={`gf-filter-chip ${filterCategory === cat && !onlySaved ? 'active' : ''}`}
                onClick={() => {
                  setOnlySaved(false);
                  setFilterCategory(cat);
                }}
              >
                {cat === 'all' ? 'Todo' : cat}
              </button>
            ))}
            <button
              type="button"
              className={`gf-filter-chip ${onlySaved ? 'active' : ''}`}
              onClick={() => setOnlySaved(v => !v)}
              title="Ver mis publicaciones guardadas"
            >
              <Bookmark size={12} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />
              Guardados{savedPosts.size > 0 ? ` (${savedPosts.size})` : ''}
            </button>
          </div>

          {/* ── Feed + Cart layout ── */}
          <div className="gf-feed-layout">

            {/* Posts column */}
            <div className="gf-posts-column">
              {isCatalogLoading ? (
                <div className="gf-state-panel">
                  <div className="gf-spinner-ring" />
                  <h3 className="gf-state-title">Cargando catálogo...</h3>
                  <p className="gf-state-desc">Estamos preparando las mejores opciones gastronómicas para ti.</p>
                </div>
              ) : catalogError ? (
                <div className="gf-state-panel">
                  <div className="gf-state-icon-wrap danger">
                    <AlertCircle size={26} />
                  </div>
                  <h3 className="gf-state-title">Oops, algo salió mal</h3>
                  <p className="gf-state-desc">{catalogError}</p>
                </div>
              ) : !hasTenantsInActiveCity ? (
                <div className="gf-state-panel">
                  <div className="gf-state-icon-wrap">
                    <Building2 size={26} />
                  </div>
                  <h3 className="gf-state-title">
                    Pronto en GastroSync {activeCity ? activeCity.name : ''}
                  </h3>
                  <p className="gf-state-desc">
                    Aún no hay restaurantes aliados activos en {activeCity ? activeCity.name : 'esta ciudad'}. Pronto podrás descubrir los mejores sabores locales aquí.
                  </p>
                  <p className="gf-state-desc">
                    ¿Tienes un restaurante o negocio gastronómico en {activeCity ? activeCity.name : 'tu ciudad'}?
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary gf-state-cta"
                    onClick={() => {
                      const btn = document.querySelector('.gf-partner-apply-btn') as HTMLButtonElement | null;
                      if (btn) btn.click();
                    }}
                  >
                    Únete como Restaurante Aliado
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="gf-state-panel">
                  <div className="gf-state-icon-wrap">
                    <MapPin size={26} />
                  </div>
                  <h3 className="gf-state-title">
                    No hay publicaciones disponibles en esta zona
                  </h3>
                  <p className="gf-state-desc">
                    No encontramos platillos para el filtro actual. Explora la oferta gastronómica de toda la ciudad.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary gf-state-cta"
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
                    hasActiveStory={stories.some(s => (s.tenantId === post.tenantId) && (s.items || []).length > 0)}
                    onLike={toggleLikePost}
                    onOrder={handleOrder}
                    onPlayVideo={setVideoPost}
                    saved={savedPosts.has(post.id)}
                    onSave={toggleSave}
                    onOpenComments={(post) => setSelectedCommentsPostId(post.id)}
                    onOpenProfile={setSelectedTenantProfile}
                    onShare={handleShare}
                    onQuickComment={addComment}
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
                      <ShoppingBag size={32} className="gf-cart-empty-icon" />
                      <p>Tu carrito está vacío</p>
                      <span>Añade platillos desde el feed</span>
                    </div>
                  ) : (
                    <>
                      <div className="gf-cart-tenant-note">
                        Restaurante actual: <strong>{cartTenant?.name}</strong>
                      </div>
                      <div className="gf-cart-items">
                        {cart.map((item, i) => (
                          <div key={i} className="gf-cart-item">
                            <div className="gf-ci-emoji">{item.product.emoji}</div>
                            <div className="gf-ci-info">
                              <span className="gf-ci-name">{item.product.name}</span>
                              <span className="gf-ci-price">
                                ${item.product.price.toLocaleString('es-CO')}{' '}
                                <span className="gf-ci-qty-tag">(x{item.quantity})</span>
                              </span>
                            </div>
                            <div className="gf-ci-controls">
                              <button className="gf-ci-btn" onClick={() => removeFromCart(item.product.id)} aria-label="Disminuir cantidad">
                                {item.quantity === 1 ? <Trash2 size={11} /> : <Minus size={11} />}
                              </button>
                              <span>{item.quantity}</span>
                              <button className="gf-ci-btn add" onClick={() => addToCart(item.product)} aria-label="Aumentar cantidad"><Plus size={11} /></button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="gf-cart-upsell-wrap">
                        <button
                          type="button"
                          className="btn btn-outline gf-cart-upsell-btn"
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

                {cart.length > 0 && (() => {
                  const deliveryFee = cartTenant?.deliveryFee ?? 0;
                  const estimatedTotal = cartTotal + deliveryFee;
                  return (
                    <div className="gf-cart-footer">
                      <div className="gf-cart-rows">
                        <div className="gf-cart-row"><span>Subtotal</span><span>${cartTotal.toLocaleString('es-CO')}</span></div>
                        <div className="gf-cart-row">
                          <span>Domicilio (estimado)</span>
                          <span className={deliveryFee === 0 ? "gf-free" : undefined}>
                            {deliveryFee === 0 ? 'Gratis' : `$${deliveryFee.toLocaleString('es-CO')}`}
                          </span>
                        </div>
                      </div>
                      <div className="gf-cart-total">
                        <span>Total estimado</span>
                        <strong>${estimatedTotal.toLocaleString('es-CO')} COP</strong>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: '#64748B', textAlign: 'center', margin: '4px 0 8px', lineHeight: 1.3 }}>
                        Tarifa para domicilio. Si recoges en local o pides en mesa se descuenta en checkout.
                      </p>
                      {isCartTenantOpen ? (
                        <button className="gf-checkout-btn" onClick={() => setIsPaymentOpen(true)}>
                          <ShoppingBag size={17} /> Continuar al Checkout
                        </button>
                      ) : (
                        <button className="gf-checkout-btn is-disabled" disabled>
                          <Clock size={17} /> Restaurante Cerrado
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Trending */}
              {zoneFilteredPosts.length > 0 && (
                <div className="gf-trending-card">
                  <div className="gf-card-section-title"><TrendingUp size={15} /> En Tendencia</div>
                  {zoneFilteredPosts.slice().sort((a, b) => b.likes - a.likes).slice(0, 4).map((p, i) => (
                    <div key={p.id} className="gf-trending-row">
                      <span className="gf-trend-rank">#{i + 1}</span>
                      <span className="gf-trend-emoji">{p.dishEmoji}</span>
                      <div className="gf-trend-info">
                        <span className="gf-trend-name">{p.dishName}</span>
                        <span className="gf-trend-by">{p.tenantName}</span>
                      </div>
                      <span className="gf-trend-likes">
                        <Heart size={11} fill="currentColor" />
                        {fmt(p.likes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* No ads banner */}
              <div className="gf-no-ads-card">
                <div className="gf-no-ads-header">
                  <ShieldCheck size={15} />
                  <span>Gastronomía sin anuncios</span>
                </div>
                <p><strong>Contenido real de restaurantes.</strong> Lo que ves aquí son publicaciones directas de los locales aliados en {activeCity ? activeCity.name : 'tu ciudad'}.</p>
                <button
                  type="button"
                  className="gf-no-ads-link"
                  onClick={() => setActiveTab('directory')}
                >
                  Explorar directorio de restaurantes <ExternalLink size={11} />
                </button>
              </div>

            </aside>
          </div>
        </>
      )}

      {activeTab === 'directory' && (
        <RestaurantDirectory
          selectedZone={selectedZoneId || 'all'}
          onOpenTenantProfile={(tenantId, tab = 'menu') => {
            setSelectedTenantInitialTab(tab);
            setSelectedTenantProfile(tenantId);
          }}
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
              <h2 className="feed-page-title">Mis Pedidos</h2>
              <p className="feed-page-subtitle">Sigue el estado de tus pedidos en tiempo real</p>
            </div>
            {activeOrdersCount > 0 && (
              <div className="active-orders-alert">
                <span className="alert-dot" />
                {activeOrdersCount} pedido{activeOrdersCount > 1 ? 's' : ''} en camino
              </div>
            )}
          </div>
          <MyOrders
            onNeedHelp={(orderId) => {
              setSupportInitialOrder(orderId);
              setActiveTab('support');
            }}
            onOpenTenantReviews={(tenantId) => {
              setSelectedTenantInitialTab('reviews');
              setSelectedTenantProfile(tenantId);
            }}
          />
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
            initialTab={selectedTenantInitialTab}
            onClose={() => {
              setSelectedTenantProfile(null);
              setSelectedTenantInitialTab('menu');
            }}
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

      {/* ── Barra de Navegación Inferior Nativa para Móviles (<= 768px) ── */}
      <nav className="gf-mobile-bottom-nav" aria-label="Navegación principal móvil">
        <button
          type="button"
          className={`gf-mobile-nav-item ${activeTab === 'feed' && !isProfileModalOpen ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('feed');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Zap size={19} />
          <span>Feed</span>
        </button>

        <button
          type="button"
          className={`gf-mobile-nav-item ${activeTab === 'directory' && !isProfileModalOpen ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('directory');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <MapPin size={19} />
          <span>Locales</span>
        </button>

        <button
          type="button"
          className={`gf-mobile-nav-item ${activeTab === 'orders' && !isProfileModalOpen ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('orders');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <div className="gf-mobile-nav-icon-wrap">
            <Package size={19} />
            {activeOrdersCount > 0 && (
              <span className="gf-mobile-nav-badge">{activeOrdersCount}</span>
            )}
          </div>
          <span>Pedidos</span>
        </button>

        <button
          type="button"
          className={`gf-mobile-nav-item ${activeTab === 'support' && !isProfileModalOpen ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('support');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <MessageCircle size={19} />
          <span>Soporte</span>
        </button>

        <button
          type="button"
          className={`gf-mobile-nav-item ${isProfileModalOpen ? 'active' : ''}`}
          onClick={() => openProfileModal('identity')}
        >
          <User size={19} />
          <span>Mi Perfil</span>
        </button>
      </nav>

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

      <Suspense fallback={null}>
        {isProfileModalOpen && (
          <UserProfileModal
            isOpen={isProfileModalOpen}
            initialSection={profileModalSection}
            onClose={() => setIsProfileModalOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
};
