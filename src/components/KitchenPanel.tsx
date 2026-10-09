import React from 'react';
import { useApp } from '../context/useApp';
import { getOperationalTenant } from '../utils/tenantHelpers';
import { motion } from 'framer-motion';
import { Power, AlertCircle, Sparkles } from 'lucide-react';
import { KdsBoard } from './KdsBoard';

export const KitchenPanel: React.FC = () => {
  const { tenants, currentUser, toggleTenantOpenStatus } = useApp();
  const operatingTenant = getOperationalTenant(currentUser, tenants);

  if (!operatingTenant) {
    return (
      <div className="rpa-card" style={{ maxWidth: '600px', margin: '2rem auto' }}>
        <div className="rpa-card-body" style={{ alignItems: 'center', textAlign: 'center', padding: '3.5rem 2rem' }}>
          <AlertCircle size={52} style={{ color: '#DC2626', marginBottom: '0.5rem' }} />
          <h3 style={{ fontSize: '1.35rem', color: 'var(--text-main)', fontWeight: 900, margin: '8px 0 4px' }}>
            No tienes una cocina asignada
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            Esta cuenta de cocina no está vinculada a un restaurante activo. Inicia sesión con credenciales autorizadas.
          </p>
        </div>
      </div>
    );
  }

  const isOwner = currentUser?.businessRole === 'restaurant_owner' || currentUser?.role === 'admin';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="tab-content active"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >
      {/* Kitchen Top Bar: Restaurant Open/Close Control Center Header */}
      <div
        className="rpa-card"
        style={{
          background: operatingTenant.isOpen
            ? 'linear-gradient(135deg, #064E3B 0%, #0F172A 100%)'
            : 'linear-gradient(135deg, #7F1D1D 0%, #0F172A 100%)',
          border: operatingTenant.isOpen
            ? '1px solid rgba(16, 185, 129, 0.35)'
            : '1px solid rgba(239, 68, 68, 0.45)',
          color: '#FFFFFF'
        }}
      >
        <div
          className="rpa-card-body"
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: '1.25rem 1.5rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#FCD34D',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Sparkles size={12} /> CENTRO DE COMANDAS KDS • {operatingTenant.name}
              </span>
            </div>
            <h2
              style={{
                fontSize: '1.3rem',
                fontWeight: 900,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                margin: 0
              }}
            >
              {operatingTenant.isOpen ? (
                <>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#10B981',
                      boxShadow: '0 0 12px #10B981'
                    }}
                  />
                  <span>ABIERTO Y RECIBIENDO COMANDAS EN VIVO</span>
                </>
              ) : (
                <>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#EF4444',
                      boxShadow: '0 0 12px #EF4444'
                    }}
                  />
                  <span>LOCAL CERRADO TEMPORALMENTE</span>
                </>
              )}
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)', margin: '4px 0 0' }}>
              {operatingTenant.isOpen
                ? 'Las comandas entran automáticamente en tiempo real en el tablero Kanban.'
                : 'Al estar cerrado no entran nuevos pedidos, pero puedes terminar de despachar las órdenes activas.'}
            </p>
          </div>

          {isOwner ? (
            <button
              type="button"
              className="pam-btn-primary"
              style={{
                background: operatingTenant.isOpen
                  ? 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                padding: '10px 20px',
                fontSize: '0.88rem',
                fontWeight: 800,
                borderRadius: '12px'
              }}
              onClick={() => toggleTenantOpenStatus(operatingTenant.id)}
            >
              <Power size={16} />
              {operatingTenant.isOpen ? 'Pausar Recepción (Cerrar)' : 'Activar Recepción (Abrir)'}
            </button>
          ) : (
            <span
              style={{
                padding: '8px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.12)',
                color: '#FFFFFF'
              }}
            >
              🔒 Estado gestionado por el Administrador
            </span>
          )}
        </div>
      </div>

      {/* Visual KDS Board */}
      <KdsBoard tenant={operatingTenant} showMenuSidebar={true} />
    </motion.div>
  );
};
