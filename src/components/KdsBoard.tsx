import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { getFulfillmentBadgeText } from '../utils/tenantHelpers';
import type { Order, OrderStatus, Tenant } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Flame,
  CheckCircle2,
  PackageCheck,
  Utensils,
  Bike,
  ShoppingBag,
  Phone,
  MapPin,
  AlertTriangle,
  Search,
  Layers,
  History,
  LayoutGrid,
  Check,
  XCircle,
  Loader2,
  Banknote,
  CreditCard,
  Volume2,
  VolumeX,
  PlusCircle,
  ChefHat,
  ExternalLink
} from 'lucide-react';

interface KdsBoardProps {
  tenant: Tenant;
  showMenuSidebar?: boolean;
}

type ChannelFilter = 'all' | 'restaurant_delivery' | 'table_service' | 'pickup';
type KdsViewMode = 'kanban' | 'batch' | 'history';

const playKitchenChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Ignore audio context restriction errors
  }
};

export const KdsBoard: React.FC<KdsBoardProps> = ({ tenant, showMenuSidebar = false }) => {
  const {
    cities,
    orders,
    products,
    currentUser,
    updateOrderStatus,
    confirmCashPayment,
    toggleProductAvailability,
    triggerTestOrder
  } = useApp();
  const tenantCityName = cities.find(c => c.id === tenant.cityId)?.name || 'Colombia';

  const [now, setNow] = useState(() => Date.now());
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [viewMode, setViewMode] = useState<KdsViewMode>('kanban');
  const [kdsStageFilter, setKdsStageFilter] = useState<'all' | 'incoming' | 'kitchen' | 'ready'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);

  // Estado local persistido de platos marcados como listos dentro de cada comanda (estilo Uber Eats KDS)
  const [checkedItemsMap, setCheckedItemsMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`gs_kds_checked_${tenant.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const isOwner =
    currentUser?.businessRole === 'restaurant_owner' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'platform_admin';

  // Estrictamente aislado al restaurante actual
  const tenantOrders = useMemo(
    () =>
      orders
        .filter(o => o.tenantId === tenant.id)
        .sort((a, b) => a.createdAt - b.createdAt),
    [orders, tenant.id]
  );

  const tenantProducts = useMemo(
    () => products.filter(p => p.tenantId === tenant.id && !p.isArchived),
    [products, tenant.id]
  );

  const toggleItemChecked = (orderId: string, itemIdx: number) => {
    const key = `${orderId}_${itemIdx}`;
    setCheckedItemsMap(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(`gs_kds_checked_${tenant.id}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tenantOrders.filter(o => {
      if (channelFilter !== 'all') {
        const f = o.fulfillment || 'restaurant_delivery';
        if (f !== channelFilter) return false;
      }
      if (q) {
        const matchId = o.id.toLowerCase().includes(q);
        const matchCustomer = (o.customerName || '').toLowerCase().includes(q);
        const matchTable = (o.tableNumber || '').toLowerCase().includes(q);
        const matchItem = o.items.some(i => i.name.toLowerCase().includes(q));
        return matchId || matchCustomer || matchTable || matchItem;
      }
      return true;
    });
  }, [tenantOrders, channelFilter, searchQuery]);

  // Columnas estilo Rappi Partners / Uber Eats Orders
  // 1. Nuevas / Por Aceptar (pending)
  const incomingOrders = useMemo(
    () => filteredOrders.filter(o => o.status === 'pending'),
    [filteredOrders]
  );

  // 2. En Cocina / Preparación (accepted + preparing)
  const kitchenOrders = useMemo(
    () => filteredOrders.filter(o => o.status === 'accepted' || o.status === 'preparing'),
    [filteredOrders]
  );

  // 3. Listos para Entrega / En Camino (ready + out_for_delivery)
  const readyAndDispatchOrders = useMemo(
    () => filteredOrders.filter(o => o.status === 'ready' || o.status === 'out_for_delivery'),
    [filteredOrders]
  );

  // Historial de completados / cancelados (más recientes primero)
  const completedOrders = useMemo(
    () =>
      filteredOrders
        .filter(o => o.status === 'delivered' || o.status === 'cancelled')
        .sort((a, b) => b.createdAt - a.createdAt),
    [filteredOrders]
  );

  // Resumen de Producción Agrupada (Batching de Cocina para saber cuántos platos iguales marchar)
  const batchProductionList = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        totalQty: number;
        pendingQty: number;
        orders: Array<{ orderId: string; qty: number; status: OrderStatus; tableOrChannel: string }>;
      }
    >();

    const activeForKitchen = [...incomingOrders, ...kitchenOrders];
    for (const o of activeForKitchen) {
      const channelLabel = getFulfillmentBadgeText(o.fulfillment, o.type);
      o.items.forEach((item, idx) => {
        const isDone = Boolean(checkedItemsMap[`${o.id}_${idx}`]);
        const entry = map.get(item.name) || {
          name: item.name,
          totalQty: 0,
          pendingQty: 0,
          orders: []
        };
        entry.totalQty += item.qty;
        if (!isDone) {
          entry.pendingQty += item.qty;
        }
        entry.orders.push({
          orderId: o.id,
          qty: item.qty,
          status: o.status,
          tableOrChannel: o.tableNumber ? `Mesa #${o.tableNumber}` : channelLabel
        });
        map.set(item.name, entry);
      });
    }

    return Array.from(map.values()).sort((a, b) => b.pendingQty - a.pendingQty);
  }, [incomingOrders, kitchenOrders, checkedItemsMap]);

  const handleTransition = async (order: Order, nextStatus: OrderStatus) => {
    setUpdatingOrderId(order.id);
    try {
      const ok = await updateOrderStatus(order.id, nextStatus);
      // Si el usuario es owner y hace clic en "Aceptar y Cocinar" desde pending, podemos avanzar a accepted
      if (ok && soundEnabled) {
        playKitchenChime();
      }
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleAcceptAndStartCooking = async (order: Order) => {
    setUpdatingOrderId(order.id);
    try {
      const step1 = await updateOrderStatus(order.id, 'accepted');
      if (step1) {
        await updateOrderStatus(order.id, 'preparing');
        if (soundEnabled) playKitchenChime();
      }
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleConfirmCash = async (paymentId: string | undefined, orderId: string) => {
    if (!paymentId) return;
    setConfirmingPaymentId(orderId);
    try {
      await confirmCashPayment(paymentId, orderId);
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  const getSlaInfo = (createdAt: number) => {
    const mins = Math.max(0, Math.floor((now - createdAt) / 60000));
    const timeLabel = mins === 0 ? 'Recién llegó' : `${mins} min`;
    if (mins < 12) {
      return {
        mins,
        timeLabel,
        level: 'ok' as const,
        bg: 'rgba(16, 185, 129, 0.14)',
        border: 'rgba(16, 185, 129, 0.35)',
        color: '#059669',
        label: 'A tiempo'
      };
    }
    if (mins < 22) {
      return {
        mins,
        timeLabel,
        level: 'warn' as const,
        bg: 'rgba(245, 158, 11, 0.16)',
        border: 'rgba(245, 158, 11, 0.45)',
        color: '#D97706',
        label: 'Prioridad'
      };
    }
    return {
      mins,
      timeLabel,
      level: 'late' as const,
      bg: 'rgba(239, 68, 68, 0.16)',
      border: 'rgba(239, 68, 68, 0.45)',
      color: '#DC2626',
      label: 'Demorado'
    };
  };

  const getChannelVisual = (order: Order) => {
    if (order.fulfillment === 'table_service' || order.tableNumber) {
      return {
        icon: <Utensils size={13} />,
        label: order.tableNumber ? `MESA #${order.tableNumber}` : 'SERVICIO EN MESA',
        bg: 'rgba(37, 99, 235, 0.12)',
        color: '#2563EB',
        border: 'rgba(37, 99, 235, 0.3)'
      };
    }
    if (order.fulfillment === 'pickup') {
      return {
        icon: <ShoppingBag size={13} />,
        label: 'PARA RECOGER',
        bg: 'rgba(124, 58, 237, 0.12)',
        color: '#7C3AED',
        border: 'rgba(124, 58, 237, 0.3)'
      };
    }
    return {
      icon: <Bike size={13} />,
      label: 'DOMICILIO',
      bg: 'rgba(255, 85, 51, 0.12)',
      color: '#EA580C',
      border: 'rgba(255, 85, 51, 0.3)'
    };
  };

  const renderOrderTicket = (order: Order, columnType: 'incoming' | 'kitchen' | 'ready') => {
    const sla = getSlaInfo(order.createdAt);
    const channel = getChannelVisual(order);
    const isBusy = updatingOrderId === order.id;
    const totalItemsCount = order.items.length;
    const checkedCount = order.items.reduce(
      (acc, _, idx) => acc + (checkedItemsMap[`${order.id}_${idx}`] ? 1 : 0),
      0
    );
    const progressPct = totalItemsCount > 0 ? Math.round((checkedCount / totalItemsCount) * 100) : 0;

    const accentColor =
      columnType === 'incoming'
        ? '#FF5533'
        : columnType === 'kitchen'
        ? '#F59E0B'
        : '#059669';

    const addressText =
      typeof order.deliveryAddress === 'string'
        ? order.deliveryAddress
        : order.deliveryAddress?.addressLine;

    const deliveryNotesText =
      typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.notes : undefined;

    const paymentId = (order as Order & { payments?: Array<{ id: string }> }).payments?.[0]?.id;

    return (
      <motion.div
        key={order.id}
        layout
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        style={{
          background: '#FFFFFF',
          border: `1.5px solid ${
            columnType === 'incoming'
              ? 'rgba(255, 85, 51, 0.45)'
              : sla.level === 'late'
              ? 'rgba(220, 38, 38, 0.45)'
              : 'rgba(226, 232, 240, 0.95)'
          }`,
          borderTop: `5px solid ${accentColor}`,
          borderRadius: '18px',
          padding: '14px 15px',
          boxShadow:
            columnType === 'incoming'
              ? '0 10px 25px rgba(255, 85, 51, 0.12)'
              : '0 6px 18px rgba(15, 23, 42, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {/* Cabecera de Comanda: #Orden + Canal + Semáforo SLA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '1.08rem',
                  fontWeight: 900,
                  color: '#0F172A',
                  letterSpacing: '-0.3px',
                  fontFamily: 'Outfit, sans-serif'
                }}
              >
                #{order.id.slice(0, 6).toUpperCase()}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  background: channel.bg,
                  color: channel.color,
                  border: `1px solid ${channel.border}`
                }}
              >
                {channel.icon} {channel.label}
              </span>
            </div>
            <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
              {new Date(order.createdAt).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit'
              })}{' '}
              · {order.customerName || 'Cliente'}
            </span>
          </div>

          {/* Semáforo SLA */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 9px',
              borderRadius: '10px',
              background: sla.bg,
              border: `1px solid ${sla.border}`,
              color: sla.color,
              fontSize: '0.73rem',
              fontWeight: 800,
              flexShrink: 0
            }}
            title={`SLA: ${sla.label}`}
          >
            <Clock size={12} />
            <span>{sla.timeLabel}</span>
          </div>
        </div>

        {/* Estado de Pago + Monto */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: '10px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            fontSize: '0.75rem'
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 700,
              color:
                order.paymentStatus === 'approved'
                  ? '#059669'
                  : order.paymentMethod === 'cash'
                  ? '#B45309'
                  : '#0284C7'
            }}
          >
            {order.paymentMethod === 'cash' ? <Banknote size={14} /> : <CreditCard size={14} />}
            {order.paymentMethod === 'cash'
              ? order.paymentStatus === 'approved'
                ? 'Efectivo Recibido'
                : 'Cobrar en Efectivo'
              : order.paymentStatus === 'approved'
              ? 'Pago Digital Aprobado'
              : 'Pago Digital'}
          </span>
          <strong style={{ fontSize: '0.88rem', fontWeight: 900, color: '#0F172A' }}>
            ${order.total.toLocaleString('es-CO')}
          </strong>
        </div>

        {/* Notas de Cocina / Instrucciones Especiales (Resaltadas estilo Uber Eats) */}
        {(order.restaurantNotes || deliveryNotesText) && (
          <div
            style={{
              background: '#FFFBEB',
              border: '1px solid #FCD34D',
              borderLeft: '4px solid #F59E0B',
              borderRadius: '10px',
              padding: '8px 10px',
              fontSize: '0.76rem',
              color: '#92400E',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '7px'
            }}
          >
            <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
            <div>
              {order.restaurantNotes && (
                <div>
                  <strong>Nota cocina:</strong> {order.restaurantNotes}
                </div>
              )}
              {deliveryNotesText && (
                <div>
                  <strong>Nota entrega:</strong> {deliveryNotesText}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Barra de Progreso de Preparación (en columna Cocina) */}
        {columnType === 'kitchen' && totalItemsCount > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700 }}>
              <span style={{ color: '#64748B' }}> Toca cada plato al emplatar:</span>
              <span style={{ color: progressPct === 100 ? '#059669' : '#D97706' }}>
                {checkedCount}/{totalItemsCount} listos ({progressPct}%)
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '999px', background: '#E2E8F0', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  borderRadius: '999px',
                  background: progressPct === 100 ? '#10B981' : '#F59E0B',
                  transition: 'width 0.2s ease'
                }}
              />
            </div>
          </div>
        )}

        {/* Lista Interactiva de Platos de la Comanda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {order.items.map((item, idx) => {
            const isChecked = Boolean(checkedItemsMap[`${order.id}_${idx}`]);
            return (
              <div
                key={`${order.id}_item_${idx}`}
                onClick={() => toggleItemChecked(order.id, idx)}
                title="Haz clic para marcar/desmarcar este plato como listo"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '11px',
                  background: isChecked ? '#ECFDF5' : '#F8FAFC',
                  border: isChecked ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span
                    style={{
                      minWidth: '28px',
                      height: '26px',
                      borderRadius: '8px',
                      background: isChecked ? '#10B981' : accentColor,
                      color: '#FFFFFF',
                      fontWeight: 900,
                      fontSize: '0.82rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 6px',
                      flexShrink: 0
                    }}
                  >
                    {isChecked ? <Check size={14} /> : `${item.qty}x`}
                  </span>
                  <span
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      color: isChecked ? '#047857' : '#0F172A',
                      textDecoration: isChecked ? 'line-through' : 'none'
                    }}
                  >
                    {item.name}
                  </span>
                </div>
                <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', flexShrink: 0 }}>
                  ${(item.price * item.qty).toLocaleString('es-CO')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Información de Dirección y Contacto (si es Domicilio o tiene teléfono) */}
        {(addressText || order.customerPhone) && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              background: '#F1F5F9',
              fontSize: '0.75rem',
              color: '#334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {addressText && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}>
                  <MapPin size={13} style={{ color: '#EA580C', flexShrink: 0 }} />
                  {addressText}
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${addressText}, ${tenantCityName}, Colombia`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#2563EB',
                    fontWeight: 800,
                    fontSize: '0.7rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    textDecoration: 'none',
                    flexShrink: 0
                  }}
                >
                  Mapa <ExternalLink size={11} />
                </a>
              </div>
            )}
            {order.customerPhone && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Phone size={12} style={{ color: '#059669' }} /> {order.customerPhone}
                </span>
                <a
                  href={`https://wa.me/57${order.customerPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#059669',
                    fontWeight: 800,
                    fontSize: '0.7rem',
                    textDecoration: 'none'
                  }}
                >
                  WhatsApp
                </a>
              </div>
            )}
          </div>
        )}

        {/* Acciones Principales de 1 Clic (Estilo Rappi Partners / Uber Eats) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '2px' }}>
          {columnType === 'incoming' && (
            <div style={{ display: 'flex', gap: '7px' }}>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleAcceptAndStartCooking(order)}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #FF5533 0%, #EA580C 100%)',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '0.84rem',
                  cursor: isBusy ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  boxShadow: '0 6px 15px rgba(255, 85, 51, 0.3)'
                }}
              >
                {isBusy ? <Loader2 size={16} className="spin" /> : <Flame size={16} />}
                Aceptar y Cocinar
              </button>

              {isOwner && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (window.confirm(`¿Cancelar el pedido #${order.id.slice(0, 6)}?`)) {
                      void handleTransition(order, 'cancelled');
                    }
                  }}
                  title="Rechazar o cancelar pedido"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid #FECACA',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: isBusy ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <XCircle size={16} />
                </button>
              )}
            </div>
          )}

          {columnType === 'kitchen' && (
            <div style={{ display: 'flex', gap: '7px' }}>
              {order.status === 'accepted' ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleTransition(order, 'preparing')}
                  style={{
                    flex: 1,
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                    color: '#FFFFFF',
                    fontWeight: 900,
                    fontSize: '0.84rem',
                    cursor: isBusy ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px'
                  }}
                >
                  {isBusy ? <Loader2 size={16} className="spin" /> : <ChefHat size={16} />}
                  Iniciar en Estufa
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleTransition(order, 'ready')}
                  style={{
                    flex: 1,
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFFFFF',
                    fontWeight: 900,
                    fontSize: '0.84rem',
                    cursor: isBusy ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    boxShadow: '0 6px 15px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  {isBusy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                  ¡Listo para Empacar / Servir!
                </button>
              )}
            </div>
          )}

          {columnType === 'ready' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {order.status === 'ready' && order.fulfillment === 'restaurant_delivery' && isOwner && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleTransition(order, 'out_for_delivery')}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(37, 99, 235, 0.3)',
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: '#1D4ED8',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: isBusy ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isBusy ? <Loader2 size={15} className="spin" /> : <Bike size={15} />}
                  Despachar con Domiciliario (En Camino)
                </button>
              )}

              {isOwner ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleTransition(order, 'delivered')}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: '#FFFFFF',
                    fontWeight: 900,
                    fontSize: '0.84rem',
                    cursor: isBusy ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    boxShadow: '0 6px 15px rgba(5, 150, 105, 0.28)'
                  }}
                >
                  {isBusy ? <Loader2 size={16} className="spin" /> : <PackageCheck size={16} />}
                  Confirmar Entrega y Liquidar
                </button>
              ) : (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    background: '#ECFDF5',
                    color: '#047857',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    textAlign: 'center'
                  }}
                >
                  ✓ Listo para despacho en mostrador / mesa
                </div>
              )}

              {order.paymentMethod === 'cash' && order.paymentStatus === 'pending' && paymentId && (
                <button
                  type="button"
                  disabled={confirmingPaymentId === order.id}
                  onClick={() => handleConfirmCash(paymentId, order.id)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #FCD34D',
                    background: '#FFFBEB',
                    color: '#B45309',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Banknote size={14} />
                  {confirmingPaymentId === order.id ? 'Confirmando...' : 'Confirmar Efectivo en Caja'}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── BARRA DE COMANDO OPERATIVO KDS (ESTILO UBER EATS / RAPPI ALIADOS) ── */}
      <div className="rpa-card">
        <div className="rpa-card-header" style={{ paddingBottom: '1rem' }}>
          <div className="rpa-card-header-left">
            <div className="rpa-card-icon">
              <ChefHat size={22} />
            </div>
            <div>
              <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
                KDS EN TIEMPO REAL · {tenant.name.toUpperCase()}
              </span>
              <h3 className="rpa-card-title">Centro Visual de Comandas y Despacho</h3>
              <p className="rpa-card-subtitle">
                Flujo de cocina estilo RappiAliados / Uber Eats: acepta, marca platos listos y despacha con 1 clic.
              </p>
            </div>
          </div>

          <div className="kds-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Buscador rápido */}
            <div className="pam-input-wrap kds-search-wrap" style={{ minWidth: '210px', flex: '1 1 210px' }}>
              <Search size={14} className="pam-icon" />
              <input
                type="text"
                className="pam-input"
                placeholder="Buscar #orden, cliente o plato..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingTop: '7px', paddingBottom: '7px', fontSize: '0.8rem' }}
              />
            </div>

            {/* Toggle Sonido */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="pam-btn-ghost"
              style={{ padding: '8px 12px', fontSize: '0.78rem', minWidth: 'auto' }}
              title={soundEnabled ? 'Alertas sonoras activadas' : 'Alertas sonoras silenciadas'}
            >
              {soundEnabled ? <Volume2 size={15} style={{ color: '#059669' }} /> : <VolumeX size={15} />}
              {soundEnabled ? 'Sonido ON' : 'Silencio'}
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={triggerTestOrder}
                className="pam-btn-ghost"
                style={{ padding: '8px 12px', fontSize: '0.78rem', minWidth: 'auto' }}
                title="Generar comanda de prueba"
              >
                <PlusCircle size={15} style={{ color: 'var(--primary)' }} /> Simular Comanda
              </button>
            )}
          </div>
        </div>

        {/* Filtros por Canal y Selector de Modo de Vista */}
        <div
          className="kds-toolbar-row"
          style={{
            padding: '0 1.5rem 1.15rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--neutral-border)'
          }}
        >
          {/* Filtros de Canal */}
          <div className="kds-scroll-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: 'Todos los Canales' },
                { id: 'restaurant_delivery', label: '🛵 Domicilio' },
                { id: 'table_service', label: '🪑 Mesa QR' },
                { id: 'pickup', label: '🛍️ Para Recoger' }
              ] as const
            ).map(ch => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setChannelFilter(ch.id)}
                className={channelFilter === ch.id ? 'pam-btn-primary' : 'pam-btn-ghost'}
                style={{ padding: '6px 13px', fontSize: '0.78rem', minWidth: 'auto', borderRadius: '999px', whiteSpace: 'nowrap' }}
              >
                {ch.label}
              </button>
            ))}
          </div>

          {/* Selector de Vista: Kanban / Batching de Platos / Historial */}
          <div className="kds-scroll-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={viewMode === 'kanban' ? 'pam-btn-primary' : 'pam-btn-ghost'}
              style={{ padding: '7px 13px', fontSize: '0.78rem', minWidth: 'auto', whiteSpace: 'nowrap' }}
            >
              <LayoutGrid size={14} /> Tablero Kanban ({incomingOrders.length + kitchenOrders.length + readyAndDispatchOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('batch')}
              className={viewMode === 'batch' ? 'pam-btn-primary' : 'pam-btn-ghost'}
              style={{ padding: '7px 13px', fontSize: '0.78rem', minWidth: 'auto', whiteSpace: 'nowrap' }}
            >
              <Layers size={14} /> Producción por Plato ({batchProductionList.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('history')}
              className={viewMode === 'history' ? 'pam-btn-primary' : 'pam-btn-ghost'}
              style={{ padding: '7px 13px', fontSize: '0.78rem', minWidth: 'auto', whiteSpace: 'nowrap' }}
            >
              <History size={14} /> Cerradas ({completedOrders.length})
            </button>
          </div>
        </div>

        {/* ── CONTENIDO PRINCIPAL DEL KDS ── */}
        <div className="rpa-card-body">
          {viewMode === 'kanban' && (
            <>
              {/* Selector rápido de columna para móviles y tablets en orientación vertical */}
              <div className="kds-stage-tabs">
                <button
                  type="button"
                  onClick={() => setKdsStageFilter('all')}
                  className={`kds-stage-tab ${kdsStageFilter === 'all' ? 'active' : ''}`}
                >
                  📋 Todas ({incomingOrders.length + kitchenOrders.length + readyAndDispatchOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setKdsStageFilter('incoming')}
                  className={`kds-stage-tab incoming ${kdsStageFilter === 'incoming' ? 'active' : ''}`}
                >
                  🔥 1. Nuevas ({incomingOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setKdsStageFilter('kitchen')}
                  className={`kds-stage-tab kitchen ${kdsStageFilter === 'kitchen' ? 'active' : ''}`}
                >
                  🍳 2. Cocina ({kitchenOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setKdsStageFilter('ready')}
                  className={`kds-stage-tab ready ${kdsStageFilter === 'ready' ? 'active' : ''}`}
                >
                  🛵 3. Listos ({readyAndDispatchOrders.length})
                </button>
              </div>

              <div
                className="kds-kanban-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    kdsStageFilter !== 'all'
                      ? '1fr'
                      : showMenuSidebar
                      ? 'repeat(auto-fit, minmax(265px, 1fr))'
                      : 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '16px',
                  alignItems: 'start'
                }}
              >
                {/* COLUMNA 1: NUEVAS / POR ACEPTAR */}
                {(kdsStageFilter === 'all' || kdsStageFilter === 'incoming') && (
                  <div
                    className="kds-kanban-col"
                    style={{
                      background: '#FFF7F5',
                      border: '1px solid rgba(255, 85, 51, 0.25)',
                      borderRadius: '20px',
                      padding: '14px',
                      minHeight: incomingOrders.length === 0 ? '200px' : '360px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#FF5533',
                            boxShadow: incomingOrders.length > 0 ? '0 0 10px #FF5533' : 'none'
                          }}
                        />
                        <strong style={{ fontSize: '0.88rem', fontWeight: 900, color: '#9A3412', letterSpacing: '0.3px' }}>
                          1. NUEVAS COMANDAS
                        </strong>
                      </div>
                      <span
                        style={{
                          background: '#FF5533',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '0.78rem',
                          padding: '2px 10px',
                          borderRadius: '999px'
                        }}
                      >
                        {incomingOrders.length}
                      </span>
                    </div>

                    {incomingOrders.length === 0 ? (
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          padding: '1.75rem 1rem',
                          color: '#9A3412',
                          opacity: 0.65
                        }}
                      >
                        <Flame size={28} style={{ marginBottom: '6px' }} />
                        <strong style={{ fontSize: '0.85rem' }}>Sin comandas nuevas</strong>
                        <span style={{ fontSize: '0.75rem' }}>Las nuevas órdenes aparecerán aquí al instante.</span>
                      </div>
                    ) : (
                      <AnimatePresence>
                        {incomingOrders.map(order => renderOrderTicket(order, 'incoming'))}
                      </AnimatePresence>
                    )}
                  </div>
                )}

                {/* COLUMNA 2: EN COCINA / PREPARACIÓN */}
                {(kdsStageFilter === 'all' || kdsStageFilter === 'kitchen') && (
                  <div
                    className="kds-kanban-col"
                    style={{
                      background: '#FFFBEB',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '20px',
                      padding: '14px',
                      minHeight: kitchenOrders.length === 0 ? '200px' : '360px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#F59E0B'
                          }}
                        />
                        <strong style={{ fontSize: '0.88rem', fontWeight: 900, color: '#92400E', letterSpacing: '0.3px' }}>
                          2. EN PREPARACIÓN (COCINA)
                        </strong>
                      </div>
                      <span
                        style={{
                          background: '#F59E0B',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '0.78rem',
                          padding: '2px 10px',
                          borderRadius: '999px'
                        }}
                      >
                        {kitchenOrders.length}
                      </span>
                    </div>

                    {kitchenOrders.length === 0 ? (
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          padding: '1.75rem 1rem',
                          color: '#92400E',
                          opacity: 0.65
                        }}
                      >
                        <ChefHat size={28} style={{ marginBottom: '6px' }} />
                        <strong style={{ fontSize: '0.85rem' }}>Estufa despejada</strong>
                        <span style={{ fontSize: '0.75rem' }}>Acepta una comanda entrante para iniciar su cocción.</span>
                      </div>
                    ) : (
                      <AnimatePresence>
                        {kitchenOrders.map(order => renderOrderTicket(order, 'kitchen'))}
                      </AnimatePresence>
                    )}
                  </div>
                )}

                {/* COLUMNA 3: LISTOS Y EN ENTREGA */}
                {(kdsStageFilter === 'all' || kdsStageFilter === 'ready') && (
                  <div
                    className="kds-kanban-col"
                    style={{
                      background: '#ECFDF5',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '20px',
                      padding: '14px',
                      minHeight: readyAndDispatchOrders.length === 0 ? '200px' : '360px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#10B981'
                          }}
                        />
                        <strong style={{ fontSize: '0.88rem', fontWeight: 900, color: '#065F46', letterSpacing: '0.3px' }}>
                          3. LISTOS / EN RUTA
                        </strong>
                      </div>
                      <span
                        style={{
                          background: '#10B981',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '0.78rem',
                          padding: '2px 10px',
                          borderRadius: '999px'
                        }}
                      >
                        {readyAndDispatchOrders.length}
                      </span>
                    </div>

                    {readyAndDispatchOrders.length === 0 ? (
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          padding: '1.75rem 1rem',
                          color: '#065F46',
                          opacity: 0.65
                        }}
                      >
                        <PackageCheck size={28} style={{ marginBottom: '6px' }} />
                        <strong style={{ fontSize: '0.85rem' }}>Sin pedidos por retirar</strong>
                        <span style={{ fontSize: '0.75rem' }}>Los platos terminados pasan aquí para entrega o ruta.</span>
                      </div>
                    ) : (
                      <AnimatePresence>
                        {readyAndDispatchOrders.map(order => renderOrderTicket(order, 'ready'))}
                      </AnimatePresence>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── VISTA 2: PRODUCCIÓN AGRUPADA POR PLATO (BATCHING DE COCINA) ── */}
          {viewMode === 'batch' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="pam-callout" style={{ marginBottom: '4px' }}>
                <Layers size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div>
                  <strong>Consolidado de Producción en Vivo (Batching)</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Muestra la suma total de cada plato solicitado en las comandas activas para que la cocina pueda preparar lotes simultáneos.
                  </div>
                </div>
              </div>

              {batchProductionList.length === 0 ? (
                <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem' }}>
                  <CheckCircle2 size={36} style={{ color: '#059669' }} />
                  <h4 style={{ margin: '6px 0 2px', color: 'var(--text-main)' }}>No hay platos pendientes por marchar</h4>
                  <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                    Todos los platos de las órdenes activas están completados.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                  {batchProductionList.map(batch => (
                    <div
                      key={batch.name}
                      className="pam-section"
                      style={{
                        padding: '14px 16px',
                        gap: '8px',
                        borderLeft: `5px solid ${batch.pendingQty > 0 ? '#FF5533' : '#10B981'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '0.96rem', color: 'var(--text-main)', fontWeight: 900 }}>
                          {batch.name}
                        </strong>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: batch.pendingQty > 0 ? '#FF5533' : '#10B981',
                            color: '#FFFFFF',
                            fontWeight: 900,
                            fontSize: '0.82rem'
                          }}
                        >
                          {batch.pendingQty} por salir
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {batch.orders.map((o, idx) => (
                          <span
                            key={`${o.orderId}_${idx}`}
                            className="rpa-badge neutral"
                            style={{ fontSize: '0.73rem' }}
                          >
                            <strong>{o.qty}x</strong> en #{o.orderId.slice(0, 5).toUpperCase()} ({o.tableOrChannel})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── VISTA 3: HISTORIAL DE COMANDAS ENTREGADAS / CANCELADAS ── */}
          {viewMode === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {completedOrders.length === 0 ? (
                <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem' }}>
                  <History size={34} style={{ color: 'var(--text-muted)' }} />
                  <h4 style={{ margin: '6px 0 2px', color: 'var(--text-main)' }}>Sin comandas en el historial</h4>
                </div>
              ) : (
                completedOrders.map(order => (
                  <div
                    key={order.id}
                    className="rpa-item-card"
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                          #{order.id.slice(0, 8).toUpperCase()}
                        </strong>
                        <span className="rpa-badge neutral">
                          {getFulfillmentBadgeText(order.fulfillment, order.type)}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {order.customerName || 'Cliente'} ·{' '}
                          {new Date(order.createdAt).toLocaleString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: 900 }}>
                        ${order.total.toLocaleString('es-CO')} COP
                      </strong>
                      <span className={`rpa-badge ${order.status === 'delivered' ? 'success' : 'danger'}`}>
                        {order.status === 'delivered' ? '✓ ENTREGADO' : '✗ CANCELADO'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Control Rápido de Disponibilidad de Platos (cuando se usa desde KitchenPanel) */}
      {showMenuSidebar && tenantProducts.length > 0 && (
        <div className="rpa-card">
          <div className="rpa-card-header">
            <div className="rpa-card-header-left">
              <div className="rpa-card-icon">
                <Utensils size={20} />
              </div>
              <div>
                <h3 className="rpa-card-title">Disponibilidad Rápida de Platos en Cocina</h3>
                <p className="rpa-card-subtitle">
                  Activa o agota temporalmente cualquier plato si se termina un insumo durante el servicio.
                </p>
              </div>
            </div>
          </div>
          <div className="rpa-card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
              {tenantProducts.map(product => (
                <div
                  key={product.id}
                  className="rpa-item-card"
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block' }}>
                      {product.name}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ${product.price.toLocaleString('es-CO')} · {product.category}
                    </span>
                  </div>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => toggleProductAvailability(product.id)}
                      className={product.available ? 'rpa-badge success' : 'rpa-badge danger'}
                      style={{ cursor: 'pointer', border: 'none', padding: '6px 12px' }}
                    >
                      {product.available ? '● Disponible' : '○ Agotado'}
                    </button>
                  ) : (
                    <span className={product.available ? 'rpa-badge success' : 'rpa-badge danger'}>
                      {product.available ? '● Disponible' : '○ Agotado'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
