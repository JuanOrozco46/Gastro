import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { getOperationalTenant, getFulfillmentBadgeText } from '../utils/tenantHelpers';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, Clock, Flame, CheckCircle, PackageCheck, Power, Utensils, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

import type { OrderStatus } from '../types';

export const KitchenPanel: React.FC = () => {
  const { tenants, currentUser, toggleTenantOpenStatus, orders, updateOrderStatus, products, triggerTestOrder } = useApp();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const operatingTenant = getOperationalTenant(currentUser, tenants);

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  if (!operatingTenant) {
    return (
      <div 
        style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '28px',
          maxWidth: '600px',
          margin: '2rem auto',
          color: 'var(--text-muted)'
        }}
      >
        <AlertCircle size={52} style={{ color: '#EF4444', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.4rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
          No tienes una cocina asignada
        </h3>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
          Esta cuenta de cocina no está vinculada a un restaurante activo. Inicia sesión con credenciales autorizadas.
        </p>
      </div>
    );
  }

  const isOwner = currentUser?.businessRole === 'restaurant_owner' || currentUser?.role === 'admin';

  const tenantOrders = orders.filter(o => o.tenantId === operatingTenant.id);
  const tenantProducts = products.filter(p => p.tenantId === operatingTenant.id);

  const pendingOrders = tenantOrders.filter(o => o.status === 'pending');
  const acceptedOrders = tenantOrders.filter(o => o.status === 'accepted');
  const preparingOrders = tenantOrders.filter(o => o.status === 'preparing');
  const readyOrders = tenantOrders.filter(o => o.status === 'ready');

  const handleUpdate = async (orderId: string, status: OrderStatus) => {
    setUpdatingOrderId(orderId);
    await updateOrderStatus(orderId, status);
    setUpdatingOrderId(null);
  };

  const getElapsedTime = (createdAt: number) => {
    const mins = Math.floor((now - createdAt) / 60000);
    return mins === 0 ? 'Ahora mismo' : `Hace ${mins} min`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="tab-content active"
    >
      {/* Kitchen Top Bar: Restaurant Open/Close Control Center Header */}
      <div 
        className="card" 
        style={{ 
          marginBottom: '1.5rem', 
          background: operatingTenant.isOpen ? 'var(--glass-medium)' : 'rgba(239, 68, 68, 0.12)', 
          borderColor: operatingTenant.isOpen ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.4)',
          backdropFilter: 'blur(20px)',
          boxShadow: operatingTenant.isOpen ? '0 10px 30px rgba(16, 185, 129, 0.1)' : '0 10px 30px rgba(239, 68, 68, 0.15)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                CENTRO DE COMANDAS KDS • {operatingTenant.name}
              </span>
              <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>SISTEMA DE TIQUETES</span>
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {operatingTenant.isOpen ? (
                <>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 12px #10B981' }} />
                  <span>ABIERTO & RECIBIENDO COMANDAS</span>
                </>
              ) : (
                <>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 12px #EF4444' }} />
                  <span>LOCAL CERRADO TEMPORALMENTE</span>
                </>
              )}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {operatingTenant.isOpen 
                ? 'Las comandas entran automáticamente en tiempo real.'
                : 'Al estar cerrado, no se generan nuevas comandas pero puedes completar las activas.'}
            </p>
          </div>

          {isOwner ? (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`btn ${operatingTenant.isOpen ? 'btn-primary' : 'btn-secondary'}`}
              style={{ 
                padding: '12px 24px', 
                fontSize: '0.95rem',
                fontWeight: 800,
                borderRadius: '14px'
              }}
              onClick={() => toggleTenantOpenStatus(operatingTenant.id)}
            >
              <Power size={18} />
              {operatingTenant.isOpen ? 'Pausar Recepción (Cerrar)' : 'Activar Recepción (Abrir)'}
            </motion.button>
          ) : (
            <span className="badge badge-secondary" style={{ padding: '8px 14px', fontSize: '0.78rem' }}>
              🔒 Estado gestionado por el Administrador
            </span>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '2.4fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* Active KDS Tickets Grid */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                👨‍🍳 Tablero de Tiquetes de Cocina
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {tenantOrders.length} tiquetes registrados para {operatingTenant.name}
              </span>
            </div>

            {isOwner && (
              <motion.button 
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="btn btn-outline" 
                style={{ 
                  padding: '8px 16px', 
                  fontSize: '0.82rem', 
                  fontWeight: 800,
                  borderRadius: '12px',
                  background: 'var(--primary-light)',
                  borderColor: 'var(--primary-border)',
                  color: 'var(--primary)'
                }} 
                onClick={triggerTestOrder}
              >
                <PlusCircle size={16} /> Simular Comanda
              </motion.button>
            )}
          </div>

          <div className="kds-columns">
            
            {/* Pending Column */}
            <div className="kds-column">
              <div className="kds-column-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FF5533', fontWeight: 800 }}>
                  <Flame size={16} /> ENTRANTES ({pendingOrders.length + acceptedOrders.length})
                </span>
                <span className="badge badge-primary">{pendingOrders.length + acceptedOrders.length}</span>
              </div>

              {(pendingOrders.length === 0 && acceptedOrders.length === 0) ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem 1rem', fontSize: '0.85rem' }}>
                  <Sparkles size={24} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: '8px' }} />
                  <div>Sin pedidos pendientes</div>
                </div>
              ) : (
                <AnimatePresence>
                  {[...pendingOrders, ...acceptedOrders].map(order => (
                    <motion.div 
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="ticket-card pending"
                      style={{
                        background: 'var(--glass-dark)',
                        border: '1px solid var(--primary-border)',
                        borderLeft: '6px solid var(--primary)',
                        borderRadius: '16px',
                        padding: '1.25rem',
                        marginBottom: '1rem',
                        boxShadow: '0 8px 24px var(--primary-glow)'
                      }}
                    >
                      <div className="ticket-header" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                        <span className="ticket-id" style={{ color: 'white', fontWeight: 900 }}>#{order.id}</span>
                        <span className="ticket-type" style={{ background: 'var(--primary-glass-border)', color: 'var(--primary)', fontWeight: 800 }}>
                          {getFulfillmentBadgeText(order.fulfillment, order.type)}
                        </span>
                      </div>

                      {order.restaurantNotes && (
                        <div style={{ fontSize: '0.78rem', color: '#FCA5A5', fontStyle: 'italic', margin: '6px 0' }}>
                          📝 Nota cocina: "{order.restaurantNotes}"
                        </div>
                      )}

                      <div className="ticket-items" style={{ margin: '12px 0' }}>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="ticket-item" style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                            <span style={{ color: '#F8FAFC' }}>
                              <span className="ticket-item-qty" style={{ color: 'var(--primary)', fontWeight: 900 }}>{item.qty}x</span> {item.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                        <div className="ticket-timer" style={{ color: 'var(--tertiary)' }}>
                          <Clock size={14} /> {getElapsedTime(order.createdAt)}
                        </div>
                        <strong style={{ fontSize: '0.95rem', color: 'white' }}>
                          ${order.total.toLocaleString('es-CO')} COP
                        </strong>
                      </div>

                      <div className="ticket-actions" style={{ marginTop: '12px' }}>
                        {order.status === 'pending' ? (
                          <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="btn btn-outline btn-full" 
                            style={{ borderRadius: '12px', fontWeight: 800, padding: '10px' }}
                            disabled={updatingOrderId === order.id}
                            onClick={() => handleUpdate(order.id, 'accepted')}
                          >
                            {updatingOrderId === order.id ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />} 
                            {updatingOrderId === order.id ? ' Actualizando...' : ' Aceptar Comanda'}
                          </motion.button>
                        ) : (
                          <motion.button 
                            whileHover={updatingOrderId === order.id ? {} : { scale: 1.02 }}
                            whileTap={updatingOrderId === order.id ? {} : { scale: 0.98 }}
                            className="btn btn-primary btn-full" 
                            style={{ borderRadius: '12px', fontWeight: 800, padding: '10px' }}
                            disabled={updatingOrderId === order.id}
                            onClick={() => handleUpdate(order.id, 'preparing')}
                          >
                            {updatingOrderId === order.id ? <Loader2 size={16} className="spin" /> : <Flame size={16} />} 
                            {updatingOrderId === order.id ? ' Actualizando...' : ' Empezar a Preparar'}
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Preparing Column */}
            <div className="kds-column">
              <div className="kds-column-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#F59E0B', fontWeight: 800 }}>
                  <Clock size={16} /> EN PREPARACIÓN ({preparingOrders.length})
                </span>
                <span className="badge badge-tertiary">{preparingOrders.length}</span>
              </div>

              {preparingOrders.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem 1rem', fontSize: '0.85rem' }}>
                  Sin platos en estufa
                </div>
              ) : (
                <AnimatePresence>
                  {preparingOrders.map(order => (
                    <motion.div 
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="ticket-card preparing"
                      style={{
                        background: 'var(--glass-dark)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderLeft: '6px solid var(--tertiary)',
                        borderRadius: '16px',
                        padding: '1.25rem',
                        marginBottom: '1rem',
                        boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15)'
                      }}
                    >
                      <div className="ticket-header" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                        <span className="ticket-id" style={{ color: 'white', fontWeight: 900 }}>#{order.id}</span>
                        <span className="ticket-type" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', fontWeight: 800 }}>
                          {getFulfillmentBadgeText(order.fulfillment, order.type)}
                        </span>
                      </div>

                      <div className="ticket-items" style={{ margin: '12px 0' }}>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="ticket-item" style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                            <span style={{ color: '#F8FAFC' }}>
                              <span className="ticket-item-qty" style={{ color: '#F59E0B', fontWeight: 900 }}>{item.qty}x</span> {item.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="ticket-actions" style={{ marginTop: '12px' }}>
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="btn btn-secondary btn-full" 
                          style={{ borderRadius: '12px', fontWeight: 800, padding: '10px' }}
                          disabled={updatingOrderId === order.id}
                          onClick={() => handleUpdate(order.id, 'ready')}
                        >
                          {updatingOrderId === order.id ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />}
                          {updatingOrderId === order.id ? ' Actualizando...' : ' Marcar Listo'}
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Ready Column */}
            <div className="kds-column">
              <div className="kds-column-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: 800 }}>
                  <CheckCircle size={16} /> LISTOS ({readyOrders.length})
                </span>
                <span className="badge badge-secondary">{readyOrders.length}</span>
              </div>

              {readyOrders.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem 1rem', fontSize: '0.85rem' }}>
                  Sin tiquetes listos
                </div>
              ) : (
                <AnimatePresence>
                  {readyOrders.map(order => (
                    <motion.div 
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="ticket-card ready"
                      style={{
                        background: 'var(--glass-dark)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        borderLeft: '6px solid var(--secondary)',
                        borderRadius: '16px',
                        padding: '1.25rem',
                        marginBottom: '1rem',
                        boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)'
                      }}
                    >
                      <div className="ticket-header" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                        <span className="ticket-id" style={{ color: 'white', fontWeight: 900 }}>#{order.id}</span>
                        <span className="ticket-type" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', fontWeight: 800 }}>
                          {getFulfillmentBadgeText(order.fulfillment, order.type)}
                        </span>
                      </div>

                      <div className="ticket-items" style={{ margin: '12px 0' }}>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="ticket-item" style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                            <span style={{ color: '#F8FAFC' }}>
                              <span className="ticket-item-qty" style={{ color: '#10B981', fontWeight: 900 }}>{item.qty}x</span> {item.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div style={{ background: 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '12px', textAlign: 'center', fontSize: '0.78rem', color: '#10B981', fontWeight: 700 }}>
                        <PackageCheck size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                        Listo para retiro por mesero / domiciliario
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

          </div>
        </div>

        {/* Real-time Menu Availability View for Kitchen */}
        <div className="card" style={{ height: 'fit-content', background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="card-header" style={{ marginBottom: '0.75rem' }}>
            <div className="card-title" style={{ color: 'white', fontSize: '1.05rem', fontWeight: 900 }}>
              <Utensils size={18} style={{ color: 'var(--primary)' }} /> Carta de {operatingTenant.name}
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.45 }}>
            Estado actual de disponibilidad de productos en el sistema.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tenantProducts.map(product => (
              <div 
                key={product.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '12px 14px', 
                  background: 'rgba(255, 255, 255, 0.04)', 
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.3rem' }}>{product.emoji}</span>
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: 'white', display: 'block' }}>{product.name}</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 800 }}>
                      ${product.price.toLocaleString('es-CO')} COP
                    </span>
                  </div>
                </div>

                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: product.available ? '#10B981' : '#EF4444' }}>
                  {product.available ? '🟢 Disponible' : '🔴 AGOTADO'}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </motion.div>
  );
};

