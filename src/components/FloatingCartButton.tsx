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
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 50, opacity: 0, scale: 0.9 }}
          whileTap={{ scale: 0.95 }}
          style={{
            position: 'fixed',
            bottom: 'env(safe-area-inset-bottom, 80px)', 
            right: '20px',
            zIndex: 999,
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '30px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(230, 148, 43, 0.4)',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '1rem',
            minHeight: '48px',
            minWidth: '48px', // Touch target
            transition: 'background-color 0.2s ease',
          }}
          aria-label={`Ver carrito, ${totalQty} productos`}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingBag size={22} fill="currentColor" />
            <motion.span 
              key={totalQty}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-10px',
                backgroundColor: 'white',
                color: 'var(--primary)',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 900,
                border: '2px solid var(--primary)'
              }}
            >
              {totalQty}
            </motion.span>
          </div>
          <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            ${totalCop.toLocaleString('es-CO')}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
};
