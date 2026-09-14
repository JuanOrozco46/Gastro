import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { motion } from 'framer-motion';
import { X, Building2, CheckCircle2, MapPin, Phone, Mail, User, ShieldCheck } from 'lucide-react';
import type { OrderFulfillment } from '../types';

interface PartnerApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PartnerApplicationModal: React.FC<PartnerApplicationModalProps> = ({ isOpen, onClose }) => {
  const { zones, submitRestaurantApplication } = useApp();

  // Filter active zones for Armenia
  const armeniaZones = zones.filter(z => z.cityId === 'city_armenia_quindio' && z.isActive);

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [category, setCategory] = useState('Hamburguesas');
  const [zoneId, setZoneId] = useState(() => (armeniaZones.length > 0 ? armeniaZones[0].id : 'zone_armenia_centro'));
  const [address, setAddress] = useState('');
  const [deliveryModes, setDeliveryModes] = useState<OrderFulfillment[]>(['pickup', 'restaurant_delivery']);
  
  // Optional fields
  const [whatsapp, setWhatsapp] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('');
  const [notes, setNotes] = useState('');

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Keyboard shortcut ESC to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleModeToggle = (mode: OrderFulfillment) => {
    setDeliveryModes(prev => {
      if (prev.includes(mode)) {
        return prev.filter(m => m !== mode);
      } else {
        return [...prev, mode];
      }
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!ownerName.trim()) newErrors.ownerName = 'El nombre del responsable es obligatorio.';
    if (!ownerEmail.trim() || !ownerEmail.includes('@')) newErrors.ownerEmail = 'Ingresa un correo electrónico de contacto válido.';
    if (!ownerPhone.trim()) newErrors.ownerPhone = 'El teléfono de contacto es obligatorio.';
    if (!restaurantName.trim()) newErrors.restaurantName = 'El nombre del restaurante es obligatorio.';
    if (!category.trim()) newErrors.category = 'Selecciona una categoría gastronómica.';
    if (!zoneId) newErrors.zoneId = 'Selecciona una zona en Armenia.';
    if (!address.trim()) newErrors.address = 'La dirección o referencia comercial es obligatoria.';
    if (deliveryModes.length === 0) newErrors.deliveryModes = 'Selecciona al menos una modalidad de atención.';

    if (minOrder !== '' && (isNaN(Number(minOrder)) || Number(minOrder) < 0)) {
      newErrors.minOrder = 'El valor debe ser un número positivo.';
    }

    if (deliveryModes.includes('restaurant_delivery')) {
      if (deliveryFee !== '' && (isNaN(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
        newErrors.deliveryFee = 'La tarifa debe ser un número positivo.';
      }
      if (deliveryRadiusKm !== '' && (isNaN(Number(deliveryRadiusKm)) || Number(deliveryRadiusKm) < 0)) {
        newErrors.deliveryRadiusKm = 'El radio debe ser un número positivo.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const ok = submitRestaurantApplication({
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim(),
      ownerPhone: ownerPhone.trim(),
      restaurantName: restaurantName.trim(),
      category: category.trim(),
      zoneId,
      address: address.trim(),
      deliveryModes,
      whatsapp: whatsapp.trim() || undefined,
      minOrder: minOrder !== '' ? Number(minOrder) : undefined,
      deliveryFee: deliveryModes.includes('restaurant_delivery') && deliveryFee !== '' ? Number(deliveryFee) : undefined,
      deliveryRadiusKm: deliveryModes.includes('restaurant_delivery') && deliveryRadiusKm !== '' ? Number(deliveryRadiusKm) : undefined,
      notes: notes.trim() || undefined
    });

    if (ok) {
      setSubmittedSuccess(true);
    }
  };

  const handleResetAndClose = () => {
    setOwnerName('');
    setOwnerEmail('');
    setOwnerPhone('');
    setRestaurantName('');
    setCategory('Hamburguesas');
    setAddress('');
    setDeliveryModes(['pickup', 'restaurant_delivery']);
    setWhatsapp('');
    setMinOrder('');
    setDeliveryFee('');
    setDeliveryRadiusKm('');
    setNotes('');
    setErrors({});
    setSubmittedSuccess(false);
    onClose();
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(8, 12, 20, 0.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="card"
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '28px',
          padding: '2rem',
          position: 'relative'
        }}
      >
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
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </button>

        {submittedSuccess ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <CheckCircle2 size={36} />
            </div>

            <h3 id="partner-modal-title" style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', marginBottom: '10px' }}>
              🎉 ¡Solicitud Registrada con Éxito!
            </h3>

            <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Tu solicitud para vincular el restaurante <strong>{restaurantName}</strong> a la red local de GastroSync en Armenia, Quindío ha sido recibida correctamente (Estado: <span style={{ color: '#F59E0B', fontWeight: 800 }}>Pendiente de Revisión</span>).
            </p>

            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: 1.5 }}>
              ℹ️ <strong>Estado de Solicitud:</strong> Tu solicitud fue recibida y quedará pendiente de revisión antes de activar el restaurante.
            </div>

            <button
              onClick={handleResetAndClose}
              className="btn btn-primary"
              style={{ padding: '12px 28px', fontSize: '0.95rem', fontWeight: 800, borderRadius: '14px', width: '100%' }}
            >
              Volver al Inicio de Sesión
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'rgba(255, 85, 51, 0.15)', border: '1px solid rgba(255, 85, 51, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <Building2 size={24} />
              </div>
              <div>
                <h3 id="partner-modal-title" style={{ margin: 0, color: 'white', fontSize: '1.3rem', fontWeight: 900 }}>
                  Únete como Restaurante Aliado
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Solicitud de vinculación comercial · GastroSync Armenia, Quindío
                </span>
              </div>
            </div>

            {/* Business Disclaimer */}
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '14px', padding: '10px 14px', fontSize: '0.8rem', color: '#FCD34D', marginBottom: '1.25rem', lineHeight: 1.45, display: 'flex', gap: '10px' }}>
              <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#F59E0B' }} />
              <div>
                <strong>Aviso de Revisión Previa:</strong> El envío de este formulario registra tu solicitud en estado pendiente. La información ingresada quedará sujeta a revisión antes de activar el restaurante.
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Owner Info Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="ownerName" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Nombre del Responsable *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      id="ownerName"
                      type="text"
                      placeholder="Ej: Carlos Gómez"
                      value={ownerName}
                      onChange={e => setOwnerName(e.target.value)}
                      style={{ width: '100%', paddingLeft: '38px', borderColor: errors.ownerName ? '#EF4444' : undefined }}
                    />
                  </div>
                  {errors.ownerName && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.ownerName}</span>}
                </div>

                <div>
                  <label htmlFor="ownerPhone" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Teléfono de Contacto *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      id="ownerPhone"
                      type="tel"
                      placeholder="Ej: (300) 123-4567"
                      value={ownerPhone}
                      onChange={e => setOwnerPhone(e.target.value)}
                      style={{ width: '100%', paddingLeft: '38px', borderColor: errors.ownerPhone ? '#EF4444' : undefined }}
                    />
                  </div>
                  {errors.ownerPhone && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.ownerPhone}</span>}
                </div>
              </div>

              <div>
                <label htmlFor="ownerEmail" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                  Correo Electrónico de Contacto *
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="ownerEmail"
                    type="email"
                    placeholder="contacto@turestaurante.co"
                    value={ownerEmail}
                    onChange={e => setOwnerEmail(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', borderColor: errors.ownerEmail ? '#EF4444' : undefined }}
                  />
                </div>
                {errors.ownerEmail && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.ownerEmail}</span>}
              </div>

              {/* Restaurant Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="restaurantName" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Nombre del Restaurante *
                  </label>
                  <input
                    id="restaurantName"
                    type="text"
                    placeholder="Ej: La Trattoria Armenia"
                    value={restaurantName}
                    onChange={e => setRestaurantName(e.target.value)}
                    style={{ width: '100%', borderColor: errors.restaurantName ? '#EF4444' : undefined }}
                  />
                  {errors.restaurantName && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.restaurantName}</span>}
                </div>

                <div>
                  <label htmlFor="category" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Categoría Gastronómica *
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="Hamburguesas">Hamburguesas</option>
                    <option value="Italiana">Italiana / Pasta</option>
                    <option value="Pizzería">Pizzería</option>
                    <option value="Mexicana">Mexicana / Tacos</option>
                    <option value="Asiática">Asiática / Sushi</option>
                    <option value="Típica">Típica / Parrilla</option>
                    <option value="Postres">Postres / Repostería</option>
                    <option value="Cafetería">Cafetería / Panadería</option>
                    <option value="Otra">Otra propuesta</option>
                  </select>
                </div>
              </div>

              {/* Location */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="cityDisplay" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Ciudad (Fija)
                  </label>
                  <input
                    id="cityDisplay"
                    type="text"
                    value="Armenia, Quindío"
                    disabled
                    style={{ width: '100%', opacity: 0.7, background: 'rgba(255,255,255,0.05)' }}
                  />
                </div>

                <div>
                  <label htmlFor="zoneId" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Zona de Armenia *
                  </label>
                  <select
                    id="zoneId"
                    value={zoneId}
                    onChange={e => setZoneId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {armeniaZones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="address" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                  Dirección o Referencia Comercial *
                </label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="address"
                    type="text"
                    placeholder="Ej: Carrera 14 # 19-25, Sector Norte"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', borderColor: errors.address ? '#EF4444' : undefined }}
                  />
                </div>
                {errors.address && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.address}</span>}
              </div>

              {/* Delivery Modes Checkboxes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '6px' }}>
                  Modalidades de Atención Ofrecidas * (Selecciona al menos 1)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${deliveryModes.includes('pickup') ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`, padding: '8px 12px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.82rem', color: 'white' }}>
                    <input
                      type="checkbox"
                      checked={deliveryModes.includes('pickup')}
                      onChange={() => handleModeToggle('pickup')}
                    />
                    <span>🛍️ Recogida en local</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${deliveryModes.includes('restaurant_delivery') ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`, padding: '8px 12px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.82rem', color: 'white' }}>
                    <input
                      type="checkbox"
                      checked={deliveryModes.includes('restaurant_delivery')}
                      onChange={() => handleModeToggle('restaurant_delivery')}
                    />
                    <span>🛵 Entrega propia del restaurante</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${deliveryModes.includes('table_service') ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`, padding: '8px 12px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.82rem', color: 'white' }}>
                    <input
                      type="checkbox"
                      checked={deliveryModes.includes('table_service')}
                      onChange={() => handleModeToggle('table_service')}
                    />
                    <span>🍽️ Servicio en mesa (QR)</span>
                  </label>
                </div>
                {errors.deliveryModes && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '4px', display: 'block' }}>{errors.deliveryModes}</span>}
              </div>

              {/* Conditional Delivery Fee & Radius */}
              {deliveryModes.includes('restaurant_delivery') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255, 85, 51, 0.06)', border: '1px solid rgba(255, 85, 51, 0.2)', padding: '12px', borderRadius: '14px' }}
                >
                  <div>
                    <label htmlFor="deliveryFee" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                      Tarifa de Entrega (COP, Opcional)
                    </label>
                    <input
                      id="deliveryFee"
                      type="number"
                      placeholder="Ej: 4000"
                      value={deliveryFee}
                      onChange={e => setDeliveryFee(e.target.value)}
                      style={{ width: '100%', borderColor: errors.deliveryFee ? '#EF4444' : undefined }}
                    />
                    {errors.deliveryFee && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.deliveryFee}</span>}
                  </div>

                  <div>
                    <label htmlFor="deliveryRadiusKm" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                      Radio de Cobertura (Km, Opcional)
                    </label>
                    <input
                      id="deliveryRadiusKm"
                      type="number"
                      step="0.5"
                      placeholder="Ej: 5"
                      value={deliveryRadiusKm}
                      onChange={e => setDeliveryRadiusKm(e.target.value)}
                      style={{ width: '100%', borderColor: errors.deliveryRadiusKm ? '#EF4444' : undefined }}
                    />
                    {errors.deliveryRadiusKm && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.deliveryRadiusKm}</span>}
                  </div>
                </motion.div>
              )}

              {/* Optional Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="whatsapp" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    WhatsApp de Pedidos (Opcional)
                  </label>
                  <input
                    id="whatsapp"
                    type="tel"
                    placeholder="Ej: +57 300 123 4567"
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label htmlFor="minOrder" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Pedido Mínimo (COP, Opcional)
                  </label>
                  <input
                    id="minOrder"
                    type="number"
                    placeholder="Ej: 20000"
                    value={minOrder}
                    onChange={e => setMinOrder(e.target.value)}
                    style={{ width: '100%', borderColor: errors.minOrder ? '#EF4444' : undefined }}
                  />
                  {errors.minOrder && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.minOrder}</span>}
                </div>
              </div>

              <div>
                <label htmlFor="notes" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                  Comentarios o Mensaje para GastroSync (Opcional)
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  placeholder="Cuéntanos brevemente sobre tu carta, especialidades o inquietudes..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={onClose}
                  style={{ flex: 1, padding: '12px', borderRadius: '14px' }}
                >
                  Cancelar
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2, padding: '12px', fontWeight: 900, borderRadius: '14px' }}
                >
                  Enviar Solicitud de Aliado
                </motion.button>
              </div>

            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
};
