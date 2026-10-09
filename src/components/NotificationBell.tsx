import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bell,
  CheckCheck,
  Clock,
  Flame,
  ChefHat,
  Bike,
  CheckCircle2,
  DollarSign,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  XCircle,
  ChevronRight,
  X
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { getOperationalTenant } from '../utils/tenantHelpers';
import {
  fetchMySupportNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../services/supportService';
import type { SupportNotification } from '../services/supportService';

export type NotificationDestination = 'orders' | 'reviews' | 'analytics' | 'support' | 'directory';

interface Props {
  onOpenTicket: (ticketId: string) => void;
  onNavigate?: (destination: NotificationDestination) => void;
  variant?: 'light' | 'dark';
}

interface UnifiedNotification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  isRead: boolean;
  category: 'order' | 'finance' | 'support';
  tone: 'urgent' | 'warning' | 'success' | 'info' | 'danger';
  ticketId?: string | null;
  destination?: NotificationDestination;
  isRemoteSupport?: boolean;
  remoteId?: string;
}

const getReadSetKey = (userId?: string) => `gastrosync_notif_read_v1_${userId || 'guest'}`;

export const NotificationBell: React.FC<Props> = ({
  onOpenTicket,
  onNavigate,
  variant = 'light'
}) => {
  const { currentUser, userRole, orders, tenants } = useApp();
  const [supportNotifications, setSupportNotifications] = useState<SupportNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'orders'>('all');
  const [now, setNow] = useState(() => Date.now());
  const [sessionReadIds, setSessionReadIds] = useState<Record<string, boolean>>({});

  const menuRef = useRef<HTMLDivElement>(null);

  const readLocalIds = useMemo<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(getReadSetKey(currentUser?.id));
      const stored = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      return { ...stored, ...sessionReadIds };
    } catch {
      return sessionReadIds;
    }
  }, [currentUser, sessionReadIds]);

  const saveReadLocalIds = (next: Record<string, boolean>) => {
    setSessionReadIds(next);
    try {
      localStorage.setItem(getReadSetKey(currentUser?.id), JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  };

  useEffect(() => {
    let isMounted = true;
    const poll = () => {
      setNow(Date.now());
      if (!currentUser) {
        if (isMounted) {
          setSupportNotifications([]);
          setLoading(false);
        }
        return;
      }
      fetchMySupportNotifications()
        .then(({ data }) => {
          if (isMounted) {
            setSupportNotifications(data || []);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
    };

    poll();
    const interval = setInterval(poll, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const operatingTenant = useMemo(
    () => getOperationalTenant(currentUser, tenants),
    [currentUser, tenants]
  );

  const isRestaurantContext =
    variant === 'dark' || userRole === 'admin' || userRole === 'kitchen';

  const unifiedNotifications = useMemo<UnifiedNotification[]>(() => {
    const list: UnifiedNotification[] = [];

    // 1. Support notifications from Supabase
    for (const n of supportNotifications) {
      const ts = n.created_at ? new Date(n.created_at).getTime() : now;
      list.push({
        id: `support-${n.id}`,
        remoteId: n.id,
        isRemoteSupport: true,
        title: n.title || 'Actualización de Soporte',
        body: n.body || 'Tienes un nuevo mensaje en tu ticket de soporte.',
        timestamp: Number.isNaN(ts) ? now : ts,
        isRead: Boolean(n.is_read) || Boolean(readLocalIds[`support-${n.id}`]),
        category: 'support',
        tone: 'info',
        ticketId: n.ticket_id,
        destination: 'support'
      });
    }

    // 2. Live Order & Financial Notifications
    if (isRestaurantContext && operatingTenant) {
      const tenantOrders = orders
        .filter(o => o.tenantId === operatingTenant.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20);

      for (const order of tenantOrders) {
        const itemsCount = order.items.reduce((acc, item) => acc + item.qty, 0);
        const totalFmt = `$${order.total.toLocaleString('es-CO')} COP`;
        const netFmt = `$${Math.round(order.total * 0.97).toLocaleString('es-CO')} COP`;

        if (order.status === 'pending') {
          const id = `rest-order-${order.id}-pending`;
          list.push({
            id,
            title: `🔥 ¡Nueva Comanda #${order.id}!`,
            body: `${itemsCount} ${itemsCount === 1 ? 'plato' : 'platos'} (${totalFmt})${order.customerName ? ` · Cliente: ${order.customerName}` : ''}. ¡Acepta la orden en el KDS!`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'urgent',
            destination: 'orders'
          });
        } else if (order.status === 'accepted' || order.status === 'preparing') {
          const id = `rest-order-${order.id}-${order.status}`;
          list.push({
            id,
            title: `👨‍🍳 Orden #${order.id} en Cocina`,
            body: `${order.status === 'accepted' ? 'Aceptada y lista para iniciar cocción' : 'En preparación en estufa'} · ${itemsCount} platos (${totalFmt}).`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'warning',
            destination: 'orders'
          });
        } else if (order.status === 'ready' || order.status === 'out_for_delivery') {
          const id = `rest-order-${order.id}-${order.status}`;
          list.push({
            id,
            title: `🛵 Orden #${order.id} ${order.status === 'ready' ? 'Lista para Empacar' : 'En Ruta'}`,
            body: `${order.status === 'ready' ? 'Platos listos en barra para entregar al repartidor o mesa' : 'El domiciliario va en camino al cliente'} (${totalFmt}).`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'info',
            destination: 'orders'
          });
        } else if (order.status === 'delivered') {
          const id = `rest-order-${order.id}-delivered`;
          list.push({
            id,
            title: `💰 Venta Liquidada #${order.id}`,
            body: `Pedido completado con éxito. Neto acreditado en Finanzas: ${netFmt} (97%).`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'finance',
            tone: 'success',
            destination: 'analytics'
          });
        } else if (order.status === 'cancelled') {
          const id = `rest-order-${order.id}-cancelled`;
          list.push({
            id,
            title: `❌ Orden #${order.id} Cancelada`,
            body: `Esta comanda por ${totalFmt} fue cancelada y excluida de la liquidación.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'danger',
            destination: 'orders'
          });
        }
      }
    } else if (currentUser) {
      // Customer notifications strictly isolated to currentUser.id
      const myOrders = orders
        .filter(o => o.customerId === currentUser.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 15);

      for (const order of myOrders) {
        const tenant = tenants.find(t => t.id === order.tenantId);
        const tenantName = tenant?.name || 'el restaurante';
        const totalFmt = `$${order.total.toLocaleString('es-CO')} COP`;
        const id = `cust-order-${order.id}-${order.status}`;

        if (order.status === 'pending') {
          list.push({
            id,
            title: `🕒 Pedido #${order.id} enviado a ${tenantName}`,
            body: `Tu orden por ${totalFmt} fue recibida y espera confirmación de cocina.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'warning',
            destination: 'orders'
          });
        } else if (order.status === 'accepted') {
          list.push({
            id,
            title: `✅ ¡${tenantName} aceptó tu pedido #${order.id}!`,
            body: `El restaurante confirmó tu orden y está alistando los ingredientes.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'info',
            destination: 'orders'
          });
        } else if (order.status === 'preparing') {
          list.push({
            id,
            title: `👨‍🍳 Tu pedido #${order.id} está en el fuego`,
            body: `${tenantName} está cocinando tus platos en este momento.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'urgent',
            destination: 'orders'
          });
        } else if (order.status === 'ready') {
          list.push({
            id,
            title: `🛍️ ¡Tu pedido #${order.id} está listo!`,
            body: `${tenantName} terminó de preparar tu orden y está lista para entrega.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'success',
            destination: 'orders'
          });
        } else if (order.status === 'out_for_delivery') {
          list.push({
            id,
            title: `🛵 ¡Tu pedido #${order.id} va en camino!`,
            body: `El repartidor de ${tenantName} salió hacia tu dirección de entrega.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'info',
            destination: 'orders'
          });
        } else if (order.status === 'delivered') {
          list.push({
            id,
            title: `🎉 Pedido #${order.id} entregado · ¡Califícalo!`,
            body: `¿Qué tal estuvo tu experiencia con ${tenantName}? Deja tus estrellas y reseña.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'success',
            destination: 'orders'
          });
        } else if (order.status === 'cancelled') {
          list.push({
            id,
            title: `❌ Pedido #${order.id} cancelado`,
            body: `Tu orden en ${tenantName} fue cancelada.`,
            timestamp: order.createdAt,
            isRead: Boolean(readLocalIds[id]),
            category: 'order',
            tone: 'danger',
            destination: 'orders'
          });
        }
      }
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [supportNotifications, isRestaurantContext, operatingTenant, orders, currentUser, tenants, readLocalIds, now]);

  const unreadCount = useMemo(
    () => unifiedNotifications.filter(n => !n.isRead).length,
    [unifiedNotifications]
  );

  const urgentCount = useMemo(
    () => unifiedNotifications.filter(n => !n.isRead && n.tone === 'urgent').length,
    [unifiedNotifications]
  );

  const filteredNotifications = useMemo(() => {
    if (filterTab === 'unread') return unifiedNotifications.filter(n => !n.isRead);
    if (filterTab === 'orders') return unifiedNotifications.filter(n => n.category !== 'support');
    return unifiedNotifications;
  }, [unifiedNotifications, filterTab]);

  const handleNotificationClick = async (notif: UnifiedNotification) => {
    // Mark as read locally
    const nextRead = { ...readLocalIds, [notif.id]: true };
    saveReadLocalIds(nextRead);

    // If remote support notification, also mark in DB
    if (notif.isRemoteSupport && notif.remoteId) {
      await markNotificationAsRead(notif.remoteId);
      setSupportNotifications(prev =>
        prev.map(item => (item.id === notif.remoteId ? { ...item, is_read: true } : item))
      );
    }

    setIsOpen(false);

    if (notif.ticketId) {
      onOpenTicket(notif.ticketId);
      return;
    }

    if (notif.destination && onNavigate) {
      onNavigate(notif.destination);
    }
  };

  const handleMarkAllRead = async () => {
    const nextRead = { ...readLocalIds };
    for (const n of unifiedNotifications) {
      nextRead[n.id] = true;
    }
    saveReadLocalIds(nextRead);

    if (supportNotifications.some(n => !n.is_read)) {
      await markAllNotificationsAsRead();
      setSupportNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const formatRelativeTime = (ts: number) => {
    const diffMins = Math.max(0, Math.floor((now - ts) / 60000));
    if (diffMins < 1) return 'Ahora mismo';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days}d`;
    return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  };

  const renderToneIcon = (notif: UnifiedNotification) => {
    if (notif.category === 'support') {
      return {
        bg: '#EEF2FF',
        border: '#C7D2FE',
        color: '#4F46E5',
        icon: <MessageSquare size={16} />
      };
    }
    if (notif.category === 'finance') {
      return {
        bg: '#ECFDF5',
        border: '#A7F3D0',
        color: '#059669',
        icon: <DollarSign size={16} />
      };
    }
    switch (notif.tone) {
      case 'urgent':
        return {
          bg: '#FEF2F2',
          border: '#FECACA',
          color: '#DC2626',
          icon: <Flame size={16} />
        };
      case 'warning':
        return {
          bg: '#FFFBEB',
          border: '#FDE68A',
          color: '#D97706',
          icon: <ChefHat size={16} />
        };
      case 'success':
        return {
          bg: '#ECFDF5',
          border: '#A7F3D0',
          color: '#059669',
          icon: <CheckCircle2 size={16} />
        };
      case 'danger':
        return {
          bg: '#FEF2F2',
          border: '#FECACA',
          color: '#DC2626',
          icon: <XCircle size={16} />
        };
      default:
        return {
          bg: '#EFF6FF',
          border: '#BFDBFE',
          color: '#2563EB',
          icon: <Bike size={16} />
        };
    }
  };

  const isDarkBtn = variant === 'dark';

  return (
    <div
      ref={menuRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center'
      }}
    >
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Centro de notificaciones"
        title="Centro de notificaciones"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '7px',
          height: '40px',
          padding: unreadCount > 0 ? '0 13px 0 11px' : '0 11px',
          borderRadius: '999px',
          border: isDarkBtn
            ? isOpen
              ? '1.5px solid #F0A483'
              : '1px solid rgba(255, 255, 255, 0.24)'
            : isOpen
            ? '1.5px solid #D95B26'
            : unreadCount > 0
            ? '1px solid rgba(217, 91, 38, 0.35)'
            : '1px solid rgba(24, 20, 17, 0.12)',
          background: isDarkBtn
            ? isOpen
              ? 'rgba(255, 255, 255, 0.2)'
              : 'rgba(255, 255, 255, 0.1)'
            : isOpen
            ? '#FFF5EE'
            : unreadCount > 0
            ? '#FFF8F4'
            : '#FFFFFF',
          color: isDarkBtn ? '#FFFFFF' : '#181411',
          cursor: 'pointer',
          boxShadow: isOpen
            ? '0 6px 18px rgba(217, 91, 38, 0.22)'
            : '0 2px 6px rgba(15, 23, 42, 0.06)',
          transition: 'all 0.18s ease'
        }}
      >
        <Bell
          size={17}
          style={{
            color: urgentCount > 0 ? (isDarkBtn ? '#FCA5A5' : '#DC2626') : isDarkBtn ? '#FFFFFF' : '#D95B26',
            flexShrink: 0
          }}
        />
        {unreadCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '20px',
              height: '20px',
              padding: '0 6px',
              borderRadius: '999px',
              background: urgentCount > 0 ? '#DC2626' : '#D95B26',
              color: '#FFFFFF',
              fontSize: '0.72rem',
              fontWeight: 900,
              lineHeight: 1,
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.35)'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 'min(395px, calc(100vw - 24px))',
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid rgba(24, 20, 17, 0.12)',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25), 0 4px 16px rgba(15, 23, 42, 0.08)',
            zIndex: 9999,
            overflow: 'hidden',
            color: '#0F172A',
            textAlign: 'left'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px 12px',
              background: 'linear-gradient(135deg, #181411 0%, #29221D 100%)',
              color: '#FFFFFF',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '9px',
                  background: 'rgba(240, 164, 131, 0.18)',
                  border: '1px solid rgba(240, 164, 131, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#F0A483'
                }}
              >
                <Bell size={15} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 900, color: '#FFFFFF' }}>
                    Notificaciones
                  </h3>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        background: '#D95B26',
                        color: '#FFFFFF',
                        fontSize: '0.66rem',
                        fontWeight: 900,
                        padding: '2px 7px',
                        borderRadius: '999px'
                      }}
                    >
                      {unreadCount} nuevas
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.68)', display: 'block' }}>
                  {isRestaurantContext && operatingTenant
                    ? `Alertas en vivo de ${operatingTenant.name}`
                    : 'Estado de tus pedidos y soporte en vivo'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 9px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.1)',
                    color: '#FFFFFF',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Marcar todas como leídas"
                >
                  <CheckCheck size={13} /> Leer todo
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.75)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                aria-label="Cerrar notificaciones"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              padding: '8px 14px',
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0'
            }}
          >
            {(
              [
                { id: 'all', label: `Todas (${unifiedNotifications.length})` },
                { id: 'unread', label: `No leídas (${unreadCount})` },
                { id: 'orders', label: isRestaurantContext ? 'Comandas y Caja' : 'Mis Pedidos' }
              ] as const
            ).map(tab => {
              const active = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '999px',
                    border: active ? '1px solid #D95B26' : '1px solid #CBD5E1',
                    background: active ? '#FFF5EE' : '#FFFFFF',
                    color: active ? '#D95B26' : '#475569',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Notification List */}
          <div
            style={{
              maxHeight: '360px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {loading && unifiedNotifications.length === 0 ? (
              <div style={{ padding: '2.2rem 1.2rem', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                Sincronizando notificaciones...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div
                style={{
                  padding: '2.4rem 1.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: '#F1F5F9',
                    color: '#94A3B8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <strong style={{ fontSize: '0.88rem', color: '#1E293B' }}>
                  {filterTab === 'unread' ? '¡Estás al día!' : 'Sin notificaciones por ahora'}
                </strong>
                <span style={{ fontSize: '0.76rem', color: '#64748B', maxWidth: '250px', lineHeight: 1.4 }}>
                  {isRestaurantContext
                    ? 'Cuando entren nuevas comandas, pagos o tickets de soporte aparecerán aquí al instante.'
                    : 'Aquí verás el avance en vivo de tus pedidos en cocina, entregas y respuestas de soporte.'}
                </span>
              </div>
            ) : (
              filteredNotifications.map(notif => {
                const visual = renderToneIcon(notif);
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => handleNotificationClick(notif)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '11px',
                      width: '100%',
                      padding: '12px 15px',
                      border: 'none',
                      borderBottom: '1px solid #F1F5F9',
                      background: !notif.isRead ? '#FFFBF7' : '#FFFFFF',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '10px',
                        background: visual.bg,
                        border: `1px solid ${visual.border}`,
                        color: visual.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}
                    >
                      {visual.icon}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '6px',
                          marginBottom: '3px'
                        }}
                      >
                        <strong
                          style={{
                            fontSize: '0.82rem',
                            fontWeight: !notif.isRead ? 900 : 700,
                            color: '#0F172A',
                            lineHeight: 1.25
                          }}
                        >
                          {notif.title}
                        </strong>
                        {!notif.isRead && (
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: notif.tone === 'urgent' ? '#DC2626' : '#D95B26',
                              flexShrink: 0,
                              marginTop: '4px'
                            }}
                          />
                        )}
                      </div>

                      <p
                        style={{
                          margin: '0 0 6px',
                          fontSize: '0.76rem',
                          color: '#475569',
                          lineHeight: 1.38
                        }}
                      >
                        {notif.body}
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.68rem',
                          color: '#94A3B8',
                          fontWeight: 600
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} /> {formatRelativeTime(notif.timestamp)}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            color: '#D95B26',
                            fontWeight: 800
                          }}
                        >
                          Ver detalle <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Quick Links */}
          {onNavigate && (
            <div
              style={{
                padding: '9px 14px',
                background: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onNavigate('orders');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: 'none',
                  background: 'transparent',
                  color: '#D95B26',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '4px 6px'
                }}
              >
                <ShoppingBag size={13} />
                {isRestaurantContext ? 'Ir al Tablero KDS' : 'Ver Mis Pedidos'}
              </button>

              {isRestaurantContext && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onNavigate('analytics');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: '#059669',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    padding: '4px 6px'
                  }}
                >
                  <DollarSign size={13} /> Ver Finanzas
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
