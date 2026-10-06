import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import { PaymentModal } from './PaymentModal';
import { CreditCard, ShoppingBag, ShieldCheck, Utensils, QrCode, Plus, AlertCircle, ExternalLink, MapPin } from 'lucide-react';
import { resolveTableByToken } from '../services/supabaseDataService';
import { fetchLiveOrdersForTable, subscribeToTableOrders } from '../services/supabaseOrderService';
import type { Product, Tenant, RestaurantTable, Order } from '../types';

export const TablePublicView: React.FC = () => {
  const { products, cart, addToCart, setCurrentTenantBySlug } = useApp();
  
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [restaurant, setRestaurant] = useState<Tenant | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  
  const [tableOrders, setTableOrders] = useState<Order[]>([]);

  useEffect(() => {
    const token = window.location.pathname.split('/mesa/')[1];
    if (!token) {
      setError('Enlace inválido o incompleto.');
      setIsLoading(false);
      return;
    }

    const init = async () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--primary-glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-muted)' }}>Conectando a la mesa...</p>
      </div>
    );
  }

  if (error || !table || !restaurant) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '2rem' }}>
        <div style={{ background: 'var(--glass-medium)', padding: '3rem', borderRadius: '24px', textAlign: 'center', maxWidth: '400px' }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ color: 'white', marginBottom: '1rem' }}>Mesa no disponible</h2>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
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
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sincronización en vivo</span>
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
            {restaurant.name} • <span style={{ color: 'var(--primary)' }}>Mesa #{table.tableNumber}</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            {table.displayName ? `Zona: ${table.displayName} • ` : ''}Elige tus platos y envía la comanda a cocina.
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
            <strong style={{ fontSize: '0.9rem', color: '#10B981', display: 'block' }}>🟢 Mesa Conectada</strong>
          </div>
        </div>
      </div>

      <div className="grid-2 table-view-grid" style={{ gap: '1.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          {tableOrders.length > 0 && (
            <div>
              <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                <div className="card-title" style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white' }}>
                  <ShoppingBag size={22} style={{ color: 'var(--primary)' }} /> Pedidos en curso
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tableOrders.map(o => (
                  <div key={o.id} style={{
                    background: 'var(--glass-light)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.09)',
                    borderRadius: '20px',
                    padding: '1.25rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: 'white', fontWeight: 800 }}>Pedido #{o.id.substring(0,6).toUpperCase()}</span>
                      <span className="badge" style={{ 
                        background: o.status === 'delivered' ? 'rgba(16, 185, 129, 0.2)' : 'var(--primary-glass)', 
                        color: o.status === 'delivered' ? '#10B981' : 'var(--primary)',
                        fontWeight: 800
                      }}>
                        {o.status === 'pending' ? 'Pendiente' : 
                         o.status === 'preparing' ? 'En Cocina' : 
                         o.status === 'ready' ? 'Listo / En camino' :
                         o.status === 'delivered' ? 'Finalizado' : 'Cancelado'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                      {o.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                    </div>
                    {o.status === 'delivered' && restaurant.googlePlaceId && (
                      <button 
                        onClick={() => window.open(`https://search.google.com/local/writereview?placeid=${restaurant.googlePlaceId}`, '_blank')}
                        className="btn btn-outline" 
                        style={{ width: '100%', borderRadius: '12px', padding: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
              <div className="card-title" style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white' }}>
                <Utensils size={22} style={{ color: 'var(--primary)' }} /> Carta Digital en Vivo
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {tenantProducts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>El menú no está disponible en este momento.</div>
              ) : (
                tenantProducts.map((product: Product) => (
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

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</h4>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 6px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.desc}</p>
                      <span style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--primary)' }}>
                        ${product.price.toLocaleString('es-CO')} COP
                      </span>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="btn btn-primary"
                      style={{ borderRadius: '12px', padding: '10px 16px', fontWeight: 800, fontSize: '0.85rem', minHeight: '44px', flexShrink: 0 }}
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
              <ShoppingBag size={20} style={{ color: 'var(--primary)' }} /> Comanda Mesa #{table.tableNumber}
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
        orderType="table_service"
        prefilledTableId={table.id}
        prefilledTableToken={window.location.pathname.split('/mesa/')[1]}
        entryPoint="qr"
      />
    </motion.div>
  );
};
