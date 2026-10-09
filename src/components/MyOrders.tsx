import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Clock, CheckCircle2, ChefHat, Bike, ShoppingBag, CreditCard,
  RefreshCw, ChevronDown, ChevronUp, MapPin, Utensils, MessageSquare, Copy, Check, Star, Send,
  Camera, X, Store, CornerDownRight, Sparkles
} from 'lucide-react';
import type { Order, OrderStatus, CustomerDeliveryAddress, RestaurantReview } from '../types';
import { fetchCustomerOrderReviews, submitRestaurantReview } from '../services/supabaseDataService';
import { uploadMediaFile } from '../services/supabaseStorageService';
import { resolveTenantLogoUrl } from '../utils/tenantHelpers';
import { PaymentStatus } from './PaymentStatus';

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: React.ReactNode; color: string; bg: string; step: number }> = {
  pending: {
    label: 'Recibido por Restaurante',
    icon: <Clock size={14} />,
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.18)',
    step: 1
  },
  preparing: {
    label: 'En Preparación en Cocina',
    icon: <ChefHat size={14} />,
    color: '#FF5533',
    bg: 'rgba(255, 85, 51, 0.18)',
    step: 2
  },
  ready: {
    label: 'Listo / Domiciliario Asignado',
    icon: <Bike size={14} />,
    color: '#38BDF8',
    bg: 'rgba(56, 189, 248, 0.18)',
    step: 3
  },
  accepted: {
    label: 'Aceptado por Restaurante',
    icon: <Clock size={14} />,
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.18)',
    step: 1
  },
  out_for_delivery: {
    label: 'En Camino',
    icon: <Bike size={14} />,
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.18)',
    step: 3
  },
  delivered: {
    label: 'Entregado ✓',
    icon: <CheckCircle2 size={14} />,
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.18)',
    step: 4
  },
  cancelled: {
    label: 'Cancelado',
    icon: <Package size={14} />,
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.18)',
    step: 0
  }
};

const PAYMENT_LABELS: Record<string, string> = {
  apple_pay: '🍎 Apple Pay',
  google_pay: '🌐 Google Pay',
  card: '💳 Tarjeta de Crédito/Débito',
  mercadopago: '📱 Wompi / PSE / Nequi'
};

const formatTime = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
};

const getFulfillmentLabel = (order: Order): string => {
  if (order.fulfillment === 'pickup') {
    return 'Recogida en local';
  }
  if (order.fulfillment === 'restaurant_delivery') {
    return 'Entrega del restaurante';
  }
  if (order.fulfillment === 'table_service') {
    return `Servicio en mesa · Mesa #${order.tableNumber || ''}`;
  }
  // Fallbacks for historical demo orders without fulfillment property
  if (order.type.toLowerCase().includes('mesa')) {
    const tableNum = order.tableNumber || order.type.replace(/[^0-9]/g, '');
    return tableNum ? `Servicio en mesa · Mesa #${tableNum}` : order.type;
  }
  if (order.type.toLowerCase().includes('domicilio')) {
    return 'Entrega del restaurante';
  }
  if (order.type.toLowerCase().includes('recoger') || order.type.toLowerCase().includes('pickup')) {
    return 'Recogida en local';
  }
  return order.type;
};

const isDeliveryOrder = (order: Order): boolean => {
  if (order.fulfillment === 'restaurant_delivery') return true;
  if (!order.fulfillment && order.type.toLowerCase().includes('domicilio')) return true;
  return false;
};

const formatDeliveryAddress = (addr: CustomerDeliveryAddress | string | undefined): string => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  let text = addr.addressLine;
  if (addr.notes) text += ` (${addr.notes})`;
  return text;
};

interface OrderCardProps {
  order: Order;
  tenantName: string;
  tenantEmoji: string;
  tenantLogoUrl?: string;
  authMode: 'demo' | 'remote';
  existingReview?: RestaurantReview;
  onReviewSaved: (orderId: string, review: RestaurantReview) => void;
  onNeedHelp?: (orderId: string) => void;
  onOpenTenantReviews?: (tenantId: string) => void;
}

