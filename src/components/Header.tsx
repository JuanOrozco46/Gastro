import React from 'react';
import { useApp } from '../context/useApp';
import { LogOut, Building2, User, Eye, Sparkles } from 'lucide-react';
import type { UserRole } from '../types';
import { motion } from 'framer-motion';

export const Header: React.FC = () => {
  const { userRole, setUserRole, currentUser, logout, tenants, currentTenant, setCurrentTenantBySlug } = useApp();

  if (userRole === 'login') return null; // Hide header on login portal

  return (
    <motion.header
      className="header"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        
        {/* Brand Logo & Switcher */}
        <motion.div
          className="logo-container"
          onClick={() => setUserRole('client_delivery')}
          style={{ cursor: 'pointer' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="logo-icon gf-glow-icon">
            <Sparkles size={22} style={{ fill: 'white' }} />
            <div className="logo-dot" />
          </div>
          <div className="logo-text">
            <h1 style={{ fontFamily: 'Outfit, sans-serif' }}>GastroSync</h1>
            <p>Red Social Gastronómica</p>
          </div>
        </motion.div>

        {/* Current User Pill */}
        <div className="gf-glass-pill">
          <User size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>
            {currentUser ? currentUser.name : 'Usuario Autenticado'}
          </span>
        </div>

        {/* View / Role Switcher Pill */}
        <div className="gf-glass-pill gf-role-pill">
          <Eye size={15} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Modo:</span>
          <select
            value={userRole}
            onChange={(e) => setUserRole(e.target.value as UserRole)}
            style={{
              background: 'transparent',
              border: 'none',
              fontWeight: 800,
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          >
            <option value="client_delivery" style={{ color: '#000' }}>🛵 Cliente (Feed & Pedidos)</option>
            <option value="admin" style={{ color: '#000' }}>📊 Admin Restaurante</option>
            <option value="kitchen" style={{ color: '#000' }}>👨‍🍳 Cocina KDS</option>
            <option value="table_qr" style={{ color: '#000' }}>📱 Mesa QR</option>
          </select>
        </div>

        {/* Tenant Switcher for Kitchen & Admin */}
        {userRole !== 'client_delivery' && (
          <div className="gf-glass-pill gf-tenant-pill">
            <Building2 size={15} style={{ color: 'var(--secondary)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Local:</span>
            <select
              value={currentTenant.slug}
              onChange={(e) => setCurrentTenantBySlug(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                fontWeight: 800,
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            >
              {tenants.map(t => (
                <option key={t.id} value={t.slug} style={{ color: '#000' }}>{t.logoEmoji} {t.name}</option>
              ))}
            </select>
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
