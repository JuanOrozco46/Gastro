import React, { useEffect, useState } from 'react';
import { Cookie, ShieldCheck, SlidersHorizontal, Check } from 'lucide-react';
import {
  COOKIE_BANNER_OPEN_EVENT,
  getSavedCookieConsent,
  openLegalCenter,
  saveCookieConsent,
} from '../utils/legalNavigation';

export const CookieConsentBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState<boolean>(() => getSavedCookieConsent() === null);
  const [showDetails, setShowDetails] = useState(false);
  const [functionalEnabled, setFunctionalEnabled] = useState<boolean>(() => {
    const saved = getSavedCookieConsent();
    return saved ? saved.functional : true;
  });
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(() => {
    const saved = getSavedCookieConsent();
    return saved ? saved.analytics : false;
  });

  useEffect(() => {
    const handleReopen = () => {
      const current = getSavedCookieConsent();
      if (current) {
        setFunctionalEnabled(current.functional);
        setAnalyticsEnabled(current.analytics);
      }
      setShowDetails(true);
      setIsVisible(true);
    };

    window.addEventListener(COOKIE_BANNER_OPEN_EVENT, handleReopen);
    return () => {
      window.removeEventListener(COOKIE_BANNER_OPEN_EVENT, handleReopen);
    };
  }, []);

  if (!isVisible) return null;

  const handleAcceptAll = () => {
    saveCookieConsent({ functional: true, analytics: true });
    setFunctionalEnabled(true);
    setAnalyticsEnabled(true);
    setIsVisible(false);
    setShowDetails(false);
  };

  const handleEssentialOnly = () => {
    saveCookieConsent({ functional: false, analytics: false });
    setFunctionalEnabled(false);
    setAnalyticsEnabled(false);
    setIsVisible(false);
    setShowDetails(false);
  };

  const handleSaveCustom = () => {
    saveCookieConsent({
      functional: functionalEnabled,
      analytics: analyticsEnabled,
    });
    setIsVisible(false);
    setShowDetails(false);
  };

  return (
    <aside
      className="gs-cookie-banner"
      role="region"
      aria-label="Aviso de cookies y privacidad"
    >
      <div className="gs-cookie-banner-inner">
        <div className="gs-cookie-banner-main">
          <div className="gs-cookie-icon-badge" aria-hidden="true">
            <Cookie size={20} />
          </div>
          <div className="gs-cookie-copy">
            <div className="gs-cookie-title-row">
              <h3 className="gs-cookie-title">Privacidad y uso de almacenamiento local</h3>
              <span className="gs-cookie-pill">
                <ShieldCheck size={12} /> Ley 1581 de 2012
              </span>
            </div>
            <p className="gs-cookie-desc">
              Usamos cookies técnicas y almacenamiento local para mantener tu sesión segura, conservar tu carrito de compras y recordar tu ciudad en Colombia. No vendemos tus datos a terceros. Consulta nuestra{' '}
              <button
                type="button"
                className="gs-inline-legal-link"
                onClick={() => openLegalCenter('cookies')}
              >
                Política de Cookies
              </button>{' '}
              y{' '}
              <button
                type="button"
                className="gs-inline-legal-link"
                onClick={() => openLegalCenter('privacy')}
              >
                Política de Privacidad
              </button>
              .
            </p>
          </div>
        </div>

        {showDetails && (
          <div className="gs-cookie-preferences-grid">
            <div className="gs-cookie-pref-card is-locked">
              <div className="gs-cookie-pref-top">
                <strong>Esenciales y Seguridad</strong>
                <span className="gs-cookie-status-tag">Siempre activas</span>
              </div>
              <p>
                Autenticación Supabase (JWT), carrito de compras activo y token de seguridad en pagos Wompi.
              </p>
            </div>

            <label className="gs-cookie-pref-card">
              <div className="gs-cookie-pref-top">
                <strong>Funcionales y Ubicación</strong>
                <input
                  type="checkbox"
                  className="gs-cookie-checkbox"
                  checked={functionalEnabled}
                  onChange={(e) => setFunctionalEnabled(e.target.checked)}
                />
              </div>
              <p>
                Recuerda tu ciudad/zona seleccionada en Colombia y preferencias de visualización del directorio.
              </p>
            </label>

            <label className="gs-cookie-pref-card">
              <div className="gs-cookie-pref-top">
                <strong>Métricas de Rendimiento</strong>
                <input
                  type="checkbox"
                  className="gs-cookie-checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                />
              </div>
              <p>
                Diagnósticos agregados y anónimos de velocidad de carga para mejorar la experiencia del feed.
              </p>
            </label>
          </div>
        )}

        <div className="gs-cookie-actions">
          <button
            type="button"
            className="gs-cookie-btn-ghost"
            onClick={() => setShowDetails((prev) => !prev)}
          >
            <SlidersHorizontal size={14} />
            <span>{showDetails ? 'Ocultar opciones' : 'Configurar'}</span>
          </button>
          <button
            type="button"
            className="gs-cookie-btn-outline"
            onClick={handleEssentialOnly}
          >
            Solo esenciales
          </button>
          {showDetails ? (
            <button
              type="button"
              className="gs-cookie-btn-primary"
              onClick={handleSaveCustom}
            >
              <Check size={15} /> Guardar preferencias
            </button>
          ) : (
            <button
              type="button"
              className="gs-cookie-btn-primary"
              onClick={handleAcceptAll}
            >
              <Check size={15} /> Aceptar todas
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
