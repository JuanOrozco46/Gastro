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
  wompiMerchantId?: string | null;
  splitConfig?: {
    restaurantMerchantId?: string | null;
    restaurantPayoutCents: number;
    platformFeeCents: number;
    gatewayFeeCents: number;
  };
}

interface WompiCheckoutProps {
  config: WompiCheckoutConfig;
  onWidgetClosed: () => void;
  onCancel: () => void;
}

interface WompiWidgetInstance {
  open: (cb: (result: unknown) => void) => void;
}

export const WompiCheckout: React.FC<WompiCheckoutProps> = ({ config, onWidgetClosed, onCancel }) => {
  const [loadError, setLoadError] = useState(false);
  const widgetRef = useRef<WompiWidgetInstance | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const loadAndOpenWidget = async () => {
      if (openedRef.current) return;

      try {
        if (!(window as unknown as { WidgetCheckout: unknown }).WidgetCheckout) {
          await new Promise<void>((resolve, reject) => {
            const existingScript = document.querySelector<HTMLScriptElement>(
              'script[src="https://checkout.wompi.co/widget.js"]'
            );
            if (existingScript) {
              existingScript.addEventListener('load', () => resolve(), { once: true });
              existingScript.addEventListener('error', () => reject(new Error('Failed to load Wompi script')), { once: true });
              return;
            }
            const script = document.createElement('script');
            script.src = 'https://checkout.wompi.co/widget.js';
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Wompi script'));
            document.body.appendChild(script);
          });
        }

        if (!isMounted || openedRef.current) return;
        openedRef.current = true;

        const WidgetCheckout = (window as unknown as {
          WidgetCheckout: new (config: unknown) => WompiWidgetInstance;
        }).WidgetCheckout;

        const checkout = new WidgetCheckout({
          currency: config.currency,
          amountInCents: config.amountInCents,
          reference: config.providerReference,
          publicKey: config.publicKey,
          signature: { integrity: config.signature }
        });

        checkout.open(() => {
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
    <div className="gs-pay-state-panel">
      {!loadError ? (
        <>
          <div className="gs-pay-state-icon primary">
            <Loader2 size={30} className="spin" />
          </div>
          <h3 className="gs-pay-state-title">
            Abriendo pasarela segura...
          </h3>
          <p className="gs-pay-state-desc">
            Serás redirigido a Wompi para completar tu pago de forma segura sin compartir tus datos financieros.
          </p>
          <div className="gs-pay-state-badge">
            <ShieldCheck size={16} />
            Conexión cifrada de extremo a extremo
          </div>
          <div className="gs-pay-state-actions">
            <button
              type="button"
              onClick={onCancel}
              className="gs-pay-state-btn outline"
            >
              Cancelar pago
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="gs-pay-state-icon danger">
            <X size={30} />
          </div>
          <h3 className="gs-pay-state-title">
            Error al conectar con Wompi
          </h3>
          <p className="gs-pay-state-desc">
            No pudimos cargar la pasarela de pagos. Revisa tu conexión a internet o desactiva bloqueadores de anuncios e inténtalo de nuevo.
          </p>
          <div className="gs-pay-state-actions">
            <button
              type="button"
              onClick={onCancel}
              className="gs-pay-state-btn primary"
            >
              Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  );
};
