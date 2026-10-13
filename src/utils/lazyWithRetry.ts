import { lazy } from 'react';
import type { LazyExoticComponent } from 'react';

const CHUNK_RELOAD_STORAGE_KEY = 'gs_last_chunk_reload_ts';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

/**
 * Detecta si un error corresponde a un fallo de descarga de un chunk JS/CSS dinámico
 * (por ejemplo, tras un nuevo despliegue en Vercel donde los hashes antiguos ya no existen
 * o por un corte momentáneo de red al cambiar de vista / cerrar sesión).
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : String(error);

  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch dynamically imported module') ||
    normalized.includes('error loading dynamically imported module') ||
    normalized.includes('importing a module script failed') ||
    normalized.includes('chunkloaderror') ||
    normalized.includes('loading chunk') ||
    normalized.includes('unable to preload css')
  );
}

/**
 * Intenta recargar la aplicación una única vez (con ventana de enfriamiento de 15s)
 * para obtener el index.html y los hashes de bundle actualizados tras un despliegue.
 * Devuelve `true` si se disparó la recarga.
 */
export function attemptChunkReload(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const now = Date.now();
    const rawLastReload = window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    const lastReload = rawLastReload ? Number(rawLastReload) : 0;

    if (!Number.isNaN(lastReload) && now - lastReload < CHUNK_RELOAD_COOLDOWN_MS) {
      return false;
    }

    window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // Si sessionStorage está bloqueado, no forzamos recarga automática para evitar bucles
    return false;
  }

  window.location.reload();
  return true;
}

/**
 * Registra el listener oficial de Vite (`vite:preloadError`) para interceptar
 * errores de precarga de chunks tras un redeploy en producción.
 */
let preloadListenerRegistered = false;

export function registerChunkErrorHandlers(): void {
  if (typeof window === 'undefined' || preloadListenerRegistered) return;
  preloadListenerRegistered = true;

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    attemptChunkReload();
  });
}

/**
 * Envoltorio sobre `React.lazy` con reintento automático ante micro-cortes de red
 * y auto-recarga limpia cuando un despliegue nuevo invalida el hash de un chunk.
 */
type BaseLazyComponent = Parameters<typeof lazy>[0] extends () => Promise<{ default: infer C }>
  ? C
  : never;

export function lazyWithRetry<T extends BaseLazyComponent>(
  importer: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  registerChunkErrorHandlers();

  return lazy(async () => {
    try {
      return await importer();
    } catch (firstError) {
      // Primer reintento breve por si fue una fluctuación momentánea de red
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        return await importer();
      } catch (secondError) {
        if (isChunkLoadError(secondError)) {
          const reloading = attemptChunkReload();
          if (reloading) {
            // Mantener el Suspense en estado de carga mientras el navegador refresca la página
            return await new Promise<{ default: T }>(() => {});
          }
        }
        throw secondError ?? firstError;
      }
    }
  });
}
