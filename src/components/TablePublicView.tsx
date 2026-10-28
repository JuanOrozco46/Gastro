import React, { useState, useEffect, Suspense } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, ShoppingBag, ShieldCheck, Utensils, QrCode, Plus, AlertCircle, ExternalLink, MapPin } from 'lucide-react';
import { resolveTableByToken } from '../services/supabaseDataService';
import { fetchLiveOrdersForTable, subscribeToTableOrders } from '../services/supabaseOrderService';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import type { Product, Tenant, RestaurantTable, Order } from '../types';

const PaymentModal = lazyWithRetry(() => import('./PaymentModal').then(m => ({ default: m.PaymentModal })));

export const TablePublicView: React.FC = () => {
  const { products, cart, addToCart, removeFromCart, setCurrentTenantBySlug } = useApp();
  
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [restaurant, setRestaurant] = useState<Tenant | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  
  const [tableOrders, setTableOrders] = useState<Order[]>([]);

  useEffect(() => {
    const init = async () => {
      const rawToken = window.location.pathname.split('/mesa/')[1];
      const token = rawToken?.split('/')[0]?.split('?')[0]?.trim();
      if (!token) {
        setError('Enlace inválido o incompleto.');
        setIsLoading(false);
        return;
      }

      const res = await resolveTableByToken(token);
      if (!res.success) {
        if (res.error === 'invalid_token') setError('El código QR es inválido o no existe.');
        else if (res.error === 'table_archived') setError('Esta mesa ha sido archivada o eliminada.');
        else if (res.error === 'table_inactive') setError('Esta mesa se encuentra inactiva o deshabilitada temporalmente.');
        else if (res.error === 'restaurant_not_found') setError('El restaurante asociado a esta mesa no existe.');
        else if (res.error === 'restaurant_not_approved') setError('El restaurante aún no ha sido aprobado en la plataforma.');
        else if (res.error === 'restaurant_paused') setError('El restaurante se encuentra pausado temporalmente.');
        else if (res.error === 'restaurant_closed') setError('El restaurante se encuentra cerrado en este momento.');
        else if (res.error === 'restaurant_not_accepting_orders') setError('El restaurante no está aceptando pedidos en este momento.');
        else if (res.error === 'table_service_disabled') setError('El servicio a la mesa no está habilitado en este restaurante.');
        else if (res.error === 'restaurant_inactive') setError('El restaurante no se encuentra activo actualmente.');
        else setError('Error al resolver la mesa: ' + res.error);
        setIsLoading(false);
        return;
      }

      setTable(res.data.table);
      setRestaurant(res.data.restaurant);
      setCurrentTenantBySlug(res.data.restaurant.slug);
      
      const orders = await fetchLiveOrdersForTable(res.data.table.id);
      setTableOrders(orders);
      
      setIsLoading(false);
    };
    init();
  }, [setCurrentTenantBySlug]);

  useEffect(() => {
    if (table?.id) {
      const unsub = subscribeToTableOrders(table.id, async () => {
        const orders = await fetchLiveOrdersForTable(table.id);
        setTableOrders(orders);
      });
      return () => unsub();
    }
  }, [table?.id]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '75vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--primary-glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>Conectando a la mesa...</p>
      </div>
    );
  }

  if (error || !table || !restaurant) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '75vh', padding: '1.5rem' }}>
        <div
          className="card"
          style={{
            background: 'var(--neutral-surface)',
            border: '1px solid var(--neutral-border)',
            boxShadow: 'var(--shadow-card)',
            padding: '2.5rem 2rem',
            borderRadius: 'var(--radius-xl)',
            textAlign: 'center',
            maxWidth: '420px',
            width: '100%'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}
          >
            <AlertCircle size={28} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Mesa no disponible
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>{error}</p>
        </div>
      </div>
    );
  }

  const tenantProducts = products.filter(p => p.tenantId === restaurant.id && p.available);
  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const cartQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="tab-content active"
    >
      <div
        className="card table-qr-hero"
        style={{
          background: 'var(--neutral-surface)',
          border: '1px solid var(--neutral-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'clamp(1.25rem, 3vw, 2rem)',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span className="badge badge-secondary">
              Escaneo QR en Mesa
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>Sincronización en vivo</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            {restaurant.name} · <span style={{ color: 'var(--primary)' }}>Mesa #{table.tableNumber}</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '6px' }}>
            {table.displayName ? `Zona: ${table.displayName} · ` : ''}Elige tus platos y envía la comanda directo a cocina.
          </p>
        </div>

        <div style={{
          background: 'var(--neutral-surface-alt)',
          border: '1px solid var(--neutral-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ background: 'var(--primary-light)', padding: '9px', borderRadius: 'var(--radius-md)', color: 'var(--primary)', display: 'flex' }}>
            <QrCode size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.6px', display: 'block' }}>
              Estado de Conexión
            </span>
            <strong style={{ fontSize: '0.875rem', color: 'var(--secondary-hover)', display: 'block' }}>Mesa Conectada</strong>
          </div>
        </div>
      </div>

      <div className="grid-2 table-view-grid" style={{ gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {tableOrders.length > 0 && (
            <div>
              <div className="card-header" style={{ marginBottom: '0.75rem' }}>
                <div className="card-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  <ShoppingBag size={20} style={{ color: 'var(--primary)' }} /> Pedidos en curso
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tableOrders.map(o => (
                  <div key={o.id} className="card" style={{
                    background: 'var(--neutral-surface)',
                    border: '1px solid var(--neutral-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.1rem 1.25rem',
                    boxShadow: 'var(--shadow-card)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '0.875rem' }}>Pedido #{o.id.substring(0,6).toUpperCase()}</span>
                      <span className={`badge ${o.status === 'delivered' ? 'badge-secondary' : 'badge-primary'}`}>
                        {o.status === 'pending' ? 'Pendiente' : 
                         o.status === 'accepted' ? 'Aceptado' :
                         o.status === 'preparing' ? 'En Cocina' : 
                         o.status === 'ready' ? 'Listo / En mesa' :
                         o.status === 'delivered' ? 'Finalizado' : 'Cancelado'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '12px' }}>
                      {o.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                    </div>
                    {o.paymentMethod === 'cash' && (
                      <div style={{ 
                        padding: '8px 12px', 
                        borderRadius: 'var(--radius-sm)', 
                        marginBottom: '12px',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        background: o.paymentStatus === 'pending' ? 'var(--warning-light)' : 'var(--secondary-light)',
                        color: o.paymentStatus === 'pending' ? 'var(--warning)' : 'var(--secondary-hover)'
                      }}>
                        {o.paymentStatus === 'pending' ? 'Pago en efectivo pendiente de confirmación' : 'Efectivo recibido en caja'}
                      </div>
                    )}
                    {o.status === 'delivered' && restaurant.googlePlaceId && (
                      <button 
                        type="button"
                        onClick={() => window.open(`https://search.google.com/local/writereview?placeid=${encodeURIComponent(restaurant.googlePlaceId!)}`, '_blank', 'noopener,noreferrer')}
                        className="btn btn-outline" 
                        style={{ width: '100%', borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        <MapPin size={16} /> Dejar una reseña en Google <ExternalLink size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="card-header" style={{ marginBottom: '0.75rem' }}>
              <div className="card-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                <Utensils size={20} style={{ color: 'var(--primary)' }} /> Carta Digital en Vivo
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tenantProducts.length === 0 ? (
                <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--neutral-surface)', border: '1px solid var(--neutral-border)' }}>
                  El menú no está disponible en este momento.
                </div>
              ) : (
                tenantProducts.map((product: Product) => (
                  <motion.div 
                    key={product.id}
                    whileHover={{ scale: 1.01 }}
                    className="card table-qr-product-card" 
                    style={{ 
                      display: 'flex', 
                      gap: '14px', 
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      padding: '1rem 1.15rem',
                      background: 'var(--neutral-surface)',
                      border: '1px solid var(--neutral-border)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-card)'
                    }}
                  >
                    <div style={{ 
                      width: '60px', 
                      height: '60px', 
                      borderRadius: 'var(--radius-md)', 
                      background: 'var(--neutral-surface-alt)', 
                      border: '1px solid var(--neutral-border)',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '1.7rem',
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          loading="lazy"
                          decoding="async"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        product.emoji || '🍽️'
                      )}
                    </div>

                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3 }}>{product.name}</h4>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '3px 0 6px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.desc}</p>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        ${product.price.toLocaleString('es-CO')} COP
                      </span>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      className="btn btn-primary table-qr-add-btn"
                      style={{ borderRadius: 'var(--radius-sm)', padding: '10px 16px', fontWeight: 700, fontSize: '0.875rem', minHeight: '44px', flexShrink: 0 }}
                      onClick={() => addToCart(product)}
                    >
                      <Plus size={16} /> Pedir a Mesa
                    </motion.button>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

        <div 
          id="table-qr-comanda-card"
          className="card" 
          style={{ 
            position: 'sticky', 
            top: '100px', 
            height: 'fit-content',
            background: 'var(--neutral-surface)',
            border: '1px solid var(--neutral-border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <div className="card-header" style={{ borderColor: 'var(--neutral-border)' }}>
            <div className="card-title" style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '1.15rem' }}>
              <ShoppingBag size={20} style={{ color: 'var(--primary)' }} /> Comanda Mesa #{table.tableNumber}
            </div>
            <span className="badge badge-primary">{cartQty} ítems</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem', minHeight: '80px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', fontSize: '0.875rem' }}>
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
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.875rem',
                      padding: '10px 12px',
                      background: 'var(--neutral-surface-alt)',
                      border: '1px solid var(--neutral-border)',
                      borderRadius: 'var(--radius-md)'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 700, display: 'block' }}>{item.product.name}</span>
                      <strong style={{ color: 'var(--primary)', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                        ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--neutral-border-strong)',
                          background: 'var(--neutral-surface)',
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          fontWeight: 800
                        }}
                      >
                        -
                      </button>
                      <strong style={{ color: 'var(--text-main)', minWidth: '18px', textAlign: 'center' }}>{item.quantity}</strong>
                      <button
                        type="button"
                        onClick={() => addToCart(item.product)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--neutral-border-strong)',
                          background: 'var(--neutral-surface)',
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          fontWeight: 800
                        }}
                      >
                        +
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          <div style={{ borderTop: '1px dashed var(--neutral-border)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 800 }}>
              <span style={{ color: 'var(--text-main)' }}>Total Mesa:</span>
              <span style={{ color: 'var(--primary)', whiteSpace: 'nowrap' }}>${cartTotal.toLocaleString('es-CO')} COP</span>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-secondary btn-full"
            disabled={cart.length === 0}
            style={{ 
              padding: '14px', 
              fontSize: '0.875rem',
              fontWeight: 800,
              borderRadius: 'var(--radius-md)'
            }}
            onClick={() => setIsPaymentOpen(true)}
          >
            <CreditCard size={18} /> Pagar y Enviar a Cocina
          </motion.button>

          <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <ShieldCheck size={14} style={{ color: 'var(--secondary)' }} />
            Pago directo 100% Cifrado
          </div>
        </div>

      </div>

      {/* Barra inferior flotante en móvil para enviar comanda de mesa sin hacer scroll */}
      {cartQty > 0 && !isPaymentOpen && (
        <div className="table-qr-mobile-sticky-bar">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(250, 250, 248, 0.78)', fontWeight: 700 }}>
              Mesa #{table.tableNumber} · {cartQty} plato{cartQty !== 1 ? 's' : ''}
            </span>
            <strong style={{ fontSize: '1.15rem', color: '#FAFAF8', fontWeight: 800, whiteSpace: 'nowrap' }}>
              ${cartTotal.toLocaleString('es-CO')} COP
            </strong>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsPaymentOpen(true)}
            style={{
              borderRadius: 'var(--radius-md)',
              padding: '10px 18px',
              fontWeight: 800,
              fontSize: '0.875rem'
            }}
          >
            <CreditCard size={16} /> Pagar y Enviar
          </button>
        </div>
      )}

      {isPaymentOpen && (
        <Suspense fallback={null}>
          <PaymentModal
            isOpen={isPaymentOpen}
            onClose={() => {
              setIsPaymentOpen(false);
              if (table?.id) {
                void fetchLiveOrdersForTable(table.id).then(setTableOrders);
              }
            }}
            orderType="table_service"
            prefilledTableId={table.id}
            prefilledTableToken={window.location.pathname.split('/mesa/')[1]?.split('/')[0]?.split('?')[0]?.trim()}
            entryPoint="qr"
          />
        </Suspense>
      )}
    </motion.div>
  );
};
