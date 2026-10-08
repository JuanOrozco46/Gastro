import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { LogOut, User, Sparkles, ShieldCheck, ChefHat, BarChart3, Bike, QrCode } from 'lucide-react';
import { motion } from 'framer-motion';
import { UserProfileModal } from './UserProfileModal';

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  client_delivery: { label: 'Cliente', icon: <Bike size={13} />, color: '#FF5533' },
  admin: { label: 'Admin Restaurante', icon: <BarChart3 size={13} />, color: '#10B981' },
  kitchen: { label: 'Cocina KDS', icon: <ChefHat size={13} />, color: '#F59E0B' },
  table_qr: { label: 'Mesa QR', icon: <QrCode size={13} />, color: '#38bdf8' },
  platform_admin: { label: 'Plataforma', icon: <ShieldCheck size={13} />, color: '#8B5CF6' },
};

export const Header: React.FC = () => {
  const { userRole, currentUser, currentTenant, logout } = useApp();
  const [showProfileModal, setShowProfileModal] = useState(false);

  if (userRole === 'login') return null;

  const roleInfo = ROLE_CONFIG[userRole] || ROLE_CONFIG.client_delivery;

  return (
    <>
      <motion.header
        className="header"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          
          {/* Brand Logo */}
          <div className="logo-container" style={{ cursor: 'default' }}>
            <div className="logo-icon gf-glow-icon">
              <Sparkles size={22} style={{ fill: 'white' }} />
              <div className="logo-dot" />
            </div>
            <div className="logo-text">
              <h1 style={{ fontFamily: 'Outfit, sans-serif' }}>GastroSync</h1>
              <p>Armenia, Quindío</p>
            </div>
          </div>

          {/* Interactive User Info Pill (opens UserProfileModal) */}
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="gf-glass-pill"
            title="Editar mi perfil, @usuario, foto y dirección de entrega"
            style={{
              cursor: 'pointer',
              border: '1px solid rgba(212, 163, 89, 0.35)',
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
                  border: '1.5px solid #d4a359'
                }}
              />
            ) : (
              <User size={15} style={{ color: 'var(--primary)' }} />
            )}
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>
              {currentUser?.name || 'Usuario'}
            </span>
            {currentUser?.username && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#f3d29c',
                  background: 'rgba(212, 163, 89, 0.18)',
                  padding: '1px 7px',
                  borderRadius: '999px'
                }}
              >
                @{currentUser.username}
              </span>
            )}
          </button>

          {/* Role Badge (read-only) */}
          <div className="gf-glass-pill" style={{ gap: '6px' }}>
            <span style={{ color: roleInfo.color, display: 'flex', alignItems: 'center' }}>
              {roleInfo.icon}
            </span>
            <span style={{
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
            <div className="gf-glass-pill" style={{ gap: '6px' }}>
              <span style={{ fontSize: '0.85rem' }}>{currentTenant.logoEmoji || '🍽️'}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'white' }}>
                {currentTenant.name}
              </span>
            </div>
          )}
        </div>

        <motion.button
          className="btn btn-outline gf-logout-btn"
          onClick={logout}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
        >
          <LogOut size={15} /> Cerrar Sesión
        </motion.button>
      </motion.header>

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </>
  );
};
