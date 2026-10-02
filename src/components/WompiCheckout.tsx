import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';

export interface WompiCheckoutConfig {
  paymentId: string;
  orderId: string;
  providerReference: string;
  amountInCents: number;
  currency: string;
  publicKey: string;
  signature: string;
}

interface WompiCheckoutProps {
  config: WompiCheckoutConfig;
  onWidgetClosed: () => void;
  onCancel: () => void;
}

export const WompiCheckout: React.FC<WompiCheckoutProps> = ({ config, onWidgetClosed, onCancel }) => {
  const [loadError, setLoadError] = useState(false);
  const widgetRef = useRef<any>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const loadAndOpenWidget = async () => {
      if (openedRef.current) return;

      try {
        if (!(window as unknown as { WidgetCheckout: unknown }).WidgetCheckout) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.wompi.co/widget.js';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Wompi script'));
            document.body.appendChild(script);
          });
        }

        if (!isMounted || openedRef.current) return;
        openedRef.current = true;

        const WidgetCheckout = (window as unknown as { WidgetCheckout: new (config: unknown) => { open: (cb: (result: unknown) => void) => void } }).WidgetCheckout;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const checkout = new WidgetCheckout({
          currency: config.currency,
          amountInCents: config.amountInCents,
          reference: config.providerReference,
          publicKey: config.publicKey,
          signature: { integrity: config.signature }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checkout.open((result: unknown) => {
          console.log('Resultado del Widget Wompi:', result);
          if (isMounted) onWidgetClosed();
        });
        
        widgetRef.current = checkout;
      } catch (err) {
        console.error('Error inicializando WidgetCheckout:', err);
        if (isMounted) setLoadError(true);
      }
    };

    loadAndOpenWidget();

    return () => {
      isMounted = false;
    };
  }, [config, onWidgetClosed]);

  return (
    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
      {!loadError ? (
        <>
          <Loader2 size={48} className="spin" style={{ color: '#10B981', margin: '0 auto 1.5rem' }} />
          <h3 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
            Abriendo Pasarela Segura...
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Serás redirigido a Wompi para completar tu pago de forma segura sin compartir datos con nosotros.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#10B981', fontSize: '0.8rem', fontWeight: 700, marginBottom: '2rem' }}>
            <ShieldCheck size={18} />
            Conexión cifrada de extremo a extremo
          </div>
          
          <button 
            type="button" 
            onClick={onCancel}
            className="btn btn-outline"
            style={{ width: '100%', maxWidth: '280px', margin: '0 auto' }}
          >
            Cancelar Pago
          </button>
        </>
      ) : (
        <>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '50%', 
            background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            margin: '0 auto 1.5rem' 
          }}>
            <X size={32} />
          </div>
          <h3 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
            Error al conectar con Wompi
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            No pudimos cargar la pasarela de pagos. Por favor, revisa tu conexión a internet o desactiva bloqueadores de anuncios e inténtalo de nuevo.
          </p>
          <button 
            type="button" 
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ width: '100%', maxWidth: '280px', margin: '0 auto' }}
          >
            Cerrar
          </button>
        </>
      )}
    </div>
  );
};
