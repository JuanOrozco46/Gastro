import React, { useState } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant } from '../../types';
import { Save } from 'lucide-react';

export const ProfileTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { updateTenant } = useApp();
  
  const [formData, setFormData] = useState({
    name: tenant.name || '',
    description: tenant.description || '',
    category: tenant.category || '',
    phone: tenant.phone || '',
    whatsapp: tenant.whatsapp || '',
    address: tenant.address || '',
    logoEmoji: tenant.logoEmoji || '🍽️',
    logoUrl: tenant.logoUrl || '',
    bannerUrl: tenant.bannerUrl || '',
    estimatedDeliveryMinutes: tenant.estimatedDeliveryMinutes?.toString() || '30',
    acceptingOrders: tenant.acceptingOrders !== false
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateTenant(tenant.id, {
      ...formData,
      estimatedDeliveryMinutes: parseInt(formData.estimatedDeliveryMinutes) || 0
    });
  };

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="card-header">
        <h3 className="card-title">Perfil Público del Restaurante</h3>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Basic Info */}
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', textAlign: 'right', marginTop: '4px' }}>
            {formData.description.length}/200
          </div>
        </div>

        <div style={{ padding: '1rem', backgroundColor: formData.acceptingOrders ? 'var(--success-light)' : 'var(--warning-light)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${formData.acceptingOrders ? 'var(--success-border)' : 'var(--warning-border)'}` }}>
          <div>
            <h4 style={{ margin: 0, color: formData.acceptingOrders ? 'var(--success-text)' : 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {formData.acceptingOrders ? '🟢 Recibiendo Pedidos' : '⏸️ Pausado Temporalmente'}
            </h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {formData.acceptingOrders 
                ? 'El restaurante está visible y permite checkout.' 
                : 'La tienda sigue abierta pero los clientes no pueden completar compras. Útil si la cocina está saturada.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, acceptingOrders: !prev.acceptingOrders }))}
            className={`btn ${formData.acceptingOrders ? 'btn-secondary' : 'btn-primary'}`}
          >
            {formData.acceptingOrders ? 'Pausar Recepción' : 'Reanudar'}
          </button>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--neutral-border)', margin: '0.5rem 0' }} />

        {/* Contact Info */}
        <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Contacto y Ubicación</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Dirección / Sede</label>
            <input type="text" name="address" value={formData.address} onChange={handleChange} className="gf-input" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Tiempo de Entrega (Minutos)</label>
            <input type="number" name="estimatedDeliveryMinutes" value={formData.estimatedDeliveryMinutes} onChange={handleChange} className="gf-input" min="0" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Teléfono Fijo / Móvil</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="gf-input" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>WhatsApp (Sin +)</label>
            <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange} className="gf-input" />
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--neutral-border)', margin: '0.5rem 0' }} />

        {/* Media Info */}
        <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Identidad Visual</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Emoji del Local</label>
            <input type="text" name="logoEmoji" value={formData.logoEmoji} onChange={handleChange} className="gf-input" maxLength={2} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '4px' }}>Un solo emoji representativo (ej. 🍔).</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>URL Imagen de Portada (Banner)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="url" name="bannerUrl" value={formData.bannerUrl} onChange={handleChange} className="gf-input" placeholder="https://..." />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '4px' }}>Temporalmente por URL externa.</p>
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="gf-btn-primary" style={{ padding: '0.75rem 2rem' }}>
            <Save size={18} /> Guardar Cambios
          </button>
        </div>

      </form>
    </div>
  );
};
