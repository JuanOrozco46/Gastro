import React, { useState, useRef } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant, RestaurantHour, RestaurantDeliveryMode } from '../../types';
import {
  Save,
  Image as ImageIcon,
  MapPin,
  Clock,
  DollarSign,
  Settings,
  Phone,
  Calendar,
  Store,
  FileText,
  Sparkles,
  Check,
  AlertCircle,
  CheckCircle2,
  Bike,
  ShoppingBag,
  QrCode,
  Copy,
  Plus,
  Trash2,
  Upload
} from 'lucide-react';
import { uploadMediaFile } from '../../services/supabaseStorageService';

const DAYS_OF_WEEK = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado'
];

const CATEGORY_PRESETS = [
  { label: '🍔 Hamburguesas', value: 'Hamburguesas' },
  { label: '🍕 Pizzería', value: 'Pizzería' },
  { label: '🥩 Parrilla & Carnes', value: 'Parrilla & Carnes' },
  { label: '🍣 Sushi & Asiática', value: 'Sushi & Asiática' },
  { label: '🌮 Mexicana', value: 'Comida Mexicana' },
  { label: '🍗 Pollo & Alitas', value: 'Pollo & Alitas' },
  { label: '🥗 Saludable & Bowls', value: 'Saludable & Bowls' },
  { label: '☕ Café & Postres', value: 'Café & Postres' },
  { label: '🍲 Típica Colombiana', value: 'Típica Colombiana' },
  { label: '🥖 Panadería Artesanal', value: 'Artesanal' }
];

