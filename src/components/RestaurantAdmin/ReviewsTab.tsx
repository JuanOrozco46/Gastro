import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant, RestaurantReview } from '../../types';
import {
  fetchRestaurantReviews,
  replyToRestaurantReview,
  deleteRestaurantReview
} from '../../services/supabaseDataService';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  Star,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  Trash2,
  Send,
  RefreshCw,
  Search,
  Image as ImageIcon,
  CornerDownRight,
  Edit3,
  X,
  Store
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const QUICK_OWNER_REPLIES = [
  '¡Muchas gracias por tu pedido y por calificarnos! Esperamos atenderte muy pronto 🧡',
  '¡Qué alegría saber que disfrutaste tu pedido! Todo nuestro equipo te espera de vuelta ✨',
  'Gracias por compartir tu experiencia, tomamos nota en cocina para seguir mejorando cada detalle 🙏'
];

type FilterMode = 'all' | 'unanswered' | 'with_photo' | '5' | '4' | 'low';

export const ReviewsTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { authMode, showToast, syncTenantRating } = useApp();

  const [reviews, setReviews] = useState<RestaurantReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Reply state
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      if (authMode === 'demo' || !isSupabaseConfigured) {
        const raw = localStorage.getItem(`gs_reviews_${tenant.id}`);
        setReviews(raw ? JSON.parse(raw) : []);
        return;
      }
      const data = await fetchRestaurantReviews(tenant.id);
      setReviews(data);
    } finally {
      setLoading(false);
    }
  }, [tenant.id, authMode]);

  useEffect(() => {
    let mounted = true;
    const initReviews = async () => {
      if (authMode === 'demo' || !isSupabaseConfigured) {
        await Promise.resolve();
        if (!mounted) return;
        const raw = localStorage.getItem(`gs_reviews_${tenant.id}`);
        setReviews(raw ? JSON.parse(raw) : []);
        setLoading(false);
        return;
      }
      try {
        const data = await fetchRestaurantReviews(tenant.id);
        if (mounted) setReviews(data);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void initReviews();
    return () => {
      mounted = false;
    };
  }, [tenant.id, authMode]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const avg =
      total > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / total).toFixed(2))
        : Number(tenant.rating || 5.0);
    const positiveCount = reviews.filter(r => r.rating >= 4).length;
    const positivePct = total > 0 ? Math.round((positiveCount / total) * 100) : 100;
    const repliedCount = reviews.filter(r => Boolean(r.ownerReply && r.ownerReply.trim())).length;
    const replyRatePct = total > 0 ? Math.round((repliedCount / total) * 100) : 100;
    const verifiedCount = reviews.filter(r => Boolean(r.orderId)).length;
    const unansweredCount = total - repliedCount;

    return {
      total,
      avg,
      positivePct,
      replyRatePct,
      verifiedCount,
      unansweredCount
    };
  }, [reviews, tenant.rating]);

  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (filterMode === 'unanswered' && r.ownerReply?.trim()) return false;
      if (filterMode === 'with_photo' && !r.reviewImageUrl) return false;
      if (filterMode === '5' && Math.round(r.rating) !== 5) return false;
      if (filterMode === '4' && Math.round(r.rating) !== 4) return false;
      if (filterMode === 'low' && Math.round(r.rating) > 3) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchComment = r.comment.toLowerCase().includes(q);
        const matchName = r.userName.toLowerCase().includes(q);
        const matchHandle = (r.userHandle || '').toLowerCase().includes(q);
        const matchTags = (r.tags || []).some(t => t.toLowerCase().includes(q));
        return matchComment || matchName || matchHandle || matchTags;
      }
      return true;
    });
  }, [reviews, filterMode, searchQuery]);

  const handleOpenReply = (review: RestaurantReview) => {
    setActiveReplyId(review.id);
    setReplyDraft(review.ownerReply || '');
  };

  const handleSaveReply = async (reviewId: string, customText?: string) => {
    const textToSave = (customText !== undefined ? customText : replyDraft).trim();
    setSavingReplyId(reviewId);
    try {
      if (authMode === 'demo' || !isSupabaseConfigured) {
        const nowIso = textToSave ? new Date().toISOString() : undefined;
        const next = reviews.map(r =>
          r.id === reviewId
            ? { ...r, ownerReply: textToSave || undefined, ownerRepliedAt: nowIso }
            : r
        );
        setReviews(next);
        try {
          localStorage.setItem(`gs_reviews_${tenant.id}`, JSON.stringify(next));
        } catch {}
        setActiveReplyId(null);
        setReplyDraft('');
        showToast(textToSave ? '✨ Respuesta del restaurante publicada.' : '🗑️ Respuesta eliminada.');
        return;
      }

      const res = await replyToRestaurantReview(reviewId, textToSave);
      if (!res.success) {
        showToast(`⚠️ ${res.error || 'No se pudo guardar la respuesta.'}`);
        return;
      }

      setReviews(prev =>
        prev.map(r =>
          r.id === reviewId
            ? {
                ...r,
                ownerReply: res.ownerReply,
                ownerRepliedAt: res.ownerRepliedAt
              }
            : r
        )
      );
      setActiveReplyId(null);
      setReplyDraft('');
      showToast(textToSave ? '✨ Respuesta oficial publicada en la reseña.' : '🗑️ Respuesta eliminada.');
    } finally {
      setSavingReplyId(null);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!window.confirm('¿Deseas eliminar esta reseña del perfil de tu restaurante?')) return;
    setDeletingId(reviewId);
    try {
      if (authMode === 'demo' || !isSupabaseConfigured) {
        const next = reviews.filter(r => r.id !== reviewId);
        setReviews(next);
        try {
          localStorage.setItem(`gs_reviews_${tenant.id}`, JSON.stringify(next));
        } catch {}
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
      showToast('🗑️ Reseña eliminada y promedio actualizado.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rpa-card">
      {/* Header Editorial */}
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <Star size={22} />
          </div>
          <div>
            <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
              <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Reputación y Experiencia del Cliente
            </span>
            <h3 className="rpa-card-title">Calificaciones y Reseñas de {tenant.name}</h3>
            <p className="rpa-card-subtitle">
              Consulta las opiniones verificadas de tus pedidos, responde oficialmente como restaurante y modera comentarios.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="pam-btn-ghost"
          onClick={loadReviews}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      <div className="rpa-card-body">
        {/* Sección 1: Resumen Ejecutivo de Calificación */}
        <section className="pam-section">
          <div className="pam-section-head">
            <div className="pam-step done">★</div>
            <div className="pam-section-title-wrap">
              <h4 className="pam-section-title">Resumen de Satisfacción</h4>
              <p className="pam-section-desc">
                Este puntaje se muestra públicamente en el directorio de Locales y en la tarjeta de tu restaurante.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              alignItems: 'center'
            }}
          >
            {/* Score Box */}
            <div
              style={{
                background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                border: '1px solid #FDE68A',
                borderRadius: '16px',
                padding: '18px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#B45309', lineHeight: 1 }}>
                {stats.avg.toFixed(1)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', margin: '8px 0' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    size={16}
                    fill={star <= Math.round(stats.avg) ? '#F59E0B' : 'none'}
                    color="#D97706"
                  />
                ))}
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400E' }}>
                {stats.total} {stats.total === 1 ? 'reseña registrada' : 'reseñas registradas'}
              </span>
            </div>

            {/* Star Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[5, 4, 3, 2, 1].map(star => {
                const count = reviews.filter(r => Math.round(r.rating) === star).length;
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : star === 5 ? 100 : 0;
                return (
                  <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                    <span style={{ width: '34px', fontWeight: 800, color: 'var(--text-main)' }}>{star} ★</span>
                    <div
                      style={{
                        flex: 1,
                        height: '8px',
                        borderRadius: '999px',
                        background: '#EFE9DE',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: '999px',
                          background: 'linear-gradient(90deg, #F59E0B, #D97706)'
                        }}
                      />
                    </div>
                    <span style={{ width: '28px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700 }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Secondary Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                style={{
                  background: '#FBF8F3',
                  border: '1px solid #EAE2D6',
                  borderRadius: '14px',
                  padding: '12px'
                }}
              >
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>
                  Calificaciones 4–5 ★
                </span>
                <strong style={{ fontSize: '1.25rem', color: '#059669', fontWeight: 900 }}>
                  {stats.positivePct}%
                </strong>
              </div>

              <div
                style={{
                  background: '#FBF8F3',
                  border: '1px solid #EAE2D6',
                  borderRadius: '14px',
                  padding: '12px'
                }}
              >
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>
                  Tasa de Respuesta
                </span>
                <strong style={{ fontSize: '1.25rem', color: 'var(--primary)', fontWeight: 900 }}>
                  {stats.replyRatePct}%
                </strong>
              </div>

              <div
                style={{
                  background: '#FBF8F3',
                  border: '1px solid #EAE2D6',
                  borderRadius: '14px',
                  padding: '12px'
                }}
              >
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>
                  Pedidos Verificados
                </span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 900 }}>
                  {stats.verifiedCount}
                </strong>
              </div>

              <div
                style={{
                  background: '#FBF8F3',
                  border: '1px solid #EAE2D6',
                  borderRadius: '14px',
                  padding: '12px'
                }}
              >
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>
                  Sin Responder
                </span>
                <strong
                  style={{
                    fontSize: '1.15rem',
                    color: stats.unansweredCount > 0 ? '#D97706' : '#059669',
                    fontWeight: 900
                  }}
                >
                  {stats.unansweredCount}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {/* Sección 2: Filtros y Búsqueda */}
        <section className="pam-section">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="pam-chips">
              <button
                type="button"
                className={`pam-chip ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
              >
                Todas ({reviews.length})
              </button>
              <button
                type="button"
                className={`pam-chip ${filterMode === 'unanswered' ? 'active' : ''}`}
                onClick={() => setFilterMode('unanswered')}
              >
                💬 Por responder ({stats.unansweredCount})
              </button>
              <button
                type="button"
                className={`pam-chip ${filterMode === 'with_photo' ? 'active' : ''}`}
                onClick={() => setFilterMode('with_photo')}
              >
                📸 Con foto ({reviews.filter(r => Boolean(r.reviewImageUrl)).length})
              </button>
              <button
                type="button"
                className={`pam-chip ${filterMode === '5' ? 'active' : ''}`}
                onClick={() => setFilterMode('5')}
              >
                5 ★ ({reviews.filter(r => Math.round(r.rating) === 5).length})
              </button>
              <button
                type="button"
                className={`pam-chip ${filterMode === '4' ? 'active' : ''}`}
                onClick={() => setFilterMode('4')}
              >
                4 ★ ({reviews.filter(r => Math.round(r.rating) === 4).length})
              </button>
              <button
                type="button"
                className={`pam-chip ${filterMode === 'low' ? 'active' : ''}`}
                onClick={() => setFilterMode('low')}
              >
                ⚠️ 1–3 ★ ({reviews.filter(r => Math.round(r.rating) <= 3).length})
              </button>
            </div>

            <div className="pam-input-wrap" style={{ minWidth: '240px', flex: '0 1 300px' }}>
              <Search size={15} className="pam-icon" />
              <input
                type="text"
                className="pam-input"
                placeholder="Buscar por cliente, @usuario o texto..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Sección 3: Listado de Reseñas */}
        {loading ? (
          <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem' }}>
            <RefreshCw size={26} className="spin" style={{ color: 'var(--primary)' }} />
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontWeight: 600 }}>
              Cargando reseñas de tus clientes...
            </p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.8rem 1.5rem' }}>
            <MessageSquare size={40} style={{ color: 'var(--primary)', opacity: 0.65 }} />
            <h4 style={{ margin: '8px 0 4px', color: 'var(--text-main)', fontWeight: 800 }}>
              {reviews.length === 0
                ? 'Aún no has recibido reseñas'
                : 'No hay reseñas para el filtro seleccionado'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '460px' }}>
              {reviews.length === 0
                ? 'Cuando tus clientes reciban sus pedidos podrán calificarte con estrellas, etiquetas y fotos desde Mis Pedidos.'
                : 'Prueba cambiando el filtro activo o limpiando el término de búsqueda.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredReviews.map(review => {
              const isReplying = activeReplyId === review.id;
              return (
                <div
                  key={review.id}
                  className="pam-section"
                  style={{
                    gap: '12px',
                    borderLeft:
                      review.rating >= 4
                        ? '4px solid #10B981'
                        : review.rating === 3
                          ? '4px solid #F59E0B'
                          : '4px solid #EF4444'
                  }}
                >
                  {/* Top Row: Author + Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: '#F3ECE1',
                          border: '1.5px solid #E2D8C7',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          flexShrink: 0
                        }}
                      >
                        {review.userAvatarUrl ? (
                          <img
                            src={review.userAvatarUrl}
                            alt={review.userName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span>{(review.userName || 'C').charAt(0).toUpperCase()}</span>
                        )}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.96rem', color: 'var(--text-main)', fontWeight: 800 }}>
                            {review.userName}
                          </strong>
                          {review.userHandle && (
                            <span
                              style={{
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                color: 'var(--primary)',
                                background: 'var(--primary-light)',
                                padding: '2px 8px',
                                borderRadius: '999px'
                              }}
                            >
                              @{review.userHandle}
                            </span>
                          )}
                          {review.orderId && (
                            <span className="rpa-badge success" style={{ fontSize: '0.7rem' }}>
                              <CheckCircle2 size={11} /> Pedido #{review.orderId.slice(0, 6)}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star
                                key={star}
                                size={14}
                                fill={star <= review.rating ? '#F59E0B' : 'none'}
                                color={star <= review.rating ? '#F59E0B' : '#CBD5E1'}
                              />
                            ))}
                          </div>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            · {review.timeAgo}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="pam-btn-ghost"
                        style={{ padding: '7px 12px', fontSize: '0.78rem' }}
                        onClick={() => (isReplying ? setActiveReplyId(null) : handleOpenReply(review))}
                      >
                        <Edit3 size={14} />
                        <span>{review.ownerReply ? 'Editar respuesta' : 'Responder'}</span>
                      </button>

                      <button
                        type="button"
                        className="pam-btn-danger"
                        style={{ padding: '7px 10px', fontSize: '0.78rem' }}
                        disabled={deletingId === review.id}
                        onClick={() => handleDelete(review.id)}
                        title="Eliminar reseña"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Quick Tags */}
                  {review.tags && review.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {review.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '999px',
                            background: '#FEF3C7',
                            color: '#B45309',
                            border: '1px solid #FDE68A'
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Comment Text */}
                  {review.comment && (
                    <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: 1.55 }}>
                      "{review.comment}"
                    </p>
                  )}

                  {/* Attached Photo */}
                  {review.reviewImageUrl && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setLightboxImageUrl(review.reviewImageUrl || null)}
                        style={{
                          padding: 0,
                          border: '1px solid #E2D8C7',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          cursor: 'zoom-in',
                          background: '#000',
                          maxWidth: '220px',
                          display: 'block'
                        }}
                        title="Haz clic para ampliar la foto del pedido"
                      >
                        <img
                          src={review.reviewImageUrl}
                          alt="Foto subida por el cliente"
                          style={{ width: '100%', height: '145px', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <ImageIcon size={12} /> Foto adjunta por el cliente
                      </span>
                    </div>
                  )}

                  {/* Existing Official Reply */}
                  {review.ownerReply && !isReplying && (
                    <div
                      style={{
                        background: '#FBF8F3',
                        border: '1px solid #E5DEC9',
                        borderLeft: '3px solid var(--primary)',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <CornerDownRight size={13} />
                          <Store size={13} /> Respuesta oficial de {tenant.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSaveReply(review.id, '')}
                          disabled={savingReplyId === review.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#DC2626',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Quitar respuesta
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                        {review.ownerReply}
                      </p>
                    </div>
                  )}

                  {/* Reply Composer */}
                  <AnimatePresence>
                    {isReplying && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div
                          style={{
                            background: '#FBF8F3',
                            border: '1px solid #E2D8C7',
                            borderRadius: '14px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            marginTop: '4px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                              Responder oficialmente como {tenant.name}
                            </strong>
                            <button
                              type="button"
                              onClick={() => setActiveReplyId(null)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                              <X size={15} />
                            </button>
                          </div>

                          <div className="pam-chips">
                            {QUICK_OWNER_REPLIES.map((preset, idx) => (
                              <button
                                key={idx}
                                type="button"
                                className="pam-chip"
                                style={{ fontSize: '0.72rem', textAlign: 'left' }}
                                onClick={() => setReplyDraft(preset)}
                              >
                                ✨ Plantilla {idx + 1}
                              </button>
                            ))}
                          </div>

                          <textarea
                            className="pam-textarea"
                            rows={2}
                            value={replyDraft}
                            onChange={e => setReplyDraft(e.target.value)}
                            placeholder="Escribe tu agradecimiento o respuesta para el cliente..."
                            maxLength={500}
                          />

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              type="button"
                              className="pam-btn-ghost"
                              onClick={() => setActiveReplyId(null)}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="pam-btn-primary"
                              disabled={savingReplyId === review.id || !replyDraft.trim()}
                              onClick={() => handleSaveReply(review.id)}
                            >
                              <Send size={14} />
                              <span>
                                {savingReplyId === review.id ? 'Publicando...' : 'Publicar Respuesta'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Modal for Review Photo */}
      {lightboxImageUrl && (
        <div
          className="pam-overlay"
          onClick={() => setLightboxImageUrl(null)}
          style={{ zIndex: 9999 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '85vh',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0,0,0,0.65)',
              background: '#0F172A'
            }}
          >
            <button
              type="button"
              onClick={() => setLightboxImageUrl(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} />
            </button>
            <img
              src={lightboxImageUrl}
              alt="Vista ampliada de la reseña"
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', display: 'block' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
