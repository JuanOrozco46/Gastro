import React from 'react';
import { useApp } from '../context/useApp';
import { ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FloatingCartButtonProps {
  onOpen: () => void;
  isVisible: boolean;
}

export const FloatingCartButton: React.FC<FloatingCartButtonProps> = ({ onOpen, isVisible }) => {
  const { cart, currentTenant } = useApp();

  const totalQty = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalCop = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  // Solo mostrar si isVisible es true, el carrito tiene items, y hay un restaurante asignado
  const shouldShow = isVisible && totalQty > 0 && currentTenant;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.button
          onClick={onOpen}
          className="floating-cart-btn"
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 50, opacity: 0, scale: 0.9 }}
          whileTap={{ scale: 0.95 }}
          aria-label={`Ver carrito, ${totalQty} productos`}
        >
          <div className="floating-cart-icon-wrap">
            <ShoppingBag size={22} fill="currentColor" />
            <motion.span
              key={totalQty}
              className="floating-cart-badge"
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
            >
              {totalQty}
            </motion.span>
          </div>
          <span className="floating-cart-amount">
            ${totalCop.toLocaleString('es-CO')}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
};
