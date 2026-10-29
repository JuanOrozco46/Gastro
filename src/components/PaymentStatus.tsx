import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, XCircle, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type PaymentState = 'pending' | 'approved' | 'declined' | 'failed' | 'voided' | 'refunded';

interface PaymentStatusProps {
  orderId: string;
  paymentId: string;
  authMode: 'demo' | 'remote';
  sandboxUrl?: string;
  onRetry?: () => void;
  onClose?: () => void;
}

export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  paymentId,
  authMode,
  sandboxUrl,
  onRetry,
  onClose
}) => {
  const [status, setStatus] = useState<PaymentState>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authMode !== 'remote' || !isSupabaseConfigured || !supabase || !paymentId) {
      return;
    }

    let isMounted = true;

    // Primero verificamos el estado actual por si el webhook llegó antes
    const fetchCurrentStatus = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('status')
          .eq('id', paymentId)
          .single();
          
        if (error) throw error;
        if (data && isMounted) {
          setStatus(data.status as PaymentState);
        }
      } catch (err) {
        console.warn('⚠️ No se pudo cargar el estado inicial del pago.', err);
        if (isMounted) setError('Error de conexión.');
      }
    };

    fetchCurrentStatus();
    
    if (!supabase) return;

    // Luego suscribimos a futuros cambios y activamos respaldo para reconexión móvil (Nequi / PSE / App Bancaria)
    const channel = supabase
      .channel(`payment_${paymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `id=eq.${paymentId}`
        },
        (payload) => {
          if (isMounted && payload.new && payload.new.status) {
            setStatus(payload.new.status as PaymentState);
          }
        }
      )
      .subscribe((subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          console.log('✅ Suscrito a eventos de pago');
        }
      });

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void fetchCurrentStatus();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibilityOrFocus);
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }

    const pollInterval = window.setInterval(() => {
      if (isMounted) {
        void fetchCurrentStatus();
      }
    }, 4000);

    return () => {
      isMounted = false;
      window.clearInterval(pollInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibilityOrFocus);
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      }
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [paymentId, authMode]);

  const renderContent = () => {
    switch (status) {
      case 'pending':
        return (
          <>
            <div className="gs-pay-state-icon primary">
              <Loader2 size={30} className="spin" />
            </div>
            <h3 className="gs-pay-state-title">Estamos confirmando tu pago...</h3>
            <p className="gs-pay-state-desc">
              El restaurante ha recibido tu pedido. Estamos a la espera de la confirmación oficial de la pasarela.
            </p>
            {import.meta.env.DEV && sandboxUrl && (
              <div className="gs-pay-state-actions">
                <button
                  type="button"
                  onClick={() => setStatus('approved')}
                  className="gs-pay-state-btn sandbox"
                >
                  Simular aprobación local (Dev) <ExternalLink size={15} />
                </button>
              </div>
            )}
          </>
        );

      case 'approved':
        return (
          <>
            <div className="gs-pay-state-icon success">
              <CheckCircle size={32} />
            </div>
            <h3 className="gs-pay-state-title">¡Pago aprobado!</h3>
            <p className="gs-pay-state-desc">
              Tu transacción fue confirmada con éxito. La cocina ya está preparando tu orden.
            </p>
            {onClose && (
              <div className="gs-pay-state-actions">
                <button type="button" className="gs-pay-state-btn primary" onClick={onClose}>
                  Entendido
                </button>
              </div>
            )}
          </>
        );

      case 'declined':
        return (
          <>
            <div className="gs-pay-state-icon danger">
              <XCircle size={32} />
            </div>
            <h3 className="gs-pay-state-title">El pago fue rechazado</h3>
            <p className="gs-pay-state-desc">
              Tu banco o pasarela no autorizó esta transacción. Puedes intentarlo nuevamente con otro medio.
            </p>
            <div className="gs-pay-state-actions">
              {onRetry && (
                <button type="button" className="gs-pay-state-btn primary" onClick={onRetry}>
                  <RefreshCw size={16} /> Reintentar pago
                </button>
              )}
              {onClose && (
                <button type="button" className="gs-pay-state-btn outline" onClick={onClose}>
                  Cerrar
                </button>
              )}
            </div>
          </>
        );

      case 'failed':
      case 'voided':
      case 'refunded':
        return (
          <>
            <div className="gs-pay-state-icon danger">
              <AlertCircle size={32} />
            </div>
            <h3 className="gs-pay-state-title">
              {status === 'failed'
                ? 'No fue posible procesar el pago'
                : status === 'voided'
                  ? 'El pago fue anulado'
                  : 'El pago fue reembolsado'}
            </h3>
            <p className="gs-pay-state-desc">
              Por favor revisa el estado con tu entidad financiera o comunícate con soporte si necesitas ayuda.
            </p>
            {onClose && (
              <div className="gs-pay-state-actions">
                <button type="button" className="gs-pay-state-btn outline" onClick={onClose}>
                  Cerrar
                </button>
              </div>
            )}
          </>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="gs-pay-state-panel"
    >
      {error && (
        <div className="gs-checkout-alert danger">
          <AlertCircle size={16} className="gs-checkout-alert-icon" />
          <span>{error}</span>
        </div>
      )}
      {renderContent()}
    </motion.div>
  );
};
