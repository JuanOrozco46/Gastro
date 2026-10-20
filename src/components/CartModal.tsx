import React from 'react';
import { useApp } from '../context/useApp';
import { ShoppingBag, Plus, Minus, Trash2, Clock, X } from 'lucide-react';
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
  const isCartTenantOpen = (cartTenant?.isOpen ?? true) && cartTenant?.acceptingOrders !== false;
  const deliveryFee = cartTenant?.deliveryFee ?? 0;
  const finalTotal = cartTotal + deliveryFee;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="gf-cart-modal-overlay" onClick={onClose}>
          <motion.div
            className="gf-cart-modal-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="gf-cart-modal-header">
              <div className="gf-cart-modal-title-group">
                <ShoppingBag size={20} className="gf-cart-modal-title-icon" />
                <h3 className="gf-cart-modal-title">Mi Carrito</h3>
                {cartQty > 0 && <span className="gf-cart-modal-badge">{cartQty}</span>}
              </div>
              <button type="button" className="gf-cart-modal-close" onClick={onClose} aria-label="Cerrar carrito">
                <X size={20} />
              </button>
            </div>

            <div className="gf-cart-modal-body">
              {cart.length === 0 ? (
                <div className="gf-cart-modal-empty">
                  <ShoppingBag size={40} className="gf-cart-empty-icon" />
                  <p>Tu carrito está vacío</p>
                  <span>Añade platillos desde el feed</span>
                </div>
              ) : (
                <>
                  <div className="gf-cart-modal-tenant-note">
                    Restaurante actual: <strong>{cartTenant?.name}</strong>
                  </div>
                  <div className="gf-cart-modal-list">
                    {cart.map((item, i) => (
                      <div key={i} className="gf-cart-modal-item">
                        <div className="gf-cart-modal-item-left">
                          <div className="gf-cart-modal-item-emoji">
                            {item.product.emoji}
                          </div>
                          <div className="gf-cart-modal-item-info">
                            <div className="gf-cart-modal-item-name">{item.product.name}</div>
                            <div className="gf-cart-modal-item-price">
                              ${item.product.price.toLocaleString('es-CO')}{' '}
                              <span className="gf-cart-modal-qty-tag">(x{item.quantity})</span>
                            </div>
                          </div>
                        </div>
                        <div className="gf-ci-controls">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.product.id)}
                            className={`gf-ci-btn ${item.quantity === 1 ? 'danger' : ''}`}
                            aria-label="Disminuir cantidad"
                          >
                            {item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => addToCart(item.product)}
                            className="gf-ci-btn add"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline gf-cart-modal-continue-btn"
                    onClick={() => {
                      onContinueShopping();
                      onClose();
                    }}
                  >
                    <Plus size={16} /> Seguir comprando
                  </button>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="gf-cart-modal-footer">
                <div className="gf-cart-rows">
                  <div className="gf-cart-row">
                    <span>Subtotal</span>
                    <span>${cartTotal.toLocaleString('es-CO')}</span>
                  </div>
                  <div className="gf-cart-row">
                    <span>Domicilio (estimado)</span>
                    <span className={deliveryFee === 0 ? "gf-free" : undefined}>
                      {deliveryFee === 0 ? 'Gratis' : `$${deliveryFee.toLocaleString('es-CO')}`}
                    </span>
                  </div>
                </div>
                <div className="gf-cart-modal-total-row">
                  <strong>Total estimado</strong>
                  <strong>${finalTotal.toLocaleString('es-CO')} COP</strong>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#64748B', textAlign: 'center', margin: '4px 0 10px', lineHeight: 1.3 }}>
                  Tarifa de envío estimada para domicilio. Si eliges recoger en el local o servicio en mesa, el envío se descuenta a $0 en checkout.
                </p>
                {isCartTenantOpen ? (
                  <button
                    type="button"
                    className="gf-checkout-btn"
                    onClick={() => { onClose(); onCheckout(); }}
                  >
                    <ShoppingBag size={18} /> Continuar al Checkout
                  </button>
                ) : (
                  <button type="button" disabled className="gf-checkout-btn is-disabled">
                    <Clock size={18} /> Restaurante Cerrado
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
