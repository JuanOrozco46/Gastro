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
    return <div className="p-4 text-center text-sm text-gray-500">Cargando...</div>;
  }

  if (existingFeedback) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center mt-6">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
            <CheckCircle size={24} />
          </div>
        </div>
        <h4 className="text-lg font-bold text-gray-900 mb-2">¡Gracias por tu retroalimentación!</h4>
        <div className="flex justify-center gap-1 mb-3">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star 
              key={star} 
              size={20} 
              className={star <= existingFeedback.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} 
            />
          ))}
        </div>
        {existingFeedback.comment && (
          <p className="text-gray-600 italic text-sm">"{existingFeedback.comment}"</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mt-6">
      <h4 className="text-lg font-bold text-gray-900 mb-2">Califica nuestra atención</h4>
      <p className="text-gray-500 text-sm mb-6">Tu caso ha sido cerrado. ¿Cómo evaluarías la solución brindada?</p>
      
      <form onSubmit={handleSubmit}>
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="focus:outline-none transition-transform hover:scale-110"
            >
              <Star 
                size={32} 
                className={star <= (hoverRating || rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'} 
              />
            </button>
          ))}
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comentario (opcional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm"
            rows={3}
            placeholder="Cuéntanos más sobre tu experiencia..."
            maxLength={500}
          />
        </div>
        
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
            {error}
          </div>
        )}
        
        <button
          type="submit"
          disabled={isSubmitting || rating === 0}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Send size={18} />
              <span>Enviar calificación</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
