import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { getOperationalTenant, getFulfillmentBadgeText } from '../utils/tenantHelpers';
import { debugOrderUpdatePermissions } from '../utils/debugKDS';
import { PlusCircle, Clock, Flame, CheckCircle, PackageCheck, Building2, AlertCircle, Loader2 } from 'lucide-react';
import type { OrderStatus } from '../types';

export const KitchenKDS: React.FC = () => {
  const { tenants, currentUser, orders, updateOrderStatus, triggerTestOrder, drivers } = useApp();
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
          Esta cuenta no está autorizada para acceder al tablero KDS.
        </p>
      </div>
    );
  }

  const isOwner = currentUser?.businessRole === 'restaurant_owner' || currentUser?.role === 'admin';
  const tenantOrders = orders.filter(o => o.tenantId === operatingTenant.id);

  const handleUpdate = async (orderId: string, status: OrderStatus) => {
    setUpdatingOrderId(orderId);
    
    // Debug en desarrollo
    if (import.meta.env.DEV) {
      await debugOrderUpdatePermissions(orderId);
    }
    
    const success = await updateOrderStatus(orderId, status);
    setUpdatingOrderId(null);
    
    if (!success) {
      // El toast ya se muestra en updateOrderStatus con el error específico
      console.warn(`Failed to update order ${orderId} to ${status}`);
    }
  };

  // Filtrar pedidos por estado para cada columna del KDS
  const newOrders = tenantOrders.filter(o => o.status === 'pending');
  const acceptedOrders = tenantOrders.filter(o => o.status === 'accepted');
  const preparingOrders = tenantOrders.filter(o => o.status === 'preparing');
  const readyOrders = tenantOrders.filter(o => o.status === 'ready');

  const getElapsedTime = (createdAt: number) => {
    const mins = Math.floor((now - createdAt) / 60000);
    return mins === 0 ? 'Ahora mismo' : `Hace ${mins} min`;
  };

  const renderTicketList = (orderList: typeof tenantOrders, _statusLabel: OrderStatus) => {
    if (orderList.length === 0) {
      return (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem', fontSize: '0.85rem' }}>
          Sin tiquetes en esta columna
        </div>
      );
    }

    return orderList.map(order => {
      const assignedDriver = drivers.find(d => d.id === order.driverId);
      const badgeText = getFulfillmentBadgeText(order.fulfillment, order.type);

      return (
        <div key={order.id} className={`ticket-card ${order.status}`}>
          <div className="ticket-header">
            <span className="ticket-id">#{order.id.length > 10 ? order.id.slice(0, 8).toUpperCase() : order.id}</span>
            <span className="ticket-type">{badgeText}</span>
          </div>

          {order.customerName && (
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'white', marginTop: '4px' }}>
              👤 {order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}
            </div>
          )}

          {order.restaurantNotes && (
            <div style={{ fontSize: '0.78rem', color: '#FCA5A5', fontStyle: 'italic', margin: '4px 0 8px' }}>
              📝 Nota: "{order.restaurantNotes}"
            </div>
          )}

          <div className="ticket-items">
            {order.items.map((item, idx) => (
              <div key={idx} className="ticket-item">
                <span>
                  <span className="ticket-item-qty">{item.qty}x</span> {item.name}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  ${(item.price * item.qty).toLocaleString('es-CO')}
                </span>
              </div>
            ))}
          </div>

          {assignedDriver && (
            <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '8px', fontWeight: 600 }}>
              🛵 Repartidor: {assignedDriver.name}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <div className="ticket-timer">
              <Clock size={14} /> {getElapsedTime(order.createdAt)}
            </div>
            <div style={{ fontWeight: 700, color: 'white' }}>
              ${order.total.toLocaleString('es-CO')}
            </div>
          </div>

          <div className="ticket-actions" style={{ marginTop: '12px' }}>
            {order.status === 'pending' && (
              <button
                className="btn btn-outline btn-full"
                disabled={updatingOrderId === order.id}
                onClick={() => handleUpdate(order.id, 'accepted')}
              >
                {updatingOrderId === order.id ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />} 
                {updatingOrderId === order.id ? ' Aceptando...' : ' Aceptar Pedido'}
              </button>
            )}

            {order.status === 'accepted' && (
              <button
                className="btn btn-primary btn-full"
                disabled={updatingOrderId === order.id}
                onClick={() => handleUpdate(order.id, 'preparing')}
              >
                {updatingOrderId === order.id ? <Loader2 size={16} className="spin" /> : <Flame size={16} />} 
                {updatingOrderId === order.id ? ' Iniciando...' : ' Iniciar Preparación'}
              </button>
            )}

            {order.status === 'preparing' && (
              <button
                className="btn btn-secondary btn-full"
                disabled={updatingOrderId === order.id}
                onClick={() => handleUpdate(order.id, 'ready')}
              >
                {updatingOrderId === order.id ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />} 
                {updatingOrderId === order.id ? ' Finalizando...' : ' Marcar Listo'}
              </button>
            )}

            {order.status === 'ready' && (
              <>
                <div style={{ 
                  background: 'rgba(16,185,129,0.15)', 
                  padding: '8px', 
                  borderRadius: '10px', 
                  textAlign: 'center', 
                  fontSize: '0.78rem', 
                  color: '#10B981', 
                  fontWeight: 700,
                  marginBottom: '8px'
                }}>
                  <PackageCheck size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  Listo para entregar
                </div>
                {isOwner && (
                  <button
                    className="btn btn-success btn-full"
                    disabled={updatingOrderId === order.id}
                    onClick={() => handleUpdate(order.id, order.fulfillment === 'restaurant_delivery' ? 'out_for_delivery' : 'delivered')}
                    style={{ background: 'var(--success)', color: 'white' }}
                  >
                    {updatingOrderId === order.id ? <Loader2 size={16} className="spin" /> : <PackageCheck size={16} />} 
                    {updatingOrderId === order.id 
                      ? ' Despachando...' 
                      : order.fulfillment === 'restaurant_delivery' ? ' Despachar (Domicilio)' : ' Entregar al Cliente'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="tab-content active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--secondary)', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
            <Building2 size={16} /> COCINA ISLADA DE {operatingTenant.name.toUpperCase()}
          </div>
          <h2>👨‍🍳 Panel de Cocina KDS ({operatingTenant.name})</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Canal de comanda exclusivo: <code style={{ color: 'var(--tertiary)' }}>tenant:{operatingTenant.slug}:orders</code>
          </p>
        </div>

        {isOwner && (
          <button className="btn btn-outline" onClick={triggerTestOrder}>
            <PlusCircle size={16} /> Simular Pedido en {operatingTenant.name}
          </button>
        )}
      </div>

      <div className="kds-columns">
        {/* Column 1: New Orders (Pending) */}
        <div className="kds-column">
          <div className="kds-column-header">
            <span>🆕 NUEVOS</span>
            <span className="badge badge-primary">{newOrders.length}</span>
          </div>
          {renderTicketList(newOrders, 'pending')}
        </div>

        {/* Column 2: Accepted Orders (Ready to cook) */}
        <div className="kds-column">
          <div className="kds-column-header">
            <span>✅ ACEPTADOS</span>
            <span className="badge badge-success">{acceptedOrders.length}</span>
          </div>
          {renderTicketList(acceptedOrders, 'accepted')}
        </div>

        {/* Column 3: Preparing (Cooking) */}
        <div className="kds-column">
          <div className="kds-column-header">
            <span>🍳 PREPARANDO</span>
            <span className="badge badge-tertiary">{preparingOrders.length}</span>
          </div>
          {renderTicketList(preparingOrders, 'preparing')}
        </div>

        {/* Column 4: Ready for Dispatch */}
        <div className="kds-column">
          <div className="kds-column-header">
            <span>📦 LISTOS</span>
            <span className="badge badge-secondary">{readyOrders.length}</span>
          </div>
          {renderTicketList(readyOrders, 'ready')}
        </div>
      </div>
    </div>
  );
};

