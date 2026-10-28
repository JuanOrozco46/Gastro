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
          background: 'var(--neutral-dark)',
          border: operatingTenant.isOpen
            ? '1px solid var(--secondary)'
            : '1px solid var(--primary)',
          color: '#FAFAF8'
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
                  fontWeight: 700,
                  color: '#B0A89E',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Sparkles size={12} style={{ color: 'var(--primary)' }} /> CENTRO DE COMANDAS KDS • {operatingTenant.name}
              </span>
            </div>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#FAFAF8',
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
                      borderRadius: '999px',
                      background: '#10B981'
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
                      borderRadius: '999px',
                      background: '#C85A38'
                    }}
                  />
                  <span>LOCAL CERRADO TEMPORALMENTE</span>
                </>
              )}
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'rgba(250, 250, 248, 0.78)', margin: '4px 0 0' }}>
              {operatingTenant.isOpen
                ? 'Las comandas entran automáticamente en tiempo real en el tablero Kanban.'
                : 'Al estar cerrado no entran nuevos pedidos, pero puedes terminar de despachar las órdenes activas.'}
            </p>
          </div>

          {isOwner ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                background: operatingTenant.isOpen ? 'var(--primary)' : 'var(--secondary)',
                padding: '10px 18px',
                fontSize: '0.875rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)'
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
                fontSize: '0.72rem',
                fontWeight: 700,
                borderRadius: '999px',
                background: 'rgba(250, 250, 248, 0.12)',
                color: '#FAFAF8'
              }}
            >
              Estado gestionado por el Administrador
            </span>
          )}
        </div>
      </div>

      {/* Visual KDS Board */}
      <KdsBoard tenant={operatingTenant} showMenuSidebar={true} />
    </motion.div>
  );
};
