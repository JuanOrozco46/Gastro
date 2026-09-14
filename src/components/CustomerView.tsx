import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { PaymentModal } from './PaymentModal';
import { QrCode, Bike, Scan, ShieldCheck, CreditCard, Link } from 'lucide-react';

export const CustomerView: React.FC = () => {
  const { products, currentTenant, cart, addToCart } = useApp();
  const [tableNumber] = useState('4');
  const [mode, setMode] = useState<'dine_in' | 'delivery'>('dine_in');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const tenantProducts = products.filter(p => p.tenantId === currentTenant.id && p.available);
  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const cartQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const dynamicUrl = mode === 'dine_in'
    ? `gastrosync.app/r/${currentTenant.slug}/table/${tableNumber}`
    : `gastrosync.app/r/${currentTenant.slug}/delivery`;

  return (
    <div className="tab-content active">
      <div className="grid-2">
        {/* Left Explanation Column */}
        <div>
          <h2>📱 Experiencia del Cliente (Pasarela Multicanal)</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Escaneo QR de mesa con **Apple Pay, Google Pay, Tarjetas y Wompi/MercadoPago**. Transacciones con split automático de comisiones ($97\%$ al comercio, $3\%$ a la red).
          </p>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <div className="card-title"><QrCode size={20} /> Ruteo de Mesa & Pago</div>
              <span className="badge badge-secondary">{currentTenant.name}</span>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--neutral-border)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link size={16} style={{ color: 'var(--secondary)' }} />
              <code style={{ color: 'var(--tertiary)', fontSize: '0.85rem' }}>
                https://{dynamicUrl}
              </code>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className={`btn ${mode === 'dine_in' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setMode('dine_in')}
              >
                <Scan size={16} /> QR Mesa #{tableNumber}
              </button>
              <button
                className={`btn ${mode === 'delivery' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setMode('delivery')}
              >
                <Bike size={16} /> Pedir a Domicilio
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title"><ShieldCheck size={20} /> Ventaja del Motor de Pagos</div>
            </div>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <li><strong>Split Automático Inmediato:</strong> El 97% del monto se transfiere a la cuenta bancaria del restaurante.</li>
              <li><strong>Soporte Biométrico Completo:</strong> Apple Pay / Google Pay en 1 solo clic.</li>
              <li><strong>Transparencia Bancaria:</strong> Códigos de autorización únicos por pedido.</li>
            </ul>
          </div>
        </div>

        {/* Right Phone Simulator */}
        <div className="phone-simulator-container">
          <div className="phone-frame">
            <div className="phone-notch"></div>
            <div className="phone-screen">

              {/* Phone Screen Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                    {currentTenant.name}
                  </span>
                  <h3 style={{ fontSize: '1rem', color: 'white' }}>
                    {mode === 'dine_in' ? `Mesa #${tableNumber} • QR Activo` : 'Domicilio Directo'}
                  </h3>
                </div>
                <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '0.75rem' }}>
                  {currentTenant.category}
                </div>
              </div>

              {/* Product List inside Phone */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                {tenantProducts.map(product => (
                  <div key={product.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--neutral-border)', borderRadius: '12px', padding: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ width: '50px', height: '50px', background: '#2a3447', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                      {product.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '0.875rem', color: 'white', margin: 0 }}>{product.name}</h4>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '2px 0 4px', lineHeight: 1.2 }}>{product.desc}</p>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tertiary)' }}>
                        ${product.price.toLocaleString('es-CO')}
                      </span>
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                      onClick={() => addToCart(product)}
                    >
                      + Añadir
                    </button>
                  </div>
                ))}
              </div>

              {/* Cart Footer inside Phone */}
              <div style={{ marginTop: 'auto', background: 'rgba(30, 38, 56, 0.95)', border: '1px solid var(--neutral-border)', borderRadius: '16px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total ({cartQty} items):</span>
                  <strong style={{ color: 'white' }}>${cartTotal.toLocaleString('es-CO')} COP</strong>
                </div>

                <button
                  className="btn btn-secondary btn-full"
                  disabled={cart.length === 0}
                  onClick={() => setIsPaymentOpen(true)}
                >
                  <CreditCard size={16} /> Abrir Pasarela de Pago
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        orderType={mode === 'dine_in' ? `Mesa #${tableNumber}` : 'Domicilio'}
      />
    </div>
  );
};
