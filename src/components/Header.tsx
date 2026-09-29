import React from 'react';
import { useApp } from '../context/useApp';
import { LogOut, User, Sparkles, ShieldCheck, ChefHat, BarChart3, Bike, QrCode } from 'lucide-react';
import { motion } from 'framer-motion';

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  client_delivery: { label: 'Cliente', icon: <Bike size={13} />, color: '#FF5533' },
  admin: { label: 'Admin Restaurante', icon: <BarChart3 size={13} />, color: '#10B981' },
  kitchen: { label: 'Cocina KDS', icon: <ChefHat size={13} />, color: '#F59E0B' },
  table_qr: { label: 'Mesa QR', icon: <QrCode size={13} />, color: '#38bdf8' },
  platform_admin: { label: 'Plataforma', icon: <ShieldCheck size={13} />, color: '#8B5CF6' },
};

export const Header: React.FC = () => {
  const { userRole, currentUser, currentTenant, logout } = useApp();

  if (userRole === 'login') return null;

  const roleInfo = ROLE_CONFIG[userRole] || ROLE_CONFIG.client_delivery;

  return (
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
            <p>Red Social Gastronómica</p>
          </div>
        </div>

        {/* User Info Pill */}
        <div className="gf-glass-pill">
          <User size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>
            {currentUser?.name || 'Usuario'}
          </span>
        </div>

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
  );
};
