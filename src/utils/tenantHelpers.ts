import type { UserAccount, Tenant, OrderStatus, OrderFulfillment, Post, Product } from '../types';

export const getCategoryFallbackBanner = (category?: string): string => {
  const normalized = (category || '').toLowerCase();
  if (normalized.includes('hamburg') || normalized.includes('burger') || normalized.includes('rápida')) {
    return 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1000&q=80';
  }
  if (normalized.includes('ital') || normalized.includes('pizza') || normalized.includes('pasta')) {
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1000&q=80';
  }
  if (normalized.includes('mexic') || normalized.includes('taco')) {
    return 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1000&q=80';
  }
  if (normalized.includes('asiát') || normalized.includes('sushi') || normalized.includes('oriental') || normalized.includes('ramen')) {
    return 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1000&q=80';
  }
  if (normalized.includes('café') || normalized.includes('cafeter') || normalized.includes('postre') || normalized.includes('panader')) {
    return 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1000&q=80';
  }
  if (normalized.includes('típic') || normalized.includes('parrilla') || normalized.includes('asado') || normalized.includes('carne')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=80';
  }
  return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80';
};

export const resolveTenantBannerUrl = (
  tenant?: Tenant | null,
  posts?: Post[],
  products?: Product[]
): string => {
  if (!tenant) return getCategoryFallbackBanner();
  const directBanner = tenant.bannerUrl?.trim();
  if (directBanner) return directBanner;

  const postImg = posts?.find(
    p => p.tenantId === tenant.id && typeof p.image === 'string' && p.image.trim().length > 0 && p.mediaType !== 'video'
  )?.image;
  if (postImg) return postImg.trim();

  const prodImg = products?.find(
    p => p.tenantId === tenant.id && typeof p.image === 'string' && p.image.trim().length > 0
  )?.image;
  if (prodImg) return prodImg.trim();

  return getCategoryFallbackBanner(tenant.category);
};

export const resolveTenantLogoUrl = (
  tenant?: Tenant | null,
  posts?: Post[],
  products?: Product[]
): string | undefined => {
  if (!tenant) return undefined;
  const directLogo = tenant.logoUrl?.trim();
  if (directLogo) return directLogo;

  const prodImg = products?.find(
    p => p.tenantId === tenant.id && typeof p.image === 'string' && p.image.trim().length > 0
  )?.image;
  if (prodImg) return prodImg.trim();

  const postImg = posts?.find(
    p => p.tenantId === tenant.id && typeof p.image === 'string' && p.image.trim().length > 0 && p.mediaType !== 'video'
  )?.image;
  if (postImg) return postImg.trim();

  return undefined;
};

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
