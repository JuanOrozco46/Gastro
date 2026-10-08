/**
 * Canal global de errores de datos: los servicios de Supabase no lanzan excepciones
 * (devuelven valores seguros), así que aquí publican los fallos para que la UI
 * (AppContext) los muestre y el usuario no confunda "sin datos" con "error".
 */

export interface DataErrorEvent {
  /** Ámbito del fallo, p. ej. 'restaurants', 'products', 'orders'. */
  scope: string;
  /** Mensaje legible para el usuario. */
  message: string;
}

type DataErrorListener = (event: DataErrorEvent) => void;

const listeners = new Set<DataErrorListener>();
const lastReportedAt = new Map<string, number>();
const COOLDOWN_MS = 30_000;

export function subscribeToDataErrors(listener: DataErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportDataError(scope: string, message: string): void {
  console.warn(`⚠️ [${scope}] ${message}`);
  const now = Date.now();
  const last = lastReportedAt.get(scope) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastReportedAt.set(scope, now);
  const event: DataErrorEvent = { scope, message };
  listeners.forEach(listener => {
    try { listener(event); } catch { /* un listener roto no debe tumbar el resto */ }
  });
}
