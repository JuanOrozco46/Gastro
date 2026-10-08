import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { motion } from 'framer-motion';
import { X, CheckCircle2, MapPin, Phone, Mail, User, ShieldCheck, Upload, Image, Clock, FileText, AlertCircle, Lock, Eye, EyeOff, Store, Sparkles, Check, ShoppingBag, Bike, QrCode } from 'lucide-react';
import type { OrderFulfillment } from '../types';
import { PLATFORM_COMMISSION_RATE } from '../services/supabaseDataService';
import {
  validateEmail,
  validateName,
  validatePhone,
  validateRequired,
  validateRegisterPassword,
  validatePasswordConfirm,
  evaluatePasswordStrength
} from '../utils/formValidation';

interface PartnerApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PartnerApplicationModal: React.FC<PartnerApplicationModalProps> = ({ isOpen, onClose }) => {
  const { cities, zones, selectedCityId, authMode, registerAccount, submitRestaurantApplication } = useApp();

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
    clearFieldError('cityId');
    clearFieldError('zoneId');
  };

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);

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

  // States para compresión
  const [logoCompression, setLogoCompression] = useState<{ original: number, final: number } | null>(null);
  const [bannerCompression, setBannerCompression] = useState<{ original: number, final: number } | null>(null);

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordStrength = evaluatePasswordStrength(ownerPassword);

  const clearFieldError = (field: string) => {
    setErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const computeFieldError = (field: string): string | null => {
    switch (field) {
      case 'ownerName':
        return validateName(ownerName);
      case 'ownerEmail':
        return validateEmail(ownerEmail);
      case 'ownerPhone':
        return validatePhone(ownerPhone);
      case 'ownerPassword':
        return authMode === 'remote' ? validateRegisterPassword(ownerPassword) : null;
      case 'ownerPasswordConfirm':
        return authMode === 'remote' ? validatePasswordConfirm(ownerPassword, ownerPasswordConfirm) : null;
      case 'restaurantName':
        return validateRequired(restaurantName, 'El nombre del restaurante');
      case 'category':
        return validateRequired(category, 'La categoría gastronómica');
      case 'cityId':
        return validateRequired(cityId, 'La ciudad de operación');
      case 'zoneId':
        return validateRequired(zoneId, 'La zona urbana');
      case 'address':
        return validateRequired(address, 'La dirección o referencia comercial');
      case 'estimatedDeliveryMinutes':
        if (estimatedDeliveryMinutes !== '' && (isNaN(Number(estimatedDeliveryMinutes)) || Number(estimatedDeliveryMinutes) <= 0)) {
          return 'El tiempo estimado debe ser en minutos (ej: 30).';
        }
        return null;
      case 'deliveryFee':
        if (deliveryModes.includes('restaurant_delivery') && deliveryFee !== '' && (isNaN(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
          return 'La tarifa debe ser un número positivo.';
        }
        return null;
      case 'deliveryRadiusKm':
        if (deliveryModes.includes('restaurant_delivery') && deliveryRadiusKm !== '' && (isNaN(Number(deliveryRadiusKm)) || Number(deliveryRadiusKm) < 0)) {
          return 'El radio debe ser un número positivo.';
        }
        return null;
      case 'minOrder':
        if (minOrder !== '' && (isNaN(Number(minOrder)) || Number(minOrder) < 0)) {
          return 'El valor debe ser un número positivo.';
        }
        return null;
      default:
        return null;
    }
  };

  const handleFieldBlur = (field: string) => {
    const err = computeFieldError(field);
    setErrors(prev => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  };

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
      const next = prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode];
      if (next.length > 0) clearFieldError('deliveryModes');
      return next;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrors(prev => ({ ...prev, [type]: 'Solo se permiten imágenes en formato JPG, PNG o WEBP. No se admiten SVG, GIF o ejecutables.' }));
      return;
    }

    const { compressImage } = await import('../utils/imageCompression');
    
    // Limits: Logo 5MB, Banner 12MB
    const maxMB = type === 'logo' ? 5 : 12;
    const MAX_SIZE = maxMB * 1024 * 1024;
    
    // First, try compressing if valid image
    const result = await compressImage(file, maxMB);
    const finalFile = result.file;

    if (finalFile.size > MAX_SIZE) {
      setErrors(prev => ({ ...prev, [type]: `La imagen no debe superar los ${maxMB}MB de tamaño (actual: ${(finalFile.size/1024/1024).toFixed(1)}MB).` }));
      return;
    }

    clearFieldError(type);

    if (type === 'logo') {
      setLogoFile(finalFile);
      setLogoPreviewUrl(URL.createObjectURL(finalFile));
      if (result.compressed) setLogoCompression({ original: result.originalSize, final: result.finalSize });
      else setLogoCompression(null);
    } else {
      setBannerFile(finalFile);
      setBannerPreviewUrl(URL.createObjectURL(finalFile));
      if (result.compressed) setBannerCompression({ original: result.originalSize, final: result.finalSize });
      else setBannerCompression(null);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    const fieldsToCheck = [
      'ownerName',
      'ownerEmail',
      'ownerPhone',
      'ownerPassword',
      'ownerPasswordConfirm',
      'restaurantName',
      'category',
      'cityId',
      'zoneId',
      'address',
      'estimatedDeliveryMinutes',
      'deliveryFee',
      'deliveryRadiusKm',
      'minOrder',
    ];

    for (const f of fieldsToCheck) {
      const err = computeFieldError(f);
      if (err) newErrors[f] = err;
    }

    if (deliveryModes.length === 0) newErrors.deliveryModes = 'Selecciona al menos una modalidad de atención.';
    if (!termsAccepted) newErrors.terms = 'Debes aceptar los Términos del Servicio para continuar.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setAccountNotice(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      // 1) Si estamos en modo remoto, crear la cuenta de acceso del propietario
      if (authMode === 'remote') {
        const regRes = await registerAccount(ownerName.trim(), ownerEmail.trim(), ownerPassword, 'client_delivery');
        if (typeof regRes === 'object' && regRes !== null && !regRes.success) {
          const isAlreadyRegistered = /ya existe|ya se encuentra registrado|already registered|already exists/i.test(regRes.error || '');
          if (isAlreadyRegistered) {
            setAccountNotice('Ya tienes una cuenta; la solicitud se vinculará a tu correo.');
            setAccountCreated(false);
          } else {
            setSubmitError(regRes.error || 'No se pudo crear tu cuenta de acceso.');
            return;
          }
        } else {
          setAccountCreated(true);
        }
      }

      // 2) Enviar solicitud del restaurante; las imágenes (opcionales) se suben después con URLs firmadas.
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
        notes: notes.trim() || undefined,
        commissionRateAccepted: termsAccepted ? PLATFORM_COMMISSION_RATE : undefined,
        termsVersion: '2026-10'
      }, { logo: logoFile, banner: bannerFile });

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
    setOwnerPassword('');
    setOwnerPasswordConfirm('');
    setShowOwnerPassword(false);
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
    setLogoCompression(null);
    setBannerCompression(null);
    setErrors({});
    setSubmitError(null);
    setAccountNotice(null);
    setAccountCreated(false);
    setSubmittedSuccess(false);
    onClose();
  };


  /* ── Progreso de campos obligatorios ── */
  const requiredChecks: boolean[] = [
    !validateName(ownerName),
    !validatePhone(ownerPhone),
    !validateEmail(ownerEmail),
    ...(authMode === 'remote'
      ? [!validateRegisterPassword(ownerPassword), !validatePasswordConfirm(ownerPassword, ownerPasswordConfirm)]
      : []),
    !!restaurantName.trim(),
    !!address.trim(),
    deliveryModes.length > 0,
    termsAccepted,
  ];
  const completed = requiredChecks.filter(Boolean).length;
  const progress = Math.round((completed / requiredChecks.length) * 100);

  const ownerDone = !validateName(ownerName) && !validatePhone(ownerPhone) && !validateEmail(ownerEmail);
  const accountDone = !validateRegisterPassword(ownerPassword) && !validatePasswordConfirm(ownerPassword, ownerPasswordConfirm);
  const restaurantDone = !!restaurantName.trim() && !!category;
  const locationDone = !!cityId && !!zoneId && !!address.trim();

  const stepOffset = authMode === 'remote' ? 1 : 0;

  const onDropFile = (e: React.DragEvent<HTMLLabelElement>, type: 'logo' | 'banner') => {
    e.preventDefault();
    if (!e.dataTransfer.files?.length) return;
    handleFileChange({ target: { files: e.dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>, type);
  };

  const inputCls = (name: string, extra = '') => `pam-input ${errors[name] ? 'has-error' : ''} ${extra}`;

  return (
    <div
      className="pam-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="pam-modal"
      >
        {/* ── Header ── */}
        <header className="pam-header">
          <div className="pam-header-glow" />
          <button type="button" onClick={onClose} className="pam-close" aria-label="Cerrar modal">
            <X size={18} />
          </button>
          <div className="pam-header-row">
            <div className="pam-header-icon"><Store size={24} /></div>
            <div>
              <span className="pam-eyebrow">Programa de Aliados · GastroSync</span>
              <h3 id="partner-modal-title">
                {submittedSuccess ? '¡Solicitud enviada!' : 'Registra tu restaurante'}
              </h3>
              {!submittedSuccess && (
                <p>Llega a más clientes en {selectedCityName}. Completa el formulario en menos de 5 minutos.</p>
              )}
            </div>
          </div>

          {!submittedSuccess && (
            <>
              <div className="pam-benefits">
                <span><Sparkles size={13} /> Sin mensualidad</span>
                <span><ShieldCheck size={13} /> Comisión del 3%</span>
                <span><Clock size={13} /> Revisión en 24–48 h</span>
              </div>
              <div className="pam-progress">
                <div className="pam-progress-label">
                  <span>Progreso del formulario</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="pam-progress-track">
                  <motion.div className="pam-progress-fill" animate={{ width: `${progress}%` }} transition={{ duration: 0.35 }} />
                </div>
              </div>
            </>
          )}
        </header>

        {submittedSuccess ? (
          /* ── Pantalla de éxito ── */
          <div className="pam-body pam-success">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="pam-success-icon"
            >
              <CheckCircle2 size={40} />
            </motion.div>
            <p className="pam-success-lead">
              Recibimos la solicitud de <strong>{restaurantName}</strong> en <strong>{selectedCityName}</strong>.
              Estado actual: <span className="pam-badge-pending">Pendiente de revisión</span>
            </p>

            {accountNotice && (
              <div className="pam-callout info"><Lock size={16} /><span><strong>Cuenta existente:</strong> {accountNotice}</span></div>
            )}
            {accountCreated && (
              <div className="pam-callout success">
                <Mail size={16} />
                <span><strong>Cuenta creada para {ownerEmail}.</strong> Revisa tu bandeja de entrada para confirmar tu correo.</span>
              </div>
            )}

            <ol className="pam-timeline">
              <li className="done">
                <span className="dot"><Check size={12} strokeWidth={3} /></span>
                <div><strong>Solicitud enviada</strong><p>Tus datos llegaron correctamente.</p></div>
              </li>
              <li className="current">
                <span className="dot" />
                <div><strong>Revisión del equipo</strong><p>Validamos tu información en 24–48 horas hábiles.</p></div>
              </li>
              <li>
                <span className="dot" />
                <div>
                  <strong>Activación</strong>
                  <p>
                    {authMode === 'remote'
                      ? 'Tu cuenta quedará vinculada como propietario para gestionar menú y pedidos.'
                      : 'Recibirás tus credenciales para gestionar menú y pedidos.'}
                  </p>
                </div>
              </li>
            </ol>

            <button type="button" onClick={handleResetAndClose} className="pam-btn-primary pam-btn-block">
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="pam-form">
            <div className="pam-body">
              {submitError && (
                <div role="alert" className="pam-callout error"><AlertCircle size={16} /><span>{submitError}</span></div>
              )}

              {/* 1. Responsable */}
              <section className="pam-section">
                <SectionHead step={1} title="Datos del responsable" desc="Persona de contacto para la revisión de la solicitud." done={ownerDone} />
                <div className="pam-grid">
                  <div className="pam-field">
                    <label htmlFor="ownerName">Nombre completo <em>*</em></label>
                    <div className="pam-input-wrap">
                      <User size={16} className="pam-icon" />
                      <input id="ownerName" type="text" placeholder="Ej: Carlos Gómez" value={ownerName}
                        onChange={e => { setOwnerName(e.target.value); clearFieldError('ownerName'); }}
                        onBlur={() => handleFieldBlur('ownerName')}
                        aria-invalid={!!errors.ownerName} aria-describedby={errors.ownerName ? 'ownerName-error' : undefined}
                        className={inputCls('ownerName')} />
                    </div>
                    <FieldError name="ownerName" error={errors.ownerName} />
                  </div>
                  <div className="pam-field">
                    <label htmlFor="ownerPhone">Teléfono <em>*</em></label>
                    <div className="pam-input-wrap">
                      <Phone size={16} className="pam-icon" />
                      <input id="ownerPhone" type="tel" placeholder="Ej: 300 123 4567" value={ownerPhone}
                        onChange={e => { setOwnerPhone(e.target.value); clearFieldError('ownerPhone'); }}
                        onBlur={() => handleFieldBlur('ownerPhone')}
                        aria-invalid={!!errors.ownerPhone} aria-describedby={errors.ownerPhone ? 'ownerPhone-error' : undefined}
                        className={inputCls('ownerPhone')} />
                    </div>
                    <FieldError name="ownerPhone" error={errors.ownerPhone} />
                  </div>
                  <div className="pam-field pam-span-2">
                    <label htmlFor="ownerEmail">Correo electrónico <em>*</em></label>
                    <div className="pam-input-wrap">
                      <Mail size={16} className="pam-icon" />
                      <input id="ownerEmail" type="email" placeholder="contacto@turestaurante.co" value={ownerEmail}
                        onChange={e => { setOwnerEmail(e.target.value); clearFieldError('ownerEmail'); }}
                        onBlur={() => handleFieldBlur('ownerEmail')}
                        aria-invalid={!!errors.ownerEmail} aria-describedby={errors.ownerEmail ? 'ownerEmail-error' : undefined}
                        className={inputCls('ownerEmail')} />
                    </div>
                    <FieldError name="ownerEmail" error={errors.ownerEmail} />
                  </div>
                </div>
              </section>

              {/* 2. Cuenta de acceso */}
              {authMode === 'remote' && (
                <section className="pam-section">
                  <SectionHead step={2} title="Tu cuenta de acceso" desc="Con esta contraseña administrarás tu restaurante cuando sea aprobado." done={accountDone} />
                  <div className="pam-grid">
                    <div className="pam-field">
                      <label htmlFor="ownerPassword">Contraseña <em>*</em></label>
                      <div className="pam-input-wrap">
                        <Lock size={16} className="pam-icon" />
                        <input id="ownerPassword" type={showOwnerPassword ? 'text' : 'password'} placeholder="Mínimo 8 caracteres"
                          value={ownerPassword}
                          onChange={e => { setOwnerPassword(e.target.value); clearFieldError('ownerPassword'); }}
                          onBlur={() => { handleFieldBlur('ownerPassword'); if (ownerPasswordConfirm) handleFieldBlur('ownerPasswordConfirm'); }}
                          aria-invalid={!!errors.ownerPassword} aria-describedby={errors.ownerPassword ? 'ownerPassword-error' : undefined}
                          className={inputCls('ownerPassword', 'with-toggle')} />
                        <button type="button" className="pam-toggle" onClick={() => setShowOwnerPassword(v => !v)}
                          aria-label={showOwnerPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                          {showOwnerPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <FieldError name="ownerPassword" error={errors.ownerPassword} />
                    </div>
                    <div className="pam-field">
                      <label htmlFor="ownerPasswordConfirm">Confirmar contraseña <em>*</em></label>
                      <div className="pam-input-wrap">
                        <Lock size={16} className="pam-icon" />
                        <input id="ownerPasswordConfirm" type={showOwnerPassword ? 'text' : 'password'} placeholder="Repite tu contraseña"
                          value={ownerPasswordConfirm}
                          onChange={e => { setOwnerPasswordConfirm(e.target.value); clearFieldError('ownerPasswordConfirm'); }}
                          onBlur={() => handleFieldBlur('ownerPasswordConfirm')}
                          aria-invalid={!!errors.ownerPasswordConfirm} aria-describedby={errors.ownerPasswordConfirm ? 'ownerPasswordConfirm-error' : undefined}
                          className={inputCls('ownerPasswordConfirm')} />
                      </div>
                      <FieldError name="ownerPasswordConfirm" error={errors.ownerPasswordConfirm} />
                    </div>
                  </div>

                  {ownerPassword.length > 0 && (
                    <div className="pam-strength">
                      <div className="pam-strength-bars">
                        {[0, 1, 2, 3, 4].map(i => (
                          <span key={i} style={{ background: i < passwordStrength.score ? passwordStrength.color : undefined }} />
                        ))}
                      </div>
                      <div className="pam-strength-row">
                        <strong style={{ color: passwordStrength.color }}>Seguridad: {passwordStrength.label}</strong>
                      </div>
                      <ul className="pam-checks">
                        {passwordStrength.checks.map((c, i) => (
                          <li key={i} className={c.passed ? 'ok' : ''}>
                            {c.passed ? <Check size={12} strokeWidth={3} /> : <span className="pam-check-dot" />} {c.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {/* 3. Restaurante */}
              <section className="pam-section">
                <SectionHead step={2 + stepOffset} title="Tu restaurante" desc="Así te verán los clientes en GastroSync." done={restaurantDone} />
                <div className="pam-field">
                  <label htmlFor="restaurantName">Nombre del restaurante <em>*</em></label>
                  <div className="pam-input-wrap">
                    <Store size={16} className="pam-icon" />
                    <input id="restaurantName" type="text" placeholder="Ej: La Trattoria" value={restaurantName}
                      onChange={e => { setRestaurantName(e.target.value); clearFieldError('restaurantName'); }}
                      onBlur={() => handleFieldBlur('restaurantName')}
                      aria-invalid={!!errors.restaurantName} aria-describedby={errors.restaurantName ? 'restaurantName-error' : undefined}
                      className={inputCls('restaurantName')} />
                  </div>
                  <FieldError name="restaurantName" error={errors.restaurantName} />
                </div>

                <div className="pam-field">
                  <label>Categoría gastronómica <em>*</em></label>
                  <div className="pam-chips" role="radiogroup" aria-label="Categoría gastronómica">
                    {CATEGORIES.map(c => (
                      <button key={c.value} type="button" role="radio" aria-checked={category === c.value}
                        className={`pam-chip ${category === c.value ? 'active' : ''}`}
                        onClick={() => { setCategory(c.value); clearFieldError('category'); }}>
                        <span>{c.emoji}</span> {c.label}
                      </button>
                    ))}
                  </div>
                  <FieldError name="category" error={errors.category} />
                </div>

                <div className="pam-field">
                  <label htmlFor="description">Descripción corta <span className="pam-opt">Opcional</span></label>
                  <div className="pam-input-wrap">
                    <FileText size={16} className="pam-icon top" />
                    <textarea id="description" rows={3} maxLength={280}
                      placeholder="Ej: Hamburguesas artesanales de carne madurada y pan brioche horneado a diario."
                      value={description} onChange={e => setDescription(e.target.value)} className="pam-input" />
                  </div>
                  <span className="pam-hint">{description.length}/280</span>
                </div>
              </section>

              {/* 4. Ubicación y operación */}
              <section className="pam-section">
                <SectionHead step={3 + stepOffset} title="Ubicación y operación" desc="Dónde estás y cómo trabajas." done={locationDone} />
                <div className="pam-grid">
                  <div className="pam-field">
                    <label htmlFor="cityId">Ciudad <em>*</em></label>
                    <div className="pam-input-wrap">
                      <MapPin size={16} className="pam-icon" />
                      <select id="cityId" value={cityId} onChange={e => handleCityChange(e.target.value)}
                        onBlur={() => handleFieldBlur('cityId')} className={inputCls('cityId')}>
                        {activeCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <FieldError name="cityId" error={errors.cityId} />
                  </div>
                  <div className="pam-field">
                    <label htmlFor="zoneId">Zona <em>*</em></label>
                    <div className="pam-input-wrap">
                      <MapPin size={16} className="pam-icon" />
                      <select id="zoneId" value={zoneId} onChange={e => { setZoneId(e.target.value); clearFieldError('zoneId'); }}
                        onBlur={() => handleFieldBlur('zoneId')} className={inputCls('zoneId')}>
                        {cityZones.length === 0 && <option value="">Sin zonas disponibles</option>}
                        {cityZones.map(z => <option key={z.id} value={z.id}>Zona {z.name}</option>)}
                      </select>
                    </div>
                    <FieldError name="zoneId" error={errors.zoneId} />
                  </div>
                  <div className="pam-field pam-span-2">
                    <label htmlFor="address">Dirección o referencia <em>*</em></label>
                    <div className="pam-input-wrap">
                      <MapPin size={16} className="pam-icon" />
                      <input id="address" type="text" placeholder="Ej: Carrera 14 # 19-25, Sector Norte" value={address}
                        onChange={e => { setAddress(e.target.value); clearFieldError('address'); }}
                        onBlur={() => handleFieldBlur('address')}
                        aria-invalid={!!errors.address} aria-describedby={errors.address ? 'address-error' : undefined}
                        className={inputCls('address')} />
                    </div>
                    <FieldError name="address" error={errors.address} />
                  </div>
                  <div className="pam-field">
                    <label htmlFor="scheduleHours">Horario <span className="pam-opt">Opcional</span></label>
                    <div className="pam-input-wrap">
                      <Clock size={16} className="pam-icon" />
                      <input id="scheduleHours" type="text" placeholder="Lun–Dom 11:00 a. m. – 10:00 p. m." value={scheduleHours}
                        onChange={e => setScheduleHours(e.target.value)} className="pam-input" />
                    </div>
                  </div>
                  <div className="pam-field">
                    <label htmlFor="estimatedDeliveryMinutes">Tiempo de preparación <span className="pam-opt">Opcional</span></label>
                    <div className="pam-input-wrap">
                      <Clock size={16} className="pam-icon" />
                      <input id="estimatedDeliveryMinutes" type="number" min={1} placeholder="Ej: 30" value={estimatedDeliveryMinutes}
                        onChange={e => { setEstimatedDeliveryMinutes(e.target.value); clearFieldError('estimatedDeliveryMinutes'); }}
                        onBlur={() => handleFieldBlur('estimatedDeliveryMinutes')}
                        className={inputCls('estimatedDeliveryMinutes', 'with-suffix')} />
                      <span className="pam-suffix">min</span>
                    </div>
                    <FieldError name="estimatedDeliveryMinutes" error={errors.estimatedDeliveryMinutes} />
                  </div>
                </div>
              </section>

              {/* 5. Imagen de marca */}
              <section className="pam-section">
                <SectionHead step={4 + stepOffset} title="Imagen de marca" desc="Opcional, pero los restaurantes con fotos reciben más pedidos." done={!!logoFile || !!bannerFile} />
                <div className="pam-uploads">
                  <label className={`pam-drop logo ${logoPreviewUrl ? 'has-file' : ''} ${errors.logo ? 'has-error' : ''}`}
                    onDragOver={e => e.preventDefault()} onDrop={e => onDropFile(e, 'logo')}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => handleFileChange(e, 'logo')} />
                    {logoPreviewUrl ? (
                      <img src={logoPreviewUrl} alt="Vista previa del logo" />
                    ) : (
                      <div className="pam-drop-empty"><Upload size={20} /><strong>Logo</strong><span>JPG, PNG o WEBP · máx. 5 MB</span></div>
                    )}
                    {logoPreviewUrl && <span className="pam-drop-change">Cambiar</span>}
                  </label>
                  <label className={`pam-drop banner ${bannerPreviewUrl ? 'has-file' : ''} ${errors.banner ? 'has-error' : ''}`}
                    onDragOver={e => e.preventDefault()} onDrop={e => onDropFile(e, 'banner')}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => handleFileChange(e, 'banner')} />
                    {bannerPreviewUrl ? (
                      <img src={bannerPreviewUrl} alt="Vista previa de la portada" />
                    ) : (
                      <div className="pam-drop-empty"><Image size={20} /><strong>Portada</strong><span>Arrastra una imagen o haz clic · máx. 12 MB</span></div>
                    )}
                    {bannerPreviewUrl && <span className="pam-drop-change">Cambiar</span>}
                  </label>
                </div>
                {(logoCompression || bannerCompression) && (
                  <span className="pam-hint ok">
                    <Check size={12} /> Imágenes optimizadas automáticamente
                    {logoCompression && ` · logo ${(logoCompression.original / 1048576).toFixed(1)}→${(logoCompression.final / 1048576).toFixed(1)} MB`}
                    {bannerCompression && ` · portada ${(bannerCompression.original / 1048576).toFixed(1)}→${(bannerCompression.final / 1048576).toFixed(1)} MB`}
                  </span>
                )}
                <FieldError name="logo" error={errors.logo} />
                <FieldError name="banner" error={errors.banner} />
              </section>

              {/* 6. Modalidades */}
              <section className="pam-section">
                <SectionHead step={5 + stepOffset} title="Modalidades de atención" desc="Selecciona al menos una." done={deliveryModes.length > 0} />
                <div className="pam-modes">
                  {DELIVERY_OPTIONS.map(opt => {
                    const active = deliveryModes.includes(opt.value);
                    const Icon = opt.icon;
                    return (
                      <button key={opt.value} type="button" aria-pressed={active}
                        className={`pam-mode ${active ? 'active' : ''}`} onClick={() => handleModeToggle(opt.value)}>
                        <span className="pam-mode-check">{active && <Check size={12} strokeWidth={3} />}</span>
                        <span className="pam-mode-icon"><Icon size={20} /></span>
                        <strong>{opt.title}</strong>
                        <span>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <FieldError name="deliveryModes" error={errors.deliveryModes} />

                {deliveryModes.includes('restaurant_delivery') && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pam-subpanel">
                    <div className="pam-grid">
                      <div className="pam-field">
                        <label htmlFor="deliveryFee">Tarifa de domicilio <span className="pam-opt">Opcional</span></label>
                        <div className="pam-input-wrap">
                          <span className="pam-prefix">$</span>
                          <input id="deliveryFee" type="number" min={0} placeholder="4000" value={deliveryFee}
                            onChange={e => { setDeliveryFee(e.target.value); clearFieldError('deliveryFee'); }}
                            onBlur={() => handleFieldBlur('deliveryFee')}
                            className={inputCls('deliveryFee', 'with-suffix')} />
                          <span className="pam-suffix">COP</span>
                        </div>
                        <FieldError name="deliveryFee" error={errors.deliveryFee} />
                      </div>
                      <div className="pam-field">
                        <label htmlFor="deliveryRadiusKm">Radio de cobertura <span className="pam-opt">Opcional</span></label>
                        <div className="pam-input-wrap">
                          <MapPin size={16} className="pam-icon" />
                          <input id="deliveryRadiusKm" type="number" min={0} step="0.5" placeholder="5" value={deliveryRadiusKm}
                            onChange={e => { setDeliveryRadiusKm(e.target.value); clearFieldError('deliveryRadiusKm'); }}
                            onBlur={() => handleFieldBlur('deliveryRadiusKm')}
                            className={inputCls('deliveryRadiusKm', 'with-suffix')} />
                          <span className="pam-suffix">km</span>
                        </div>
                        <FieldError name="deliveryRadiusKm" error={errors.deliveryRadiusKm} />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="pam-grid">
                  <div className="pam-field">
                    <label htmlFor="whatsapp">WhatsApp de pedidos <span className="pam-opt">Opcional</span></label>
                    <div className="pam-input-wrap">
                      <Phone size={16} className="pam-icon" />
                      <input id="whatsapp" type="tel" placeholder="+57 300 123 4567" value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)} className="pam-input" />
                    </div>
                  </div>
                  <div className="pam-field">
                    <label htmlFor="minOrder">Pedido mínimo <span className="pam-opt">Opcional</span></label>
                    <div className="pam-input-wrap">
                      <span className="pam-prefix">$</span>
                      <input id="minOrder" type="number" min={0} placeholder="20000" value={minOrder}
                        onChange={e => { setMinOrder(e.target.value); clearFieldError('minOrder'); }}
                        onBlur={() => handleFieldBlur('minOrder')}
                        className={inputCls('minOrder', 'with-suffix')} />
                      <span className="pam-suffix">COP</span>
                    </div>
                    <FieldError name="minOrder" error={errors.minOrder} />
                  </div>
                  <div className="pam-field pam-span-2">
                    <label htmlFor="notes">Notas adicionales <span className="pam-opt">Opcional</span></label>
                    <textarea id="notes" rows={2} placeholder="Cuéntanos sobre tu carta, especialidades o inquietudes..."
                      value={notes} onChange={e => setNotes(e.target.value)} className="pam-input no-icon" />
                  </div>
                </div>
              </section>

              {/* Términos */}
              <label className={`pam-terms ${termsAccepted ? 'checked' : ''} ${errors.terms ? 'has-error' : ''}`}>
                <input type="checkbox" checked={termsAccepted}
                  onChange={e => { setTermsAccepted(e.target.checked); if (e.target.checked) clearFieldError('terms'); }} />
                <span className="pam-terms-box">{termsAccepted && <Check size={13} strokeWidth={3} />}</span>
                <span>
                  Acepto los <strong>Términos del Servicio</strong> y la comisión transparente del <strong>3% por pedido procesado</strong> en GastroSync.
                </span>
              </label>
              <FieldError name="terms" error={errors.terms} />
            </div>

            {/* ── Footer fijo ── */}
            <footer className="pam-footer">
              <span className="pam-footer-hint">
                {completed}/{requiredChecks.length} campos obligatorios
              </span>
              <div className="pam-footer-actions">
                <button type="button" className="pam-btn-ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="pam-btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? (<><span className="auth-spinner" aria-hidden="true" /> Enviando...</>) : 'Enviar solicitud'}
                </button>
              </div>
            </footer>
          </form>
        )}
      </motion.div>
    </div>
  );
};

const FieldError: React.FC<{ name: string; error?: string }> = ({ name, error }) =>
  error ? (
    <span id={`${name}-error`} role="alert" className="pam-error">
      <AlertCircle size={12} /> {error}
    </span>
  ) : null;

const SectionHead: React.FC<{ step: number; title: string; desc?: string; done?: boolean }> = ({ step, title, desc, done }) => (
  <div className="pam-section-head">
    <span className={`pam-step ${done ? 'done' : ''}`}>{done ? <Check size={14} strokeWidth={3} /> : step}</span>
    <div>
      <h4>{title}</h4>
      {desc && <p>{desc}</p>}
    </div>
  </div>
);

const CATEGORIES = [
  { value: 'Hamburguesas', label: 'Hamburguesas', emoji: '🍔' },
  { value: 'Italiana', label: 'Italiana', emoji: '🍝' },
  { value: 'Pizzería', label: 'Pizzería', emoji: '🍕' },
  { value: 'Mexicana', label: 'Mexicana', emoji: '🌮' },
  { value: 'Asiática', label: 'Asiática', emoji: '🍣' },
  { value: 'Típica', label: 'Típica / Parrilla', emoji: '🥩' },
  { value: 'Postres', label: 'Postres', emoji: '🍰' },
  { value: 'Cafetería', label: 'Cafetería', emoji: '☕' },
  { value: 'Otra', label: 'Otra', emoji: '🍽️' },
];

const DELIVERY_OPTIONS: { value: OrderFulfillment; title: string; desc: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { value: 'pickup', title: 'Recogida en local', desc: 'El cliente pasa por su pedido', icon: ShoppingBag },
  { value: 'restaurant_delivery', title: 'Domicilio propio', desc: 'Tú entregas con tus repartidores', icon: Bike },
  { value: 'table_service', title: 'Servicio en mesa', desc: 'Pedidos por código QR', icon: QrCode },
];
