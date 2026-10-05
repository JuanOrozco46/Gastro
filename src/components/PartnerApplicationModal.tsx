import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { motion } from 'framer-motion';
import { X, Building2, CheckCircle2, MapPin, Phone, Mail, User, ShieldCheck, Upload, Image, Clock, FileText, AlertCircle } from 'lucide-react';
import type { OrderFulfillment } from '../types';
import { checkDuplicatePendingApplication, uploadApplicationAsset } from '../services/supabaseDataService';

interface PartnerApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PartnerApplicationModal: React.FC<PartnerApplicationModalProps> = ({ isOpen, onClose }) => {
  const { cities, zones, selectedCityId, submitRestaurantApplication } = useApp();

  const activeCities = cities.filter(c => c.isActive);

  const [cityId, setCityId] = useState<string>(() => {
    return selectedCityId || (activeCities.length > 0 ? activeCities[0].id : '');
  });

  const selectedCityName = activeCities.find(c => c.id === cityId)?.name || 'Tu ciudad';

  const cityZones = zones.filter(z => z.cityId === cityId && z.isActive);

  const [zoneId, setZoneId] = useState<string>(() => (cityZones.length > 0 ? cityZones[0].id : ''));

  const handleCityChange = (newCityId: string) => {
    setCityId(newCityId);
    const nextCityZones = zones.filter(z => z.cityId === newCityId && z.isActive);
    setZoneId(nextCityZones.length > 0 ? nextCityZones[0].id : '');
  };

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [category, setCategory] = useState('Hamburguesas');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleHours, setScheduleHours] = useState('');
  const [estimatedDeliveryMinutes, setEstimatedDeliveryMinutes] = useState('');
  const [deliveryModes, setDeliveryModes] = useState<OrderFulfillment[]>(['pickup', 'restaurant_delivery']);
  
  // Asset Uploads
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);

  // Optional fields
  const [whatsapp, setWhatsapp] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('');
  const [notes, setNotes] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrors(prev => ({ ...prev, [type]: 'Solo se permiten imágenes en formato JPG, PNG o WEBP.' }));
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrors(prev => ({ ...prev, [type]: 'La imagen no debe superar los 5MB de tamaño.' }));
      return;
    }

    setErrors(prev => {
      const next = { ...prev };
      delete next[type];
      return next;
    });

    if (type === 'logo') {
      setLogoFile(file);
      setLogoPreviewUrl(URL.createObjectURL(file));
    } else {
      setBannerFile(file);
      setBannerPreviewUrl(URL.createObjectURL(file));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!ownerName.trim()) newErrors.ownerName = 'El nombre del responsable es obligatorio.';
    if (!ownerEmail.trim() || !ownerEmail.includes('@')) newErrors.ownerEmail = 'Ingresa un correo electrónico de contacto válido.';
    if (!ownerPhone.trim()) newErrors.ownerPhone = 'El teléfono de contacto es obligatorio.';
    if (!restaurantName.trim()) newErrors.restaurantName = 'El nombre del restaurante es obligatorio.';
    if (!category.trim()) newErrors.category = 'Selecciona una categoría gastronómica.';
    if (!cityId) newErrors.cityId = 'Selecciona una ciudad válida.';
    if (!zoneId) newErrors.zoneId = 'Selecciona una zona válida.';
    if (!address.trim()) newErrors.address = 'La dirección o referencia comercial es obligatoria.';
    if (deliveryModes.length === 0) newErrors.deliveryModes = 'Selecciona al menos una modalidad de atención.';
    if (!termsAccepted) newErrors.terms = 'Debes aceptar los Términos del Servicio para continuar.';

    if (minOrder !== '' && (isNaN(Number(minOrder)) || Number(minOrder) < 0)) {
      newErrors.minOrder = 'El valor debe ser un número positivo.';
    }

    if (estimatedDeliveryMinutes !== '' && (isNaN(Number(estimatedDeliveryMinutes)) || Number(estimatedDeliveryMinutes) <= 0)) {
      newErrors.estimatedDeliveryMinutes = 'El tiempo estimado debe ser en minutos (ej: 30).';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      // Check duplicate
      const dupCheck = await checkDuplicatePendingApplication(ownerEmail, restaurantName);
      if (dupCheck.isDuplicate) {
        setSubmitError(dupCheck.reason || 'Ya existe una solicitud pendiente con este correo o nombre.');
        setIsSubmitting(false);
        return;
      }

      // Upload assets if provided
      let uploadedLogoUrl: string | undefined;
      let uploadedBannerUrl: string | undefined;

      const tempFolderId = `app_${Date.now()}`;

      if (logoFile) {
        const logoUrl = await uploadApplicationAsset(logoFile, tempFolderId);
        if (logoUrl) uploadedLogoUrl = logoUrl;
      }

      if (bannerFile) {
        const bannerUrl = await uploadApplicationAsset(bannerFile, tempFolderId);
        if (bannerUrl) uploadedBannerUrl = bannerUrl;
      }

      const ok = await submitRestaurantApplication({
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPhone: ownerPhone.trim(),
        restaurantName: restaurantName.trim(),
        category: category.trim(),
        cityId,
        zoneId,
        address: address.trim(),
        description: description.trim() || undefined,
        scheduleHours: scheduleHours.trim() || undefined,
        estimatedDeliveryMinutes: estimatedDeliveryMinutes ? Number(estimatedDeliveryMinutes) : undefined,
        deliveryModes,
        whatsapp: whatsapp.trim() || undefined,
        minOrder: minOrder !== '' ? Number(minOrder) : undefined,
        deliveryFee: deliveryModes.includes('restaurant_delivery') && deliveryFee !== '' ? Number(deliveryFee) : undefined,
        deliveryRadiusKm: deliveryModes.includes('restaurant_delivery') && deliveryRadiusKm !== '' ? Number(deliveryRadiusKm) : undefined,
        logoUrl: uploadedLogoUrl,
        bannerUrl: uploadedBannerUrl,
        notes: notes.trim() || undefined
      });

      if (ok) {
        setSubmittedSuccess(true);
      }
    } catch (err: unknown) {
      console.error('Error submitting application:', err);
      setSubmitError('Ocurrió un error inesperado al enviar la solicitud. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setOwnerName('');
    setOwnerEmail('');
    setOwnerPhone('');
    setRestaurantName('');
    setCategory('Hamburguesas');
    setAddress('');
    setDescription('');
    setScheduleHours('');
    setEstimatedDeliveryMinutes('');
    setDeliveryModes(['pickup', 'restaurant_delivery']);
    setLogoFile(null);
    setBannerFile(null);
    setLogoPreviewUrl(null);
    setBannerPreviewUrl(null);
    setWhatsapp('');
    setMinOrder('');
    setDeliveryFee('');
    setDeliveryRadiusKm('');
    setNotes('');
    setTermsAccepted(false);
    setErrors({});
    setSubmitError(null);
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
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--glass-dark)',
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
              Tu solicitud para vincular el restaurante <strong>{restaurantName}</strong> a la red local de GastroSync en <strong>{selectedCityName}</strong> ha sido recibida correctamente (Estado: <span style={{ color: '#F59E0B', fontWeight: 800 }}>Pendiente de Revisión</span>).
            </p>

            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: 1.5 }}>
              ℹ️ <strong>Siguientes pasos:</strong> El equipo administrativo revisará tu propuesta comercial. Una vez aprobada, recibirás las credenciales de acceso para gestionar tu menú, zonas de despacho y pedidos en tiempo real.
            </div>

            <button
              onClick={handleResetAndClose}
              className="btn btn-primary"
              style={{ padding: '12px 28px', fontSize: '0.95rem', fontWeight: 800, borderRadius: '14px', width: '100%' }}
            >
              Entendido / Cerrar
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'var(--primary-glow)', border: '1px solid var(--primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <Building2 size={24} />
              </div>
              <div>
                <h3 id="partner-modal-title" style={{ margin: 0, color: 'white', fontSize: '1.3rem', fontWeight: 900 }}>
                  Únete como Restaurante Aliado
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Solicitud de vinculación comercial · GastroSync Multi-Ciudad
                </span>
              </div>
            </div>

            {/* Business Disclaimer */}
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '14px', padding: '10px 14px', fontSize: '0.8rem', color: '#FCD34D', marginBottom: '1.25rem', lineHeight: 1.45, display: 'flex', gap: '10px' }}>
              <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#F59E0B' }} />
              <div>
                <strong>Aviso de Revisión Previa:</strong> Registro formal sin contraseña inicial. Tu solicitud será evaluada por el equipo administrativo antes de activar tu perfil de restaurante.
              </div>
            </div>

            {submitError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '14px', padding: '10px 14px', fontSize: '0.82rem', color: '#FCA5A5', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={18} style={{ flexShrink: 0, color: '#EF4444' }} />
                <span>{submitError}</span>
              </div>
            )}

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
                    placeholder="Ej: La Trattoria"
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

              {/* Description */}
              <div>
                <label htmlFor="description" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                  Propuesta Gastronómica / Descripción Corta
                </label>
                <div style={{ position: 'relative' }}>
                  <FileText size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
                  <textarea
                    id="description"
                    rows={2}
                    placeholder="Ej: Hamburguesas artesanales de carne 100% madurada, pan brioche horneado a diario..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Location */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="cityId" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Ciudad de Operación *
                  </label>
                  <select
                    id="cityId"
                    value={cityId}
                    onChange={e => handleCityChange(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {activeCities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="zoneId" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Zona Urbana *
                  </label>
                  <select
                    id="zoneId"
                    value={zoneId}
                    onChange={e => setZoneId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {cityZones.map(z => (
                      <option key={z.id} value={z.id}>Zona {z.name}</option>
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

              {/* Operations & Schedule */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="scheduleHours" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Horario de Atención (Opcional)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Clock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      id="scheduleHours"
                      type="text"
                      placeholder="Ej: Lun-Dom: 11:00 am - 10:00 pm"
                      value={scheduleHours}
                      onChange={e => setScheduleHours(e.target.value)}
                      style={{ width: '100%', paddingLeft: '38px' }}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="estimatedDeliveryMinutes" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Tiempo de Prep. (Minutos, Opcional)
                  </label>
                  <input
                    id="estimatedDeliveryMinutes"
                    type="number"
                    placeholder="Ej: 30"
                    value={estimatedDeliveryMinutes}
                    onChange={e => setEstimatedDeliveryMinutes(e.target.value)}
                    style={{ width: '100%', borderColor: errors.estimatedDeliveryMinutes ? '#EF4444' : undefined }}
                  />
                  {errors.estimatedDeliveryMinutes && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.estimatedDeliveryMinutes}</span>}
                </div>
              </div>

              {/* Branding Image Uploads */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Logo del Restaurante (JPG, PNG, max 5MB)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.2)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <Upload size={16} />
                    <span>{logoFile ? logoFile.name : 'Subir Logo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={e => handleFileChange(e, 'logo')}
                    />
                  </label>
                  {logoPreviewUrl && (
                    <img src={logoPreviewUrl} alt="Logo preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', marginTop: '8px' }} />
                  )}
                  {errors.logo && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.logo}</span>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                    Portada / Banner (JPG, PNG, max 5MB)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.2)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <Image size={16} />
                    <span>{bannerFile ? bannerFile.name : 'Subir Portada'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={e => handleFileChange(e, 'banner')}
                    />
                  </label>
                  {bannerPreviewUrl && (
                    <img src={bannerPreviewUrl} alt="Banner preview" style={{ width: '100px', height: '48px', objectFit: 'cover', borderRadius: '8px', marginTop: '8px' }} />
                  )}
                  {errors.banner && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '2px', display: 'block' }}>{errors.banner}</span>}
                </div>
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
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255, 85, 51, 0.06)', border: '1px solid var(--primary-glass-border)', padding: '12px', borderRadius: '14px' }}
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
                  Comentarios o Notas Adicionales (Opcional)
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

              {/* Terms Checkbox */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <span>
                    Acepto los Términos del Servicio y la tarifa de comisión transparente del <strong>3% por pedido procesado</strong> en GastroSync.
                  </span>
                </label>
                {errors.terms && <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '4px', display: 'block' }}>{errors.terms}</span>}
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{ flex: 1, padding: '12px', borderRadius: '14px', opacity: isSubmitting ? 0.5 : 1 }}
                >
                  Cancelar
                </button>
                <motion.button
                  whileHover={!isSubmitting ? { scale: 1.02 } : {}}
                  whileTap={!isSubmitting ? { scale: 0.98 } : {}}
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ flex: 2, padding: '12px', fontWeight: 900, borderRadius: '14px', opacity: isSubmitting ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  {isSubmitting ? (
                    <>
                      <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
                      Enviando Solicitud...
                    </>
                  ) : (
                    'Enviar Solicitud de Aliado'
                  )}
                </motion.button>
              </div>

            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
};
