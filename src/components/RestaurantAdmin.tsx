import React, { useState, lazy, Suspense } from 'react';
import { useApp } from '../context/useApp';
import { getOperationalTenant } from '../utils/tenantHelpers';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUploadInput } from './FileUploadInput';
import { ProfileTab } from './RestaurantAdmin/ProfileTab';
import { NotificationBell } from './NotificationBell';
import { RestaurantTablesAdmin } from './RestaurantTablesAdmin';
import { KdsBoard } from './KdsBoard';
import {
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

const FinancialAnalytics = lazy(() =>
  import('./FinancialAnalytics').then(m => ({ default: m.FinancialAnalytics }))
);
const SupportTab = lazy(() =>
  import('./RestaurantAdmin/SupportTab').then(m => ({ default: m.SupportTab }))
);
const MenuTab = lazy(() =>
  import('./RestaurantAdmin/MenuTab').then(m => ({ default: m.MenuTab }))
);
const TeamTab = lazy(() =>
  import('./RestaurantAdmin/TeamTab').then(m => ({ default: m.TeamTab }))
);
const ReviewsTab = lazy(() =>
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
    posts,
    createPost,
    deletePost,
    orders
  } = useApp();

  const operatingTenant = getOperationalTenant(currentUser, tenants);

  const [activeTab, setActiveTab] = useState<
    'orders' | 'profile' | 'content' | 'menu' | 'reviews' | 'analytics' | 'qr' | 'support' | 'team'
  >('orders');
  const [supportInitialTicketId, setSupportInitialTicketId] = useState<string | null>(null);

  // Driver form state
  const [showAddDriverForm, setShowAddDriverForm] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverVehicle, setDriverVehicle] = useState('🏍️ Moto 125cc / 150cc');
  const [driverPhone, setDriverPhone] = useState('');

  // Content creation (Post) form state
  const [postDishName, setPostDishName] = useState('');
  const [postDishEmoji, setPostDishEmoji] = useState('🍕');
  const [postPrice, setPostPrice] = useState('25000');
  const [postDesc, setPostDesc] = useState('');
  const [postHashtags, setPostHashtags] = useState('#GastroSync #ComidaArtesanal #SaborLocal');
  const [isDeletingPost, setIsDeletingPost] = useState<string | null>(null);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postFormError, setPostFormError] = useState<string | null>(null);
  const [postMediaType, setPostMediaType] = useState<'photo' | 'video'>('video');
  const [postImage, setPostImage] = useState('');
  const [postMediaUrl, setPostMediaUrl] = useState('');
  const [postProductId, setPostProductId] = useState('');
  const [postMediaWidth, setPostMediaWidth] = useState<number | undefined>();
  const [postMediaHeight, setPostMediaHeight] = useState<number | undefined>();

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
                className="pam-btn-primary"
                style={{
                  background: operatingTenant.isOpen
                    ? 'linear-gradient(135deg, #059669 0%, #10B981 100%)'
                    : 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
                  boxShadow: operatingTenant.isOpen
                    ? '0 6px 16px rgba(16, 185, 129, 0.35)'
                    : '0 6px 16px rgba(239, 68, 68, 0.35)',
                  minWidth: '145px',
                  padding: '10px 18px'
                }}
                onClick={() => toggleTenantOpenStatus(operatingTenant.id)}
              >
                <Power size={16} />
                <span>{operatingTenant.isOpen ? '🟢 ABIERTO' : '🔴 CERRADO'}</span>
              </button>
            </div>
          </div>

          {/* KPI Quick-Navigation Cards */}
          <div className="rpa-kpis">
            <div className="rpa-kpi" onClick={() => setActiveTab('orders')}>
              <span className="rpa-kpi-label">Pedidos Activos</span>
              <strong className="rpa-kpi-val" style={{ color: '#F0A483' }}>
                {activeOrders.length} en proceso
              </strong>
            </div>

            <div className="rpa-kpi" onClick={() => setActiveTab('menu')}>
              <span className="rpa-kpi-label">Carta Digital</span>
              <strong className="rpa-kpi-val">{tenantProducts.length} platos</strong>
            </div>

            <div className="rpa-kpi" onClick={() => setActiveTab('content')}>
              <span className="rpa-kpi-label">Publicaciones</span>
              <strong className="rpa-kpi-val">{tenantPosts.length} en feed</strong>
            </div>

            <div className="rpa-kpi" onClick={() => setActiveTab('reviews')}>
              <span className="rpa-kpi-label">Reputación</span>
              <strong className="rpa-kpi-val" style={{ color: '#FBBF24' }}>
                ⭐ {Number(operatingTenant.rating || 5).toFixed(1)} ({operatingTenant.reviewsCount || 0})
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div className="nav-tabs" style={{ marginBottom: '0.25rem' }}>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Package size={16} /> Comandas KDS ({activeOrders.length})
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <Store size={16} /> Perfil y Horarios
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'menu' ? 'active' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          <Utensils size={16} /> Menú ({tenantProducts.length})
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          <Share2 size={16} /> Publicar Contenido
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          <Star size={16} /> Reseñas ({operatingTenant.reviewsCount || 0})
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'qr' ? 'active' : ''}`}
          onClick={() => setActiveTab('qr')}
        >
          <QrCode size={16} /> QR y Repartidores
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          <Users size={16} /> Empleados
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={16} /> Finanzas
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'support' ? 'active' : ''}`}
          onClick={() => setActiveTab('support')}
        >
          <MessageSquare size={16} /> Soporte
        </button>
      </div>

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

      {/* ── TAB: PUBLICADOR DE CONTENIDO (FOTOS Y REELS) ── */}
      {activeTab === 'content' && (
        <div className="grid-2" style={{ gridTemplateColumns: '1.35fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          <div className="rpa-card">
            <div className="rpa-card-header">
              <div className="rpa-card-header-left">
                <div className="rpa-card-icon">
                  <Sparkles size={22} />
                </div>
                <div>
                  <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
                    <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Estudio Creativo del Restaurante
                  </span>
                  <h3 className="rpa-card-title">Publicar Foto o Reel en el Feed</h3>
                  <p className="rpa-card-subtitle">
                    Tus publicaciones aparecen ante los clientes cercanos a <strong>{operatingTenant.address}</strong>.
                  </p>
                </div>
              </div>
            </div>

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
          </div>

          {/* Columna Derecha: Vista Previa & Publicaciones Activas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="rpa-card">
              <div className="rpa-card-header">
                <div className="rpa-card-header-left">
                  <div className="rpa-card-icon">
                    <Eye size={20} />
                  </div>
                  <div>
                    <h3 className="rpa-card-title" style={{ fontSize: '1.08rem' }}>
                      Vista Previa en Vivo
                    </h3>
                    <p className="rpa-card-subtitle">Así lucirá tu publicación en el feed</p>
                  </div>
                </div>
                <span className="rpa-badge success">En Vivo</span>
              </div>

              <div className="rpa-card-body">
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
                          onClick={async () => {
                            const confirmMessage =
                              '¿Deseas eliminar o archivar esta publicación del feed público?';
                            if (!window.confirm(confirmMessage)) return;

                            setIsDeletingPost(p.id);
                            await deletePost(p.id);
                            setIsDeletingPost(null);
                          }}
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
                      <span className={`rpa-badge ${driver.status === 'available' ? 'success' : 'warning'}`}>
                        {driver.status === 'available'
                          ? '🟢 Disponible'
                          : `🛵 En entrega (#${driver.assignedOrderId})`}
                      </span>
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
    </motion.div>
  );
};