export const ProfileTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { updateTenant, showToast } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'all' | 'basic' | 'delivery' | 'hours'>('all');

  const [formData, setFormData] = useState({
    name: tenant.name || '',
    description: tenant.description || '',
    category: tenant.category || 'Hamburguesas',
    phone: tenant.phone || '',
    whatsapp: tenant.whatsapp || '',
    address: tenant.address || '',
    logoEmoji: tenant.logoEmoji || '🍽️',
    logoUrl: tenant.logoUrl || '',
    bannerUrl: tenant.bannerUrl || '',
    estimatedDeliveryMinutes: tenant.estimatedDeliveryMinutes?.toString() || '30',
    acceptingOrders: tenant.acceptingOrders !== false,
    tableServiceEnabled: tenant.tableServiceEnabled !== false,
    acceptsCash: tenant.acceptsCash !== false,
    deliveryFee: tenant.deliveryFee?.toString() || '0',
    minOrder: tenant.minOrder?.toString() || '0',
    deliveryRadiusKm: tenant.deliveryRadiusKm?.toString() || '5',
    specialties: tenant.specialties ? tenant.specialties.join(', ') : ''
  });

  const [deliveryModes, setDeliveryModes] = useState<RestaurantDeliveryMode[]>(
    tenant.deliveryModes || ['pickup', 'restaurant_delivery', 'table_service']
  );

  const [hours, setHours] = useState<RestaurantHour[]>(() => {
    const defaultHours = DAYS_OF_WEEK.map((_, i) => ({
      restaurantId: tenant.id,
      dayOfWeek: i,
      isOpen: i >= 1 && i <= 6,
      openTime: '11:00',
      closeTime: '22:00'
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleModeToggle = (mode: RestaurantDeliveryMode) => {
    setDeliveryModes(prev =>
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    );
  };

  const handleHourChange = (
    dayIndex: number,
    field: keyof RestaurantHour,
    value: string | boolean
  ) => {
    setHours(prev => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex], [field]: value };
      return updated;
    });
  };

  const copyMondayToWeekdays = () => {
    const monday = hours[1];
    if (!monday) return;
    setHours(prev =>
      prev.map((h, idx) =>
        idx >= 1 && idx <= 5
          ? {
              ...h,
              isOpen: monday.isOpen,
              openTime: monday.openTime,
              closeTime: monday.closeTime,
              openTime2: monday.openTime2,
              closeTime2: monday.closeTime2
            }
          : h
      )
    );
    showToast('Horario del lunes aplicado de lunes a viernes.');
  };

  const copyMondayToAllDays = () => {
    const monday = hours[1];
    if (!monday) return;
    setHours(prev =>
      prev.map(h => ({
        ...h,
        isOpen: monday.isOpen,
        openTime: monday.openTime,
        closeTime: monday.closeTime,
        openTime2: monday.openTime2,
        closeTime2: monday.closeTime2
      }))
    );
    showToast('Horario del lunes aplicado a todos los días de la semana.');
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'profile' | 'banner'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    const setUploading = type === 'profile' ? setUploadingLogo : setUploadingBanner;
    setUploading(true);

    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const maxMB = type === 'profile' ? 5 : 12;
      const compressed = await compressImage(file, maxMB);
      const res = await uploadMediaFile(compressed.file, type, tenant.id);
      if (res.success && res.publicUrl) {
        const uploadedUrl = res.publicUrl;
        if (type === 'profile') {
          setFormData(prev => ({ ...prev, logoUrl: uploadedUrl }));
          await updateTenant(tenant.id, { logoUrl: uploadedUrl });
          showToast('Logo del restaurante actualizado y publicado.');
        } else {
          setFormData(prev => ({ ...prev, bannerUrl: uploadedUrl }));
          await updateTenant(tenant.id, { bannerUrl: uploadedUrl });
          showToast('Portada del restaurante actualizada y publicada.');
        }
      } else {
        setErrorMsg(res.error || 'Error al subir la imagen.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const validateHours = () => {
    for (const h of hours) {
      if (h.isOpen) {
        if (!h.openTime || !h.closeTime) {
          return `Faltan horas de apertura o cierre para el día ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
        }
        if (h.openTime >= h.closeTime) {
          if (h.closeTime > '00:00' && h.closeTime <= '05:00') {
            // Turno nocturno válido
          } else {
            return `El horario de cierre debe ser posterior al de apertura el día ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
          }
        }
        if (h.openTime2 || h.closeTime2) {
          if (!h.openTime2 || !h.closeTime2) {
            return `Completa ambos campos del segundo turno en ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
          }
          if (h.openTime2 >= h.closeTime2) {
            return `El horario de cierre del turno 2 debe ser posterior al de apertura en ${DAYS_OF_WEEK[h.dayOfWeek]}.`;
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

    if (!formData.name.trim()) {
      setErrorMsg('El nombre comercial del restaurante es obligatorio.');
      return;
    }

    if (deliveryModes.length === 0) {
      setErrorMsg('Selecciona al menos una modalidad de atención.');
      return;
    }

    const hourError = validateHours();
    if (hourError) {
      setErrorMsg(hourError);
      return;
    }

    setIsSaving(true);
    try {
      await updateTenant(tenant.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category.trim(),
        phone: formData.phone.trim(),
        whatsapp: formData.whatsapp.trim(),
        address: formData.address.trim(),
        logoEmoji: formData.logoEmoji || '🍽️',
        logoUrl: formData.logoUrl,
        bannerUrl: formData.bannerUrl,
        estimatedDeliveryMinutes: parseInt(formData.estimatedDeliveryMinutes) || 0,
        acceptingOrders: formData.acceptingOrders,
        tableServiceEnabled: formData.tableServiceEnabled,
        acceptsCash: formData.acceptsCash,
        deliveryFee: parseFloat(formData.deliveryFee) || 0,
        minOrder: parseFloat(formData.minOrder) || 0,
        deliveryRadiusKm: parseFloat(formData.deliveryRadiusKm) || 0,
        specialties: formData.specialties
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0),
        deliveryModes,
        hours
      });
      setSuccessMsg('¡Perfil, configuración operativa y horarios actualizados exitosamente!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error guardando el perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const step1Done = Boolean(
    formData.name.trim() && formData.category.trim() && (formData.phone.trim() || formData.whatsapp.trim())
  );
  const step2Done = Boolean(formData.address.trim() && deliveryModes.length > 0);
  const openDaysCount = hours.filter(h => h.isOpen).length;
  const step3Done = openDaysCount > 0 && !validateHours();

  const completedSteps = [step1Done, step2Done, step3Done].filter(Boolean).length;
  const progressPct = Math.round((completedSteps / 3) * 100);

  return (
    <div className="rpa-card">
      {/* Header Editorial */}
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <Store size={22} />
          </div>
          <div>
            <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
              <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Configuración Integral del Comercio
            </span>
            <h3 className="rpa-card-title">Perfil Comercial, Operación y Horarios</h3>
            <p className="rpa-card-subtitle">
              Personaliza la imagen de <strong>{tenant.name}</strong>, modalidades de entrega y turnos semanales.
            </p>
          </div>
        </div>

        <div style={{ minWidth: '210px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
            <span>Ficha completada</span>
            <strong style={{ color: 'var(--primary)' }}>{completedSteps}/3 secciones ({progressPct}%)</strong>
          </div>
          <div style={{ height: '7px', borderRadius: '999px', background: 'var(--neutral-border)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, var(--primary), #10B981)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      </div>

      {/* Sub-navigation bar */}
      <div className="rpa-subtabs">
        <button
          type="button"
          className={`rpa-subtab ${activeSubTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('all')}
        >
          <Sparkles size={15} /> Vista Completa (3 pasos)
        </button>
        <button
          type="button"
          className={`rpa-subtab ${activeSubTab === 'basic' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('basic')}
        >
          <Settings size={15} /> 1. Identidad y Marca
          {step1Done && (
            <span className="rpa-subtab-check">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
        </button>
        <button
          type="button"
          className={`rpa-subtab ${activeSubTab === 'delivery' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('delivery')}
        >
          <MapPin size={15} /> 2. Operación y Domicilios
          {step2Done && (
            <span className="rpa-subtab-check">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
        </button>
        <button
          type="button"
          className={`rpa-subtab ${activeSubTab === 'hours' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('hours')}
        >
          <Calendar size={15} /> 3. Horarios ({openDaysCount} días)
          {step3Done && (
            <span className="rpa-subtab-check">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="rpa-card-body">
          {errorMsg && (
            <div className="pam-callout error" role="alert">
              <AlertCircle size={18} />
              <div>
                <strong>Revisa la información antes de guardar</strong>
                <div>{errorMsg}</div>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="pam-callout success" role="status">
              <CheckCircle2 size={18} />
              <div>
                <strong>Cambios guardados</strong>
                <div>{successMsg}</div>
              </div>
            </div>
          )}

          {/* ── SECCIÓN 1: IDENTIDAD Y MARCA ── */}
          {(activeSubTab === 'all' || activeSubTab === 'basic') && (
            <section className="pam-section">
              <div className="pam-section-head">
                <div className={`pam-step ${step1Done ? 'done' : ''}`}>
                  {step1Done ? <Check size={15} strokeWidth={3} /> : 1}
                </div>
                <div>
                  <h4>Identidad Visual y Datos del Restaurante</h4>
                  <p>Así verán tu marca los clientes en el feed gastronómico y en tu perfil público.</p>
                </div>
              </div>

              {/* Uploads: Logo + Portada */}
              <div className="pam-uploads">
                <div className="pam-field">
                  <label>
                    Logo Comercial <span className="pam-opt">Cuadrado</span>
                  </label>
                  <div
                    className={`pam-drop ${formData.logoUrl ? 'has-file' : ''}`}
                    onClick={() => !uploadingLogo && logoInputRef.current?.click()}
                  >
                    {formData.logoUrl ? (
                      <>
                        <img src={formData.logoUrl} alt="Logo" />
                        <span className="pam-drop-change">
                          {uploadingLogo ? 'Subiendo...' : 'Cambiar'}
                        </span>
                      </>
                    ) : (
                      <div className="pam-drop-empty">
                        <Upload size={22} />
                        <strong>{uploadingLogo ? 'Optimizando...' : 'Subir Logo'}</strong>
                        <span>JPG, PNG o WEBP</span>
                      </div>
                    )}
                    <input
                      type="file"
                      ref={logoInputRef}
                      style={{ display: 'none' }}
                      accept="image/jpeg,image/png,image/webp"
                      onChange={e => handleFileUpload(e, 'profile')}
                    />
                  </div>
                  {formData.logoUrl && (
                    <button
                      type="button"
                      className="urm-avatar-remove"
                      style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                      onClick={() => setFormData(prev => ({ ...prev, logoUrl: '' }))}
                    >
                      <Trash2 size={12} /> Quitar logo
                    </button>
                  )}
                </div>

                <div className="pam-field">
                  <label>
                    Portada / Banner del Restaurante <span className="pam-opt">Horizontal 16:9</span>
                  </label>
                  <div
                    className={`pam-drop ${formData.bannerUrl ? 'has-file' : ''}`}
                    onClick={() => !uploadingBanner && bannerInputRef.current?.click()}
                  >
                    {formData.bannerUrl ? (
                      <>
                        <img src={formData.bannerUrl} alt="Portada" />
                        <span className="pam-drop-change">
                          {uploadingBanner ? 'Subiendo...' : 'Cambiar portada'}
                        </span>
                      </>
                    ) : (
                      <div className="pam-drop-empty">
                        <ImageIcon size={24} />
                        <strong>{uploadingBanner ? 'Optimizando...' : 'Subir Imagen de Portada'}</strong>
                        <span>Destaca tu plato estrella o ambiente del local (JPG, PNG, WEBP)</span>
                      </div>
                    )}
                    <input
                      type="file"
                      ref={bannerInputRef}
                      style={{ display: 'none' }}
                      accept="image/jpeg,image/png,image/webp"
                      onChange={e => handleFileUpload(e, 'banner')}
                    />
                  </div>
                </div>
              </div>

              {/* Nombre, Emoji y Teléfonos */}
              <div className="pam-grid">
                <div className="pam-field">
                  <label>
                    Nombre Comercial <em>*</em>
                  </label>
                  <div className="pam-input-wrap">
                    <Store size={16} className="pam-icon" />
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="pam-input"
                      placeholder="Ej. La Burguesía Artesanal"
                      required
                    />
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Emoji Distintivo <span className="pam-opt">Avatar rápido</span>
                  </label>
                  <div className="pam-input-wrap">
                    <input
                      type="text"
                      name="logoEmoji"
                      value={formData.logoEmoji}
                      onChange={handleChange}
                      className="pam-input no-icon"
                      maxLength={2}
                      placeholder="🍔"
                      style={{ textAlign: 'center', fontSize: '1.15rem' }}
                    />
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Teléfono de Contacto <em>*</em>
                  </label>
                  <div className="pam-input-wrap">
                    <Phone size={16} className="pam-icon" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="pam-input"
                      placeholder="Ej. 300 123 4567"
                    />
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    WhatsApp de Pedidos <span className="pam-opt">Con código de país</span>
                  </label>
                  <div className="pam-input-wrap">
                    <Phone size={16} className="pam-icon" />
                    <input
                      type="tel"
                      name="whatsapp"
                      value={formData.whatsapp}
                      onChange={handleChange}
                      className="pam-input"
                      placeholder="Ej. 573001234567"
                    />
                  </div>
                </div>

                {/* Categoría con chips */}
                <div className="pam-field pam-span-2">
                  <label>
                    Categoría Gastronómica Principal <em>*</em>
                  </label>
                  <div className="pam-chips">
                    {CATEGORY_PRESETS.map(preset => (
                      <button
                        key={preset.value}
                        type="button"
                        className={`pam-chip ${formData.category === preset.value ? 'active' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, category: preset.value }))}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="pam-input-wrap" style={{ marginTop: '6px' }}>
                    <Store size={16} className="pam-icon" />
                    <input
                      type="text"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="pam-input"
                      placeholder="O escribe otra categoría personalizada..."
                      required
                    />
                  </div>
                </div>

                {/* Descripción / Bio */}
                <div className="pam-field pam-span-2">
                  <label>
                    Historia / Descripción Corta (Bio) <span className="pam-opt">Máx. 200 caracteres</span>
                  </label>
                  <div className="pam-input-wrap">
                    <FileText size={16} className="pam-icon top" />
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      className="pam-input"
                      rows={3}
                      maxLength={200}
                      placeholder="Cuéntale a tus clientes qué hace única tu cocina, tus ingredientes o tu especialidad..."
                    />
                  </div>
                  <span className="pam-hint">{formData.description.length}/200 caracteres</span>
                </div>

                {/* Especialidades */}
                <div className="pam-field pam-span-2">
                  <label>
                    Especialidades de la Casa <span className="pam-opt">Separadas por coma</span>
                  </label>
                  <div className="pam-input-wrap">
                    <Sparkles size={16} className="pam-icon" />
                    <input
                      type="text"
                      name="specialties"
                      value={formData.specialties}
                      onChange={handleChange}
                      className="pam-input"
                      placeholder="Ej. Hamburguesas maduradas, Papas rústicas, Malteadas artesanales"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── SECCIÓN 2: OPERACIÓN, DOMICILIOS Y PAGOS ── */}
          {(activeSubTab === 'all' || activeSubTab === 'delivery') && (
            <section className="pam-section">
              <div className="pam-section-head">
                <div className={`pam-step ${step2Done ? 'done' : ''}`}>
                  {step2Done ? <Check size={15} strokeWidth={3} /> : 2}
                </div>
                <div>
                  <h4>Configuración Operativa, Modalidades y Tarifas</h4>
                  <p>Controla en tiempo real los canales de atención, costos de envío y métodos de pago.</p>
                </div>
              </div>

              {/* Interruptores operativos */}
              <div className="rpa-switch-grid">
                <div className={`rpa-switch-card ${formData.acceptingOrders ? 'on' : 'off'}`}>
                  <div className="rpa-switch-info">
                    <h5>
                      {formData.acceptingOrders ? '🟢 Recepción de Pedidos Activa' : '⏸️ Pedidos Pausados'}
                    </h5>
                    <p>
                      {formData.acceptingOrders
                        ? 'Los clientes pueden finalizar pedidos desde el feed y tu menú.'
                        : 'Tu perfil sigue visible pero el checkout está pausado temporalmente.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`rpa-toggle-pill ${formData.acceptingOrders ? 'on' : ''}`}
                    onClick={() =>
                      setFormData(prev => ({ ...prev, acceptingOrders: !prev.acceptingOrders }))
                    }
                    aria-label="Alternar recepción de pedidos"
                  >
                    <div className="rpa-toggle-knob" />
                  </button>
                </div>

                <div className={`rpa-switch-card ${formData.tableServiceEnabled ? 'on' : 'off'}`}>
                  <div className="rpa-switch-info">
                    <h5>
                      {formData.tableServiceEnabled ? '🍽️ Servicio en Mesa QR Activo' : '🚫 Servicio en Mesa Inactivo'}
                    </h5>
                    <p>
                      {formData.tableServiceEnabled
                        ? 'Los códigos QR en tus mesas permiten ordenar directo a cocina.'
                        : 'Al escanear el QR se indicará que el pedido en mesa está deshabilitado.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`rpa-toggle-pill ${formData.tableServiceEnabled ? 'on' : ''}`}
                    onClick={() =>
                      setFormData(prev => ({
                        ...prev,
                        tableServiceEnabled: !prev.tableServiceEnabled
                      }))
                    }
                    aria-label="Alternar servicio a la mesa"
                  >
                    <div className="rpa-toggle-knob" />
                  </button>
                </div>

                <div className={`rpa-switch-card ${formData.acceptsCash ? 'on' : 'off'}`}>
                  <div className="rpa-switch-info">
                    <h5>
                      {formData.acceptsCash ? '💵 Pago en Efectivo Habilitado' : '💳 Solo Pagos Digitales'}
                    </h5>
                    <p>
                      {formData.acceptsCash
                        ? 'Los clientes pueden elegir pagar en efectivo contra entrega o en mesa.'
                        : 'Solo se aceptarán pagos electrónicos en línea (Wompi / Tarjeta / PSE).'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`rpa-toggle-pill ${formData.acceptsCash ? 'on' : ''}`}
                    onClick={() =>
                      setFormData(prev => ({ ...prev, acceptsCash: !prev.acceptsCash }))
                    }
                    aria-label="Alternar pago en efectivo"
                  >
                    <div className="rpa-toggle-knob" />
                  </button>
                </div>
              </div>

              {/* Modalidades de Entrega */}
              <div className="pam-field">
                <label>
                  Modalidades de Atención Habilitadas <em>*</em>
                </label>
                <div className="pam-modes">
                  <button
                    type="button"
                    className={`pam-mode ${deliveryModes.includes('restaurant_delivery') ? 'active' : ''}`}
                    onClick={() => handleModeToggle('restaurant_delivery')}
                  >
                    <div className="pam-mode-icon">
                      <Bike size={20} />
                    </div>
                    <div className="pam-mode-check">
                      {deliveryModes.includes('restaurant_delivery') && <Check size={12} strokeWidth={3} />}
                    </div>
                    <strong>Domicilio Propio</strong>
                    <span>Envías con tus propios domiciliarios</span>
                  </button>

                  <button
                    type="button"
                    className={`pam-mode ${deliveryModes.includes('pickup') ? 'active' : ''}`}
                    onClick={() => handleModeToggle('pickup')}
                  >
                    <div className="pam-mode-icon">
                      <ShoppingBag size={20} />
                    </div>
                    <div className="pam-mode-check">
                      {deliveryModes.includes('pickup') && <Check size={12} strokeWidth={3} />}
                    </div>
                    <strong>Recoger en Local</strong>
                    <span>El cliente pasa por su pedido</span>
                  </button>

                  <button
                    type="button"
                    className={`pam-mode ${deliveryModes.includes('table_service') ? 'active' : ''}`}
                    onClick={() => handleModeToggle('table_service')}
                  >
                    <div className="pam-mode-icon">
                      <QrCode size={20} />
                    </div>
                    <div className="pam-mode-check">
                      {deliveryModes.includes('table_service') && <Check size={12} strokeWidth={3} />}
                    </div>
                    <strong>Servicio en Mesa QR</strong>
                    <span>Pedidos desde las mesas del local</span>
                  </button>
                </div>
              </div>

              {/* Dirección y Parámetros de Envío */}
              <div className="pam-grid">
                <div className="pam-field pam-span-2">
                  <label>
                    Dirección Física del Local <em>*</em>
                  </label>
                  <div className="pam-input-wrap">
                    <MapPin size={16} className="pam-icon" />
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="pam-input"
                      placeholder="Ej. Cra 14 # 19-20, Barrio Norte, Armenia"
                      required
                    />
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Tarifa de Domicilio <span className="pam-opt">COP</span>
                  </label>
                  <div className="pam-input-wrap">
                    <DollarSign size={16} className="pam-icon" />
                    <input
                      type="number"
                      name="deliveryFee"
                      value={formData.deliveryFee}
                      onChange={handleChange}
                      className="pam-input with-suffix"
                      min="0"
                      step="500"
                    />
                    <span className="pam-suffix">COP</span>
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Pedido Mínimo <span className="pam-opt">COP</span>
                  </label>
                  <div className="pam-input-wrap">
                    <DollarSign size={16} className="pam-icon" />
                    <input
                      type="number"
                      name="minOrder"
                      value={formData.minOrder}
                      onChange={handleChange}
                      className="pam-input with-suffix"
                      min="0"
                      step="1000"
                    />
                    <span className="pam-suffix">COP</span>
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Tiempo Estimado de Entrega <span className="pam-opt">Minutos</span>
                  </label>
                  <div className="pam-input-wrap">
                    <Clock size={16} className="pam-icon" />
                    <input
                      type="number"
                      name="estimatedDeliveryMinutes"
                      value={formData.estimatedDeliveryMinutes}
                      onChange={handleChange}
                      className="pam-input with-suffix"
                      min="5"
                    />
                    <span className="pam-suffix">min</span>
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Radio de Cobertura <span className="pam-opt">Kilómetros</span>
                  </label>
                  <div className="pam-input-wrap">
                    <MapPin size={16} className="pam-icon" />
                    <input
                      type="number"
                      step="0.5"
                      name="deliveryRadiusKm"
                      value={formData.deliveryRadiusKm}
                      onChange={handleChange}
                      className="pam-input with-suffix"
                      min="0.5"
                    />
                    <span className="pam-suffix">km</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── SECCIÓN 3: HORARIOS DE ATENCIÓN ── */}
          {(activeSubTab === 'all' || activeSubTab === 'hours') && (
            <section className="pam-section">
              <div className="pam-section-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div className={`pam-step ${step3Done ? 'done' : ''}`}>
                    {step3Done ? <Check size={15} strokeWidth={3} /> : 3}
                  </div>
                  <div>
                    <h4>Horarios de Atención por Día</h4>
                    <p>Configura apertura, cierre y doble turno (ej. almuerzo y cena). Zona horaria: Colombia.</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="pam-chip"
                    onClick={copyMondayToWeekdays}
                    title="Copia el horario configurado en Lunes a Martes, Miércoles, Jueves y Viernes"
                  >
                    <Copy size={13} /> Copiar Lunes a Lun–Vie
                  </button>
                  <button
                    type="button"
                    className="pam-chip"
                    onClick={copyMondayToAllDays}
                    title="Copia el horario configurado en Lunes a los 7 días"
                  >
                    <Copy size={13} /> Copiar Lunes a toda la semana
                  </button>
                </div>
              </div>

              <div className="rpa-hours-list">
                {hours.map((hour, index) => (
                  <div
                    key={hour.dayOfWeek}
                    className={`rpa-hour-row ${hour.isOpen ? 'open' : 'closed'}`}
                  >
                    <div className="rpa-hour-top">
                      <div
                        className="rpa-day-label"
                        onClick={() => handleHourChange(index, 'isOpen', !hour.isOpen)}
                      >
                        <button
                          type="button"
                          className={`rpa-toggle-pill ${hour.isOpen ? 'on' : ''}`}
                          aria-label={`Alternar ${DAYS_OF_WEEK[hour.dayOfWeek]}`}
                        >
                          <div className="rpa-toggle-knob" />
                        </button>
                        <span>{DAYS_OF_WEEK[hour.dayOfWeek]}</span>
                        <span className={`rpa-badge ${hour.isOpen ? 'success' : 'neutral'}`}>
                          {hour.isOpen ? 'Abierto' : 'Cerrado'}
                        </span>
                      </div>

                      {hour.isOpen && !hour.openTime2 && (
                        <button
                          type="button"
                          className="pam-chip"
                          style={{ padding: '5px 11px', fontSize: '0.74rem' }}
                          onClick={() => {
                            handleHourChange(index, 'openTime2', '18:00');
                            handleHourChange(index, 'closeTime2', '23:00');
                          }}
                        >
                          <Plus size={13} /> Agregar 2° turno (Cena)
                        </button>
                      )}
                    </div>

                    {hour.isOpen && (
                      <div className="rpa-hour-slots">
                        <div className="rpa-time-box">
                          <Clock size={14} style={{ color: 'var(--primary)' }} />
                          <span>Abre:</span>
                          <input
                            type="time"
                            value={hour.openTime || ''}
                            onChange={e => handleHourChange(index, 'openTime', e.target.value)}
                            required
                          />
                        </div>

                        <div className="rpa-time-box">
                          <span>Cierra:</span>
                          <input
                            type="time"
                            value={hour.closeTime || ''}
                            onChange={e => handleHourChange(index, 'closeTime', e.target.value)}
                            required
                          />
                        </div>

                        {hour.openTime2 && (
                          <>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', marginLeft: '6px' }}>
                              2° Turno:
                            </span>
                            <div className="rpa-time-box">
                              <span>Abre:</span>
                              <input
                                type="time"
                                value={hour.openTime2}
                                onChange={e => handleHourChange(index, 'openTime2', e.target.value)}
                              />
                            </div>
                            <div className="rpa-time-box">
                              <span>Cierra:</span>
                              <input
                                type="time"
                                value={hour.closeTime2 || ''}
                                onChange={e => handleHourChange(index, 'closeTime2', e.target.value)}
                              />
                            </div>
                            <button
                              type="button"
                              className="urm-avatar-remove"
                              onClick={() => {
                                handleHourChange(index, 'openTime2', '');
                                handleHourChange(index, 'closeTime2', '');
                              }}
                            >
                              <Trash2 size={12} /> Quitar 2° turno
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer de Guardado */}
        <div className="pam-footer">
          <div className="pam-footer-hint">
            Editando perfil oficial de <strong>{tenant.name}</strong> · Los cambios se reflejan al instante en el feed.
          </div>
          <div className="pam-footer-actions">
            <button
              type="submit"
              className="pam-btn-primary"
              disabled={isSaving || uploadingLogo || uploadingBanner}
            >
              <Save size={17} />
              <span>{isSaving ? 'Guardando cambios...' : 'Guardar Perfil y Horarios'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
