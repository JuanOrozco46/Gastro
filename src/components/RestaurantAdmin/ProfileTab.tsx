import React, { useState, useRef } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant } from '../../types';
import { Save, X, Image as ImageIcon } from 'lucide-react';
import { uploadMediaFile } from '../../services/supabaseStorageService';

export const ProfileTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { updateTenant } = useApp();
  
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
    acceptingOrders: tenant.acceptingOrders !== false
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
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
      
      {errorMsg && (
        <div style={{ margin: '1.5rem 1.5rem 0', padding: '1rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)' }}>
          {errorMsg}
        </div>
      )}

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
                : 'La tienda sigue abierta pero los clientes no pueden completar compras.'}
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
        
        {/* Banner */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Imagen de Portada (Banner)</label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '1rem' }}>Sube una imagen horizontal (recomendado 1200x400px, max 5MB). Formatos: JPG, PNG, WebP.</p>
          
          <div 
            style={{ 
              width: '100%', 
              height: '200px', 
              borderRadius: '12px', 
              border: formData.bannerUrl ? 'none' : '2px dashed var(--neutral-border)',
              backgroundColor: 'var(--surface-color)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            onClick={() => !uploadingBanner && bannerInputRef.current?.click()}
          >
            {formData.bannerUrl ? (
              <>
                <img src={formData.bannerUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Cambiar</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setFormData(p => ({...p, bannerUrl: ''})); }} style={{ background: 'rgba(239,68,68,0.8)', color: 'white', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}><X size={16} /></button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                {uploadingBanner ? <div className="spinner" style={{ margin: '0 auto 8px' }} /> : <ImageIcon size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />}
                <p style={{ margin: 0 }}>{uploadingBanner ? 'Subiendo...' : 'Haz clic para subir banner'}</p>
              </div>
            )}
            <input 
              type="file" 
              ref={bannerInputRef} 
              style={{ display: 'none' }} 
              accept="image/jpeg,image/png,image/webp" 
              onChange={(e) => handleFileUpload(e, 'banner')}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          {/* Logo */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Foto de Perfil / Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div 
                style={{ 
                  width: '80px', height: '80px', borderRadius: '50%', 
                  backgroundColor: 'var(--surface-color)', border: '2px dashed var(--neutral-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  cursor: 'pointer', position: 'relative', flexShrink: 0
                }}
                onClick={() => !uploadingLogo && logoInputRef.current?.click()}
              >
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  uploadingLogo ? <div className="spinner" /> : <ImageIcon size={24} style={{ opacity: 0.5 }} />
                )}
                <input 
                  type="file" 
                  ref={logoInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/jpeg,image/png,image/webp" 
                  onChange={(e) => handleFileUpload(e, 'profile')}
                />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', margin: '0 0 8px 0' }}>Formato cuadrado recomendado. Max 2MB.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Subir Logo</button>
                  {formData.logoUrl && (
                    <button type="button" onClick={() => setFormData(p => ({...p, logoUrl: ''}))} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>Quitar</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Emoji Fallback */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Emoji Opcional (Fallback)</label>
            <input type="text" name="logoEmoji" value={formData.logoEmoji} onChange={handleChange} className="gf-input" maxLength={2} placeholder="Ej. 🍔" />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '4px' }}>Se mostrará si no hay logo.</p>
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
