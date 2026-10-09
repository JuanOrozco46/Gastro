import React from 'react';
import { useApp } from '../context/useApp';
import { ShoppingBag, Plus, Minus, Trash2, Bike, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
  onContinueShopping: () => void;
}

export const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose, onCheckout, onContinueShopping }) => {
  const { cart, tenants, removeFromCart, addToCart } = useApp();

  const cartQty = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartTotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const cartTenantId = cart.length > 0 ? cart[0].product.tenantId : null;
  const cartTenant = cartTenantId ? tenants.find(t => t.id === cartTenantId) : null;
  const isCartTenantOpen = cartTenant?.isOpen && cartTenant?.acceptingOrders;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="gf-mobile-cart-overlay" onClick={onClose} style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end'
        }}>
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '90vh',
              background: 'var(--neutral-surface)',
              borderRadius: '24px 24px 0 0',
              display: 'flex',
              flexDirection: 'column',
              borderTop: '1px solid var(--neutral-border)'
            }}
          >
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--neutral-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '1.1rem' }}>
                <ShoppingBag size={20} /> Mi Carrito
                {cartQty > 0 && <span style={{ background: 'var(--primary)', color: 'white', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px' }}>{cartQty}</span>}
              </div>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}><X size={24} /></button>
            </div>

            <div style={{ overflowY: 'auto', padding: '1.25rem', flex: 1 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <ShoppingBag size={48} style={{ color: '#CBD5E1', marginBottom: 16 }} />
                  <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Tu carrito está vacío</p>
                  <span style={{ fontSize: '0.9rem' }}>Añade platillos desde el feed</span>
                </div>
              ) : (
                <>
                  <div style={{ padding: '0 0.5rem 1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Restaurante actual: <strong style={{ color: 'var(--primary)' }}>{cartTenant?.name}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {cart.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--neutral-surface-alt)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '1.5rem', background: 'rgba(255,255,255,0.05)', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.product.emoji}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.product.name}</div>
                          <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.9rem' }}>
                            ${item.product.price.toLocaleString('es-CO')} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(x{item.quantity})</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '10px' }}>
                          <button onClick={() => removeFromCart(item.product.id)} style={{ width: 34, height: 34, borderRadius: '8px', border: 'none', background: 'var(--neutral-surface)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            {item.quantity === 1 ? <Trash2 size={15} color="var(--danger)" /> : <Minus size={15} />}
                          </button>
                          <span style={{ fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{item.quantity}</span>
                          <button onClick={() => addToCart(item.product)} style={{ width: 34, height: 34, borderRadius: '8px', border: 'none', background: 'var(--neutral-surface)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div style={{ marginTop: '1rem' }}>
                    <button 
                      className="btn btn-outline" 
                      style={{ width: '100%', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700 }}
                      onClick={() => {
                        onContinueShopping();
                        onClose();
                      }}
                    >
                      <Plus size={16} /> Seguir comprando
                    </button>
                  </div>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ padding: '1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--neutral-border)', background: 'var(--neutral-surface-alt)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span>Subtotal</span><span>${cartTotal.toLocaleString('es-CO')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span>🛵 Domicilio</span><span style={{ color: '#10B981', fontWeight: 700 }}>Gratis</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '1.2rem', fontWeight: 900 }}>
                  <span>Total</span><span>${cartTotal.toLocaleString('es-CO')} COP</span>
                </div>
                {isCartTenantOpen ? (
                  <button 
                    onClick={() => { onClose(); onCheckout(); }}
                    style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'var(--primary)', color: 'white', border: 'none', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <Bike size={20} /> Pagar a Domicilio
                  </button>
                ) : (
                  <button disabled style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)', border: 'none', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'not-allowed' }}>
                    <Clock size={20} /> Restaurante Cerrado
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
