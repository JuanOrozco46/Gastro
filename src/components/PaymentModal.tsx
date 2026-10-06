import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { PaymentSimulatorService } from '../services/paymentService';
import type { PaymentMethod, OrderFulfillment, CheckoutDetails } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, ShoppingBag, Bike, Utensils } from 'lucide-react';
import confetti from 'canvas-confetti';
import { PaymentStatus } from './PaymentStatus';
import type { WompiCheckoutConfig } from './WompiCheckout';

const WompiCheckout = React.lazy(() => import('./WompiCheckout').then(m => ({ default: m.WompiCheckout })));

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderType?: string;
  prefilledTableId?: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, orderType = 'pickup', prefilledTableId }) => {
  const { cart, currentTenant, currentUser, submitOrderWithPayment, retryRemotePayment, authMode, isSubmittingOrder, orderError } = useApp();
  const [method, setMethod] = useState<PaymentMethod>('wompi');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [wompiConfig, setWompiConfig] = useState<WompiCheckoutConfig | null>(null);
  const [pendingPaymentInfo, setPendingPaymentInfo] = useState<{orderId: string, paymentId: string, sandboxUrl?: string} | null>(null);

  // Available delivery modes for this restaurant
  const allowedModes: OrderFulfillment[] = (currentTenant.deliveryModes && currentTenant.deliveryModes.length > 0)
    ? currentTenant.deliveryModes
    : ['pickup'];

  // Default mode selection
  const initialMode: OrderFulfillment = (() => {
    if (orderType.toLowerCase().includes('mesa') && allowedModes.includes('table_service')) {
      return 'table_service';
    }
    if (orderType.toLowerCase().includes('domicilio') && allowedModes.includes('restaurant_delivery')) {
      return 'restaurant_delivery';
    }
    return allowedModes[0] || 'pickup';
  })();

  const [fulfillment, setFulfillment] = useState<OrderFulfillment>(initialMode);

  // Customer & Delivery Form State
  const [customerName, setCustomerName] = useState(currentUser?.name || 'Cliente Demo');
  const [customerPhone, setCustomerPhone] = useState('+57 300 123 4567');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Table Service Form State
  const initialTableNum = (() => {
    const match = orderType.match(/\d+/);
    return match ? match[0] : '4';
  })();
  const [tableNumber, setTableNumber] = useState(initialTableNum);
  const [restaurantNotes, setRestaurantNotes] = useState('');

  // Card Form State
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  const [tempOrderId] = useState(() => Math.floor(104 + Math.random() * 895).toString());

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevTenantId, setPrevTenantId] = useState(currentTenant.id);

  if (isOpen !== prevIsOpen || currentTenant.id !== prevTenantId) {
    setPrevIsOpen(isOpen);
    setPrevTenantId(currentTenant.id);
    if (isOpen) {
      setFormError(null);
      setSuccess(false);
      setFulfillment(initialMode);
      if (currentUser?.name) {
        setCustomerName(currentUser.name);
      }
    }
  }

  if (!isOpen) return null;

  // Economic calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const deliveryFee = fulfillment === 'restaurant_delivery' ? (currentTenant.deliveryFee || 0) : 0;
  const total = subtotal + deliveryFee;

  const platformFee = Math.round(total * currentTenant.commissionRate);
  const restaurantPayout = total - platformFee;

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validations
    if (!currentTenant.isOpen) {
      setFormError('El restaurante está cerrado temporalmente. No se pueden procesar pedidos.');
      return;
    }

    if (cart.length === 0) {
      setFormError('El carrito está vacío.');
      return;
    }

    if (!allowedModes.includes(fulfillment)) {
      setFormError('La modalidad seleccionada no está disponible en este restaurante.');
      return;
    }

    if (fulfillment === 'restaurant_delivery') {
      if (!customerName.trim()) {
        setFormError('Ingresa tu nombre completo para la entrega a domicilio.');
        return;
      }
      if (!customerPhone.trim()) {
        setFormError('Ingresa un teléfono de contacto para el domiciliario.');
        return;
      }
      if (!deliveryAddress.trim()) {
        setFormError('Ingresa la dirección de entrega en Armenia, Quindío.');
        return;
      }
    }

    if (fulfillment === 'table_service') {
      if (!tableNumber.trim()) {
        setFormError('Ingresa el número de mesa.');
        return;
      }
    }

    const checkoutDetails: CheckoutDetails = {
      fulfillment,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: fulfillment === 'restaurant_delivery' ? {
        label: 'Dirección de Entrega',
        addressLine: deliveryAddress.trim(),
        notes: deliveryNotes.trim() || undefined
      } : undefined,
      tableNumber: fulfillment === 'table_service' ? tableNumber.trim() : undefined,
      tableId: fulfillment === 'table_service' ? prefilledTableId : undefined,
      restaurantNotes: restaurantNotes.trim() || undefined
    };

    let successResult = false;

    if (authMode === 'remote') {
      // In remote mode, we do not simulate a local transaction to avoid saving dummy payments
      const res = await submitOrderWithPayment(checkoutDetails, method);
      if (res.success && res.orderId && res.paymentId) {
        if (res.wompiConfig) {
          setWompiConfig(res.wompiConfig as WompiCheckoutConfig);
        } else {
          setPendingPaymentInfo({ 
            orderId: res.orderId, 
            paymentId: res.paymentId, 
            sandboxUrl: res.sandboxUrl 
          });
        }
        return; // Detenemos la ejecución para mostrar el modal de Wompi o el estatus
      }
    } else {
      setLoading(true);
      const transaction = await PaymentSimulatorService.processPayment({
        orderId: tempOrderId,
        tenantId: currentTenant.id,
        totalAmount: total,
        commissionRate: currentTenant.commissionRate,
        paymentMethod: method,
        cardDetails: method === 'card' ? {
          number: cardNumber,
          holder: cardHolder,
          expMonth: cardExp.split('/')[0] || '12',
          expYear: cardExp.split('/')[1] || '28',
          cvc: cardCvc
        } : undefined
      });
      setLoading(false);
      const res = await submitOrderWithPayment(checkoutDetails, method, transaction);
      successResult = res.success;
    }

    if (successResult) {
      setSuccess(true);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1800);
    }
  };

  return (
    <AnimatePresence>
      <div 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(8, 12, 20, 0.85)', 
          backdropFilter: 'blur(16px)', 
          zIndex: 1000, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '1.25rem',
          overflowY: 'auto'
        }}
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="card" 
          style={{ 
            width: '100%', 
            maxWidth: '540px', 
            maxHeight: '90vh',
            overflowY: 'auto',
            background: 'var(--glass-dark)', 
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.12)', 
            borderRadius: '28px', 
            padding: '1.75rem', 
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)', 
            position: 'relative' 
          }}
        >
          {/* Close Button */}
          <button 
            onClick={onClose} 
            style={{ 
              position: 'absolute', 
              top: '20px', 
              right: '20px', 
              background: 'rgba(255, 255, 255, 0.08)', 
              border: 'none', 
              color: 'var(--text-muted)', 
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>

          {wompiConfig ? (
            <React.Suspense fallback={<div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Preparando pasarela de pago...</div>}>
              <WompiCheckout
                config={wompiConfig}
                onWidgetClosed={() => {
                  setPendingPaymentInfo({ 
                    orderId: wompiConfig.orderId, 
                    paymentId: wompiConfig.paymentId 
                  });
                  setWompiConfig(null);
                }}
                onCancel={() => {
                  setPendingPaymentInfo({ 
                    orderId: wompiConfig.orderId, 
                    paymentId: wompiConfig.paymentId 
                  });
                  setWompiConfig(null);
                }}
              />
            </React.Suspense>
          ) : pendingPaymentInfo ? (
            <PaymentStatus
              orderId={pendingPaymentInfo.orderId}
              paymentId={pendingPaymentInfo.paymentId}
              authMode={authMode}
              sandboxUrl={pendingPaymentInfo.sandboxUrl}
              onClose={() => {
                setPendingPaymentInfo(null);
                onClose();
              }}
              onRetry={async () => {
                setFormError(null);
                const currentOrderId = pendingPaymentInfo.orderId;
                setPendingPaymentInfo(null); 
                const res = await retryRemotePayment(currentOrderId);
                if (res.success && res.paymentId) {
                  if (res.wompiConfig) {
                    setWompiConfig(res.wompiConfig as WompiCheckoutConfig);
                  } else {
                    setPendingPaymentInfo({
                      orderId: currentOrderId,
                      paymentId: res.paymentId,
                      sandboxUrl: res.sandboxUrl
                    });
                  }
                } else {
                  setFormError('No fue posible iniciar el reintento de pago.');
                }
              }}
            />
          ) : success ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                style={{ 
                  width: '72px', 
                  height: '72px', 
                  borderRadius: '50%', 
                  background: 'rgba(16, 185, 129, 0.18)', 
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#10B981', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '0 auto 1.25rem' 
                }}
              >
                <CheckCircle2 size={42} />
              </motion.div>
              <h3 style={{ fontSize: '1.4rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
                ¡Pedido Confirmado con Éxito!
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Tu pedido por <strong>${total.toLocaleString('es-CO')} COP</strong> fue enviado directamente a la cocina de <strong>{currentTenant.name}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePaySubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <span className="badge badge-secondary" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                  🛍️ CHECKOUT DE PEDIDO LOCAL
                </span>
                <h3 style={{ fontSize: '1.5rem', color: 'white', fontWeight: 900, marginTop: '6px' }}>
                  Confirmar Pedido en {currentTenant.name}
                </h3>
              </div>

              {/* Validation Alert */}
              {(formError || orderError) && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FCA5A5',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '1.25rem'
                }}>
                  <AlertCircle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <span>{formError || orderError}</span>
                </div>
              )}

              {/* Step 1: Select Fulfillment Mode */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
                  1. Modalidad de Entrega / Cumplimiento:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {allowedModes.includes('pickup') && (
                    <button
                      type="button"
                      onClick={() => setFulfillment('pickup')}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '14px',
                        border: fulfillment === 'pickup' ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
                        background: fulfillment === 'pickup' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.03)',
                        color: 'white',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <ShoppingBag size={20} style={{ color: 'var(--primary)' }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '0.88rem', display: 'block' }}>Recoger en el local (Pickup)</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Recoge personalmente en {currentTenant.name} ({currentTenant.address})</span>
                      </div>
                    </button>
                  )}

                  {allowedModes.includes('restaurant_delivery') && (
                    <button
                      type="button"
                      onClick={() => setFulfillment('restaurant_delivery')}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '14px',
                        border: fulfillment === 'restaurant_delivery' ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
                        background: fulfillment === 'restaurant_delivery' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.03)',
                        color: 'white',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <Bike size={20} style={{ color: '#10B981' }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '0.88rem', display: 'block' }}>Entrega propia del restaurante (Domicilio)</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Tarifa de envío: {currentTenant.deliveryFee ? `$${currentTenant.deliveryFee.toLocaleString('es-CO')} COP` : 'Sin costo de entrega'}
                        </span>
                      </div>
                    </button>
                  )}

                  {allowedModes.includes('table_service') && (
                    <button
                      type="button"
                      onClick={() => setFulfillment('table_service')}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '14px',
                        border: fulfillment === 'table_service' ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
                        background: fulfillment === 'table_service' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.03)',
                        color: 'white',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <Utensils size={20} style={{ color: '#F59E0B' }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '0.88rem', display: 'block' }}>Servicio en Mesa / Pedido QR</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Atención directa a tu mesa en el restaurante</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: Form Fields per Fulfillment Mode */}
              {fulfillment === 'pickup' && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                  <p style={{ color: 'white', fontWeight: 700, margin: 0 }}>📍 Dirección de Recogida:</p>
                  <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{currentTenant.name} · {currentTenant.address || 'Armenia, Quindío'}</p>
                </div>
              )}

              {fulfillment === 'restaurant_delivery' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>Nombre de quien recibe *</label>
                    <input
                      type="text"
                      placeholder="Ej. María Fernanda"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>Teléfono de contacto *</label>
                    <input
                      type="tel"
                      placeholder="Ej. +57 300 123 4567"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>Dirección de entrega en Armenia *</label>
                    <input
                      type="text"
                      placeholder="Ej. Cra 14 # 19-20, Barrio Norte"
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>Notas para el repartidor (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Apto 302, timbrar al llegar"
                      value={deliveryNotes}
                      onChange={e => setDeliveryNotes(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              )}

              {fulfillment === 'table_service' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>Número de Mesa *</label>
                    <input
                      type="text"
                      placeholder="Ej. 4"
                      value={tableNumber}
                      onChange={e => setTableNumber(e.target.value)}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>Nota para cocina (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Sin cebolla en la ensalada"
                      value={restaurantNotes}
                      onChange={e => setRestaurantNotes(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              )}

              {/* Economic Summary Breakdown */}
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Subtotal de Productos:</span>
                  <strong style={{ color: 'white' }}>${subtotal.toLocaleString('es-CO')} COP</strong>
                </div>
                {fulfillment === 'restaurant_delivery' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tarifa de Envío:</span>
                    <strong style={{ color: '#38BDF8' }}>
                      {currentTenant.deliveryFee ? `$${currentTenant.deliveryFee.toLocaleString('es-CO')} COP` : 'Gratis'}
                    </strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '1rem', fontWeight: 900 }}>
                  <span style={{ color: 'white' }}>Total a Pagar:</span>
                  <strong style={{ color: 'var(--primary)' }}>${total.toLocaleString('es-CO')} COP</strong>
                </div>
              </div>

              {/* Step 3: Payment Method Selection */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
                  2. Método de Pago Colombia:
                </label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', 
                  gap: '4px', 
                  background: 'rgba(0,0,0,0.3)', 
                  padding: '5px', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255, 255, 255, 0.08)' 
                }}>
                  {[
                    { id: 'wompi', label: '🇨🇴 PSE/Nequi' },
                    { id: 'mercadopago', label: '📱 MercadoPago' },
                    { id: 'card', label: '💳 Tarjeta' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      style={{
                        padding: '8px 2px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        borderRadius: '12px',
                        border: 'none',
                        background: method === item.id || (method === 'wompi' && item.id === 'wompi') ? 'var(--primary)' : 'transparent',
                        color: method === item.id || (method === 'wompi' && item.id === 'wompi') ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        lineHeight: 1.2
                      }}
                      onClick={() => setMethod(item.id as PaymentMethod)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Method Details for Card */}
              {method === 'card' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.25rem' }}>
                  <input
                    placeholder="Número de Tarjeta (4532 ...)"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    style={{ width: '100%' }}
                    required
                  />
                  <input
                    placeholder="Nombre del Titular"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    style={{ width: '100%' }}
                    required
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input
                      placeholder="MM/AA"
                      value={cardExp}
                      onChange={(e) => setCardExp(e.target.value)}
                      required
                    />
                    <input
                      placeholder="CVC / CVV"
                      type="password"
                      maxLength={4}
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Commission Transparency Note */}
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.12)', marginBottom: '1.25rem', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Para el restaurante (97%):</span>
                  <strong style={{ color: '#10B981' }}>${restaurantPayout.toLocaleString('es-CO')} COP</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Comisión GastroSync (3%):</span>
                  <strong style={{ color: '#F59E0B' }}>${platformFee.toLocaleString('es-CO')} COP</strong>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                className="btn btn-secondary btn-full"
                style={{ padding: '14px', fontSize: '0.98rem', fontWeight: 900, borderRadius: '14px' }}
                disabled={loading || isSubmittingOrder}
              >
                {(loading || isSubmittingOrder) ? 'Procesando...' : `Pagar $${total.toLocaleString('es-CO')} COP`}
              </motion.button>

              <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                🔒 Pago procesado de forma segura
              </div>
            </form>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
