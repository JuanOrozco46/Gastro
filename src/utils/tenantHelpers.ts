import type { UserAccount, Tenant, OrderStatus, OrderFulfillment } from '../types';

export const getOperationalTenant = (currentUser: UserAccount | null, tenants: Tenant[]): Tenant | null => {
  if (!currentUser || !currentUser.tenantId) return null;
  return tenants.find(t => t.id === currentUser.tenantId) || null;
};

export const getFulfillmentBadgeText = (fulfillment?: OrderFulfillment, typeStr: string = ''): string => {
  if (fulfillment === 'pickup') return '🛍️ Recogida en local';
  if (fulfillment === 'restaurant_delivery') return '🛵 Entrega del restaurante';
  if (fulfillment === 'table_service') return '🍽️ Servicio en mesa';
  if (typeStr.toLowerCase().includes('mesa')) return `🍽️ ${typeStr}`;
  if (typeStr.toLowerCase().includes('domicilio')) return '🛵 Entrega del restaurante';
  if (typeStr.toLowerCase().includes('recoger') || typeStr.toLowerCase().includes('pickup')) return '🛍️ Recogida en local';
  return typeStr;
};

export interface StatusTransition {
  status: OrderStatus;
  label: string;
  variant: 'primary' | 'secondary' | 'outline' | 'danger';
}

export const getValidOrderTransitions = (
  currentStatus: OrderStatus,
  fulfillment?: OrderFulfillment,
  typeStr: string = '',
  isKitchen: boolean = false
): StatusTransition[] => {
  const isDelivery = fulfillment === 'restaurant_delivery' || (!fulfillment && typeStr.toLowerCase().includes('domicilio'));

  if (currentStatus === 'pending') {
    const list: StatusTransition[] = [
      { status: 'accepted', label: 'Aceptar Pedido', variant: 'primary' }
    ];
    if (!isKitchen) {
      list.push({ status: 'cancelled', label: 'Cancelar Pedido', variant: 'danger' });
    }
    return list;
  }

  if (currentStatus === 'accepted') {
    const list: StatusTransition[] = [
      { status: 'preparing', label: 'Empezar Preparación', variant: 'secondary' }
    ];
    if (!isKitchen) {
      list.push({ status: 'cancelled', label: 'Cancelar Pedido', variant: 'danger' });
    }
    return list;
  }

  if (currentStatus === 'preparing') {
    return [
      { status: 'ready', label: 'Marcar Listo', variant: 'primary' }
    ];
  }

  if (currentStatus === 'ready') {
    if (isKitchen) {
      return [];
    }
    if (isDelivery) {
      return [
        { status: 'out_for_delivery', label: 'Despachar (En Camino)', variant: 'primary' }
      ];
    } else {
      return [
        { status: 'delivered', label: 'Marcar Entregado', variant: 'secondary' }
      ];
    }
  }

  if (currentStatus === 'out_for_delivery') {
    if (isKitchen) return [];
    return [
      { status: 'delivered', label: 'Marcar Entregado', variant: 'secondary' }
    ];
  }

  return [];
};
