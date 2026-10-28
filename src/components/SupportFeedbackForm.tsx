import React, { useState, useEffect } from 'react';
import { Star, Send, CheckCircle } from 'lucide-react';
import { submitTicketFeedback, fetchTicketFeedback } from '../services/supportService';
import type { SupportTicketFeedback } from '../services/supportService';

interface Props {
  ticketId: string;
}

export const SupportFeedbackForm: React.FC<Props> = ({ ticketId }) => {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [existingFeedback, setExistingFeedback] = useState<SupportTicketFeedback | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetchTicketFeedback(ticketId).then(({ data }) => {
      if (!isMounted) return;
      if (data) setExistingFeedback(data);
      setLoading(false);
    });
    return () => { isMounted = false; };
  }, [ticketId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Por favor selecciona una calificación.');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    const { error: submitErr } = await submitTicketFeedback(ticketId, rating, comment);
    
    if (submitErr) {
      setError(submitErr);
      setIsSubmitting(false);
    } else {
      // Re-fetch to show the submitted state
      const { data } = await fetchTicketFeedback(ticketId);
      if (data) setExistingFeedback(data);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        Cargando calificación...
      </div>
    );
  }

  if (existingFeedback) {
    return (
      <div
        style={{
          background: 'var(--secondary-light)',
          border: '1px solid var(--neutral-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          textAlign: 'center',
          marginTop: '1.25rem'
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '999px',
            background: 'var(--neutral-surface)',
            color: 'var(--secondary-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem',
            border: '1px solid var(--neutral-border)'
          }}
        >
          <CheckCircle size={22} />
        </div>
        <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
          ¡Gracias por tu retroalimentación!
        </h4>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '0.75rem' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              size={20}
              fill={star <= existingFeedback.rating ? 'var(--tertiary)' : 'transparent'}
              color={star <= existingFeedback.rating ? 'var(--tertiary)' : 'var(--neutral-border-strong)'}
            />
          ))}
        </div>
        {existingFeedback.comment && (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.875rem', margin: 0 }}>
            «{existingFeedback.comment}»
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        background: 'var(--neutral-surface)',
        border: '1px solid var(--neutral-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        marginTop: '1.25rem',
        boxShadow: 'var(--shadow-card)'
      }}
    >
      <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
        Califica nuestra atención
      </h4>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        Tu caso ha sido cerrado. ¿Cómo evaluarías la solución brindada?
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1.25rem' }}>
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= (hoverRating || rating);
            return (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                aria-label={`Calificar con ${star} estrella${star !== 1 ? 's' : ''}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  transition: 'transform 0.15s ease'
                }}
              >
                <Star
                  size={30}
                  fill={active ? 'var(--tertiary)' : 'transparent'}
                  color={active ? 'var(--tertiary)' : 'var(--neutral-border-strong)'}
                />
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              marginBottom: '6px'
            }}
          >
            Comentario (opcional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="form-input"
            rows={3}
            placeholder="Cuéntanos más sobre tu experiencia..."
            maxLength={500}
            style={{ width: '100%' }}
          />
        </div>

        {error && (
          <div
            style={{
              marginBottom: '1rem',
              fontSize: '0.875rem',
              color: 'var(--danger)',
              background: 'var(--danger-light)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--primary-border)'
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || rating === 0}
          className="btn btn-primary btn-full"
          style={{ justifyContent: 'center' }}
        >
          {isSubmitting ? (
            <span>Enviando...</span>
          ) : (
            <>
              <Send size={16} />
              <span>Enviar calificación</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
