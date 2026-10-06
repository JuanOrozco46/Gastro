import React, { useState, lazy, Suspense } from 'react';
import { useApp } from '../context/useApp';
import { getOperationalTenant, getFulfillmentBadgeText, getValidOrderTransitions } from '../utils/tenantHelpers';
import { motion } from 'framer-motion';
import { FileUploadInput } from './FileUploadInput';
import { ProfileTab } from './RestaurantAdmin/ProfileTab';
import { NotificationBell } from './NotificationBell';

const FinancialAnalytics = lazy(() => import('./FinancialAnalytics').then(m => ({ default: m.FinancialAnalytics })));
const SupportTab = lazy(() => import('./RestaurantAdmin/SupportTab').then(m => ({ default: m.SupportTab })));
const MenuTab = lazy(() => import('./RestaurantAdmin/MenuTab').then(m => ({ default: m.MenuTab })));
const TeamTab = lazy(() => import('./RestaurantAdmin/TeamTab').then(m => ({ default: m.TeamTab })));

const FallbackLoader: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
    <div style={{ width: '24px', height: '24px', border: '2px solid', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
    {message}
  </div>
);

import {
  QrCode, Utensils, Truck, Plus, Share2, Play,
  Eye, Heart, Sparkles, Trash2, Power,
  MapPin, BarChart3, MessageSquare, ShieldBan,
  AlertCircle, Package, Clock, CheckCircle
} from 'lucide-react';

import { RestaurantTablesAdmin } from './RestaurantTablesAdmin';

export const RestaurantAdmin: React.FC = () => {
  const {
    tenants, currentUser, toggleTenantOpenStatus,
    products,
    drivers, addDriver,
    posts, createPost, deletePost,
    orders, updateOrderStatus, authMode, showToast
  } = useApp();

  const operatingTenant = getOperationalTenant(currentUser, tenants);

  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'content' | 'menu' | 'analytics' | 'qr' | 'support' | 'team'>('orders');
  const [supportInitialTicketId, setSupportInitialTicketId] = useState<string | null>(null);
  
  // Modals state
  // Modals state
  const [showAddDriverForm, setShowAddDriverForm] = useState(false);



  // Form State for Drivers
  const [driverName, setDriverName] = useState('');
  const [driverVehicle, setDriverVehicle] = useState('Moto Yamaha FZ');
  const [driverPhone, setDriverPhone] = useState('(300) 123-4567');

  // Form State for Content Creation (Post)
  const [postDishName, setPostDishName] = useState('');
  const [postDishEmoji, setPostDishEmoji] = useState('🍕');
  const [postPrice, setPostPrice] = useState('25000');
  const [postDesc, setPostDesc] = useState('');
  const [postHashtags, setPostHashtags] = useState('#GastroSync #ComidaArtesanal #SaborLocal');
  const [postMediaType, setPostMediaType] = useState<'photo' | 'video'>('video');
  const [postImage, setPostImage] = useState('');
  const [postMediaUrl, setPostMediaUrl] = useState('');
  const [postProductId, setPostProductId] = useState('');
  const [postMediaWidth, setPostMediaWidth] = useState<number | undefined>();
  const [postMediaHeight, setPostMediaHeight] = useState<number | undefined>();

  if (!operatingTenant) {
    return (
      <div 
        style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '28px',
          maxWidth: '600px',
          margin: '2rem auto',
          color: 'var(--text-muted)'
        }}
      >
        <AlertCircle size={52} style={{ color: '#EF4444', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.4rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
          No tienes un restaurante asignado
        </h3>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
          Esta cuenta no está autorizada para administrar comercios. Inicia sesión con la cuenta oficial del restaurante.
        </p>
      </div>
    );
  }

  // Filtered data for active operating tenant ONLY
  const tenantProducts = products.filter(p => p.tenantId === operatingTenant.id);
  const tenantPosts = posts.filter(p => p.tenantId === operatingTenant.id);
  const tenantDrivers = drivers.filter(d => d.tenantId === operatingTenant.id);
  const tenantOrders = orders.filter(o => o.tenantId === operatingTenant.id).sort((a, b) => b.createdAt - a.createdAt);

  const activeOrders = tenantOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const pastOrders = tenantOrders.filter(o => o.status === 'delivered' || o.status === 'cancelled');


  const handleAddDriverSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverName || !driverPhone) return;

    addDriver({
      name: driverName,
      vehicle: driverVehicle,
      phone: driverPhone
    });

    setDriverName('');
    setShowAddDriverForm(false);
  };

  const handleCreatePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postDishName || !postDesc || !postPrice) return;

    const hashtagsArr = postHashtags
      .split(' ')
      .filter(h => h.trim().length > 0)
      .map(h => h.startsWith('#') ? h : `#${h}`);

    const existingProduct = postProductId ? tenantProducts.find(p => p.id === postProductId) : tenantProducts.find(p => p.name.toLowerCase().includes(postDishName.toLowerCase()));
    const productId = existingProduct ? existingProduct.id : undefined;

    const finalImage = postMediaType === 'photo' && postMediaUrl
      ? postMediaUrl
      : (postImage || operatingTenant.bannerUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=85');

    await createPost({
      tenantId: operatingTenant.id,
      tenantName: operatingTenant.name,
      tenantCategory: operatingTenant.category,
      tenantLogoEmoji: operatingTenant.logoEmoji || '🍽️',
      tenantAddress: operatingTenant.address,
      dishName: postDishName,
      dishEmoji: postDishEmoji,
      desc: postDesc,
      hashtags: hashtagsArr,
      price: parseFloat(postPrice),
      image: finalImage,
      mediaType: postMediaType,
      mediaUrl: postMediaUrl,
      duration: postMediaType === 'video' ? 45 : undefined,
      productId: productId || '',
      width: postMediaWidth,
      height: postMediaHeight
    });

    setPostDishName('');
    setPostProductId('');
    setPostDesc('');
    setPostMediaUrl('');
    setPostMediaWidth(undefined);
    setPostMediaHeight(undefined);
    setPostImage('');
  };

  const applyStoryPreset = (type: string) => {
    if (type === 'artesanal') {
      setPostDesc(`Preparado desde cero en la cocina de ${operatingTenant.name}. Receta artesanal horneada con dedicación para hoy.`);
      setPostHashtags('#ProcesoArtesanal #IngredientesLocales #GastroSync');
    } else if (type === 'promocion') {
      setPostDesc(`¡Especial del día en ${operatingTenant.name}! Haz tu pedido directo sin pagar tarifas extras y recíbelo bien caliente.`);
      setPostHashtags('#EspecialDelDía #SaborÚnico #DomicilioSinComisión');
    } else if (type === 'secreto') {
      setPostDesc(`El secreto que hace inolvidable a ${operatingTenant.name}. Selección fresca de esta mañana directo a tu plato.`);
      setPostHashtags('#RecetaDeLaCasa #CalidadGarantizada #Foodies');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="tab-content active"
    >
      {/* ── Operating Tenant Header ── */}
      <div 
        className="card" 
        style={{ 
          padding: '1.75rem 2rem', 
          marginBottom: '1.75rem',
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '28px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '2.8rem', background: 'rgba(255, 255, 255, 0.06)', padding: '12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {operatingTenant.logoEmoji}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.5px' }}>
                  {operatingTenant.name}
                </h2>
                <span className="badge badge-secondary">{operatingTenant.category}</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '4px 0 0' }}>
                <MapPin size={14} style={{ color: 'var(--primary)', verticalAlign: 'middle' }} /> {operatingTenant.address} · Comisión Ética (3%)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <NotificationBell onOpenTicket={(ticketId) => {
              setSupportInitialTicketId(ticketId);
              setActiveTab('support');
            }} />
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`btn ${operatingTenant.isOpen ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => toggleTenantOpenStatus(operatingTenant.id)}
              style={{ padding: '12px 20px', fontWeight: 800, borderRadius: '14px', fontSize: '0.9rem' }}
            >
              <Power size={18} />
              {operatingTenant.isOpen ? '🟢 ABIERTO' : '🔴 CERRADO'}
            </motion.button>
          </div>
        </div>

        {/* Financial KPI Cards */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '14px', 
            marginTop: '1.5rem', 
            paddingTop: '1.25rem', 
            borderTop: '1px dashed rgba(255, 255, 255, 0.12)' 
          }}
        >

          <div style={{ background: 'rgba(56, 189, 248, 0.12)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            <span style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 800, textTransform: 'uppercase' }}>
              Pedidos Activos
            </span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: '#38BDF8', fontWeight: 900, marginTop: '4px' }}>
              {activeOrders.length} en proceso
            </strong>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Publicaciones
            </span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'white', fontWeight: 900, marginTop: '4px' }}>
              {tenantPosts.length} posts
            </strong>
          </div>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="nav-tabs" style={{ marginBottom: '1.75rem' }}>
        <button
          className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <MapPin size={16} /> 👤 Perfil y Horarios
        </button>
        <button
          className={`nav-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Package size={16} /> 📦 Pedidos ({activeOrders.length})
        </button>
        <button
          className={`nav-tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          <Share2 size={16} /> 📢 Publicar Contenido
        </button>
        <button
          className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={16} /> 📈 Analítica Financiera
        </button>
        <button
          className={`nav-tab ${activeTab === 'menu' ? 'active' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          <Utensils size={16} /> 🍕 Menú ({tenantProducts.length})
        </button>
        <button
          className={`nav-tab ${activeTab === 'qr' ? 'active' : ''}`}
          onClick={() => setActiveTab('qr')}
        >
          <QrCode size={16} /> 📱 QR & Repartidores
        </button>
        <button
          className={`nav-tab ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          <ShieldBan size={16} /> 👥 Miembros
        </button>
        <button
          className={`nav-tab ${activeTab === 'support' ? 'active' : ''}`}
          onClick={() => setActiveTab('support')}
        >
          <MessageSquare size={16} /> 💬 Soporte
        </button>
      </div>

      {/* ── TAB: PROFILE ── */}
      {activeTab === 'profile' && (
        <ProfileTab tenant={operatingTenant} />
      )}

      {/* ── TAB 0: ORDER MANAGEMENT ── */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          {/* Active Orders */}
          <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={22} style={{ color: 'var(--primary)' }} /> Operación de Pedidos Activos
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Gestión exclusiva para {operatingTenant.name}
                </span>
              </div>
              <span className="badge badge-primary">{activeOrders.length} activos</span>
            </div>

            {activeOrders.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem', fontSize: '0.9rem' }}>
                <CheckCircle size={40} style={{ color: '#10B981', marginBottom: '12px' }} />
                <h4 style={{ color: 'white', fontWeight: 800, margin: '0 0 4px' }}>¡Todo al día en cocina y despacho!</h4>
                <p>No tienes pedidos activos pendientes en este momento.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {activeOrders.map(order => {
                  const badgeText = getFulfillmentBadgeText(order.fulfillment, order.type);
                  const transitions = getValidOrderTransitions(order.status, order.fulfillment, order.type, false);

                  return (
                    <div 
                      key={order.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '20px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>#{order.id}</span>
                          <span className="badge badge-secondary" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
                            {badgeText}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <Clock size={13} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                            {new Date(order.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-glow)', padding: '4px 10px', borderRadius: '12px' }}>
                            Estado: {order.status.toUpperCase()}
                          </span>
                          <strong style={{ fontSize: '1.05rem', color: 'white', fontWeight: 900 }}>
                            ${order.total.toLocaleString('es-CO')} COP
                          </strong>
                        </div>
                      </div>

                      {/* Customer / Fulfillment details */}
                      <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: '12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {order.customerName && (
                          <div>Cliente: <strong style={{ color: 'white' }}>{order.customerName}</strong> {order.customerPhone && `· Tel: ${order.customerPhone}`}</div>
                        )}
                        {order.deliveryAddress && (
                          <div style={{ marginTop: '2px', color: '#38BDF8' }}>
                            📍 Dirección: <strong>{typeof order.deliveryAddress === 'string' ? order.deliveryAddress : order.deliveryAddress.addressLine}</strong>
                          </div>
                        )}
                        {order.tableNumber && (
                          <div style={{ marginTop: '2px', color: '#F59E0B' }}>
                            🍽️ Servicio en Mesa: <strong>Mesa #{order.tableNumber}</strong>
                          </div>
                        )}
                        {order.restaurantNotes && (
                          <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#FCA5A5' }}>
                            📝 Nota: "{order.restaurantNotes}"
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {order.items.map((item, idx) => (
                          <span key={idx} style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.82rem', color: 'white' }}>
                            <strong style={{ color: 'var(--primary)' }}>{item.qty}x</strong> {item.name}
                          </span>
                        ))}
                      </div>

                      {/* Action buttons */}
                      {transitions.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                          {transitions.map(t => (
                            <button
                              key={t.status}
                              type="button"
                              className={`btn ${t.variant === 'primary' ? 'btn-primary' : t.variant === 'secondary' ? 'btn-secondary' : 'btn-outline'}`}
                              style={{ 
                                padding: '8px 16px', 
                                fontSize: '0.82rem', 
                                fontWeight: 800, 
                                borderRadius: '10px',
                                color: t.variant === 'danger' ? '#EF4444' : undefined,
                                borderColor: t.variant === 'danger' ? 'rgba(239,68,68,0.4)' : undefined
                              }}
                              onClick={() => updateOrderStatus(order.id, t.status)}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Orders */}
          {pastOrders.length > 0 && (
            <div className="card" style={{ background: 'var(--glass-light)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '24px', padding: '1.5rem' }}>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', marginBottom: '1rem' }}>
                Historial de Pedidos Completados / Cancelados ({pastOrders.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pastOrders.map(order => (
                  <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', fontSize: '0.82rem' }}>
                    <span>
                      <strong style={{ color: 'white' }}>#{order.id}</strong> · {getFulfillmentBadgeText(order.fulfillment, order.type)}
                    </span>
                    <span style={{ color: order.status === 'delivered' ? '#10B981' : '#EF4444', fontWeight: 800 }}>
                      {order.status === 'delivered' ? '✓ ENTREGADO' : '✗ CANCELADO'} (${order.total.toLocaleString('es-CO')} COP)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── TAB 1: CONTENT CREATOR & ZONE PUBLISHING ── */}
      {activeTab === 'content' && (
        <div className="grid-2" style={{ gridTemplateColumns: '1.4fr 1fr', gap: '1.75rem' }}>
          
          {/* Creator Form */}
          <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div className="card-header">
              <div className="card-title" style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>
                <Sparkles size={20} style={{ color: 'var(--primary)' }} /> Publicar Foto o Reel para {operatingTenant.name}
              </div>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Cada publicación que hagas aparecerá en el feed de los clientes cercanos en la zona de <strong>{operatingTenant.address}</strong>.
            </p>

            {/* Storytelling Assistant Pills */}
            <div style={{ marginBottom: '1.25rem', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 800 }}>
                💡 Asistente de Copywriting (Haz clic para aplicar texto automático):
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '10px' }} onClick={() => applyStoryPreset('artesanal')}>
                  🌾 Preparación Artesanal
                </button>
                <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '10px' }} onClick={() => applyStoryPreset('promocion')}>
                  🔥 Especial del Día
                </button>
                <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '10px' }} onClick={() => applyStoryPreset('secreto')}>
                  ❤️ Receta Secreta
                </button>
              </div>
            </div>

            <form onSubmit={handleCreatePostSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Vincular / Nombre del Plato:
                  </label>
                  {tenantProducts.length > 0 ? (
                    <select
                      value={postProductId}
                      onChange={e => {
                        const selected = tenantProducts.find(p => p.id === e.target.value);
                        setPostProductId(e.target.value);
                        if (selected) {
                          setPostDishName(selected.name);
                          setPostPrice(selected.price.toString());
                          setPostDishEmoji(selected.emoji);
                        } else {
                          setPostDishName('');
                        }
                      }}
                      required
                      style={{ width: '100%' }}
                    >
                      <option value="">-- Selecciona del Menú --</option>
                      {tenantProducts.map(p => (
                        <option key={p.id} value={p.id} style={{ color: '#000' }}>
                          {p.emoji} {p.name} - ${p.price.toLocaleString('es-CO')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ej: Pizza Napolitana Trufada"
                      value={postDishName}
                      onChange={e => setPostDishName(e.target.value)}
                      required
                      style={{ width: '100%' }}
                    />
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Emoji:
                  </label>
                  <input
                    type="text"
                    value={postDishEmoji}
                    onChange={e => setPostDishEmoji(e.target.value)}
                    style={{ width: '100%', textAlign: 'center' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Precio en Menú (COP):
                  </label>
                  <input
                    type="number"
                    value={postPrice}
                    onChange={e => setPostPrice(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Formato Visual:
                  </label>
                  <select
                    value={postMediaType}
                    onChange={e => setPostMediaType(e.target.value as 'photo' | 'video')}
                    style={{ width: '100%' }}
                  >
                    <option value="video">▶ Video Corto (Reel)</option>
                    <option value="photo">🖼️ Foto de Alta Calidad</option>
                  </select>
                </div>
              </div>

              <FileUploadInput
                label={postMediaType === 'video' ? "Archivo de Video" : "Foto del Plato"}
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

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                  Descripción / Storytelling del Plato:
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe los ingredientes, aroma y por qué deben probarlo hoy..."
                  value={postDesc}
                  onChange={e => setPostDesc(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                  Hashtags (separados por espacio):
                </label>
                <input
                  type="text"
                  value={postHashtags}
                  onChange={e => setPostHashtags(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '14px', marginTop: '8px', fontSize: '0.95rem', fontWeight: 900, borderRadius: '14px' }}
              >
                <Sparkles size={18} /> Publicar Contenido en el Feed de la Zona
              </motion.button>

            </form>
          </div>

          {/* Live Preview & Active Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Live Card Preview */}
            <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <div className="card-header">
                <div className="card-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>
                  <Eye size={18} /> Vista Previa en Vivo ({operatingTenant.name})
                </div>
                <span className="badge badge-secondary">En Vivo</span>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '1.3rem' }}>{operatingTenant.logoEmoji}</div>
                  <div>
                    <strong style={{ color: 'white', display: 'block', fontSize: '0.9rem' }}>{operatingTenant.name}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#38BDF8' }}>{operatingTenant.category} · {operatingTenant.address}</span>
                  </div>
                </div>
                <h4 style={{ margin: '8px 0', color: 'white', fontSize: '0.95rem', fontWeight: 800 }}>{postDishEmoji} {postDishName || 'Nombre de tu plato'}</h4>
                
                <div style={{ height: '180px', borderRadius: '14px', overflow: 'hidden', position: 'relative' }}>
                  <img src={postImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {postMediaType === 'video' && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(255,85,51,0.5)' }}>
                        <Play size={20} fill="white" />
                      </div>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.85)', padding: '5px 12px', borderRadius: '10px', color: 'white', fontWeight: 900, fontSize: '0.9rem' }}>
                    ${parseFloat(postPrice || '0').toLocaleString('es-CO')} COP
                  </div>
                </div>

                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.45 }}>
                  {postDesc || 'Aquí aparecerá la descripción del plato...'}
                </p>
              </div>
            </div>

            {/* Published Posts Analytics */}
            <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <div className="card-header">
                <div className="card-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>
                  📊 Publicaciones Activas ({tenantPosts.length})
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tenantPosts.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem' }}>
                    {operatingTenant.name} aún no ha publicado contenido visual en la zona. ¡Crea el primero a la izquierda!
                  </p>
                ) : (
                  tenantPosts.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={p.image} alt={p.dishName} style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover' }} />
                        <div>
                          <strong style={{ color: 'white', fontSize: '0.88rem' }}>{p.dishEmoji} {p.dishName}</strong>
                          <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <span><Eye size={12} /> {p.viewCount || 0} vistas</span>
                            <span><Heart size={12} fill="#EF4444" /> {p.likes} likes</span>
                          </div>
                        </div>
                      </div>

                      <button
                        className="btn btn-outline"
                        style={{ padding: '6px 10px', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)', borderRadius: '10px' }}
                        onClick={() => {
                          if (authMode === 'remote') {
                            showToast('⚠️ La edición remota del catálogo estará disponible en una próxima fase.');
                            return;
                          }
                          deletePost(p.id);
                        }}
                        title="Eliminar publicación"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ── TAB 2: FINANCIAL ANALYTICS ── */}
      {activeTab === 'analytics' && (
      <Suspense fallback={<FallbackLoader message="Cargando analítica..." />}>
        <FinancialAnalytics tenantId={operatingTenant.id} />
      </Suspense>
      )}

      {activeTab === 'menu' && (
        <Suspense fallback={<FallbackLoader message="Cargando menú..." />}>
          <MenuTab tenant={operatingTenant} />
        </Suspense>
      )}

      {/* ── TAB 4: QR & DRIVERS ── */}
      {activeTab === 'qr' && (
        <div className="grid-2" style={{ gap: '1.75rem' }}>
          
          {/* QR & Table Management */}
          <RestaurantTablesAdmin tenant={operatingTenant} />

          {/* Delivery Drivers */}
          <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'white', fontWeight: 900 }}><Truck size={22} style={{ color: 'var(--secondary)' }} /> Repartidores Propios ({tenantDrivers.length})</div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn btn-primary"
                style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px' }}
                onClick={() => setShowAddDriverForm(!showAddDriverForm)}
              >
                <Plus size={14} /> {showAddDriverForm ? 'Cancelar' : 'Enrolar Repartidor'}
              </motion.button>
            </div>

            {showAddDriverForm && (
              <form onSubmit={handleAddDriverSubmit} style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '16px', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <input
                    placeholder="Nombre repartidor"
                    value={driverName}
                    onChange={e => setDriverName(e.target.value)}
                    required
                  />
                  <input
                    placeholder="Teléfono"
                    value={driverPhone}
                    onChange={e => setDriverPhone(e.target.value)}
                    required
                  />
                </div>
                <input
                  placeholder="Vehículo (e.g. Moto Honda Biz / Bicicleta)"
                  value={driverVehicle}
                  onChange={e => setDriverVehicle(e.target.value)}
                  style={{ width: '100%', marginBottom: '10px' }}
                />
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px', fontWeight: 800, borderRadius: '10px' }}>
                  Guardar Repartidor
                </button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tenantDrivers.map(driver => (
                <div key={driver.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px' }}>
                  <div>
                    <strong style={{ color: 'white', fontSize: '0.92rem' }}>{driver.name}</strong>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      {driver.vehicle} • {driver.phone}
                    </p>
                  </div>
                  <span className={`badge ${driver.status === 'available' ? 'badge-secondary' : 'badge-tertiary'}`}>
                    {driver.status === 'available' ? 'Disponible' : `En entrega (#${driver.assignedOrderId})`}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── TAB: TEAM & MEMBERS ── */}
      {activeTab === 'team' && (
        <Suspense fallback={<FallbackLoader message="Cargando equipo..." />}>
          <TeamTab tenant={operatingTenant} />
        </Suspense>
      )}

      {/* ── TAB: SOPORTE ── */}
      {activeTab === 'support' && operatingTenant && (
      <Suspense fallback={<FallbackLoader message="Cargando soporte..." />}>
        <SupportTab restaurantId={operatingTenant.id} initialTicketId={supportInitialTicketId} />
      </Suspense>
      )}

    </motion.div>
  );
};
