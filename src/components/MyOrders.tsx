import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Clock, CheckCircle2, ChefHat, Bike, ShoppingBag, CreditCard,
  RefreshCw, ChevronDown, ChevronUp, MapPin, Utensils, MessageSquare, Copy, Check
} from 'lucide-react';
import type { Order, OrderStatus, CustomerDeliveryAddress } from '../types';
import { PaymentStatus } from './PaymentStatus';

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: React.ReactNode; color: string; bg: string; step: number }> = {
  pending: {
    label: 'Recibido por Restaurante',
    icon: <Clock size={14} />,
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.18)',
    step: 1
  },
  preparing: {
    label: 'En Preparación en Cocina',
    icon: <ChefHat size={14} />,
    color: '#FF5533',
    bg: 'rgba(255, 85, 51, 0.18)',
    step: 2
  },
  ready: {
    label: 'Listo / Domiciliario Asignado',
    icon: <Bike size={14} />,
    color: '#38BDF8',
    bg: 'rgba(56, 189, 248, 0.18)',
    step: 3
  },
  accepted: {
    label: 'Aceptado por Restaurante',
    icon: <Clock size={14} />,
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.18)',
    step: 1
  },
  out_for_delivery: {
    label: 'En Camino',
    icon: <Bike size={14} />,
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.18)',
    step: 3
  },
  delivered: {
    label: 'Entregado ✓',
    icon: <CheckCircle2 size={14} />,
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.18)',
    step: 4
  },
  cancelled: {
    label: 'Cancelado',
    icon: <Package size={14} />,
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.18)',
    step: 0
  }
};

const PAYMENT_LABELS: Record<string, string> = {
  apple_pay: '🍎 Apple Pay',
  google_pay: '🌐 Google Pay',
  card: '💳 Tarjeta de Crédito/Débito',
  mercadopago: '📱 Wompi / PSE / Nequi'
};

const formatTime = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
};

const getFulfillmentLabel = (order: Order): string => {
  if (order.fulfillment === 'pickup') {
    return 'Recogida en local';
  }
  if (order.fulfillment === 'restaurant_delivery') {
    return 'Entrega del restaurante';
  }
  if (order.fulfillment === 'table_service') {
    return `Servicio en mesa · Mesa #${order.tableNumber || ''}`;
  }
  // Fallbacks for historical demo orders without fulfillment property
  if (order.type.toLowerCase().includes('mesa')) {
    const tableNum = order.tableNumber || order.type.replace(/[^0-9]/g, '');
    return tableNum ? `Servicio en mesa · Mesa #${tableNum}` : order.type;
  }
  if (order.type.toLowerCase().includes('domicilio')) {
    return 'Entrega del restaurante';
  }
  if (order.type.toLowerCase().includes('recoger') || order.type.toLowerCase().includes('pickup')) {
    return 'Recogida en local';
  }
  return order.type;
};

const isDeliveryOrder = (order: Order): boolean => {
  if (order.fulfillment === 'restaurant_delivery') return true;
  if (!order.fulfillment && order.type.toLowerCase().includes('domicilio')) return true;
  return false;
};

const formatDeliveryAddress = (addr: CustomerDeliveryAddress | string | undefined): string => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  let text = addr.addressLine;
  if (addr.notes) text += ` (${addr.notes})`;
  return text;
};

