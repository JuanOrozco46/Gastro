import React, { Suspense, lazy } from 'react';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { CustomerDeliveryApp } from './components/CustomerDeliveryApp';
import { Toast } from './components/Toast';

// Módulos pesados importados dinámicamente para Code-Splitting
const KitchenPanel = lazy(() => import('./components/KitchenPanel').then(m => ({ default: m.KitchenPanel })));
const RestaurantAdmin = lazy(() => import('./components/RestaurantAdmin').then(m => ({ default: m.RestaurantAdmin })));
const TablePublicView = lazy(() => import('./components/TablePublicView').then(m => ({ default: m.TablePublicView })));
const SuperAdminView = lazy(() => import('./components/SuperAdminView').then(m => ({ default: m.SuperAdminView })));

const ViewLoader: React.FC = () => (
  <div style={{
    minHeight: '60vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    color: 'var(--text-muted)'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '3px solid var(--primary-glass-border)',
      borderTopColor: 'var(--primary)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }} />
    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Cargando módulo GastroSync...</span>
  </div>
);

import { ForcePasswordModal } from './components/ForcePasswordModal';

const MainContent: React.FC = () => {
  const { userRole, isAuthLoading } = useApp();

  if (isAuthLoading) {
    return <ViewLoader />;
  }

  const path = window.location.pathname;
  if (path.startsWith('/mesa/')) {
    return (
      <main>
        <Suspense fallback={<ViewLoader />}>
          <TablePublicView />
        </Suspense>
      </main>
    );
  }

  if (userRole === 'login') {
    return <LoginScreen />;
  }

  return (
    <main>
      <ForcePasswordModal />
      <Suspense fallback={<ViewLoader />}>
        {userRole === 'client_delivery' && <CustomerDeliveryApp />}
        {userRole === 'kitchen' && <KitchenPanel />}
        {userRole === 'admin' && <RestaurantAdmin />}
        {userRole === 'table_qr' && <TablePublicView />}
        {userRole === 'platform_admin' && <SuperAdminView />}
      </Suspense>
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
      </div>
    </AppProvider>
  );
}

export default App;
