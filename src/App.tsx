import React, { Suspense } from 'react';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Módulos importados dinámicamente con auto-recuperación ante despliegues nuevos en Vercel
const LoginScreen = lazyWithRetry(() => import('./components/LoginScreen').then(m => ({ default: m.LoginScreen })));
const EmailVerificationScreen = lazyWithRetry(() => import('./components/EmailVerificationScreen').then(m => ({ default: m.EmailVerificationScreen })));
const CustomerDeliveryApp = lazyWithRetry(() => import('./components/CustomerDeliveryApp').then(m => ({ default: m.CustomerDeliveryApp })));
const KitchenPanel = lazyWithRetry(() => import('./components/KitchenPanel').then(m => ({ default: m.KitchenPanel })));
const RestaurantAdmin = lazyWithRetry(() => import('./components/RestaurantAdmin').then(m => ({ default: m.RestaurantAdmin })));
const TablePublicView = lazyWithRetry(() => import('./components/TablePublicView').then(m => ({ default: m.TablePublicView })));
const SuperAdminView = lazyWithRetry(() => import('./components/SuperAdminView').then(m => ({ default: m.SuperAdminView })));
const ForcePasswordModal = lazyWithRetry(() => import('./components/ForcePasswordModal').then(m => ({ default: m.ForcePasswordModal })));
const LegalCenterModal = lazyWithRetry(() => import('./components/LegalCenterModal').then(m => ({ default: m.LegalCenterModal })));

const ViewLoader: React.FC = () => (
  <div className="gs-view-loader" role="status" aria-live="polite">
    <div className="gs-view-loader__spinner" aria-hidden="true" />
    <span className="gs-view-loader__label">Cargando módulo GastroSync...</span>
  </div>
);

const MainContent: React.FC = () => {
  const { userRole, isAuthLoading, emailVerificationState } = useApp();

  if (isAuthLoading) {
    return <ViewLoader />;
  }

  const path = window.location.pathname;

  if (path.startsWith('/auth/callback')) {
    return (
      <main>
        <div style={{ minHeight: '100vh', background: 'var(--neutral-bg)', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center' }}>
          <ViewLoader />
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Verificando sesión, por favor espera...</p>
        </div>
      </main>
    );
  }

  if (path.startsWith('/mesa/')) {
    return (
      <main>
        <ErrorBoundary moduleName="Servicio en Mesa QR">
          <Suspense fallback={<ViewLoader />}>
            <TablePublicView />
          </Suspense>
        </ErrorBoundary>
      </main>
    );
  }

  if (emailVerificationState === 'pending' || emailVerificationState === 'error' || emailVerificationState === 'expired') {
    return (
      <ErrorBoundary moduleName="Verificación de Correo">
        <Suspense fallback={<ViewLoader />}>
          <EmailVerificationScreen />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (userRole === 'login') {
    return (
      <ErrorBoundary moduleName="Inicio de Sesión">
        <Suspense fallback={<ViewLoader />}>
          <LoginScreen />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <main>
      <ErrorBoundary key={userRole} moduleName="Aplicación Principal">
        <Suspense fallback={<ViewLoader />}>
          {userRole === 'client_delivery' && <CustomerDeliveryApp />}
          {userRole === 'kitchen' && <KitchenPanel />}
          {userRole === 'admin' && <RestaurantAdmin />}
          {userRole === 'table_qr' && <TablePublicView />}
          {userRole === 'platform_admin' && <SuperAdminView />}
        </Suspense>
      </ErrorBoundary>
    </main>
  );
};

export function App() {
  return (
    <AppProvider>
      <div className="app-layout">
        <Header />
        <Suspense fallback={null}>
          <ForcePasswordModal />
        </Suspense>
        <MainContent />
        <Toast />
        <Suspense fallback={null}>
          <LegalCenterModal />
        </Suspense>
        <CookieConsentBanner />
      </div>
    </AppProvider>
  );
}

export default App;
