import React, { useState, Suspense } from 'react';
import { useApp } from '../context/useApp';
import { getOperationalTenant } from '../utils/tenantHelpers';
import type { Post, Driver } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUploadInput } from './FileUploadInput';
import { ProfileTab } from './RestaurantAdmin/ProfileTab';
import { NotificationBell } from './NotificationBell';
import { RestaurantTablesAdmin } from './RestaurantTablesAdmin';
import { KdsBoard } from './KdsBoard';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { DashboardTab } from './RestaurantAdmin/DashboardTab';
import '../styles/admin-dashboard.css';
import {
  LayoutDashboard,
  QrCode,
  Utensils,
  Truck,
  Plus,
  Share2,
  Play,
  Eye,
  Heart,
  Sparkles,
  Trash2,
  Power,
  MapPin,
  BarChart3,
  MessageSquare,
  Users,
  AlertCircle,
  Package,
  Loader2,
  Check,
  DollarSign,
  FileText,
  Hash,
  Film,
  Image as ImageIcon,
  User,
  Phone,
  X,
  Save,
  Store,
  Star
} from 'lucide-react';

const FinancialAnalytics = lazyWithRetry(() =>
  import('./FinancialAnalytics').then(m => ({ default: m.FinancialAnalytics }))
);
const SupportTab = lazyWithRetry(() =>
  import('./RestaurantAdmin/SupportTab').then(m => ({ default: m.SupportTab }))
);
const MenuTab = lazyWithRetry(() =>
  import('./RestaurantAdmin/MenuTab').then(m => ({ default: m.MenuTab }))
);
const TeamTab = lazyWithRetry(() =>
  import('./RestaurantAdmin/TeamTab').then(m => ({ default: m.TeamTab }))
);
const ReviewsTab = lazyWithRetry(() =>
  import('./RestaurantAdmin/ReviewsTab').then(m => ({ default: m.ReviewsTab }))
);

const FallbackLoader: React.FC<{ message: string }> = ({ message }) => (
  <div className="rpa-card">
    <div className="rpa-card-body" style={{ alignItems: 'center', textAlign: 'center', padding: '3rem' }}>
      <Loader2 size={28} className="spin" style={{ color: 'var(--primary)' }} />
      <p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>{message}</p>
    </div>
  </div>
);

const VEHICLE_PRESETS = [
  '🏍️ Moto 125cc / 150cc',
  '🚲 Bicicleta / E-Bike',
  '🚗 Automóvil'
];

