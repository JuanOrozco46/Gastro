import { useState, useEffect } from 'react';
import type { CartItem, Product, Tenant } from '../types';

export interface CartConflict {
  pendingProduct: Product | null;
  activeTenantName: string;
}

export type AddToCartResult =
  | { success: true }
  | { success: false; requiresClear?: boolean; activeTenantName?: string };

/**
 * Slice del carrito: estado persistido, conflicto multi-restaurante y mutaciones.
 * Depende solo de tenants/currentTenant para validar disponibilidad.
 */
export function useCartSlice(
  tenants: Tenant[],
  currentTenant: Tenant,
  showToast: (message: string) => void
) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('gs_cart_v5');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [cartConflict, setCartConflict] = useState<CartConflict | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('gs_cart_v5', JSON.stringify(cart));
    } catch {
      // Ignorar QuotaExceededError o restricciones de almacenamiento privado
    }
  }, [cart]);

  const addToCart = (product: Product): AddToCartResult => {
    if (product.available === false) {
      showToast(`⚠️ "${product.name}" no se encuentra disponible por el momento.`);
      return { success: false };
    }
    const prodTenant = tenants.find(t => t.id === product.tenantId) || currentTenant;
    if (!prodTenant.isOpen) {
      showToast(`⚠️ ${prodTenant.name} se encuentra CERRADO temporalmente.`);
      return { success: false };
    }

    if (cart.length > 0) {
      const activeTenantId = cart[0].product.tenantId;
      if (activeTenantId !== product.tenantId) {
        const activeTenant = tenants.find(t => t.id === activeTenantId);
        const activeName = activeTenant ? activeTenant.name : 'otro restaurante';
        setCartConflict({ pendingProduct: product, activeTenantName: activeName });
        return { success: false, requiresClear: true, activeTenantName: activeName };
      }
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
    showToast(`Añadido al carrito: ${product.name}`);
    return { success: true };
  };

  const clearCartAndAdd = (product: Product) => {
    setCart([{ product, quantity: 1 }]);
    showToast(`Añadido al carrito: ${product.name}`);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  return {
    cart,
    setCart,
    cartConflict,
    setCartConflict,
    addToCart,
    clearCartAndAdd,
    removeFromCart,
    clearCart
  };
}
