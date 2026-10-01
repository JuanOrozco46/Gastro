import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import { PaymentModal } from './PaymentModal';
import { CreditCard, ShoppingBag, ShieldCheck, Utensils, QrCode, Plus } from 'lucide-react';
import type { Product } from '../types';

export const TableQRView: React.FC = () => {
  const { currentTenant, products, cart, addToCart } = useApp();
  const [tableNum] = useState('4');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const tenantProducts = products.filter(p => p.tenantId === currentTenant.id && p.available);
  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const cartQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="tab-content active"
    >
      {/* Table Banner Header */}
      <div style={{
        background: 'var(--glass-medium)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '28px',
        padding: '2rem 2.5rem',
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="badge badge-secondary" style={{ padding: '6px 14px', fontSize: '0.78rem', fontWeight: 800 }}>
              📱 ESCANEO QR EN MESA
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Mesa presencial sincronizada</span>
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
            {currentTenant.name} • <span style={{ color: 'var(--primary)' }}>Mesa #{tableNum}</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Elige tus platos, confirma y paga directamente sin esperar la cuenta física.
          </p>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{ background: 'var(--primary-light)', padding: '10px', borderRadius: '12px', color: 'var(--primary)' }}>
            <QrCode size={28} />
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800 }}>
              ESTADO DE CONEXIÓN
            </span>
            <strong style={{ fontSize: '0.9rem', color: '#10B981', display: 'block' }}>🟢 Mesa #{tableNum} Conectada</strong>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '2.2fr 1fr', gap: '1.75rem' }}>
        
        {/* Menu Catalog */}
        <div>
          <div className="card-header" style={{ marginBottom: '1.25rem' }}>
            <div className="card-title" style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white' }}>
              <Utensils size={22} style={{ color: 'var(--primary)' }} /> Carta Digital en Vivo
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {tenantProducts.map((product: Product) => (
              <motion.div 
                key={product.id}
                whileHover={{ scale: 1.01 }}
                className="card" 
                style={{ 
                  display: 'flex', 
                  gap: '16px', 
                  alignItems: 'center', 
                  padding: '1.25rem',
                  background: 'var(--glass-light)',
                  backdropFilter: 'blur(16px)',
                  borderColor: 'rgba(255, 255, 255, 0.09)',
                  borderRadius: '20px'
                }}
              >
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '16px', 
                  background: 'var(--primary-glass)', 
                  border: '1px solid var(--primary-glass-border)',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '1.8rem',
                  flexShrink: 0
                }}>
                  {product.emoji}
                </div>

                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'white' }}>{product.name}</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 6px', lineHeight: 1.4 }}>{product.desc}</p>
                  <span style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--primary)' }}>
                    ${product.price.toLocaleString('es-CO')} COP
                  </span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="btn btn-primary"
                  style={{ borderRadius: '12px', padding: '10px 16px', fontWeight: 800, fontSize: '0.85rem' }}
                  onClick={() => addToCart(product)}
                >
                  <Plus size={16} /> Pedir a Mesa
                </motion.button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Table Cart Sidebar */}
        <div 
          className="card" 
          style={{ 
            position: 'sticky', 
            top: '100px', 
            height: 'fit-content',
            background: 'var(--glass-medium)',
            backdropFilter: 'blur(20px)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div className="card-header" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <div className="card-title" style={{ color: 'white', fontWeight: 900 }}>
              <ShoppingBag size={20} style={{ color: 'var(--primary)' }} /> Comanda Mesa #{tableNum}
            </div>
            <span className="badge badge-primary">{cartQty} ítems</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem', minHeight: '80px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', fontSize: '0.85rem' }}>
                Tu orden de mesa está vacía. Añade platos para enviar a cocina.
              </div>
            ) : (
              <AnimatePresence>
                {cart.map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '0.88rem',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderRadius: '10px'
                    }}
                  >
                    <span>
                      <strong style={{ color: 'var(--primary)', marginRight: '6px' }}>{item.quantity}x</strong> 
                      <span style={{ color: 'white' }}>{item.product.name}</span>
                    </span>
                    <strong style={{ color: 'white' }}>${(item.product.price * item.quantity).toLocaleString('es-CO')}</strong>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.12)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 900 }}>
              <span style={{ color: 'white' }}>Total Mesa:</span>
              <span style={{ color: 'var(--primary)' }}>${cartTotal.toLocaleString('es-CO')} COP</span>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-secondary btn-full"
            disabled={cart.length === 0}
            style={{ 
              padding: '14px', 
              fontSize: '0.95rem',
              fontWeight: 900,
              borderRadius: '14px',
              boxShadow: cart.length > 0 ? '0 6px 20px rgba(16, 185, 129, 0.3)' : 'none'
            }}
            onClick={() => setIsPaymentOpen(true)}
          >
            <CreditCard size={18} /> Pagar & Enviar a Cocina
          </motion.button>

          <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <ShieldCheck size={14} style={{ color: 'var(--secondary)' }} />
            Pago directo 100% Cifrado
          </div>
        </div>

      </div>

      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        orderType={`Mesa #${tableNum}`}
      />
    </motion.div>
  );
};