const ORDER_REVIEW_TAGS = [
  '🔥 Excelente sabor',
  '⚡ Entrega rápida',
  '📦 Buena porción',
  '🧼 Buena presentación',
  '💚 Atención amable'
];

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  tenantName,
  tenantEmoji,
  tenantLogoUrl,
  authMode,
  existingReview,
  onReviewSaved,
  onNeedHelp,
  onOpenTenantReviews
}) => {
  const { currentUser, showToast, syncTenantRating } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [brokenLogo, setBrokenLogo] = useState(false);

  // Review state
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [rating, setRating] = useState<number>(existingReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>(existingReview?.tags || []);
  const [comment, setComment] = useState<string>(existingReview?.comment || '');
  const [reviewImageUrl, setReviewImageUrl] = useState<string>(existingReview?.reviewImageUrl || '');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(order.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleReviewPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    if (!rawFile.type.startsWith('image/')) {
      showToast('⚠️ Selecciona una foto válida (JPG, PNG o WEBP).');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const { compressImage } = await import('../utils/imageCompression');
      const compressed = await compressImage(rawFile, 1.5, 1280);
      const uploaded = await uploadMediaFile(compressed.file, 'reviews');
      if (uploaded.success && uploaded.publicUrl) {
        setReviewImageUrl(uploaded.publicUrl);
        showToast('📸 Foto lista para tu reseña.');
      } else {
        showToast(`⚠️ ${uploaded.error || 'No se pudo subir la foto.'}`);
      }
    } catch {
      showToast('⚠️ Error procesando la foto seleccionada.');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('⚠️ Inicia sesión para calificar tu pedido.');
      return;
    }
    if (!comment.trim() && selectedTags.length === 0 && !reviewImageUrl) {
      showToast('⚠️ Selecciona al menos una etiqueta, escribe un comentario o sube una foto de tu pedido.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const finalComment = comment.trim() || selectedTags.join(' · ') || 'Pedido calificado';

      if (authMode === 'demo') {
        const demoRev: RestaurantReview = {
          id: existingReview?.id || `rev_${Date.now()}`,
          restaurantId: order.tenantId,
          orderId: order.id,
          userId: currentUser.id || currentUser.email,
          userName: currentUser.name,
          userHandle: currentUser.username,
          userAvatarUrl: currentUser.avatarUrl,
          rating,
          comment: finalComment,
          tags: selectedTags,
          reviewImageUrl: reviewImageUrl || undefined,
          ownerReply: existingReview?.ownerReply,
          ownerRepliedAt: existingReview?.ownerRepliedAt,
          createdAt: new Date().toISOString(),
          timeAgo: 'Hace un momento'
        };
        try {
          const key = `gs_reviews_${order.tenantId}`;
          const prevList: RestaurantReview[] = JSON.parse(localStorage.getItem(key) || '[]');
          const nextList = [demoRev, ...prevList.filter(r => r.orderId !== order.id && r.id !== demoRev.id)];
          localStorage.setItem(key, JSON.stringify(nextList));
          const avg = nextList.reduce((acc, r) => acc + r.rating, 0) / nextList.length;
          syncTenantRating(order.tenantId, avg, nextList.length);
        } catch {}
        onReviewSaved(order.id, demoRev);
        setIsEditingReview(false);
        showToast('⭐ ¡Gracias por calificar tu pedido!');
        return;
      }

      const res = await submitRestaurantReview({
        restaurantId: order.tenantId,
        orderId: order.id,
        userId: currentUser.id || currentUser.email,
        rating,
        comment: finalComment,
        tags: selectedTags,
        reviewImageUrl: reviewImageUrl || '',
        authorFallback: {
          name: currentUser.name,
          username: currentUser.username,
          avatarUrl: currentUser.avatarUrl
        }
      });

      if (!res.success || !res.review) {
        showToast(`⚠️ ${res.error || 'No se pudo guardar tu calificación.'}`);
        return;
      }

      syncTenantRating(order.tenantId, res.ratingAvg, res.ratingCount);
      onReviewSaved(order.id, res.review);
      setIsEditingReview(false);
      showToast('⭐ ¡Tu calificación fue publicada en el perfil del restaurante!');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const cfg = STATUS_CONFIG[order.status];
  const steps: OrderStatus[] = ['pending', 'preparing', 'ready', 'delivered'];
  const fulfillmentLabel = getFulfillmentLabel(order);
  const showDeliveryAddress = isDeliveryOrder(order) && !!order.deliveryAddress;
  const addressText = formatDeliveryAddress(order.deliveryAddress);

  return (
    <motion.div 
      id={`order-card-${order.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card ${order.status === 'delivered' ? 'order-delivered' : ''}`}
      style={{
        background: 'var(--glass-medium)',
        backdropFilter: 'blur(20px)',
        border: order.status === 'delivered' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid var(--primary-border)',
        borderRadius: '24px',
        padding: '1.5rem',
        marginBottom: '1.25rem',
        boxShadow: order.status === 'delivered' ? '0 10px 30px rgba(0,0,0,0.3)' : '0 12px 36px var(--primary-glow)'
      }}
    >
      {/* Order Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '16px', 
            background: '#0F172A', 
            border: '1px solid var(--primary-glass-border)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '1.5rem',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            {tenantLogoUrl && !brokenLogo ? (
              <img
                loading="lazy"
                decoding="async"
                src={tenantLogoUrl}
                alt={tenantName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setBrokenLogo(true)}
              />
            ) : (
              tenantEmoji
            )}
          </div>
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>{tenantName}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
              <span className="badge badge-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 800 }}>
                {fulfillmentLabel}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {formatTime(order.createdAt)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                #{order.id.slice(0, 8)}
              </span>
              <button 
                onClick={handleCopyId} 
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                title="Copiar ID completo"
              >
                {copied ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span
            style={{ 
              color: cfg.color, 
              background: cfg.bg, 
              padding: '6px 14px', 
              borderRadius: '20px', 
              fontSize: '0.78rem', 
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {cfg.icon} {cfg.label}
          </span>
          <strong style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', marginTop: '2px' }}>
            ${order.total.toLocaleString('es-CO')} COP
          </strong>
        </div>
      </div>

      {/* Delivery Address (only for delivery orders) */}
      {showDeliveryAddress && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          color: '#38BDF8',
          fontSize: '0.82rem',
          marginBottom: '1rem',
          fontWeight: 600
        }}>
          <MapPin size={16} style={{ flexShrink: 0 }} />
          <span>Dirección de entrega: <strong>{addressText}</strong></span>
        </div>
      )}

      {/* Table Service info tag if applicable */}
      {order.fulfillment === 'table_service' && order.tableNumber && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          color: '#F59E0B',
          fontSize: '0.82rem',
          marginBottom: '1rem',
          fontWeight: 600
        }}>
          <Utensils size={16} style={{ flexShrink: 0 }} />
          <span>Servicio en mesa · <strong>Mesa #{order.tableNumber}</strong></span>
        </div>
      )}

      {/* Progress Track */}
      {order.status !== 'delivered' && (
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '18px',
          padding: '1.25rem 1rem',
          marginBottom: '1.25rem',
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', position: 'relative' }}>
            {steps.map(step => {
              const stepCfg = STATUS_CONFIG[step];
              const active = stepCfg.step <= cfg.step;
              const current = step === order.status;
              return (
                <div key={step} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: active ? stepCfg.color : 'rgba(255,255,255,0.1)',
                    color: active ? 'white' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 6px',
                    boxShadow: current ? `0 0 16px ${stepCfg.color}` : 'none',
                    transition: 'all 0.3s'
                  }}>
                    {stepCfg.icon}
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: active ? 800 : 500, color: active ? 'white' : 'var(--text-muted)', display: 'block' }}>
                    {stepCfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Status para remotos */}
      {authMode === 'remote' && order.paymentId && (
        <div style={{ marginBottom: '1.25rem' }}>
          <PaymentStatus 
            orderId={order.id} 
            paymentId={order.paymentId} 
            authMode={authMode} 
          />
        </div>
      )}

      {/* Items collapse toggle */}
      <button 
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: 'pointer'
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShoppingBag size={16} style={{ color: 'var(--primary)' }} />
          Ver detalle del pedido ({order.items.length} productos)
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}
          >
            {order.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                <span style={{ color: 'white' }}>
                  <strong style={{ color: 'var(--primary)', marginRight: '6px' }}>{item.qty}×</strong> {item.name}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>${(item.price * item.qty).toLocaleString('es-CO')}</span>
              </div>
            ))}

            {/* Economic Breakdown if subtotal available */}
            {order.subtotal !== undefined && (
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Subtotal productos:</span>
                  <span style={{ color: 'white' }}>${order.subtotal.toLocaleString('es-CO')} COP</span>
                </div>
                {order.deliveryFeeApplied !== undefined && order.deliveryFeeApplied > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Tarifa de entrega:</span>
                    <span style={{ color: '#38BDF8' }}>${order.deliveryFeeApplied.toLocaleString('es-CO')} COP</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {order.paymentMethod && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CreditCard size={14} />
                  {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}
                </span>
              )}
              <span>Total Pago: <strong style={{ color: 'white', fontSize: '0.95rem' }}>${order.total.toLocaleString('es-CO')} COP</strong></span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post-Order Rating & Review Section */}
      {order.status !== 'cancelled' && (
        <div
          style={{
            marginTop: '14px',
            padding: '14px 16px',
            borderRadius: '16px',
            background: existingReview && !isEditingReview
              ? 'rgba(16, 185, 129, 0.08)'
              : 'rgba(245, 158, 11, 0.08)',
            border: existingReview && !isEditingReview
              ? '1px solid rgba(16, 185, 129, 0.25)'
              : '1px solid rgba(245, 158, 11, 0.28)'
          }}
        >
          {existingReview && !isEditingReview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10B981' }}>
                    ✓ Tu calificación para {tenantName}:
                  </span>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        size={14}
                        fill={s <= existingReview.rating ? '#F59E0B' : 'none'}
                        color={s <= existingReview.rating ? '#F59E0B' : '#475569'}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setRating(existingReview.rating);
                      setSelectedTags(existingReview.tags || []);
                      setComment(existingReview.comment || '');
                      setReviewImageUrl(existingReview.reviewImageUrl || '');
                      setIsEditingReview(true);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      color: 'white',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Editar reseña
                  </button>
                  {onOpenTenantReviews && (
                    <button
                      type="button"
                      onClick={() => onOpenTenantReviews(order.tenantId)}
                      style={{
                        background: 'rgba(245, 158, 11, 0.16)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        color: '#FBBF24',
                        borderRadius: '8px',
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Ver reseñas del local
                    </button>
                  )}
                </div>
              </div>
              {existingReview.tags && existingReview.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {existingReview.tags.map((t, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#FBBF24',
                        fontWeight: 700
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {existingReview.comment && (
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#E2E8F0' }}>
                  "{existingReview.comment}"
                </p>
              )}
              {existingReview.reviewImageUrl && (
                <div style={{ marginTop: '2px' }}>
                  <img
                    src={existingReview.reviewImageUrl}
                    alt="Foto de tu pedido"
                    style={{
                      width: '140px',
                      height: '100px',
                      objectFit: 'cover',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.14)'
                    }}
                  />
                </div>
              )}
              {existingReview.ownerReply && (
                <div
                  style={{
                    marginTop: '4px',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: 'rgba(15, 23, 42, 0.72)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderLeft: '3px solid var(--primary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <CornerDownRight size={13} style={{ color: 'var(--primary)' }} />
                    <Store size={13} style={{ color: 'var(--primary)' }} />
                    <strong style={{ fontSize: '0.76rem', color: '#FBBF24' }}>
                      Respuesta oficial de {tenantName}:
                    </strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#E2E8F0', lineHeight: 1.45 }}>
                    {existingReview.ownerReply}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveReview} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#FBBF24', display: 'block' }}>
                    ⭐ ¿Qué tal estuvo tu pedido en {tenantName}?
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Tu calificación aparecerá en el apartado de Reseñas del restaurante
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[1, 2, 3, 4, 5].map(star => {
                    const active = star <= (hoverRating || rating);
                    return (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(star)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        <Star
                          size={22}
                          fill={active ? '#F59E0B' : 'none'}
                          color={active ? '#F59E0B' : '#64748B'}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {ORDER_REVIEW_TAGS.map(tag => {
                  const selected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      style={{
                        padding: '4px 9px',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: selected ? '1px solid #F59E0B' : '1px solid rgba(255,255,255,0.12)',
                        background: selected ? 'rgba(245, 158, 11, 0.22)' : 'rgba(255,255,255,0.04)',
                        color: selected ? '#FBBF24' : 'var(--text-muted)'
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              {/* Photo Attachment Preview / Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '10px',
                    border: '1px dashed rgba(245, 158, 11, 0.4)',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#FBBF24',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: isUploadingPhoto ? 'wait' : 'pointer'
                  }}
                >
                  <Camera size={14} />
                  <span>{isUploadingPhoto ? 'Subiendo foto...' : reviewImageUrl ? 'Cambiar foto del pedido' : '📸 Subir foto de tu pedido (opcional)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleReviewPhotoSelect}
                    disabled={isUploadingPhoto}
                    style={{ display: 'none' }}
                  />
                </label>

                {reviewImageUrl && (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={reviewImageUrl}
                      alt="Vista previa"
                      style={{
                        width: '72px',
                        height: '54px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.2)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setReviewImageUrl('')}
                      title="Quitar foto"
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: 'none',
                        background: '#EF4444',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Deja tu comentario sobre el sabor, temperatura o atención..."
                  maxLength={500}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    color: 'white',
                    fontSize: '0.82rem',
                    resize: 'vertical'
                  }}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  {isEditingReview && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setIsEditingReview(false)}
                      style={{ borderRadius: '10px', padding: '8px 12px', fontSize: '0.78rem' }}
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmittingReview || isUploadingPhoto}
                    style={{
                      borderRadius: '10px',
                      padding: '8px 14px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Send size={14} />
                    {isSubmittingReview ? 'Guardando...' : 'Calificar'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Button for Help */}
      {onNeedHelp && (
        <button 
          className="btn btn-outline"
          style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px', padding: '10px', fontSize: '0.85rem', marginTop: '12px' }}
          onClick={(e) => {
            e.stopPropagation();
            onNeedHelp(order.id);
          }}
        >
          <MessageSquare size={16} /> Necesito ayuda con este pedido
        </button>
      )}
    </motion.div>
  );
};

interface MyOrdersProps {
  onNeedHelp?: (orderId: string) => void;
  onOpenTenantReviews?: (tenantId: string) => void;
}

export const MyOrders: React.FC<MyOrdersProps> = ({ onNeedHelp, onOpenTenantReviews }) => {
  const { orders, tenants, posts, products, authMode, currentUser } = useApp();
  const [orderReviewsMap, setOrderReviewsMap] = useState<Record<string, RestaurantReview>>({});

  React.useEffect(() => {
    let mounted = true;
    const loadReviews = async () => {
      if (!currentUser) return;
      if (authMode === 'demo') {
        const map: Record<string, RestaurantReview> = {};
        for (const t of tenants) {
          try {
            const list: RestaurantReview[] = JSON.parse(localStorage.getItem(`gs_reviews_${t.id}`) || '[]');
            for (const r of list) {
              if (r.orderId && (r.userId === currentUser.id || r.userId === currentUser.email)) {
                map[r.orderId] = r;
              }
            }
          } catch {}
        }
        if (mounted) setOrderReviewsMap(map);
        return;
      }
      if (currentUser.id) {
        const remoteMap = await fetchCustomerOrderReviews(currentUser.id);
        if (mounted) setOrderReviewsMap(remoteMap);
      }
    };
    loadReviews();
    return () => { mounted = false; };
  }, [currentUser, authMode, tenants]);

  const handleReviewSaved = (orderId: string, review: RestaurantReview) => {
    setOrderReviewsMap(prev => ({ ...prev, [orderId]: review }));
  };

  const clientOrders = orders
    .filter(o => {
      if (!o || !currentUser) return false;
      const belongsToCurrentUser =
        (Boolean(currentUser.id) && o.customerId === currentUser.id) ||
        (Boolean(currentUser.email) && o.customerId === currentUser.email);
      if (!belongsToCurrentUser) return false;

      return (
        o.fulfillment !== undefined ||
        o.type.toLowerCase().includes('domicilio') ||
        o.type.toLowerCase().includes('red social') ||
        o.type.toLowerCase().includes('mesa') ||
        o.type.toLowerCase().includes('recoger') ||
        o.type.toLowerCase().includes('local')
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

  const activeOrders = clientOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const pastOrders = clientOrders.filter(o => o.status === 'delivered' || o.status === 'cancelled');
  const unreviewedDeliveredOrders = pastOrders.filter(
    o => o.status === 'delivered' && !orderReviewsMap[o.id]
  );

  if (clientOrders.length === 0) {
    return (
      <div 
        className="my-orders-empty"
        style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '32px',
          maxWidth: '600px',
          margin: '2rem auto',
          color: 'var(--text-muted)'
        }}
      >
        <Package size={56} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.5rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>Aún no tienes pedidos registrados</h3>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
          Realiza tu primer pedido desde la red social gastronómica o la carta digital en mesa para rastrearlo en tiempo real.
        </p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ maxWidth: '900px', margin: '0 auto' }}
    >
      {/* Banner de Recordatorio para Pedidos Entregados sin Calificar */}
      {unreviewedDeliveredOrders.length > 0 && (
        <div
          style={{
            marginBottom: '1.75rem',
            padding: '16px 20px',
            borderRadius: '22px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.1) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '14px',
                background: 'rgba(245, 158, 11, 0.25)',
                color: '#FBBF24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <strong style={{ color: 'white', fontSize: '0.96rem', display: 'block', fontWeight: 900 }}>
                ¡Cuéntanos cómo estuvo tu pedido en {tenantMap[unreviewedDeliveredOrders[0].tenantId]?.name || 'el restaurante'}!
              </strong>
              <span style={{ color: '#FDE68A', fontSize: '0.8rem' }}>
                Tienes {unreviewedDeliveredOrders.length}{' '}
                {unreviewedDeliveredOrders.length === 1 ? 'pedido entregado' : 'pedidos entregados'} pendiente
                {unreviewedDeliveredOrders.length === 1 ? '' : 's'} por calificar.
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{
              borderRadius: '12px',
              padding: '9px 16px',
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => {
              const target = document.getElementById(`order-card-${unreviewedDeliveredOrders[0].id}`);
              target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            <Star size={14} fill="currentColor" /> Calificar Ahora
          </button>
        </div>
      )}

      {activeOrders.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <RefreshCw size={20} style={{ color: 'var(--primary)', animation: 'spin 3s linear infinite' }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'white' }}>Pedidos en Curso</h3>
            <span className="badge badge-primary">{activeOrders.length} en seguimiento</span>
          </div>
          <div>
            {activeOrders.map(order => {
              const tenant = tenantMap[order.tenantId];
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  tenantName={tenant?.name || 'Restaurante Aliado'}
                  tenantEmoji={tenant?.logoEmoji || '🍽️'}
                  tenantLogoUrl={resolveTenantLogoUrl(tenant, posts, products)}
                  authMode={authMode}
                  existingReview={orderReviewsMap[order.id]}
                  onReviewSaved={handleReviewSaved}
                  onNeedHelp={onNeedHelp}
                  onOpenTenantReviews={onOpenTenantReviews}
                />
              );
            })}
          </div>
        </section>
      )}

      {pastOrders.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <CheckCircle2 size={20} style={{ color: '#10B981' }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'white' }}>Historial de Pedidos Completados</h3>
          </div>
          <div>
            {pastOrders.map(order => {
              const tenant = tenantMap[order.tenantId];
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  tenantName={tenant?.name || 'Restaurante Aliado'}
                  tenantEmoji={tenant?.logoEmoji || '🍽️'}
                  tenantLogoUrl={resolveTenantLogoUrl(tenant, posts, products)}
                  authMode={authMode}
                  existingReview={orderReviewsMap[order.id]}
                  onReviewSaved={handleReviewSaved}
                  onNeedHelp={onNeedHelp}
                  onOpenTenantReviews={onOpenTenantReviews}
                />
              );
            })}
          </div>
        </section>
      )}
    </motion.div>
  );
};


