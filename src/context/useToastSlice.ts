import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeToDataErrors } from '../services/dataErrors';

/**
 * Slice de notificaciones: estado del toast, emisor y suscripción a errores
 * de datos reportados por los servicios de Supabase.
 */
export function useToastSlice(isRemoteMode: boolean) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    setToast(message);
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Los servicios de datos reportan fallos de red/RLS aquí para no dejar al
  // usuario ante una app vacía sin explicación.
  useEffect(() => {
    if (!isRemoteMode) return;
    return subscribeToDataErrors(event => {
      showToast(`⚠️ ${event.message}`);
    });
  }, [isRemoteMode, showToast]);

  return { toast, showToast };
}
