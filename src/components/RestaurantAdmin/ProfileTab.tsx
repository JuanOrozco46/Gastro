import React, { useState, useRef } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant, RestaurantHour, RestaurantDeliveryMode } from '../../types';
import { Save, Image as ImageIcon, MapPin, Clock, DollarSign, Settings, Phone, Calendar } from 'lucide-react';
import { uploadMediaFile } from '../../services/supabaseStorageService';

const DAYS_OF_WEEK = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

export const ProfileTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { updateTenant } = useApp();
  
  const [activeSubTab, setActiveSubTab] = useState<'basic' | 'delivery' | 'hours'>('basic');
  
  // Basic info state
  const [formData, setFormData] = useState({
    name: tenant.name || '',
    description: tenant.description || '',
    category: tenant.category || '',
    phone: tenant.phone || '',
    whatsapp: tenant.whatsapp || '',
    address: tenant.address || '',
    logoEmoji: tenant.logoEmoji || '',
    logoUrl: tenant.logoUrl || '',
    bannerUrl: tenant.bannerUrl || '',
    estimatedDeliveryMinutes: tenant.estimatedDeliveryMinutes?.toString() || '30',
    acceptingOrders: tenant.acceptingOrders !== false,
    deliveryFee: tenant.deliveryFee?.toString() || '0',
    minOrder: tenant.minOrder?.toString() || '0',
    deliveryRadiusKm: tenant.deliveryRadiusKm?.toString() || '5',
    specialties: tenant.specialties ? tenant.specialties.join(', ') : '',
  });

  const [deliveryModes, setDeliveryModes] = useState<RestaurantDeliveryMode[]>(
    tenant.deliveryModes || ['pickup', 'restaurant_delivery', 'table_service']
  );

  // Initialize hours from tenant or default array
  const [hours, setHours] = useState<RestaurantHour[]>(() => {
    const defaultHours = DAYS_OF_WEEK.map((_, i) => ({
      restaurantId: tenant.id,
      dayOfWeek: i,
      isOpen: i >= 1 && i <= 6, // Closed Sunday by default
      openTime: '11:00',
      closeTime: '22:00',
    }));

    if (tenant.hours && tenant.hours.length > 0) {
      return DAYS_OF_WEEK.map((_, i) => {
        const existing = tenant.hours!.find(h => h.dayOfWeek === i);
        return existing || defaultHours[i];
      });
    }
    return defaultHours;
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleModeToggle = (mode: RestaurantDeliveryMode) => {
    setDeliveryModes(prev => 
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    );
  };

  const handleHourChange = (dayIndex: number, field: keyof RestaurantHour, value: any) => {
    setHours(prev => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex], [field]: value };
      return updated;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    const setUploading = type === 'profile' ? setUploadingLogo : setUploadingBanner;
    setUploading(true);

    try {
      const res = await uploadMediaFile(file, type, tenant.id);
      if (res.success && res.publicUrl) {
        if (type === 'profile') {
          setFormData(prev => ({ ...prev, logoUrl: res.publicUrl as string }));
        } else {
          setFormData(prev => ({ ...prev, bannerUrl: res.publicUrl as string }));
        }
      } else {
        setErrorMsg(res.error || 'Error al subir el archivo.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al subir el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const validateHours = () => {
    for (const h of hours) {
      if (h.isOpen) {
        if (!h.openTime || !h.closeTime) {
          return `Faltan horas para el día ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
        }
        if (h.openTime >= h.closeTime) {
          if (h.closeTime > '00:00' && h.closeTime <= '05:00') {
             // It's a valid overnight shift
          } else {
            return `El horario de cierre debe ser mayor al de apertura para el día ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
          }
        }
        if (h.openTime2 || h.closeTime2) {
          if (!h.openTime2 || !h.closeTime2) {
            return `Falta completar el segundo turno para el día ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
          }
          if (h.openTime2 >= h.closeTime2) {
             return `El horario de cierre del turno 2 debe ser mayor al de apertura para el día ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
          }
        }
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    const hourError = validateHours();
    if (hourError) {
      setErrorMsg(hourError);
      return;
    }

    setIsSaving(true);
    try {
      await updateTenant(tenant.id, {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        phone: formData.phone,
        whatsapp: formData.whatsapp,
        address: formData.address,
        logoEmoji: formData.logoEmoji,
        logoUrl: formData.logoUrl,
        bannerUrl: formData.bannerUrl,
        estimatedDeliveryMinutes: parseInt(formData.estimatedDeliveryMinutes) || 0,
        acceptingOrders: formData.acceptingOrders,
        deliveryFee: parseFloat(formData.deliveryFee) || 0,
        minOrder: parseFloat(formData.minOrder) || 0,
        deliveryRadiusKm: parseFloat(formData.deliveryRadiusKm) || 0,
        specialties: formData.specialties.split(',').map(s => s.trim()).filter(s => s.length > 0),
        deliveryModes,
        hours
      });
      setSuccessMsg('Perfil guardado exitosamente.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '850px', margin: '0 auto', overflow: 'hidden' }}>
      
      <div style={{ display: 'flex', borderBottom: '1px solid var(--neutral-border)' }}>
        <button 
          type="button" 
          onClick={() => setActiveSubTab('basic')}
          style={{ flex: 1, padding: '1rem', background: 'transparent', border: 'none', borderBottom: activeSubTab === 'basic' ? '3px solid var(--primary)' : '3px solid transparent', color: activeSubTab === 'basic' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Settings size={18} /> Información Básica
        </button>
        <button 
          type="button" 
          onClick={() => setActiveSubTab('delivery')}
          style={{ flex: 1, padding: '1rem', background: 'transparent', border: 'none', borderBottom: activeSubTab === 'delivery' ? '3px solid var(--primary)' : '3px solid transparent', color: activeSubTab === 'delivery' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <MapPin size={18} /> Configuración Operativa
        </button>
        <button 
          type="button" 
          onClick={() => setActiveSubTab('hours')}
          style={{ flex: 1, padding: '1rem', background: 'transparent', border: 'none', borderBottom: activeSubTab === 'hours' ? '3px solid var(--primary)' : '3px solid transparent', color: activeSubTab === 'hours' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Calendar size={18} /> Horarios
        </button>
      </div>

      {errorMsg && (
        <div style={{ margin: '1.5rem 1.5rem 0', padding: '1rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)' }}>
          {errorMsg}
        </div>
      )}
      
      {successMsg && (
        <div style={{ margin: '1.5rem 1.5rem 0', padding: '1rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: '8px', border: '1px solid var(--success-border)' }}>
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* BASIC TAB */}
        {activeSubTab === 'basic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Nombre Comercial</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="gf-input" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Categoría Principal</label>
                <input type="text" name="category" value={formData.category} onChange={handleChange} className="gf-input" required />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Descripción Corta (Bio)</label>
              <textarea name="description" value={formData.description} onChange={handleChange} className="gf-input" style={{ minHeight: '80px' }} maxLength={200} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Teléfono Fijo / Móvil</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Phone size={18} color="var(--text-muted)" />
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="gf-input" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>WhatsApp (Sin +)</label>
                <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange} className="gf-input" placeholder="573001234567" />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Imagen de Portada (Banner)</label>
              <div 
                style={{ 
                  width: '100%', height: '200px', borderRadius: '12px', border: formData.bannerUrl ? 'none' : '2px dashed var(--neutral-border)',
                  backgroundColor: 'var(--surface-color)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
                onClick={() => !uploadingBanner && bannerInputRef.current?.click()}
              >
                {formData.bannerUrl ? (
                  <>
                    <img src={formData.bannerUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Cambiar</button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {uploadingBanner ? <div className="spinner" style={{ margin: '0 auto 8px' }} /> : <ImageIcon size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />}
                    <p style={{ margin: 0 }}>{uploadingBanner ? 'Subiendo...' : 'Haz clic para subir banner'}</p>
                  </div>
                )}
                <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFileUpload(e, 'banner')} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div 
                style={{ 
                  width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--surface-color)', border: '2px dashed var(--neutral-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', position: 'relative', flexShrink: 0
                }}
                onClick={() => !uploadingLogo && logoInputRef.current?.click()}
              >
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  uploadingLogo ? <div className="spinner" /> : <ImageIcon size={24} style={{ opacity: 0.5 }} />
                )}
                <input type="file" ref={logoInputRef} style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFileUpload(e, 'profile')} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px 0' }}>Logo del Restaurante</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Subir Logo</button>
                  {formData.logoUrl && (
                    <button type="button" onClick={() => setFormData(p => ({...p, logoUrl: ''}))} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>Quitar</button>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Emoji Opcional</label>
                <input type="text" name="logoEmoji" value={formData.logoEmoji} onChange={handleChange} className="gf-input" maxLength={2} placeholder="Ej. 🍔" style={{ width: '80px', textAlign: 'center' }} />
              </div>
            </div>
          </div>
        )}

        {/* DELIVERY / OP TAB */}
        {activeSubTab === 'delivery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div style={{ padding: '1rem', backgroundColor: formData.acceptingOrders ? 'var(--success-light)' : 'var(--warning-light)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${formData.acceptingOrders ? 'var(--success-border)' : 'var(--warning-border)'}` }}>
              <div>
                <h4 style={{ margin: 0, color: formData.acceptingOrders ? 'var(--success-text)' : 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {formData.acceptingOrders ? '🟢 Recibiendo Pedidos' : '⏸️ Pausado Temporalmente'}
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {formData.acceptingOrders ? 'El restaurante está visible y permite checkout.' : 'La tienda sigue abierta pero los clientes no pueden completar compras.'}
                </p>
              </div>
              <button type="button" onClick={() => setFormData(prev => ({ ...prev, acceptingOrders: !prev.acceptingOrders }))} className={`btn ${formData.acceptingOrders ? 'btn-secondary' : 'btn-primary'}`}>
                {formData.acceptingOrders ? 'Pausar Recepción' : 'Reanudar'}
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Dirección Física</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange} className="gf-input" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Especialidades (separadas por coma)</label>
              <input type="text" name="specialties" value={formData.specialties} onChange={handleChange} className="gf-input" placeholder="Hamburguesas, Comida Rápida, Parrilla" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Tarifa de Domicilio ($)</label>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input type="number" name="deliveryFee" value={formData.deliveryFee} onChange={handleChange} className="gf-input" style={{ paddingLeft: '36px' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Pedido Mínimo ($)</label>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input type="number" name="minOrder" value={formData.minOrder} onChange={handleChange} className="gf-input" style={{ paddingLeft: '36px' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Tiempo Estimado (Minutos)</label>
                <div style={{ position: 'relative' }}>
                  <Clock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input type="number" name="estimatedDeliveryMinutes" value={formData.estimatedDeliveryMinutes} onChange={handleChange} className="gf-input" style={{ paddingLeft: '36px' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Radio de Cobertura (Km)</label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input type="number" step="0.1" name="deliveryRadiusKm" value={formData.deliveryRadiusKm} onChange={handleChange} className="gf-input" style={{ paddingLeft: '36px' }} />
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Modalidades de Entrega Habilitadas</label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--surface-color)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--neutral-border)' }}>
                  <input type="checkbox" checked={deliveryModes.includes('restaurant_delivery')} onChange={() => handleModeToggle('restaurant_delivery')} />
                  <span>Domicilio (Delivery)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--surface-color)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--neutral-border)' }}>
                  <input type="checkbox" checked={deliveryModes.includes('pickup')} onChange={() => handleModeToggle('pickup')} />
                  <span>Para Recoger (Pickup)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--surface-color)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--neutral-border)' }}>
                  <input type="checkbox" checked={deliveryModes.includes('table_service')} onChange={() => handleModeToggle('table_service')} />
                  <span>A la Mesa (Table Service)</span>
                </label>
              </div>
            </div>
            
          </div>
        )}

        {/* HOURS TAB */}
        {activeSubTab === 'hours' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Configura los horarios en los que el restaurante aparecerá como "Abierto". Zona horaria: Bogotá/Colombia.</p>
            
            {hours.map((hour, index) => (
              <div key={hour.dayOfWeek} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--surface-color)', borderRadius: '12px', border: '1px solid var(--neutral-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={hour.isOpen} 
                      onChange={(e) => handleHourChange(index, 'isOpen', e.target.checked)} 
                      style={{ transform: 'scale(1.2)' }}
                    />
                    {DAYS_OF_WEEK[hour.dayOfWeek]}
                  </label>
                  {!hour.isOpen && <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', background: 'var(--neutral-light)', padding: '2px 8px', borderRadius: '12px' }}>Cerrado</span>}
                </div>

                {hour.isOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginLeft: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Abre:</span>
                      <input type="time" className="gf-input" style={{ width: 'auto', padding: '8px' }} value={hour.openTime || ''} onChange={e => handleHourChange(index, 'openTime', e.target.value)} required />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cierra:</span>
                      <input type="time" className="gf-input" style={{ width: 'auto', padding: '8px' }} value={hour.closeTime || ''} onChange={e => handleHourChange(index, 'closeTime', e.target.value)} required />
                    </div>
                    
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {hour.openTime2 ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Abre 2:</span>
                            <input type="time" className="gf-input" style={{ width: 'auto', padding: '8px' }} value={hour.openTime2} onChange={e => handleHourChange(index, 'openTime2', e.target.value)} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cierra 2:</span>
                            <input type="time" className="gf-input" style={{ width: 'auto', padding: '8px' }} value={hour.closeTime2 || ''} onChange={e => handleHourChange(index, 'closeTime2', e.target.value)} />
                          </div>
                          <button type="button" onClick={() => { handleHourChange(index, 'openTime2', ''); handleHourChange(index, 'closeTime2', ''); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>Quitar</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => { handleHourChange(index, 'openTime2', '18:00'); handleHourChange(index, 'closeTime2', '23:00'); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>+ Agregar segundo turno</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="gf-btn-primary" style={{ padding: '0.75rem 2rem', opacity: isSaving ? 0.7 : 1 }} disabled={isSaving}>
            <Save size={18} /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>

      </form>
    </div>
  );
};