interface OrderCardProps {
  order: Order;
  tenantName: string;
  tenantEmoji: string;
  authMode: 'demo' | 'remote';
  onNeedHelp?: (orderId: string) => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, tenantName, tenantEmoji, authMode, onNeedHelp }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(order.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const cfg = STATUS_CONFIG[order.status];
  const steps: OrderStatus[] = ['pending', 'preparing', 'ready', 'delivered'];
  const fulfillmentLabel = getFulfillmentLabel(order);
  const showDeliveryAddress = isDeliveryOrder(order) && !!order.deliveryAddress;
  const addressText = formatDeliveryAddress(order.deliveryAddress);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card ${order.status === 'delivered' ? 'order-delivered' : ''}`}
      style={{
        background: 'var(--glass-medium)',
        backdropFilter: 'blur(20px)',
        border: order.status === 'delivered' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid var(--primary-border)',
        borderRadius: '24px',
        padding: '1.5rem',
        marginBottom: '1.25rem',
        boxShadow: order.status === 'delivered' ? '0 10px 30px rgba(0,0,0,0.3)' : '0 12px 36px var(--primary-glow)'
      }}
    >
      {/* Order Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '16px', 
            background: 'var(--primary-glass)', 
            border: '1px solid var(--primary-glass-border)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '1.5rem' 
          }}>
            {tenantEmoji}
          </div>
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>{tenantName}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
              <span className="badge badge-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 800 }}>
                {fulfillmentLabel}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {formatTime(order.createdAt)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                #{order.id.slice(0, 8)}
              </span>
              <button 
                onClick={handleCopyId} 
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                title="Copiar ID completo"
              >
                {copied ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span
            style={{ 
              color: cfg.color, 
              background: cfg.bg, 
              padding: '6px 14px', 
              borderRadius: '20px', 
              fontSize: '0.78rem', 
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {cfg.icon} {cfg.label}
          </span>
          <strong style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', marginTop: '2px' }}>
            ${order.total.toLocaleString('es-CO')} COP
          </strong>
        </div>
      </div>

      {/* Delivery Address (only for delivery orders) */}
      {showDeliveryAddress && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          color: '#38BDF8',
          fontSize: '0.82rem',
          marginBottom: '1rem',
          fontWeight: 600
        }}>
          <MapPin size={16} style={{ flexShrink: 0 }} />
          <span>Dirección de entrega: <strong>{addressText}</strong></span>
        </div>
      )}

      {/* Table Service info tag if applicable */}
      {order.fulfillment === 'table_service' && order.tableNumber && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          color: '#F59E0B',
          fontSize: '0.82rem',
          marginBottom: '1rem',
          fontWeight: 600
        }}>
          <Utensils size={16} style={{ flexShrink: 0 }} />
          <span>Servicio en mesa · <strong>Mesa #{order.tableNumber}</strong></span>
        </div>
      )}

      {/* Progress Track */}
      {order.status !== 'delivered' && (
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '18px',
          padding: '1.25rem 1rem',
          marginBottom: '1.25rem',
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', position: 'relative' }}>
            {steps.map(step => {
              const stepCfg = STATUS_CONFIG[step];
              const active = stepCfg.step <= cfg.step;
              const current = step === order.status;
              return (
                <div key={step} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: active ? stepCfg.color : 'rgba(255,255,255,0.1)',
                    color: active ? 'white' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 6px',
                    boxShadow: current ? `0 0 16px ${stepCfg.color}` : 'none',
                    transition: 'all 0.3s'
                  }}>
                    {stepCfg.icon}
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: active ? 800 : 500, color: active ? 'white' : 'var(--text-muted)', display: 'block' }}>
                    {stepCfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Status para remotos */}
      {authMode === 'remote' && order.paymentId && (
        <div style={{ marginBottom: '1.25rem' }}>
          <PaymentStatus 
            orderId={order.id} 
            paymentId={order.paymentId} 
            authMode={authMode} 
          />
        </div>
      )}

      {/* Items collapse toggle */}
      <button 
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: 'pointer'
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShoppingBag size={16} style={{ color: 'var(--primary)' }} />
          Ver detalle del pedido ({order.items.length} productos)
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}
          >
            {order.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                <span style={{ color: 'white' }}>
                  <strong style={{ color: 'var(--primary)', marginRight: '6px' }}>{item.qty}×</strong> {item.name}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>${(item.price * item.qty).toLocaleString('es-CO')}</span>
              </div>
            ))}

            {/* Economic Breakdown if subtotal available */}
            {order.subtotal !== undefined && (
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Subtotal productos:</span>
                  <span style={{ color: 'white' }}>${order.subtotal.toLocaleString('es-CO')} COP</span>
                </div>
                {order.deliveryFeeApplied !== undefined && order.deliveryFeeApplied > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Tarifa de entrega:</span>
                    <span style={{ color: '#38BDF8' }}>${order.deliveryFeeApplied.toLocaleString('es-CO')} COP</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {order.paymentMethod && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CreditCard size={14} />
                  {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}
                </span>
              )}
              <span>Total Pago: <strong style={{ color: 'white', fontSize: '0.95rem' }}>${order.total.toLocaleString('es-CO')} COP</strong></span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button for Help */}
      {onNeedHelp && (
        <button 
          className="btn btn-outline"
          style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px', padding: '10px', fontSize: '0.85rem', marginTop: '12px' }}
          onClick={(e) => {
            e.stopPropagation();
            onNeedHelp(order.id);
          }}
        >
          <MessageSquare size={16} /> Necesito ayuda con este pedido
        </button>
      )}
    </motion.div>
  );
};

interface MyOrdersProps {
  onNeedHelp?: (orderId: string) => void;
}

export const MyOrders: React.FC<MyOrdersProps> = ({ onNeedHelp }) => {
  const { orders, tenants, authMode, currentUser } = useApp();

  const clientOrders = orders
    .filter(o => {
      if (!o || !currentUser) return false;
      const belongsToCurrentUser =
        (Boolean(currentUser.id) && o.customerId === currentUser.id) ||
        (Boolean(currentUser.email) && o.customerId === currentUser.email);
      if (!belongsToCurrentUser) return false;

      return (
        o.fulfillment !== undefined ||
        o.type.toLowerCase().includes('domicilio') ||
        o.type.toLowerCase().includes('red social') ||
        o.type.toLowerCase().includes('mesa') ||
        o.type.toLowerCase().includes('recoger') ||
        o.type.toLowerCase().includes('local')
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

  const activeOrders = clientOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const pastOrders = clientOrders.filter(o => o.status === 'delivered' || o.status === 'cancelled');

  if (clientOrders.length === 0) {
    return (
      <div 
        className="my-orders-empty"
        style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '32px',
          maxWidth: '600px',
          margin: '2rem auto',
          color: 'var(--text-muted)'
        }}
      >
        <Package size={56} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.5rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>Aún no tienes pedidos registrados</h3>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
          Realiza tu primer pedido desde la red social gastronómica o la carta digital en mesa para rastrearlo en tiempo real.
        </p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ maxWidth: '900px', margin: '0 auto' }}
    >
      {activeOrders.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <RefreshCw size={20} style={{ color: 'var(--primary)', animation: 'spin 3s linear infinite' }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'white' }}>Pedidos en Curso</h3>
            <span className="badge badge-primary">{activeOrders.length} en seguimiento</span>
          </div>
          <div>
            {activeOrders.map(order => {
              const tenant = tenantMap[order.tenantId];
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  tenantName={tenant?.name || 'Restaurante Aliado'}
                  tenantEmoji={tenant?.logoEmoji || '🍽️'}
                  authMode={authMode}
                  onNeedHelp={onNeedHelp}
                />
              );
            })}
          </div>
        </section>
      )}

      {pastOrders.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <CheckCircle2 size={20} style={{ color: '#10B981' }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'white' }}>Historial de Pedidos Completados</h3>
          </div>
          <div>
            {pastOrders.map(order => {
              const tenant = tenantMap[order.tenantId];
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  tenantName={tenant?.name || 'Restaurante Aliado'}
                  tenantEmoji={tenant?.logoEmoji || '🍽️'}
                  authMode={authMode}
                  onNeedHelp={onNeedHelp}
                />
              );
            })}
          </div>
        </section>
      )}
    </motion.div>
  );
};