export const RestaurantAdmin: React.FC = () => {
  const {
    tenants,
    currentUser,
    toggleTenantOpenStatus,
    products,
    drivers,
    addDriver,
    deleteDriver,
    posts,
    createPost,
    deletePost,
    stories,
    createStoryItem,
    deleteStoryItem,
    orders
  } = useApp();

  const operatingTenant = getOperationalTenant(currentUser, tenants);

  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'orders' | 'profile' | 'content' | 'menu' | 'reviews' | 'analytics' | 'qr' | 'support' | 'team'
  >('dashboard');
  const [supportInitialTicketId, setSupportInitialTicketId] = useState<string | null>(null);

  // Driver form state
  const [showAddDriverForm, setShowAddDriverForm] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverVehicle, setDriverVehicle] = useState('🏍️ Moto 125cc / 150cc');
  const [driverPhone, setDriverPhone] = useState('');

  // Content Studio mode ('feed' = Publicar en el Feed | 'story' = Subir Historia 24h)
  const [contentPublishMode, setContentPublishMode] = useState<'feed' | 'story'>('feed');

  // Content creation (Post) form state
  const [postDishName, setPostDishName] = useState('');
  const [postDishEmoji, setPostDishEmoji] = useState('🍕');
  const [postPrice, setPostPrice] = useState('25000');
  const [postDesc, setPostDesc] = useState('');
  const [postHashtags, setPostHashtags] = useState('#GastroSync #ComidaArtesanal #SaborLocal');
  const [isDeletingPost, setIsDeletingPost] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postFormError, setPostFormError] = useState<string | null>(null);
  const [postMediaType, setPostMediaType] = useState<'photo' | 'video'>('video');
  const [postImage, setPostImage] = useState('');
  const [postMediaUrl, setPostMediaUrl] = useState('');
  const [postProductId, setPostProductId] = useState('');
  const [postMediaWidth, setPostMediaWidth] = useState<number | undefined>();
  const [postMediaHeight, setPostMediaHeight] = useState<number | undefined>();

  // Story creation (24h Story) form state
  const [storyProductId, setStoryProductId] = useState('');
  const [storyDishName, setStoryDishName] = useState('');
  const [storyPrice, setStoryPrice] = useState('25000');
  const [storyCaption, setStoryCaption] = useState('');
  const [storyMediaType, setStoryMediaType] = useState<'photo' | 'video'>('photo');
  const [storyMediaUrl, setStoryMediaUrl] = useState('');
  const [storyFormError, setStoryFormError] = useState<string | null>(null);
  const [isSubmittingStory, setIsSubmittingStory] = useState(false);
  const [isDeletingStory, setIsDeletingStory] = useState<string | null>(null);
  const [storyNowMs, setStoryNowMs] = useState<number>(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setStoryNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!operatingTenant) {
    return (
      <div className="rpa-card" style={{ maxWidth: '600px', margin: '2rem auto' }}>
        <div className="rpa-card-body" style={{ alignItems: 'center', textAlign: 'center', padding: '3.5rem 2rem' }}>
          <AlertCircle size={48} style={{ color: '#DC2626' }} />
          <h3 style={{ fontSize: '1.35rem', color: 'var(--text-main)', fontWeight: 900, margin: '8px 0 4px' }}>
            No tienes un restaurante asignado
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            Esta cuenta no está vinculada a ningún comercio activo. Inicia sesión con la cuenta oficial del restaurante.
          </p>
        </div>
      </div>
    );
  }

  const tenantProducts = products.filter(p => p.tenantId === operatingTenant.id && !p.isArchived);
  const tenantPosts = posts.filter(p => p.tenantId === operatingTenant.id);
  const tenantStoryGroup = stories.find(s => s.tenantId === operatingTenant.id);
  const tenantStoryItems = tenantStoryGroup ? tenantStoryGroup.items : [];
  const tenantDrivers = drivers.filter(d => d.tenantId === operatingTenant.id);
  const tenantOrders = orders
    .filter(o => o.tenantId === operatingTenant.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  const activeOrders = tenantOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');

  const handleAddDriverSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverName.trim() || !driverPhone.trim()) return;

    addDriver({
      name: driverName.trim(),
      vehicle: driverVehicle.trim(),
      phone: driverPhone.trim()
    });

    setDriverName('');
    setDriverPhone('');
    setShowAddDriverForm(false);
  };

  const handleCreatePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostFormError(null);

    const parsedPrice = parseFloat(postPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setPostFormError('El precio debe ser un número mayor a $0 COP.');
      return;
    }
    if (!Number.isInteger(parsedPrice)) {
      setPostFormError('El precio debe ser entero en pesos (COP), sin decimales.');
      return;
    }
    if (!postMediaUrl) {
      setPostFormError(
        postMediaType === 'video'
          ? 'Debes subir el archivo de video antes de publicar.'
          : 'Debes subir la foto del plato antes de publicar.'
      );
      return;
    }
    if (!postDishName.trim() || !postDesc.trim()) {
      setPostFormError('El nombre del plato y la descripción son obligatorios.');
      return;
    }

    const hashtagsArr = postHashtags
      .split(' ')
      .filter(h => h.trim().length > 0)
      .map(h => (h.startsWith('#') ? h : `#${h}`));

    const existingProduct = postProductId
      ? tenantProducts.find(p => p.id === postProductId)
      : tenantProducts.find(p => p.name.toLowerCase().includes(postDishName.toLowerCase()));
    const productId = existingProduct ? existingProduct.id : undefined;

    const finalImage =
      postMediaType === 'photo' ? postMediaUrl : postImage || operatingTenant.bannerUrl || '';

    setIsSubmittingPost(true);
    const ok = await createPost({
      tenantId: operatingTenant.id,
      tenantName: operatingTenant.name,
      tenantCategory: operatingTenant.category,
      tenantLogoEmoji: operatingTenant.logoEmoji || '🍽️',
      tenantAddress: operatingTenant.address,
      dishName: postDishName.trim(),
      dishEmoji: postDishEmoji,
      desc: postDesc.trim(),
      hashtags: hashtagsArr,
      price: Math.round(parsedPrice),
      image: finalImage,
      mediaType: postMediaType,
      mediaUrl: postMediaUrl,
      duration: postMediaType === 'video' ? 45 : undefined,
      productId: productId || '',
      width: postMediaWidth,
      height: postMediaHeight
    });
    setIsSubmittingPost(false);

    if (ok) {
      setPostDishName('');
      setPostProductId('');
      setPostDesc('');
      setPostMediaUrl('');
      setPostMediaWidth(undefined);
      setPostMediaHeight(undefined);
      setPostImage('');
    }
  };

  const handleCreateStorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoryFormError(null);

    if (!storyMediaUrl) {
      setStoryFormError(
        storyMediaType === 'video'
          ? 'Sube un video vertical para tu historia (máx. 8 MB).'
          : 'Sube una fotografía vertical o de plato para tu historia.'
      );
      return;
    }

    const parsedPrice = parseFloat(storyPrice || '0');
    if (storyDishName.trim() && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setStoryFormError('Ingresa un precio válido en pesos (COP).');
      return;
    }

    const existingProduct = storyProductId
      ? tenantProducts.find(p => p.id === storyProductId)
      : storyDishName.trim()
        ? tenantProducts.find(p => p.name.toLowerCase().includes(storyDishName.trim().toLowerCase()))
        : undefined;

    setIsSubmittingStory(true);
    const ok = await createStoryItem({
      tenantId: operatingTenant.id,
      dishName: storyDishName.trim() || existingProduct?.name || operatingTenant.name,
      price: existingProduct ? existingProduct.price : Math.max(0, Math.round(parsedPrice || 0)),
      productId: existingProduct?.id || '0',
      image: storyMediaType === 'photo' ? storyMediaUrl : (operatingTenant.bannerUrl || operatingTenant.logoUrl || storyMediaUrl),
      mediaType: storyMediaType,
      mediaUrl: storyMediaUrl,
      caption: storyCaption.trim() || undefined
    });
    setIsSubmittingStory(false);

    if (ok) {
      setStoryMediaUrl('');
      setStoryCaption('');
      setStoryDishName('');
      setStoryProductId('');
    }
  };

  const applyStoryPreset = (type: string) => {
    if (type === 'artesanal') {
      setPostDesc(
        `Preparado desde cero en la cocina de ${operatingTenant.name}. Receta artesanal horneada con dedicación para hoy.`
      );
      setPostHashtags('#ProcesoArtesanal #IngredientesLocales #GastroSync');
    } else if (type === 'promocion') {
      setPostDesc(
        `¡Especial del día en ${operatingTenant.name}! Haz tu pedido directo sin pagar tarifas extras y recíbelo bien caliente.`
      );
      setPostHashtags('#EspecialDelDía #SaborÚnico #DomicilioSinComisión');
    } else if (type === 'secreto') {
      setPostDesc(
        `El secreto que hace inolvidable a ${operatingTenant.name}. Selección fresca de esta mañana directo a tu plato.`
      );
      setPostHashtags('#RecetaDeLaCasa #CalidadGarantizada #Foodies');
    }
  };

  const postStep1Done = Boolean(postDishName.trim() && Number(postPrice) > 0);
  const postStep2Done = Boolean(postMediaUrl && postDesc.trim());
  const storyStep1Done = Boolean(storyMediaUrl);
  const driverStepDone = Boolean(driverName.trim() && driverPhone.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rpa-shell"
    >
      {/* ── HERO HEADER DEL RESTAURANTE ── */}
      <div className="rpa-hero">
        {operatingTenant.bannerUrl && (
          <div
            className="rpa-hero-banner-bg"
            style={{ backgroundImage: `url(${operatingTenant.bannerUrl})` }}
          />
        )}

        <div className="rpa-hero-content">
          <div className="rpa-hero-top">
            <div className="rpa-brand">
              <div className="rpa-brand-avatar">
                {operatingTenant.logoUrl ? (
                  <img src={operatingTenant.logoUrl} alt={operatingTenant.name} />
                ) : (
                  <span>{operatingTenant.logoEmoji || '🍽️'}</span>
                )}
              </div>
              <div>
                <div className="rpa-eyebrow">
                  <Sparkles size={11} /> Panel de Administración · GastroSync
                </div>
                <div className="rpa-title-row">
                  <h2 className="rpa-title">{operatingTenant.name}</h2>
                  <span className="rpa-category-pill">{operatingTenant.category}</span>
                </div>
                <p className="rpa-subtitle">
                  <span>
                    <MapPin size={13} style={{ color: '#F0A483', verticalAlign: 'middle' }} />{' '}
                    {operatingTenant.address}
                  </span>
                  <span>· Comisión Ética (3%)</span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <NotificationBell
                variant="dark"
                onOpenTicket={ticketId => {
                  setSupportInitialTicketId(ticketId);
                  setActiveTab('support');
                }}
                onNavigate={dest => {
                  if (dest === 'directory') {
                    setActiveTab('orders');
                  } else {
                    setActiveTab(dest);
                  }
                }}
              />
              <button
                type="button"
                className="pam-btn-ghost"
                style={{
                  color: '#FFFFFF',
                  borderColor: 'rgba(255,255,255,0.22)',
                  background: 'rgba(255,255,255,0.08)',
                  padding: '10px 16px'
                }}
                onClick={() => setActiveTab('profile')}
              >
                <Store size={16} /> Editar Perfil
              </button>
              <button
                type="button"
                className={`rpa-status-btn ${operatingTenant.isOpen ? 'open' : 'closed'}`}
                onClick={() => toggleTenantOpenStatus(operatingTenant.id)}
                title={operatingTenant.isOpen ? 'Haz clic para pausar pedidos temporalmente' : 'Haz clic para abrir el restaurante'}
              >
                <span className="rpa-status-dot" />
                <Power size={14} />
                <span>{operatingTenant.isOpen ? 'Local Abierto' : 'Local Cerrado'}</span>
              </button>
            </div>
          </div>

          {/* KPI Quick-Navigation Cards */}
          <div className="rpa-kpis">
            <div
              className={`rpa-kpi ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="rpa-kpi-label">Resumen Ejecutivo</span>
              <strong className="rpa-kpi-val" style={{ color: '#F0A483' }}>
                Panel Central
              </strong>
            </div>

            <div
              className={`rpa-kpi ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <span className="rpa-kpi-label">Pedidos Activos</span>
              <strong className="rpa-kpi-val" style={{ color: activeOrders.length > 0 ? '#F0A483' : '#FFFFFF' }}>
                {activeOrders.length} en cocina
              </strong>
            </div>

            <div
              className={`rpa-kpi ${activeTab === 'menu' ? 'active' : ''}`}
              onClick={() => setActiveTab('menu')}
            >
              <span className="rpa-kpi-label">Carta Digital</span>
              <strong className="rpa-kpi-val">{tenantProducts.length} platos</strong>
            </div>

            <div
              className={`rpa-kpi ${activeTab === 'content' ? 'active' : ''}`}
              onClick={() => setActiveTab('content')}
            >
              <span className="rpa-kpi-label">Contenido Social</span>
              <strong className="rpa-kpi-val">{tenantPosts.length} en feed</strong>
            </div>

            <div
              className={`rpa-kpi ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              <span className="rpa-kpi-label">Reputación</span>
              <strong className="rpa-kpi-val" style={{ color: '#FBBF24' }}>
                ★ {Number(operatingTenant.rating || 5).toFixed(1)} ({operatingTenant.reviewsCount || 0})
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <nav className="nav-tabs rpa-nav" aria-label="Secciones del panel" style={{ marginBottom: '0.25rem' }}>
        {([
          { key: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
          { key: 'orders', label: `Comandas KDS (${activeOrders.length})`, icon: Package },
          { key: 'profile', label: 'Perfil y Horarios', icon: Store },
          { key: 'menu', label: `Menú (${tenantProducts.length})`, icon: Utensils },
          { key: 'content', label: 'Publicar Contenido', icon: Share2 },
          { key: 'reviews', label: `Reseñas (${operatingTenant.reviewsCount || 0})`, icon: Star },
          { key: 'qr', label: 'QR y Repartidores', icon: QrCode },
          { key: 'team', label: 'Empleados', icon: Users },
          { key: 'analytics', label: 'Finanzas', icon: BarChart3 },
          { key: 'support', label: 'Soporte', icon: MessageSquare }
        ] as const).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              className={`nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {isActive && (
                <motion.span
                  layoutId="rpa-nav-pill"
                  className="rpa-nav-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.8 }}
                />
              )}
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeTab}
        className="rpa-tab-stage"
        initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
      {/* ── TAB: RESUMEN / DASHBOARD ── */}
      {activeTab === 'dashboard' && (
        <DashboardTab
          tenant={operatingTenant}
          orders={tenantOrders}
          products={tenantProducts}
          posts={tenantPosts}
          storyItems={tenantStoryItems}
          onNavigate={setActiveTab}
        />
      )}

      {/* ── TAB: PERFIL Y HORARIOS ── */}
      {activeTab === 'profile' && <ProfileTab tenant={operatingTenant} />}

      {/* ── TAB: RESEÑAS Y REPUTACIÓN ── */}
      {activeTab === 'reviews' && (
        <Suspense fallback={<FallbackLoader message="Cargando reseñas del restaurante..." />}>
          <ReviewsTab tenant={operatingTenant} />
        </Suspense>
      )}

      {/* ── TAB: COMANDAS KDS & PEDIDOS EN TIEMPO REAL ── */}
      {activeTab === 'orders' && <KdsBoard tenant={operatingTenant} showMenuSidebar={false} />}

      {/* ── TAB: PUBLICADOR DE CONTENIDO (FOTOS, REELS E HISTORIAS 24H) ── */}
      {activeTab === 'content' && (
        <div className="grid-2" style={{ gridTemplateColumns: '1.35fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          <div className="rpa-card">
            <div className="rpa-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div className="rpa-card-header-left">
                <div className="rpa-card-icon">
                  <Sparkles size={22} />
                </div>
                <div>
                  <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
                    <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Estudio Creativo del Restaurante
                  </span>
                  <h3 className="rpa-card-title">
                    {contentPublishMode === 'story'
                      ? 'Subir Historia 24h al Carrusel Superior'
                      : 'Publicar Foto o Reel en el Feed'}
                  </h3>
                  <p className="rpa-card-subtitle">
                    {contentPublishMode === 'story'
                      ? `Destaca promociones del día o platos recién salidos en la barra de Historias de ${operatingTenant.name}.`
                      : `Tus publicaciones aparecen ante los clientes cercanos a ${operatingTenant.address}.`}
                  </p>
                </div>
              </div>

              {/* Selector de Modo: Feed vs Historias 24h */}
              <div
                className="gs-admin-content-mode-switch"
                role="tablist"
                aria-label="Seleccionar tipo de publicación"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={contentPublishMode === 'feed'}
                  className={`gs-admin-content-mode-btn ${contentPublishMode === 'feed' ? 'active' : ''}`}
                  onClick={() => setContentPublishMode('feed')}
                >
                  <Film size={15} />
                  <span>Publicación Feed</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={contentPublishMode === 'story'}
                  className={`gs-admin-content-mode-btn ${contentPublishMode === 'story' ? 'active' : ''}`}
                  onClick={() => setContentPublishMode('story')}
                >
                  <Sparkles size={15} />
                  <span>Subir Historia (24h)</span>
                  <span className="gs-admin-story-count-pill">{tenantStoryItems.length}</span>
                </button>
              </div>
            </div>

            {contentPublishMode === 'feed' ? (
              <form onSubmit={handleCreatePostSubmit} noValidate>
                <div className="rpa-card-body">
                  {postFormError && (
                    <div className="pam-callout error">
                      <AlertCircle size={18} />
                      <span>{postFormError}</span>
                    </div>
                  )}

                  {/* Paso 1: Plato, Precio y Formato */}
                  <section className="pam-section">
                    <div className="pam-section-head">
                      <div className={`pam-step ${postStep1Done ? 'done' : ''}`}>
                        {postStep1Done ? <Check size={15} strokeWidth={3} /> : 1}
                      </div>
                      <div>
                        <h4>1. Plato Destacado y Formato Visual</h4>
                        <p>Vincula un plato de tu menú para que los clientes puedan pedirlo con 1 clic.</p>
                      </div>
                    </div>

                    <div className="pam-grid">
                      <div className="pam-field">
                        <label>
                          Vincular / Nombre del Plato <em>*</em>
                        </label>
                        {tenantProducts.length > 0 && (
                          <div className="pam-input-wrap" style={{ marginBottom: '6px' }}>
                            <Utensils size={16} className="pam-icon" />
                            <select
                              className="pam-input"
                              value={postProductId}
                              onChange={e => {
                                const selected = tenantProducts.find(p => p.id === e.target.value);
                                setPostProductId(e.target.value);
                                if (selected) {
                                  setPostDishName(selected.name);
                                  setPostPrice(selected.price.toString());
                                  setPostDishEmoji(selected.emoji);
                                }
                              }}
                            >
                              <option value="">✨ Escribir plato nuevo o seleccionar del menú...</option>
                              {tenantProducts.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.emoji} {p.name} - ${p.price.toLocaleString('es-CO')}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="pam-input-wrap">
                          <Utensils size={16} className="pam-icon" />
                          <input
                            type="text"
                            className="pam-input"
                            placeholder="Nombre del plato (ej. Pizza Napolitana Trufada)"
                            value={postDishName}
                            onChange={e => setPostDishName(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="pam-field">
                        <label>
                          Emoji y Precio en Menú <em>*</em>
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            className="pam-input no-icon"
                            value={postDishEmoji}
                            onChange={e => setPostDishEmoji(e.target.value)}
                            maxLength={2}
                            style={{ width: '58px', textAlign: 'center', fontSize: '1.1rem' }}
                          />
                          <div className="pam-input-wrap" style={{ flex: 1 }}>
                            <DollarSign size={16} className="pam-icon" />
                            <input
                              type="number"
                              className="pam-input with-suffix"
                              value={postPrice}
                              onChange={e => setPostPrice(e.target.value)}
                              required
                            />
                            <span className="pam-suffix">COP</span>
                          </div>
                        </div>
                      </div>

                      <div className="pam-field pam-span-2">
                        <label>
                          Formato de la Publicación <em>*</em>
                        </label>
                        <div className="pam-modes" style={{ gridTemplateColumns: '1fr 1fr' }}>
                          <button
                            type="button"
                            className={`pam-mode ${postMediaType === 'video' ? 'active' : ''}`}
                            onClick={() => setPostMediaType('video')}
                          >
                            <div className="pam-mode-icon">
                              <Film size={20} />
                            </div>
                            <div className="pam-mode-check">
                              {postMediaType === 'video' && <Check size={12} strokeWidth={3} />}
                            </div>
                            <strong>Video Corto (Reel)</strong>
                            <span>Ideal para mostrar preparación y textura</span>
                          </button>

                          <button
                            type="button"
                            className={`pam-mode ${postMediaType === 'photo' ? 'active' : ''}`}
                            onClick={() => setPostMediaType('photo')}
                          >
                            <div className="pam-mode-icon">
                              <ImageIcon size={20} />
                            </div>
                            <div className="pam-mode-check">
                              {postMediaType === 'photo' && <Check size={12} strokeWidth={3} />}
                            </div>
                            <strong>Fotografía de Alta Calidad</strong>
                            <span>Compresión inteligente en formato WebP</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Paso 2: Archivo Multimedia y Storytelling */}
                  <section className="pam-section">
                    <div className="pam-section-head">
                      <div className={`pam-step ${postStep2Done ? 'done' : ''}`}>
                        {postStep2Done ? <Check size={15} strokeWidth={3} /> : 2}
                      </div>
                      <div>
                        <h4>2. Archivo Visual, Copywriting y Hashtags</h4>
                        <p>Sube el contenido y usa las plantillas rápidas para redactar una descripción irresistible.</p>
                      </div>
                    </div>

                    <FileUploadInput
                      label={postMediaType === 'video' ? 'Archivo de Video (Reel)' : 'Fotografía del Plato'}
                      accept={postMediaType === 'video' ? 'video' : 'image'}
                      value={postMediaUrl}
                      onChange={(val, type, w, h) => {
                        setPostMediaUrl(val);
                        setPostMediaType(type);
                        setPostMediaWidth(w);
                        setPostMediaHeight(h);
                      }}
                      folder="posts"
                      tenantId={operatingTenant.id}
                      maxSizeMB={8}
                    />

                    <div className="pam-field">
                      <label>
                        💡 Plantillas Rápidas de Copywriting <span className="pam-opt">1 clic</span>
                      </label>
                      <div className="pam-chips">
                        <button
                          type="button"
                          className="pam-chip"
                          onClick={() => applyStoryPreset('artesanal')}
                        >
                          🌾 Preparación Artesanal
                        </button>
                        <button
                          type="button"
                          className="pam-chip"
                          onClick={() => applyStoryPreset('promocion')}
                        >
                          🔥 Especial del Día
                        </button>
                        <button
                          type="button"
                          className="pam-chip"
                          onClick={() => applyStoryPreset('secreto')}
                        >
                          ❤️ Receta de la Casa
                        </button>
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Descripción / Storytelling del Plato <em>*</em>
                      </label>
                      <div className="pam-input-wrap">
                        <FileText size={16} className="pam-icon top" />
                        <textarea
                          rows={3}
                          className="pam-input"
                          placeholder="Describe los ingredientes, aroma y por qué deben probarlo hoy..."
                          value={postDesc}
                          onChange={e => setPostDesc(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Hashtags <span className="pam-opt">Separados por espacio</span>
                      </label>
                      <div className="pam-input-wrap">
                        <Hash size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={postHashtags}
                          onChange={e => setPostHashtags(e.target.value)}
                        />
                      </div>
                    </div>
                  </section>
                </div>

                <div className="pam-footer">
                  <div className="pam-footer-hint">
                    Se publicará en el feed de <strong>{operatingTenant.name}</strong>
                  </div>
                  <div className="pam-footer-actions">
                    <button
                      type="submit"
                      className="pam-btn-primary"
                      disabled={isSubmittingPost}
                    >
                      <Sparkles size={16} />
                      <span>{isSubmittingPost ? 'Publicando...' : 'Publicar en el Feed'}</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateStorySubmit} noValidate>
                <div className="rpa-card-body">
                  {storyFormError && (
                    <div className="pam-callout error">
                      <AlertCircle size={18} />
                      <span>{storyFormError}</span>
                    </div>
                  )}

                  {/* Paso 1 de Historia: Archivo Vertical y Formato */}
                  <section className="pam-section">
                    <div className="pam-section-head">
                      <div className={`pam-step ${storyStep1Done ? 'done' : ''}`}>
                        {storyStep1Done ? <Check size={15} strokeWidth={3} /> : 1}
                      </div>
                      <div>
                        <h4>1. Contenido Visual para tu Historia (Formato 9:16)</h4>
                        <p>Aparecerá con anillo encendido en la barra superior de Historias de tu ciudad.</p>
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Tipo de Historia <em>*</em>
                      </label>
                      <div className="pam-modes" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <button
                          type="button"
                          className={`pam-mode ${storyMediaType === 'photo' ? 'active' : ''}`}
                          onClick={() => setStoryMediaType('photo')}
                        >
                          <div className="pam-mode-icon">
                            <ImageIcon size={20} />
                          </div>
                          <div className="pam-mode-check">
                            {storyMediaType === 'photo' && <Check size={12} strokeWidth={3} />}
                          </div>
                          <strong>Foto Instantánea (6s)</strong>
                          <span>Plato del día, ambiente o promoción flash</span>
                        </button>

                        <button
                          type="button"
                          className={`pam-mode ${storyMediaType === 'video' ? 'active' : ''}`}
                          onClick={() => setStoryMediaType('video')}
                        >
                          <div className="pam-mode-icon">
                            <Film size={20} />
                          </div>
                          <div className="pam-mode-check">
                            {storyMediaType === 'video' && <Check size={12} strokeWidth={3} />}
                          </div>
                          <strong>Video en Cocina (Story)</strong>
                          <span>Sonido real, emplatado o fuego en vivo</span>
                        </button>
                      </div>
                    </div>

                    <FileUploadInput
                      label={storyMediaType === 'video' ? 'Video Vertical para Historia' : 'Fotografía para Historia'}
                      accept={storyMediaType === 'video' ? 'video' : 'image'}
                      value={storyMediaUrl}
                      onChange={(val, type) => {
                        setStoryMediaUrl(val);
                        setStoryMediaType(type);
                      }}
                      folder="posts"
                      tenantId={operatingTenant.id}
                      maxSizeMB={8}
                    />
                  </section>

                  {/* Paso 2 de Historia: Vincular Plato para Compra en 1 Clic + Texto Rápido */}
                  <section className="pam-section">
                    <div className="pam-section-head">
                      <div className="pam-step done">2</div>
                      <div>
                        <h4>2. Plato Vinculado para Pedido en 1 Clic y Mensaje</h4>
                        <p>Los clientes verán el botón «Pedir Ahora» directamente dentro de tu historia.</p>
                      </div>
                    </div>

                    <div className="pam-grid">
                      <div className="pam-field">
                        <label>
                          Vincular Plato del Menú <span className="pam-opt">Recomendado</span>
                        </label>
                        {tenantProducts.length > 0 && (
                          <div className="pam-input-wrap" style={{ marginBottom: '6px' }}>
                            <Utensils size={16} className="pam-icon" />
                            <select
                              className="pam-input"
                              value={storyProductId}
                              onChange={e => {
                                const selected = tenantProducts.find(p => p.id === e.target.value);
                                setStoryProductId(e.target.value);
                                if (selected) {
                                  setStoryDishName(selected.name);
                                  setStoryPrice(selected.price.toString());
                                }
                              }}
                            >
                              <option value="">✨ Seleccionar plato del menú para compra rápida...</option>
                              {tenantProducts.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.emoji} {p.name} - ${p.price.toLocaleString('es-CO')}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="pam-input-wrap">
                          <Utensils size={16} className="pam-icon" />
                          <input
                            type="text"
                            className="pam-input"
                            placeholder={`Título en la historia (ej. ${operatingTenant.name} Especial)`}
                            value={storyDishName}
                            onChange={e => setStoryDishName(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="pam-field">
                        <label>
                          Precio en Botón de Compra <span className="pam-opt">COP</span>
                        </label>
                        <div className="pam-input-wrap">
                          <DollarSign size={16} className="pam-icon" />
                          <input
                            type="number"
                            className="pam-input with-suffix"
                            value={storyPrice}
                            onChange={e => setStoryPrice(e.target.value)}
                          />
                          <span className="pam-suffix">COP</span>
                        </div>
                      </div>

                      <div className="pam-field pam-span-2">
                        <label>
                          Mensaje Corto sobre la Historia <span className="pam-opt">Opcional</span>
                        </label>
                        <div className="pam-chips" style={{ marginBottom: '8px' }}>
                          <button
                            type="button"
                            className="pam-chip"
                            onClick={() => setStoryCaption('🔥 Recién salido de cocina · Pídelo caliente ahora')}
                          >
                            🔥 Recién salido
                          </button>
                          <button
                            type="button"
                            className="pam-chip"
                            onClick={() => setStoryCaption('⚡ Unidades limitadas por hoy · Domicilio directo')}
                          >
                            ⚡ Unidades limitadas
                          </button>
                          <button
                            type="button"
                            className="pam-chip"
                            onClick={() => setStoryCaption('✨ Especial del Chef · Sin tarifas ocultas')}
                          >
                            ✨ Especial del Chef
                          </button>
                        </div>
                        <div className="pam-input-wrap">
                          <FileText size={16} className="pam-icon" />
                          <input
                            type="text"
                            className="pam-input"
                            maxLength={110}
                            placeholder="Ej. ¡Acabamos de hornear nueva tanda! Pide en 1 clic abajo..."
                            value={storyCaption}
                            onChange={e => setStoryCaption(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="pam-footer">
                  <div className="pam-footer-hint">
                    Visible por <strong>24 horas</strong> en el carrusel de Historias de tu ciudad
                  </div>
                  <div className="pam-footer-actions">
                    <button
                      type="submit"
                      className="pam-btn-primary"
                      disabled={isSubmittingStory}
                    >
                      <Sparkles size={16} />
                      <span>{isSubmittingStory ? 'Subiendo historia...' : 'Subir a Historias (24h)'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Columna Derecha: Vista Previa, Historias Activas (24h) & Publicaciones del Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="rpa-card">
              <div className="rpa-card-header">
                <div className="rpa-card-header-left">
                  <div className="rpa-card-icon">
                    <Eye size={20} />
                  </div>
                  <div>
                    <h3 className="rpa-card-title" style={{ fontSize: '1.08rem' }}>
                      {contentPublishMode === 'story' ? 'Vista Previa de Historia (9:16)' : 'Vista Previa en Vivo'}
                    </h3>
                    <p className="rpa-card-subtitle">
                      {contentPublishMode === 'story'
                        ? 'Así verán los clientes tu historia a pantalla completa'
                        : 'Así lucirá tu publicación en el feed'}
                    </p>
                  </div>
                </div>
                <span className="rpa-badge success">
                  {contentPublishMode === 'story' ? 'Story 24h' : 'En Vivo'}
                </span>
              </div>

              <div className="rpa-card-body">
                {contentPublishMode === 'story' ? (
                  <div className="gs-admin-story-preview-frame">
                    <div className="gs-admin-story-preview-progress">
                      <span className="gs-admin-story-preview-bar" />
                    </div>
                    <div className="gs-admin-story-preview-header">
                      <span className="gs-admin-story-preview-emoji">
                        {operatingTenant.logoEmoji || '🍽️'}
                      </span>
                      <div>
                        <strong>{operatingTenant.name}</strong>
                        <span>Hace un momento · EN VIVO</span>
                      </div>
                    </div>

                    <div className="gs-admin-story-preview-media">
                      {storyMediaUrl ? (
                        storyMediaType === 'video' ? (
                          <video
                            src={storyMediaUrl}
                            muted
                            autoPlay
                            loop
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <img
                            src={storyMediaUrl}
                            alt="Story Preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )
                      ) : (
                        <div className="gs-admin-story-preview-empty">
                          <Sparkles size={24} />
                          <span>Sube una foto o video vertical para previsualizar tu Historia 24h</span>
                        </div>
                      )}
                    </div>

                    {storyCaption && (
                      <div className="gs-admin-story-preview-caption">
                        {storyCaption}
                      </div>
                    )}

                    <div className="gs-admin-story-preview-cta">
                      <div>
                        <span>Plato destacado en esta historia</span>
                        <strong>{storyDishName || operatingTenant.name}</strong>
                        <em>${parseFloat(storyPrice || '0').toLocaleString('es-CO')} COP</em>
                      </div>
                      <span className="gs-admin-story-preview-btn">Pedir Ahora</span>
                    </div>
                  </div>
                ) : (
                  <div className="pam-section">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '1.5rem' }}>{operatingTenant.logoEmoji || '🍽️'}</div>
                      <div>
                        <strong style={{ color: 'var(--text-main)', display: 'block', fontSize: '0.9rem' }}>
                          {operatingTenant.name}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>
                          {operatingTenant.category} · {operatingTenant.address}
                        </span>
                      </div>
                    </div>

                    <h4 style={{ margin: '4px 0 0', color: 'var(--text-main)', fontSize: '0.96rem', fontWeight: 800 }}>
                      {postDishEmoji} {postDishName || 'Nombre de tu plato'}
                    </h4>

                    <div
                      style={{
                        height: '185px',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        position: 'relative',
                        background: '#181411',
                        border: '1px solid var(--neutral-border)'
                      }}
                    >
                      {postMediaUrl ? (
                        postMediaType === 'video' ? (
                          <video
                            src={postMediaUrl}
                            muted
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <img
                            src={postMediaUrl}
                            alt="Preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'rgba(255,255,255,0.65)',
                            fontSize: '0.82rem',
                            padding: '1rem',
                            textAlign: 'center'
                          }}
                        >
                          Sube una foto o video a la izquierda para previsualizar
                        </div>
                      )}
                      {postMediaType === 'video' && postMediaUrl && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0,0,0,0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '50%',
                              background: 'var(--primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Play size={18} fill="white" color="white" />
                          </div>
                        </div>
                      )}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '10px',
                          right: '10px',
                          background: 'rgba(20, 18, 16, 0.88)',
                          padding: '5px 12px',
                          borderRadius: '10px',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '0.86rem'
                        }}
                      >
                        ${parseFloat(postPrice || '0').toLocaleString('es-CO')} COP
                      </div>
                    </div>

                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
                      {postDesc || 'Aquí aparecerá la descripción tentadora de tu plato...'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Historias Activas (24h) */}
            <div className="rpa-card">
              <div className="rpa-card-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 className="rpa-card-title" style={{ fontSize: '1.08rem' }}>
                    🔥 Historias Activas 24h ({tenantStoryItems.length})
                  </h3>
                  <p className="rpa-card-subtitle">Diapositivas visibles en el anillo superior de tu restaurante</p>
                </div>
                {contentPublishMode !== 'story' && (
                  <button
                    type="button"
                    className="pam-chip"
                    onClick={() => setContentPublishMode('story')}
                  >
                    <Plus size={13} /> Subir Historia
                  </button>
                )}
              </div>

              <div className="rpa-card-body">
                {tenantStoryItems.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: 0, padding: '1rem' }}>
                    No tienes historias activas en este momento. ¡Usa la pestaña «Subir Historia (24h)» para destacar un plato!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tenantStoryItems.map((storyItem, idx) => (
                      <div key={storyItem.id} className="rpa-item-card" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <div style={{ position: 'relative', width: '44px', height: '56px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, border: '2px solid var(--primary)' }}>
                            <img
                              src={storyItem.image}
                              alt={storyItem.dishName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <span
                              style={{
                                position: 'absolute',
                                top: '2px',
                                left: '4px',
                                fontSize: '0.62rem',
                                fontWeight: 900,
                                color: '#FFF',
                                textShadow: '0 1px 3px rgba(0,0,0,0.8)'
                              }}
                            >
                              #{idx + 1}
                            </span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.88rem', display: 'block' }}>
                              {storyItem.dishName}
                            </strong>
                            {storyItem.caption && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                                {storyItem.caption}
                              </span>
                            )}
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.73rem', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
                              <span>{storyItem.timeAgo}</span>
                              {typeof storyItem.createdAt === 'number' && Number.isFinite(storyItem.createdAt) && (() => {
                                const remainingMs = Math.max(0, storyItem.createdAt + 24 * 60 * 60 * 1000 - storyNowMs);
                                const hoursLeft = Math.floor(remainingMs / (60 * 60 * 1000));
                                const minsLeft = Math.max(1, Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000)));
                                return (
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                    · Expira en {hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m`}
                                  </span>
                                );
                              })()}
                              {storyItem.price > 0 && (
                                <span>· ${storyItem.price.toLocaleString('es-CO')} COP</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="rpa-icon-btn danger"
                          disabled={isDeletingStory === storyItem.id}
                          onClick={async () => {
                            setIsDeletingStory(storyItem.id);
                            await deleteStoryItem(storyItem.id);
                            setIsDeletingStory(null);
                          }}
                          title="Retirar de Historias activas"
                        >
                          {isDeletingStory === storyItem.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Publicaciones Activas */}
            <div className="rpa-card">
              <div className="rpa-card-header">
                <div>
                  <h3 className="rpa-card-title" style={{ fontSize: '1.08rem' }}>
                    📊 Publicaciones Activas ({tenantPosts.length})
                  </h3>
                  <p className="rpa-card-subtitle">Interacción de tus publicaciones en el feed</p>
                </div>
              </div>

              <div className="rpa-card-body">
                {tenantPosts.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: 0, padding: '1rem' }}>
                    Aún no has publicado contenido en el feed. ¡Crea tu primera publicación a la izquierda!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tenantPosts.map(p => (
                      <div key={p.id} className="rpa-item-card" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <img
                            src={p.image}
                            alt={p.dishName}
                            style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.88rem', display: 'block' }}>
                              {p.dishEmoji} {p.dishName}
                            </strong>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                              <span>
                                <Eye size={12} style={{ verticalAlign: 'middle' }} /> {p.viewCount || 0} vistas
                              </span>
                              <span>
                                <Heart size={12} fill="#EF4444" color="#EF4444" style={{ verticalAlign: 'middle' }} /> {p.likes} likes
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="rpa-icon-btn danger"
                          disabled={isDeletingPost === p.id}
                          onClick={() => setPostToDelete(p)}
                          title="Eliminar publicación"
                        >
                          {isDeletingPost === p.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ANALÍTICA FINANCIERA ── */}
      {activeTab === 'analytics' && (
        <Suspense fallback={<FallbackLoader message="Cargando analítica financiera..." />}>
          <FinancialAnalytics tenantId={operatingTenant.id} />
        </Suspense>
      )}

      {/* ── TAB: MENÚ ── */}
      {activeTab === 'menu' && (
        <Suspense fallback={<FallbackLoader message="Cargando carta digital..." />}>
          <MenuTab tenant={operatingTenant} />
        </Suspense>
      )}

      {/* ── TAB: QR DE MESAS & REPARTIDORES PROPIOS ── */}
      {activeTab === 'qr' && (
        <div className="grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
          <RestaurantTablesAdmin tenant={operatingTenant} />

          {/* Repartidores Propios con el mismo formato .pam-* */}
          <div className="rpa-card">
            <div className="rpa-card-header">
              <div className="rpa-card-header-left">
                <div className="rpa-card-icon">
                  <Truck size={22} />
                </div>
                <div>
                  <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
                    <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Flota de Domiciliarios
                  </span>
                  <h3 className="rpa-card-title">Repartidores Propios ({tenantDrivers.length})</h3>
                  <p className="rpa-card-subtitle">
                    Enrola y gestiona los domiciliarios directos de tu restaurante.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className={showAddDriverForm ? 'pam-btn-ghost' : 'pam-btn-primary'}
                onClick={() => setShowAddDriverForm(!showAddDriverForm)}
              >
                {showAddDriverForm ? (
                  <>
                    <X size={16} /> Cancelar
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Enrolar Repartidor
                  </>
                )}
              </button>
            </div>

            <div className="rpa-card-body">
              <AnimatePresence>
                {showAddDriverForm && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <form onSubmit={handleAddDriverSubmit} noValidate>
                      <section className="pam-section">
                        <div className="pam-section-head">
                          <div className={`pam-step ${driverStepDone ? 'done' : ''}`}>
                            {driverStepDone ? <Check size={15} strokeWidth={3} /> : 1}
                          </div>
                          <div>
                            <h4>Datos del Repartidor</h4>
                            <p>Registra el nombre, teléfono de contacto y medio de transporte.</p>
                          </div>
                        </div>

                        <div className="pam-grid">
                          <div className="pam-field">
                            <label>
                              Nombre Completo <em>*</em>
                            </label>
                            <div className="pam-input-wrap">
                              <User size={16} className="pam-icon" />
                              <input
                                type="text"
                                className="pam-input"
                                placeholder="Ej. Carlos Andrés Gómez"
                                value={driverName}
                                onChange={e => setDriverName(e.target.value)}
                                required
                              />
                            </div>
                          </div>

                          <div className="pam-field">
                            <label>
                              Teléfono / WhatsApp <em>*</em>
                            </label>
                            <div className="pam-input-wrap">
                              <Phone size={16} className="pam-icon" />
                              <input
                                type="tel"
                                className="pam-input"
                                placeholder="Ej. 300 123 4567"
                                value={driverPhone}
                                onChange={e => setDriverPhone(e.target.value)}
                                required
                              />
                            </div>
                          </div>

                          <div className="pam-field pam-span-2">
                            <label>
                              Vehículo / Medio de Transporte <em>*</em>
                            </label>
                            <div className="pam-chips">
                              {VEHICLE_PRESETS.map(v => (
                                <button
                                  key={v}
                                  type="button"
                                  className={`pam-chip ${driverVehicle === v ? 'active' : ''}`}
                                  onClick={() => setDriverVehicle(v)}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                            <div className="pam-input-wrap" style={{ marginTop: '6px' }}>
                              <Truck size={16} className="pam-icon" />
                              <input
                                type="text"
                                className="pam-input"
                                placeholder="O especifica marca/placa (ej. Moto Yamaha FZ - ABC12D)"
                                value={driverVehicle}
                                onChange={e => setDriverVehicle(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                          <button
                            type="button"
                            className="pam-btn-ghost"
                            onClick={() => setShowAddDriverForm(false)}
                          >
                            Cancelar
                          </button>
                          <button type="submit" className="pam-btn-primary">
                            <Save size={16} /> Guardar Repartidor
                          </button>
                        </div>
                      </section>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {tenantDrivers.length === 0 ? (
                <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <Truck size={40} style={{ color: 'var(--primary)', opacity: 0.6 }} />
                  <h4 style={{ margin: '6px 0 2px', color: 'var(--text-main)', fontWeight: 800 }}>
                    No tienes repartidores registrados
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    Haz clic en "Enrolar Repartidor" para registrar a tu equipo de entregas a domicilio.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {tenantDrivers.map(driver => (
                    <div key={driver.id} className="rpa-item-card">
                      <div>
                        <strong style={{ color: 'var(--text-main)', fontSize: '0.94rem', fontWeight: 800 }}>
                          {driver.name}
                        </strong>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
                          {driver.vehicle} · 📞 {driver.phone}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`rpa-badge ${driver.status === 'available' ? 'success' : 'warning'}`}>
                          {driver.status === 'available'
                            ? '🟢 Disponible'
                            : `🛵 En entrega (#${driver.assignedOrderId})`}
                        </span>
                        <button
                          type="button"
                          className="rpa-icon-btn danger"
                          onClick={() => setDriverToDelete(driver)}
                          title="Eliminar repartidor"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: EMPLEADOS / EQUIPO ── */}
      {activeTab === 'team' && (
        <Suspense fallback={<FallbackLoader message="Cargando equipo del restaurante..." />}>
          <TeamTab tenant={operatingTenant} />
        </Suspense>
      )}

      {/* ── TAB: SOPORTE ── */}
      {activeTab === 'support' && operatingTenant && (
        <Suspense fallback={<FallbackLoader message="Cargando centro de soporte..." />}>
          <SupportTab
            restaurantId={operatingTenant.id}
            initialTicketId={supportInitialTicketId}
          />
        </Suspense>
      )}

      {/* Modal de Confirmación para Eliminar Publicación */}
      <AnimatePresence>
        {postToDelete && (
          <div className="gs-modal-backdrop" onClick={() => setPostToDelete(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="gs-modal-card"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '420px' }}
            >
              <div className="gs-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="rpa-card-icon" style={{ width: '32px', height: '32px', background: '#FEE2E2', color: '#DC2626' }}>
                    <Trash2 size={16} />
                  </div>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                    Eliminar Publicación
                  </strong>
                </div>
                <button
                  type="button"
                  className="rpa-icon-btn"
                  onClick={() => setPostToDelete(null)}
                  aria-label="Cerrar modal"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="gs-modal-body">
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                  ¿Deseas eliminar permanentemente la publicación de <strong>{postToDelete.dishName}</strong> del feed de GastroSync?
                </p>
              </div>

              <div className="gs-modal-footer">
                <button
                  type="button"
                  className="pam-btn-ghost"
                  onClick={() => setPostToDelete(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="pam-btn-danger"
                  disabled={Boolean(isDeletingPost)}
                  onClick={async () => {
                    if (!postToDelete) return;
                    setIsDeletingPost(postToDelete.id);
                    await deletePost(postToDelete.id);
                    setIsDeletingPost(null);
                    setPostToDelete(null);
                  }}
                >
                  {isDeletingPost ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmación para Desvincular Repartidor */}
      <AnimatePresence>
        {driverToDelete && (
          <div className="gs-modal-backdrop" onClick={() => setDriverToDelete(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="gs-modal-card"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '420px' }}
            >
              <div className="gs-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="rpa-card-icon" style={{ width: '32px', height: '32px', background: '#FEE2E2', color: '#DC2626' }}>
                    <Trash2 size={16} />
                  </div>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                    Desvincular Repartidor
                  </strong>
                </div>
                <button
                  type="button"
                  className="rpa-icon-btn"
                  onClick={() => setDriverToDelete(null)}
                  aria-label="Cerrar modal"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="gs-modal-body">
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                  ¿Deseas desvincular a <strong>{driverToDelete.name}</strong> ({driverToDelete.vehicle}) del equipo de repartidores del restaurante?
                </p>
              </div>

              <div className="gs-modal-footer">
                <button
                  type="button"
                  className="pam-btn-ghost"
                  onClick={() => setDriverToDelete(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="pam-btn-danger"
                  onClick={() => {
                    if (typeof deleteDriver === 'function' && driverToDelete) {
                      void deleteDriver(driverToDelete.id);
                    }
                    setDriverToDelete(null);
                  }}
                >
                  Sí, desvincular
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};
