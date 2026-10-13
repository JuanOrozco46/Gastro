const DEVICE_ID_STORAGE_KEY = 'gs_device_id';

/**
 * Obtiene o genera un identificador anónimo de dispositivo para aislar sesiones
 * públicas de Servicio en Mesa QR sin requerir cuenta autenticada.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-device';
  try {
    let stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!stored || !stored.trim()) {
      stored =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, stored);
    }
    return stored;
  } catch {
    return 'ephemeral-device';
  }
}
