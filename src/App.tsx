import React, { Suspense } from 'react';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { ForcePasswordModal } from './components/ForcePasswordModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LegalCenterModal } from './components/LegalCenterModal';
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
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <ViewLoader />
          <p className="mt-4 text-gray-400">Verificando sesión, por favor espera...</p>
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

  if (userRole === 'login') {
    return (
      <ErrorBoundary moduleName="Inicio de Sesión">
        <Suspense fallback={<ViewLoader />}>
          <LoginScreen />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (emailVerificationState === 'pending' || emailVerificationState === 'error') {
    return (
      <ErrorBoundary moduleName="Verificación de Correo">
        <Suspense fallback={<ViewLoader />}>
          <EmailVerificationScreen />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <main>
      <ForcePasswordModal />
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
        <MainContent />
        <Toast />
        <LegalCenterModal />
        <CookieConsentBanner />
      </div>
    </AppProvider>
  );
}

export default App;
