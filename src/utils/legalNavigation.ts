export type LegalTabId = 'privacy' | 'terms' | 'cookies' | 'rnbd';

export const LEGAL_OPEN_EVENT = 'gastrosync:open-legal-center';
export const COOKIE_BANNER_OPEN_EVENT = 'gastrosync:open-cookie-banner';
export const COOKIE_CONSENT_STORAGE_KEY = 'gs_cookie_consent_v1';
export const CURRENT_LEGAL_POLICY_VERSION = '2026.1';

export interface CookieConsentPreferences {
  essential: true;
  functional: boolean;
  analytics: boolean;
  acceptedAt: string;
  version: string;
}

export function openLegalCenter(tab: LegalTabId = 'privacy'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LegalTabId>(LEGAL_OPEN_EVENT, { detail: tab }));
}

export function openCookieSettingsBanner(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COOKIE_BANNER_OPEN_EVENT));
}

export function getSavedCookieConsent(): CookieConsentPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsentPreferences>;
    if (!parsed || typeof parsed.acceptedAt !== 'string') return null;
    return {
      essential: true,
      functional: Boolean(parsed.functional),
      analytics: Boolean(parsed.analytics),
      acceptedAt: parsed.acceptedAt,
      version: parsed.version || CURRENT_LEGAL_POLICY_VERSION,
    };
  } catch {
    return null;
  }
}

export function isFunctionalStorageAllowed(): boolean {
  const consent = getSavedCookieConsent();
  // Si el usuario rechazó explícitamente las cookies funcionales ("Solo esenciales"), no persistir
  if (consent && consent.functional === false) {
    return false;
  }
  return true;
}

export function saveCookieConsent(prefs: {
  functional: boolean;
  analytics: boolean;
}): CookieConsentPreferences {
  const payload: CookieConsentPreferences = {
    essential: true,
    functional: prefs.functional,
    analytics: prefs.analytics,
    acceptedAt: new Date().toISOString(),
    version: CURRENT_LEGAL_POLICY_VERSION,
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(payload));
      if (!prefs.functional) {
        window.localStorage.removeItem('gs_selected_city_v1');
        window.localStorage.removeItem('gs_selected_zone_v1');
        window.localStorage.removeItem('gs_location_preference_v1');
      }
    } catch {
      // Ignorar si el navegador bloquea localStorage
    }
  }
  return payload;
}
