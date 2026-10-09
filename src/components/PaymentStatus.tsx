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

    // Luego suscribimos a futuros cambios
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Suscrito a eventos de pago');
        }
      });

    return () => {
      isMounted = false;
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
            <Loader2 size={48} className="spin" style={{ color: 'var(--primary)', margin: '0 auto 1rem' }} />
            <h3 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '0.5rem' }}>Estamos confirmando tu pago...</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              El restaurante ha recibido tu pedido. Estamos a la espera de la confirmación de la pasarela de pagos.
            </p>
            {import.meta.env.DEV && sandboxUrl && (
              <button
                type="button"
                onClick={() => setStatus('approved')}
                className="btn btn-outline"
                style={{ width: '100%', marginBottom: '1rem', borderColor: '#F59E0B', color: '#F59E0B' }}
              >
                Simular Aprobación Local (Dev) <ExternalLink size={16} />
              </button>
            )}
          </>
        );
      
      case 'approved':
        return (
          <>
            <CheckCircle size={48} style={{ color: '#10B981', margin: '0 auto 1rem' }} />
            <h3 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '0.5rem' }}>¡Pago aprobado!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Tu transacción ha sido exitosa. La cocina ya está trabajando en tu orden.
            </p>
            {onClose && (
              <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
                Entendido
              </button>
            )}
          </>
        );

      case 'declined':
        return (
          <>
            <XCircle size={48} style={{ color: '#EF4444', margin: '0 auto 1rem' }} />
            <h3 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '0.5rem' }}>El pago fue rechazado</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Tu banco o pasarela no ha autorizado esta transacción.
            </p>
            {onRetry && (
              <button className="btn btn-primary" onClick={onRetry} style={{ width: '100%', marginBottom: '0.5rem' }}>
                <RefreshCw size={16} /> Reintentar Pago
              </button>
            )}
            {onClose && (
              <button className="btn btn-outline" onClick={onClose} style={{ width: '100%' }}>
                Cerrar
              </button>
            )}
          </>
        );
      
      case 'failed':
      case 'voided':
      case 'refunded':
        return (
          <>
            <AlertCircle size={48} style={{ color: '#EF4444', margin: '0 auto 1rem' }} />
            <h3 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              {status === 'failed' ? 'No fue posible procesar el pago' : (status === 'voided' ? 'El pago fue anulado' : 'El pago fue reembolsado')}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Por favor revisa el estado con tu entidad financiera o comunícate con soporte.
            </p>
            {onClose && (
              <button className="btn btn-outline" onClick={onClose} style={{ width: '100%' }}>
                Cerrar
              </button>
            )}
          </>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card"
      style={{
        background: 'var(--glass-dark)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '2rem',
        borderRadius: '24px',
        textAlign: 'center',
        maxWidth: '400px',
        margin: '2rem auto'
      }}
    >
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#FCA5A5', padding: '0.75rem', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}
      {renderContent()}
    </motion.div>
  );
};
