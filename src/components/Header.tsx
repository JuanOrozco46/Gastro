import React, { useState, Suspense } from 'react';
import { useApp } from '../context/useApp';
import { LogOut, User, Sparkles, ShieldCheck, ChefHat, BarChart3, Bike, QrCode, Scale } from 'lucide-react';
import { motion } from 'framer-motion';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { openLegalCenter } from '../utils/legalNavigation';

const UserProfileModal = lazyWithRetry(() => import('./UserProfileModal').then(m => ({ default: m.UserProfileModal })));

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  client_delivery: { label: 'Cliente', icon: <Bike size={13} />, color: 'var(--primary)' },
  admin: { label: 'Admin Restaurante', icon: <BarChart3 size={13} />, color: 'var(--secondary)' },
  kitchen: { label: 'Cocina KDS', icon: <ChefHat size={13} />, color: 'var(--tertiary)' },
  table_qr: { label: 'Mesa QR', icon: <QrCode size={13} />, color: 'var(--primary)' },
  platform_admin: { label: 'Plataforma', icon: <ShieldCheck size={13} />, color: 'var(--text-main)' },
};

export const Header: React.FC = () => {
  const { userRole, currentUser, currentTenant, cities, selectedCityId, logout } = useApp();
  const [showProfileModal, setShowProfileModal] = useState(false);

  if (userRole === 'login' || userRole === 'client_delivery') return null;

  const roleInfo = ROLE_CONFIG[userRole] || ROLE_CONFIG.client_delivery;
  const activeCityId =
    userRole === 'admin' || userRole === 'kitchen'
      ? currentTenant?.cityId || selectedCityId
      : selectedCityId;
  const activeCityName = cities.find(c => c.id === activeCityId)?.name;

  return (
    <>
      <motion.header
        className="header"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="header-left-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', minWidth: 0 }}>
          
          {/* Brand Logo */}
          <div className="logo-container" style={{ cursor: 'default' }}>
            <div className="logo-icon gf-glow-icon">
              <Sparkles size={22} style={{ fill: 'white' }} />
              <div className="logo-dot" />
            </div>
            <div className="logo-text">
              <h1 style={{ fontFamily: 'var(--font-display)' }}>GastroSync</h1>
              <p>{activeCityName ? `${activeCityName}, Colombia` : 'Colombia'}</p>
            </div>
          </div>

          {/* Interactive User Info Pill (opens UserProfileModal) */}
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="gf-glass-pill header-user-pill"
            title="Editar mi perfil, @usuario, foto y dirección de entrega"
            style={{
              cursor: 'pointer',
              border: '1px solid var(--primary-border)',
              paddingLeft: currentUser?.avatarUrl ? '6px' : undefined
            }}
          >
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1.5px solid var(--primary)'
                }}
              />
            ) : (
              <User size={15} style={{ color: 'var(--primary)' }} />
            )}
            <span className="header-user-name" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {currentUser?.name || 'Usuario'}
            </span>
            {currentUser?.username ? (
              <span
                className="header-user-handle"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  background: 'var(--primary-light)',
                  padding: '1px 7px',
                  borderRadius: '999px'
                }}
              >
                @{currentUser.username}
              </span>
            ) : (
              <span
                className="header-user-handle"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--primary)',
                  background: 'var(--primary-light)',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  border: '1px dashed var(--primary-border)'
                }}
              >
                Editar @perfil
              </span>
            )}
          </button>

          {/* Role Badge (read-only) */}
          <div className="gf-glass-pill header-role-pill" style={{ gap: '6px' }}>
            <span style={{ color: roleInfo.color, display: 'flex', alignItems: 'center' }}>
              {roleInfo.icon}
            </span>
            <span className="header-role-label" style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              color: roleInfo.color,
              letterSpacing: '0.3px'
            }}>
              {roleInfo.label}
            </span>
          </div>

          {/* Tenant Name (if restaurant staff/owner) */}
          {currentUser?.tenantId && currentTenant && (
            <div className="gf-glass-pill header-tenant-pill" style={{ gap: '6px' }}>
              <span style={{ fontSize: '0.875rem' }}>{currentTenant.logoEmoji || '🍽️'}</span>
              <span className="header-tenant-name" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {currentTenant.name}
              </span>
            </div>
          )}
        </div>

        <div className="gs-header-actions">
          <button
            type="button"
            className="gs-header-legal-btn"
            onClick={() => openLegalCenter('privacy')}
            title="Política de Privacidad, Términos, Cookies y RNBD (Ley 1581)"
          >
            <Scale size={14} />
            <span className="gs-header-legal-text">Legal y Privacidad</span>
          </button>

          <motion.button
            className="btn btn-outline gf-logout-btn"
            onClick={logout}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            title="Cerrar Sesión"
          >
            <LogOut size={15} /> <span className="logout-text">Cerrar Sesión</span>
          </motion.button>
        </div>
      </motion.header>

      {showProfileModal && (
        <Suspense fallback={null}>
          <UserProfileModal
            isOpen={showProfileModal}
            onClose={() => setShowProfileModal(false)}
          />
        </Suspense>
      )}
    </>
  );
};
