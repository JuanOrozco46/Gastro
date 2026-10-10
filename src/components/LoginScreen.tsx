import React, { useState, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { DEMO_ACCOUNTS } from '../context/demoAccounts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, Mail, User, Phone, MapPin, Camera, Trash2,
  Eye, EyeOff, Utensils, Check,
  AlertCircle, Building2, CheckCircle2, X, KeyRound,
  Compass, QrCode, ShieldCheck, ArrowUpRight, ChefHat, BarChart3, Bike,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { PartnerApplicationModal } from './PartnerApplicationModal';
import {
  validateEmail,
  validateName,
  validatePhone,
  validateUsername,
  normalizeUsername,
  suggestUsernameFromName,
  validateRegisterPassword,
  validatePasswordConfirm,
  evaluatePasswordStrength
} from '../utils/formValidation';

/* ── Carrusel Fotográfico Libre de Derechos (Licencia Unsplash) ────────── */
const SHOWCASE_SLIDES = [
  {
    id: 'feed-local',
    icon: Compass,
    tag: 'Carta Viva · Feed Gastronómico',
    headline: 'Descubre los platos reales de tu ciudad antes de pedir.',
    desc: 'Explora fotos e historias publicadas cada día por las cocinas locales de tu zona y ordena en segundos sin intermediarios.',
    highlight: 'La Trattoria Artesanal · $ 34.000 COP precio real de carta',
    imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1400&q=85',
    imageAlt: 'Pizza napolitana artesanal recién salida del horno de leña',
  },
  {
    id: 'mesa-qr-domicilio',
    icon: QrCode,
    tag: 'Mesa QR · Recogida · Domicilio',
    headline: 'Ordena desde la mesa con QR o recibe directo en tu puerta.',
    desc: 'Sin esperar la cuenta ni hacer filas: tu pedido entra directo al tablero KDS de la cocina con seguimiento en vivo.',
    highlight: 'Comanda conectada en tiempo real con cocina · 0 esperas',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=85',
    imageAlt: 'Mesa compartida en restaurante local con platos recién servidos',
  },
  {
    id: 'comision-justa',
    icon: ShieldCheck,
    tag: 'Alianza Justa del 3% · Transparencia en COP',
    headline: 'Pagas el precio real del menú, apoyando al restaurante local.',
    desc: 'Mientras otras plataformas cobran hasta un 30% que infla tu cuenta, GastroSync opera con solo el 3% para proteger el oficio gastronómico.',
    highlight: '97% del valor de cada plato va directo al restaurante',
    imageUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1400&q=85',
    imageAlt: 'Chef emplata una preparación artesanal en cocina profesional',
  },
  {
    id: 'ecosistema-restaurante',
    icon: ChefHat,
    tag: 'Tecnología Todo-en-Uno · +16 Ciudades',
    headline: 'Menú digital QR, pantalla KDS de cocina y pagos integrados.',
    desc: 'Todo lo que un restaurante independiente en Colombia necesita para vender en salón y a domicilio sin mensualidades fijas.',
    highlight: '0% mensualidad · Activación rápida para restaurantes aliados',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1400&q=85',
    imageAlt: 'Hamburguesa artesanal gourmet preparada con ingredientes frescos',
  },
];

const DEMO_ROLE_META: Record<string, { shortLabel: string; icon: React.ComponentType<{ size?: number }> }> = {
  demo_customer: { shortLabel: 'Comensal', icon: Bike },
  demo_owner: { shortLabel: 'Dueño', icon: BarChart3 },
  demo_kitchen: { shortLabel: 'Cocina KDS', icon: ChefHat },
  demo_platform_admin: { shortLabel: 'Plataforma', icon: ShieldCheck },
};

type AuthTab = 'login' | 'register';

interface TabFieldErrors {
  email: string | null;
  password: string | null;
  name: string | null;
  username: string | null;
  phone: string | null;
  defaultAddress: string | null;
  confirmPassword: string | null;
}

const EMPTY_FIELD_ERRORS: TabFieldErrors = {
  email: null,
  password: null,
  name: null,
  username: null,
  phone: null,
  defaultAddress: null,
  confirmPassword: null,
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function RegisterSectionHead({
  step,
  done,
  title,
  desc
}: {
  step: number;
  done: boolean;
  title: string;
  desc: string;
}) {
  return (
    <div className="pam-section-head">
      <div className={`pam-step ${done ? 'done' : ''}`} aria-hidden="true">
        {done ? <Check size={15} strokeWidth={3} /> : step}
      </div>
      <div className="pam-section-title-wrap">
        <h4 className="pam-section-title">{title}</h4>
        <p className="pam-section-desc">{desc}</p>
      </div>
    </div>
  );
}

export const LoginScreen: React.FC = () => {
  const { authMode, loginWithCredentials, loginWithGoogle, registerAccount, sendPasswordReset } = useApp();
  const [tab, setTab] = useState<AuthTab>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [defaultDeliveryNotes, setDefaultDeliveryNotes] = useState('');
  const [showOptionalAddress, setShowOptionalAddress] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [isCompressingAvatar, setIsCompressingAvatar] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPartnerModal, setShowPartnerModal] = useState(false);

  // Carrusel fotográfico lateral (pausa automática en hover / foco)
  const [activeSlide, setActiveSlide] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);

  React.useEffect(() => {
    if (isCarouselPaused) return;
    const timer = window.setInterval(() => {
      setActiveSlide(prev => (prev + 1) % SHOWCASE_SLIDES.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [isCarouselPaused]);

  const handlePrevSlide = () => {
    setActiveSlide(prev => (prev - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length);
  };

  const handleNextSlide = () => {
    setActiveSlide(prev => (prev + 1) % SHOWCASE_SLIDES.length);
  };

  const currentSlide = SHOWCASE_SLIDES[activeSlide] || SHOWCASE_SLIDES[0];
  const CurrentSlideIcon = currentSlide.icon;

  // Password strength
  const passwordStrength = evaluatePasswordStrength(password);

  // Modal para restablecer contraseña
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailError, setResetEmailError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [resetErrorMessage, setResetErrorMessage] = useState<string | null>(null);

  // Estado de errores por campo separado por tab
  const [errorsByTab, setErrorsByTab] = useState<Record<AuthTab, TabFieldErrors>>({
    login: { ...EMPTY_FIELD_ERRORS },
    register: { ...EMPTY_FIELD_ERRORS },
  });

  const fieldErrors = errorsByTab[tab];

  const setTabFieldError = (field: keyof TabFieldErrors, value: string | null) => {
    setErrorsByTab(prev => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [field]: value,
      },
    }));
  };

  // Permitir cerrar el modal de recuperación con la tecla Escape
  React.useEffect(() => {
    if (!showResetModal) return;
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setShowResetModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResetModal]);

  // Field validation handlers (onBlur)
  const handleEmailBlur = () => {
    setTabFieldError('email', validateEmail(email));
  };

  const handlePasswordBlur = () => {
    if (tab === 'login') {
      setTabFieldError('password', password ? null : 'Ingresa tu contraseña.');
    } else {
      setTabFieldError('password', validateRegisterPassword(password));
      if (confirmPassword) {
        setTabFieldError('confirmPassword', validatePasswordConfirm(password, confirmPassword));
      }
    }
  };

  const handleNameBlur = () => {
    setTabFieldError('name', validateName(name));
  };

  const handleUsernameBlur = () => {
    setTabFieldError('username', validateUsername(username));
  };

  const handlePhoneBlur = () => {
    setTabFieldError('phone', validatePhone(phone));
  };

  const handleAddressBlur = () => {
    const trimmed = defaultAddress.trim();
    setTabFieldError(
      'defaultAddress',
      trimmed.length === 0 || trimmed.length >= 5
        ? null
        : 'Escribe al menos 5 caracteres o déjala vacía para configurarla en tu primer domicilio.'
    );
  };

  const handleConfirmPasswordBlur = () => {
    setTabFieldError('confirmPassword', validatePasswordConfirm(password, confirmPassword));
  };

  // Clear field error on change
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setTabFieldError('email', null);
    setLoginError(null);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setTabFieldError('password', null);
    setLoginError(null);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    setTabFieldError('name', null);
    setLoginError(null);
    if (!usernameTouched) {
      const suggested = suggestUsernameFromName(val);
      setUsername(suggested);
      if (suggested) setTabFieldError('username', null);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsernameTouched(true);
    const clean = normalizeUsername(e.target.value);
    setUsername(clean);
    setTabFieldError('username', null);
    setLoginError(null);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value);
    setTabFieldError('phone', null);
    setLoginError(null);
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDefaultAddress(e.target.value);
    setTabFieldError('defaultAddress', null);
    setLoginError(null);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    setTabFieldError('confirmPassword', null);
    setLoginError(null);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    if (!rawFile.type.startsWith('image/')) {
      setLoginError('Selecciona una imagen válida (JPG, PNG o WEBP) para tu foto de perfil.');
      return;
    }
    setIsCompressingAvatar(true);
    setLoginError(null);
    try {
      const { compressImage } = await import('../utils/imageCompression');
      const result = await compressImage(rawFile, 0.35, 320);
      const dataUrl = await fileToDataUrl(result.file);
      setAvatarFile(result.file);
      setAvatarPreview(dataUrl);
    } catch {
      setLoginError('No se pudo procesar la foto de perfil.');
    } finally {
      setIsCompressingAvatar(false);
    }
  };

  // Section completion & live progress for Register tab (address is optional)
  const registerProgress = useMemo(() => {
    const trimmedAddr = defaultAddress.trim();
    const isAddressValid = trimmedAddr.length === 0 || trimmedAddr.length >= 5;
    const step1Done = !validateName(name) && !validateUsername(username);
    const step2Done = !validatePhone(phone) && isAddressValid;
    const step3Done =
      !validateEmail(email) &&
      !validateRegisterPassword(password) &&
      !validatePasswordConfirm(password, confirmPassword);

    const checks = [
      !validateName(name),
      !validateUsername(username),
      !validatePhone(phone),
      !validateEmail(email),
      !validateRegisterPassword(password) && !validatePasswordConfirm(password, confirmPassword)
    ];
    const doneCount = checks.filter(Boolean).length;
    const pct = Math.round((doneCount / checks.length) * 100);

    return { step1Done, step2Done, step3Done, doneCount, totalCount: checks.length, pct };
  }, [name, username, phone, defaultAddress, email, password, confirmPassword]);

  const handleQuickDemoSelect = async (demoEmail: string, demoPassword: string) => {
    setTab('login');
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoginError(null);
    setErrorsByTab(prev => ({ ...prev, login: { ...EMPTY_FIELD_ERRORS } }));
    if (!demoPassword) return;
    setLoading(true);
    try {
      const res = await loginWithCredentials(demoEmail, demoPassword);
      if (typeof res === 'object' && !res.success) {
        setLoginError(res.error || 'No se pudo iniciar la sesión de demostración.');
      } else if (res === false) {
        setLoginError('No se pudo iniciar la sesión de demostración.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (tab === 'login') {
      const emailErr = validateEmail(email);
      const passErr = password ? null : 'Ingresa tu contraseña.';
      if (emailErr || passErr) {
        setErrorsByTab(prev => ({
          ...prev,
          login: { ...EMPTY_FIELD_ERRORS, email: emailErr, password: passErr },
        }));
        return;
      }
    } else {
      const nameErr = validateName(name);
      const usernameErr = validateUsername(username);
      const phoneErr = validatePhone(phone);
      const trimmedAddress = defaultAddress.trim();
      const addressErr =
        trimmedAddress.length === 0 || trimmedAddress.length >= 5
          ? null
          : 'Escribe al menos 5 caracteres o déjala vacía para configurarla luego.';
      const emailErr = validateEmail(email);
      const passErr = validateRegisterPassword(password);
      const confirmErr = validatePasswordConfirm(password, confirmPassword);

      if (nameErr || usernameErr || phoneErr || addressErr || emailErr || passErr || confirmErr) {
        if (addressErr) setShowOptionalAddress(true);
        setErrorsByTab(prev => ({
          ...prev,
          register: {
            name: nameErr,
            username: usernameErr,
            phone: phoneErr,
            defaultAddress: addressErr,
            email: emailErr,
            password: passErr,
            confirmPassword: confirmErr,
          },
        }));
        return;
      }
    }

    setLoading(true);

    try {
      if (tab === 'login') {
        const res = await loginWithCredentials(email, password);
        if (typeof res === 'object' && !res.success) {
          setLoginError(res.error || 'Correo o contraseña incorrectos.');
        } else if (res === false) {
          setLoginError('Correo o contraseña incorrectos.');
        }
      } else {
        const res = await registerAccount(name.trim(), email, password, 'client_delivery', {
          username: normalizeUsername(username),
          phone: phone.trim(),
          defaultAddress: defaultAddress.trim() || undefined,
          defaultDeliveryNotes: defaultDeliveryNotes.trim() || undefined,
          avatarFile,
          avatarDataUrl: avatarPreview || undefined
        });
        if (typeof res === 'object' && !res.success) {
          setLoginError(res.error || 'Error al crear la cuenta.');
        }
      }
    } catch {
      setLoginError('Ocurrió un error inesperado al procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMessage(null);
    setResetSuccessMessage(null);

    const emailErr = validateEmail(resetEmail);
    if (emailErr) {
      setResetEmailError(emailErr);
      return;
    }

    setResetLoading(true);

    try {
      const res = await sendPasswordReset(resetEmail);
      if (res.success) {
        setResetSuccessMessage('Hemos enviado las instrucciones para restablecer tu contraseña a tu correo electrónico.');
      } else {
        setResetErrorMessage(res.error || 'No se pudo procesar la solicitud.');
      }
    } catch {
      setResetErrorMessage('Error al conectar con el servicio de autenticación.');
    } finally {
      setResetLoading(false);
    }
  };

  const canUseQuickDemo = authMode === 'demo' && Boolean(DEMO_ACCOUNTS[0]?.demoPassword);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="login-page"
    >
      {/* ── LEFT PANEL — Carrusel Fotográfico de Ventajas GastroSync ── */}
      <motion.aside
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="login-brand-panel"
        aria-label="Ventajas de GastroSync"
        onMouseEnter={() => setIsCarouselPaused(true)}
        onMouseLeave={() => setIsCarouselPaused(false)}
        onFocusCapture={() => setIsCarouselPaused(true)}
        onBlurCapture={() => setIsCarouselPaused(false)}
      >
        {/* Full-bleed Photo Background with Smooth Crossfade */}
        <div className="gs-carousel-media" aria-hidden="true">
          <AnimatePresence mode="wait">
            <motion.img
              key={currentSlide.id}
              src={currentSlide.imageUrl}
              alt={currentSlide.imageAlt}
              className="gs-carousel-img"
              loading="eager"
              decoding="async"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
            />
          </AnimatePresence>
          <div className="gs-carousel-scrim" />
        </div>

        <div className="gs-auth-editorial-frame">
          {/* Top Brand Bar over Photo */}
          <div className="gs-auth-brand-top">
            <div className="gs-auth-brand-mark">
              <div className="gs-auth-seal">
                <Utensils size={20} />
              </div>
              <div>
                <span className="gs-auth-brand-name">GastroSync</span>
                <span className="gs-auth-brand-sub">Colombia · Red Gastronómica Local</span>
              </div>
            </div>

            <span className="gs-auth-edition-tag">
              <MapPin size={13} /> 0{activeSlide + 1} / 0{SHOWCASE_SLIDES.length}
            </span>
          </div>

          {/* Bottom Story Showcase & Controls */}
          <div className="gs-carousel-bottom">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="gs-carousel-caption"
              >
                <span className="gs-carousel-eyebrow">
                  <CurrentSlideIcon size={14} />
                  <span>{currentSlide.tag}</span>
                </span>

                <h1 className="gs-auth-headline">{currentSlide.headline}</h1>

                <p className="gs-auth-lead-copy">{currentSlide.desc}</p>

                <div className="gs-carousel-highlight">
                  <span className="gs-auth-specimen-dot" />
                  <span>{currentSlide.highlight}</span>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Progress Bars + Arrow Controls */}
            <div className="gs-carousel-controls">
              <div className="gs-carousel-dots" role="tablist" aria-label="Seleccionar ventaja de GastroSync">
                {SHOWCASE_SLIDES.map((slide, idx) => {
                  const isActive = idx === activeSlide;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Ventaja ${idx + 1}: ${slide.tag}`}
                      onClick={() => setActiveSlide(idx)}
                      className={`gs-carousel-dot ${isActive ? 'active' : ''}`}
                    />
                  );
                })}
              </div>

              <div className="gs-carousel-arrows">
                <button
                  type="button"
                  onClick={handlePrevSlide}
                  className="gs-carousel-arrow"
                  aria-label="Ventaja anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleNextSlide}
                  className="gs-carousel-arrow"
                  aria-label="Siguiente ventaja"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Partner Colophon at base of Left Panel */}
            <div className="gs-auth-partner-colophon">
              <div className="gs-auth-partner-copy">
                <span className="gs-auth-partner-title">¿Diriges un restaurante en Colombia?</span>
                <span className="gs-auth-partner-sub">
                  0% de mensualidad · Comisión única del 3% · Menú QR y KDS en vivo.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPartnerModal(true)}
                className="gs-auth-partner-cta"
              >
                <Building2 size={16} />
                <span>Vincular restaurante</span>
                <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* ── RIGHT PANEL — El Pase de Acceso ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.06 }}
        className="login-form-panel"
        aria-label="Acceso a tu cuenta"
      >
        <div>
          {/* Sheet Header + Quiet Connection Status */}
          <div className="gs-auth-sheet-top">
            <div>
              <h2 className="gs-auth-sheet-heading">
                {tab === 'login' ? 'Pase de acceso' : 'Crear cuenta de comensal'}
              </h2>
              <p className="gs-auth-sheet-sub">
                {tab === 'login'
                  ? 'Ingresa con tu cuenta para pedir o gestionar tu restaurante.'
                  : 'Crea tu usuario @ y empieza a pedir en mesa QR, para recoger o a domicilio.'}
              </p>
            </div>

            <div className="gs-auth-status-badge">
              <span className={`gs-auth-status-dot ${authMode === 'demo' ? 'demo' : ''}`} />
              <span>{authMode === 'demo' ? 'Modo Demo Local' : 'Red Activa en Vivo'}</span>
            </div>
          </div>

          {/* Segmented Tab Switcher */}
          <div className="auth-tabs" role="tablist" aria-label="Opciones de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              onClick={() => { setTab('login'); setLoginError(null); }}
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'register'}
              onClick={() => { setTab('register'); setLoginError(null); }}
              className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            >
              Crear Cuenta
            </button>
          </div>

          {/* Quick Demo Role Switcher (Shown only on Login tab in Local Demo Mode) */}
          {canUseQuickDemo && tab === 'login' && (
            <div className="gs-auth-demo-strip">
              <div className="gs-auth-demo-head">
                <span>Acceso rápido de demostración (1 clic)</span>
                <span>4 roles activos</span>
              </div>
              <div className="gs-auth-demo-pills">
                {DEMO_ACCOUNTS.map(acc => {
                  const meta = DEMO_ROLE_META[acc.id] || { shortLabel: acc.name, icon: User };
                  const RoleIcon = meta.icon;
                  const isSelected = email === acc.email && tab === 'login';
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      disabled={loading}
                      onClick={() => handleQuickDemoSelect(acc.email, acc.demoPassword)}
                      className={`gs-auth-demo-pill ${isSelected ? 'active' : ''}`}
                      title={`Entrar como ${acc.name} (${acc.email})`}
                    >
                      <RoleIcon size={14} />
                      <span>{meta.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Alert Box */}
          {loginError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="auth-alert error"
              role="alert"
            >
              <AlertCircle size={18} className="gs-flex-shrink-0" />
              <span>{loginError}</span>
            </motion.div>
          )}

          {/* ── TAB: LOGIN ── */}
          {tab === 'login' ? (
            <form onSubmit={handleSubmit} noValidate className="login-form">
              <div className="auth-field">
                <label htmlFor="auth-email" className="auth-label">Correo electrónico</label>
                <div className="auth-input-wrap">
                  <div className="auth-field-icon">
                    <Mail size={18} />
                  </div>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu.correo@ejemplo.com"
                    value={email}
                    onChange={handleEmailChange}
                    onBlur={handleEmailBlur}
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                    className={`auth-input ${fieldErrors.email ? 'auth-input-error' : ''}`}
                    required
                  />
                </div>
                {fieldErrors.email && (
                  <div id="auth-email-error" role="alert" className="auth-field-error">
                    {fieldErrors.email}
                  </div>
                )}
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="auth-password" className="auth-label">Contraseña</label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setResetEmailError(null);
                      setResetSuccessMessage(null);
                      setResetErrorMessage(null);
                      setShowResetModal(true);
                    }}
                    className="forgot-link"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="auth-input-wrap">
                  <div className="auth-field-icon">
                    <Lock size={18} />
                  </div>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={handlePasswordChange}
                    onBlur={handlePasswordBlur}
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
                    className={`auth-input has-icon-right ${fieldErrors.password ? 'auth-input-error' : ''}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="field-toggle-pw"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <div id="auth-password-error" role="alert" className="auth-field-error">
                    {fieldErrors.password}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="auth-submit"
                disabled={loading}
              >
                {loading && <span className="auth-spinner" aria-hidden="true" />}
                <span>{loading ? 'Validando acceso...' : 'Entrar a GastroSync'}</span>
              </button>

              <div className="gs-auth-divider">o continúa con</div>

              <button
                type="button"
                onClick={() => loginWithGoogle()}
                disabled={authMode === 'demo'}
                className="gs-auth-google-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>
                  {authMode === 'demo'
                    ? 'Continuar con Google (requiere conexión en vivo)'
                    : 'Continuar con Google'}
                </span>
              </button>
            </form>
          ) : (
            /* ── TAB: REGISTER (Editorial 3-Stage Ledger without Nested Cards) ── */
            <form onSubmit={handleSubmit} noValidate className="login-form">
              <div className="gs-register-owner-callout">
                <span>¿Representas a un restaurante?</span>
                <button
                  type="button"
                  onClick={() => setShowPartnerModal(true)}
                  className="gs-auth-partner-inline-link"
                >
                  <Building2 size={13} />
                  <span>Postular restaurante aliado (3%)</span>
                </button>
              </div>

              <div className="gs-register-progress-bar">
                <div className="gs-register-progress-meta">
                  <span>Progreso de registro ({registerProgress.doneCount}/{registerProgress.totalCount})</span>
                  <span>{registerProgress.pct}%</span>
                </div>
                <div className="gs-register-progress-track">
                  <div className="gs-register-progress-fill" style={{ width: `${registerProgress.pct}%` }} />
                </div>
              </div>

              {/* ── SECCIÓN 1: Identidad, Foto de Perfil y @ ── */}
              <div className="gs-register-ledger-section">
                <RegisterSectionHead
                  step={1}
                  done={registerProgress.step1Done}
                  title="Identidad en la mesa"
                  desc="Tu foto y tu @ aparecerán en tus reseñas y comentarios sobre los platos"
                />

                <div className="gs-register-avatar-row">
                  <div className="urm-avatar-preview">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Vista previa de perfil" />
                    ) : (
                      <span>{(name.trim() || 'TU').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="urm-avatar-info">
                    <div className="urm-avatar-title">Foto de perfil (Opcional)</div>
                    <p className="urm-avatar-sub">
                      Se mostrará junto a tu <strong>@{username || 'usuario'}</strong> al interactuar con los restaurantes.
                    </p>
                    <div className="urm-avatar-actions">
                      <label className="urm-avatar-btn">
                        <Camera size={14} />
                        <span>
                          {isCompressingAvatar
                            ? 'Optimizando...'
                            : avatarPreview
                            ? 'Cambiar foto'
                            : 'Subir foto'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAvatarChange}
                          className="gs-sr-only-input"
                        />
                      </label>
                      {avatarPreview && (
                        <button
                          type="button"
                          className="urm-avatar-remove"
                          onClick={() => {
                            setAvatarPreview('');
                            setAvatarFile(null);
                          }}
                        >
                          <Trash2 size={13} /> Quitar
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pam-grid-2">
                  <div className="auth-field">
                    <label htmlFor="auth-name" className="auth-label">Nombre completo *</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon">
                        <User size={17} />
                      </div>
                      <input
                        id="auth-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Ej. María Fernanda López"
                        value={name}
                        onChange={handleNameChange}
                        onBlur={handleNameBlur}
                        aria-invalid={!!fieldErrors.name}
                        aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
                        className={`auth-input ${fieldErrors.name ? 'auth-input-error' : ''}`}
                        required
                      />
                    </div>
                    {fieldErrors.name && (
                      <div id="auth-name-error" role="alert" className="auth-field-error">
                        {fieldErrors.name}
                      </div>
                    )}
                  </div>

                  <div className="auth-field">
                    <label htmlFor="auth-username" className="auth-label">Tu usuario @ *</label>
                    <div className="auth-input-wrap">
                      <div className="urm-at-prefix">@</div>
                      <input
                        id="auth-username"
                        type="text"
                        autoComplete="username"
                        placeholder="maria_lopez"
                        value={username}
                        onChange={handleUsernameChange}
                        onBlur={handleUsernameBlur}
                        aria-invalid={!!fieldErrors.username}
                        aria-describedby={fieldErrors.username ? 'auth-username-error' : undefined}
                        className={`auth-input has-at-prefix ${fieldErrors.username ? 'auth-input-error' : ''}`}
                        maxLength={24}
                        required
                      />
                    </div>
                    {fieldErrors.username ? (
                      <div id="auth-username-error" role="alert" className="auth-field-error">
                        {fieldErrors.username}
                      </div>
                    ) : (
                      <span className="pam-hint">Solo minúsculas, números, puntos o guiones bajos.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── SECCIÓN 2: Contacto y Entrega Opcional ── */}
              <div className="gs-register-ledger-section">
                <RegisterSectionHead
                  step={2}
                  done={registerProgress.step2Done}
                  title="Contacto y entregas"
                  desc="Tu WhatsApp para notificaciones del pedido; la dirección puedes guardarla ahora o en tu primer domicilio"
                />

                <div className="pam-grid-1">
                  <div className="auth-field">
                    <label htmlFor="auth-phone" className="auth-label">Teléfono / WhatsApp de contacto *</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon">
                        <Phone size={17} />
                      </div>
                      <input
                        id="auth-phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="Ej. +57 300 123 4567"
                        value={phone}
                        onChange={handlePhoneChange}
                        onBlur={handlePhoneBlur}
                        aria-invalid={!!fieldErrors.phone}
                        aria-describedby={fieldErrors.phone ? 'auth-phone-error' : undefined}
                        className={`auth-input ${fieldErrors.phone ? 'auth-input-error' : ''}`}
                        required
                      />
                    </div>
                    {fieldErrors.phone && (
                      <div id="auth-phone-error" role="alert" className="auth-field-error">
                        {fieldErrors.phone}
                      </div>
                    )}
                  </div>

                  {!showOptionalAddress && !defaultAddress ? (
                    <button
                      type="button"
                      onClick={() => setShowOptionalAddress(true)}
                      className="gs-optional-address-toggle"
                    >
                      <MapPin size={15} />
                      <span>+ Agregar dirección habitual de entrega ahora (opcional)</span>
                    </button>
                  ) : (
                    <div className="gs-optional-address-fields">
                      <div className="auth-field">
                        <div className="auth-label-row">
                          <label htmlFor="auth-address" className="auth-label">
                            Dirección habitual de entrega (Opcional)
                          </label>
                          {!defaultAddress && (
                            <button
                              type="button"
                              onClick={() => setShowOptionalAddress(false)}
                              className="forgot-link"
                            >
                              Omitir por ahora
                            </button>
                          )}
                        </div>
                        <div className="auth-input-wrap">
                          <div className="auth-field-icon">
                            <MapPin size={17} />
                          </div>
                          <input
                            id="auth-address"
                            type="text"
                            autoComplete="street-address"
                            placeholder="Ej. Cra 14 # 19-20, Apto 302, Barrio..."
                            value={defaultAddress}
                            onChange={handleAddressChange}
                            onBlur={handleAddressBlur}
                            aria-invalid={!!fieldErrors.defaultAddress}
                            aria-describedby={fieldErrors.defaultAddress ? 'auth-address-error' : undefined}
                            className={`auth-input ${fieldErrors.defaultAddress ? 'auth-input-error' : ''}`}
                          />
                        </div>
                        {fieldErrors.defaultAddress && (
                          <div id="auth-address-error" role="alert" className="auth-field-error">
                            {fieldErrors.defaultAddress}
                          </div>
                        )}
                      </div>

                      <div className="auth-field">
                        <label htmlFor="auth-delivery-notes" className="auth-label">
                          Notas de entrega (Opcional)
                        </label>
                        <input
                          id="auth-delivery-notes"
                          type="text"
                          placeholder="Ej. Apto 302, Torre B, timbrar en portería"
                          value={defaultDeliveryNotes}
                          onChange={e => setDefaultDeliveryNotes(e.target.value)}
                          className="auth-input no-icon-left"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── SECCIÓN 3: Credenciales de Acceso ── */}
              <div className="gs-register-ledger-section">
                <RegisterSectionHead
                  step={3}
                  done={registerProgress.step3Done}
                  title="Credenciales de acceso"
                  desc="Tu correo y contraseña segura para entrar a GastroSync"
                />

                <div className="pam-grid-1">
                  <div className="auth-field">
                    <label htmlFor="auth-reg-email" className="auth-label">Correo electrónico *</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon">
                        <Mail size={17} />
                      </div>
                      <input
                        id="auth-reg-email"
                        type="email"
                        autoComplete="email"
                        placeholder="tu.correo@ejemplo.com"
                        value={email}
                        onChange={handleEmailChange}
                        onBlur={handleEmailBlur}
                        aria-invalid={!!fieldErrors.email}
                        aria-describedby={fieldErrors.email ? 'auth-reg-email-error' : undefined}
                        className={`auth-input ${fieldErrors.email ? 'auth-input-error' : ''}`}
                        required
                      />
                    </div>
                    {fieldErrors.email && (
                      <div id="auth-reg-email-error" role="alert" className="auth-field-error">
                        {fieldErrors.email}
                      </div>
                    )}
                  </div>

                  <div className="auth-field">
                    <label htmlFor="auth-reg-password" className="auth-label">Contraseña *</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon">
                        <Lock size={17} />
                      </div>
                      <input
                        id="auth-reg-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres, mayúscula, minúscula y número"
                        value={password}
                        onChange={handlePasswordChange}
                        onBlur={handlePasswordBlur}
                        aria-invalid={!!fieldErrors.password}
                        aria-describedby={fieldErrors.password ? 'auth-reg-password-error' : undefined}
                        className={`auth-input has-icon-right ${fieldErrors.password ? 'auth-input-error' : ''}`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="field-toggle-pw"
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <div id="auth-reg-password-error" role="alert" className="auth-field-error">
                        {fieldErrors.password}
                      </div>
                    )}
                  </div>

                  <div className="auth-field">
                    <label htmlFor="auth-confirm-password" className="auth-label">Confirmar contraseña *</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon">
                        <Lock size={17} />
                      </div>
                      <input
                        id="auth-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Repite tu contraseña"
                        value={confirmPassword}
                        onChange={handleConfirmPasswordChange}
                        onBlur={handleConfirmPasswordBlur}
                        aria-invalid={!!fieldErrors.confirmPassword}
                        aria-describedby={fieldErrors.confirmPassword ? 'auth-confirm-password-error' : undefined}
                        className={`auth-input ${fieldErrors.confirmPassword ? 'auth-input-error' : ''}`}
                        required
                      />
                    </div>
                    {fieldErrors.confirmPassword && (
                      <div id="auth-confirm-password-error" role="alert" className="auth-field-error">
                        {fieldErrors.confirmPassword}
                      </div>
                    )}
                  </div>

                  {/* Password Strength Meter & Live Checklist */}
                  {password.length > 0 && (
                    <div className="pam-strength" aria-live="polite">
                      <div className="pam-strength-bars">
                        {[1, 2, 3, 4, 5].map(lvl => (
                          <span
                            key={lvl}
                            className="pam-strength-bar"
                            style={{
                              background: passwordStrength.score >= lvl ? passwordStrength.color : undefined
                            }}
                          />
                        ))}
                      </div>
                      <div className="pam-strength-meta">
                        <span>Nivel de seguridad</span>
                        <span style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
                      </div>
                      <ul className="pam-checks">
                        {passwordStrength.checks.map((c, idx) => (
                          <li key={idx} className={`pam-check ${c.passed ? 'ok' : ''}`}>
                            {c.passed ? (
                              <Check size={12} strokeWidth={3} aria-hidden="true" />
                            ) : (
                              <span className="pam-check-dot" aria-hidden="true" />
                            )}
                            <span>{c.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="auth-submit"
                disabled={loading || isCompressingAvatar}
              >
                {loading && <span className="auth-spinner" aria-hidden="true" />}
                <span>
                  {loading
                    ? 'Creando tu perfil...'
                    : username
                    ? `Crear mi cuenta como @${username}`
                    : 'Crear Mi Cuenta'}
                </span>
              </button>

              <div className="gs-auth-divider">o regístrate rápido con</div>

              <button
                type="button"
                onClick={() => loginWithGoogle()}
                disabled={authMode === 'demo'}
                className="gs-auth-google-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>
                  {authMode === 'demo'
                    ? 'Continuar con Google (requiere conexión en vivo)'
                    : 'Continuar con Google'}
                </span>
              </button>
            </form>
          )}
        </div>

        {/* Sheet Footer with Partner Link */}
        <footer className="gs-auth-sheet-footer">
          <span>GastroSync · Ecosistema Gastronómico Local</span>
          <button
            type="button"
            onClick={() => setShowPartnerModal(true)}
            className="gs-auth-partner-inline-link"
          >
            <Building2 size={13} />
            <span>¿Tienes un restaurante? Regístralo aquí (3% comisión)</span>
          </button>
        </footer>

        <PartnerApplicationModal
          isOpen={showPartnerModal}
          onClose={() => setShowPartnerModal(false)}
        />

        {/* Modal de Restablecimiento de Contraseña */}
        <AnimatePresence>
          {showResetModal && (
            <div
              className="gs-reset-overlay"
              onClick={e => {
                if (e.target === e.currentTarget) setShowResetModal(false);
              }}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                className="gs-reset-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="gs-reset-title"
              >
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  aria-label="Cerrar recuperación de contraseña"
                  className="gs-reset-close"
                >
                  <X size={20} />
                </button>

                <div className="gs-reset-head">
                  <div className="gs-reset-icon">
                    <KeyRound size={22} />
                  </div>
                  <div>
                    <h3 id="gs-reset-title" className="gs-reset-title">Recuperar Contraseña</h3>
                    <span className="gs-reset-sub">Restablece el acceso a tu cuenta</span>
                  </div>
                </div>

                {resetSuccessMessage ? (
                  <div className="gs-reset-success-stack">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="auth-alert success"
                      role="status"
                    >
                      <CheckCircle2 size={20} className="gs-flex-shrink-0" />
                      <span>{resetSuccessMessage}</span>
                    </motion.div>
                    <button
                      type="button"
                      onClick={() => setShowResetModal(false)}
                      className="auth-submit"
                    >
                      <span>Volver a iniciar sesión</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} noValidate className="login-form">
                    <p className="gs-reset-copy">
                      Ingresa tu correo electrónico registrado y te enviaremos un enlace seguro para crear una nueva contraseña.
                    </p>

                    {resetErrorMessage && (
                      <div className="auth-alert error" role="alert">
                        <AlertCircle size={18} className="gs-flex-shrink-0" />
                        <span>{resetErrorMessage}</span>
                      </div>
                    )}

                    <div className="auth-field">
                      <label htmlFor="reset-email" className="auth-label">
                        Correo electrónico
                      </label>
                      <div className="auth-input-wrap">
                        <div className="auth-field-icon">
                          <Mail size={18} />
                        </div>
                        <input
                          id="reset-email"
                          type="email"
                          autoComplete="email"
                          placeholder="tu.correo@ejemplo.com"
                          value={resetEmail}
                          onChange={e => {
                            setResetEmail(e.target.value);
                            setResetEmailError(null);
                            setResetErrorMessage(null);
                          }}
                          onBlur={() => setResetEmailError(validateEmail(resetEmail))}
                          aria-invalid={!!resetEmailError}
                          aria-describedby={resetEmailError ? 'reset-email-error' : undefined}
                          className={`auth-input ${resetEmailError ? 'auth-input-error' : ''}`}
                          required
                        />
                      </div>
                      {resetEmailError && (
                        <div id="reset-email-error" role="alert" className="auth-field-error">
                          {resetEmailError}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="auth-submit"
                    >
                      {resetLoading && <span className="auth-spinner" aria-hidden="true" />}
                      <span>{resetLoading ? 'Enviando enlace...' : 'Enviar correo de recuperación'}</span>
                    </button>
                  </form>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
};

