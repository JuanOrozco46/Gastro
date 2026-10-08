import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, Mail, User,
  Eye, EyeOff, Utensils,
  AlertCircle, Building2, CheckCircle2, X, KeyRound
} from 'lucide-react';
import { PartnerApplicationModal } from './PartnerApplicationModal';
import {
  validateEmail,
  validateName,
  validateRegisterPassword,
  validatePasswordConfirm,
  evaluatePasswordStrength
} from '../utils/formValidation';

/* ── Animated feature cards shown on the left panel ────────── */
const FEATURES = [
  { icon: '📸', title: 'Descubre sabores locales', desc: 'Fotos reales de platos que puedes pedir con un solo clic' },
  { icon: '🛵', title: 'Pide directo al restaurante', desc: 'Tu pedido va directamente a la cocina, sin intermediarios' },
  { icon: '🍽️', title: 'Restaurantes de Armenia', desc: 'Apoya el comercio local del Quindío con cada pedido' },
];

type AuthTab = 'login' | 'register';

interface TabFieldErrors {
  email: string | null;
  password: string | null;
  name: string | null;
  confirmPassword: string | null;
}

const EMPTY_FIELD_ERRORS: TabFieldErrors = {
  email: null,
  password: null,
  name: null,
  confirmPassword: null,
};

export const LoginScreen: React.FC = () => {
  const { authMode, loginWithCredentials, loginWithGoogle, registerAccount, sendPasswordReset } = useApp();
  const [tab, setTab] = useState<AuthTab>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const [showPartnerModal, setShowPartnerModal] = useState(false);

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
    setName(e.target.value);
    setTabFieldError('name', null);
    setLoginError(null);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    setTabFieldError('confirmPassword', null);
    setLoginError(null);
  };

  // Cycle features every 3.5s
  React.useEffect(() => {
    const t = setInterval(() => setActiveFeature(i => (i + 1) % FEATURES.length), 3500);
    return () => clearInterval(t);
  }, []);

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
      const emailErr = validateEmail(email);
      const passErr = validateRegisterPassword(password);
      const confirmErr = validatePasswordConfirm(password, confirmPassword);
      if (nameErr || emailErr || passErr || confirmErr) {
        setErrorsByTab(prev => ({
          ...prev,
          register: {
            name: nameErr,
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
        const res = await registerAccount(name.trim(), email, password, 'client_delivery');
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

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="login-page"
    >
      {/* ── LEFT PANEL — Brand & Visual ── */}
      <motion.div 
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="login-brand-panel"
        style={{
          background: 'linear-gradient(145deg, #181614 0%, #25211D 100%)',
          border: '1px solid var(--primary-border)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)'
        }}
      >
        {/* Background decorative glow spots */}
        <div style={{
          position: 'absolute',
          top: '-60px',
          left: '-60px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(200, 90, 56, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-60px',
          right: '-60px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(107, 140, 106, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div className="brand-content" style={{ position: 'relative', zIndex: 2 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'var(--neutral-dark)',
              border: '1px solid var(--primary-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)'
            }}>
              <Utensils size={24} />
            </div>
            <div>
              <span style={{ fontFamily: "var(--font-display)", fontSize: '1.6rem', fontWeight: 700, color: 'white', letterSpacing: '-0.3px' }}>
                GastroSync
              </span>
              <span style={{
                marginLeft: '8px',
                padding: '3px 9px',
                borderRadius: '6px',
                background: 'var(--primary-light)',
                border: '1px solid var(--primary-border)',
                color: 'var(--primary)',
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.5px'
              }}>
                ARMENIA MVP
              </span>
            </div>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: '2.3rem', fontWeight: 700, lineHeight: 1.2, color: 'white', letterSpacing: '-0.5px', marginBottom: '1rem' }}>
              Descubre qué<br />comer en<br />
              <span style={{
                color: 'var(--primary)'
              }}>
                Armenia, Quindío.
              </span>
            </h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.95rem', lineHeight: 1.6 }}>
              Antojos, restaurantes y pedidos directos en tu zona. Explora los sabores del Eje Cafetero.
            </p>
          </div>

          {/* Animated Feature Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(200, 90, 56, 0.2)',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            marginBottom: '2rem',
            backdropFilter: 'blur(10px)'
          }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFeature}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
              >
                <span style={{ fontSize: '1.8rem', background: 'rgba(200, 90, 56, 0.15)', padding: '10px', borderRadius: '12px' }}>
                  {FEATURES[activeFeature].icon}
                </span>
                <div>
                  <strong style={{ fontSize: '0.95rem', color: 'white', display: 'block', marginBottom: '2px', fontFamily: "var(--font-display)" }}>
                    {FEATURES[activeFeature].title}
                  </strong>
                  <p style={{ fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.65)', margin: 0, lineHeight: 1.4 }}>
                    {FEATURES[activeFeature].desc}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
            
            <div style={{ display: 'flex', gap: '6px', marginTop: '1rem', justifyContent: 'center' }}>
              {FEATURES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFeature(i)}
                  style={{
                    width: i === activeFeature ? '24px' : '8px',
                    height: '6px',
                    borderRadius: '3px',
                    background: i === activeFeature ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Local context */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '14px 20px',
            borderRadius: '14px',
            border: '1px solid rgba(200, 169, 126, 0.15)'
          }}>
            <span style={{ fontSize: '1.5rem' }}>🇨🇴</span>
            <div>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', display: 'block' }}>Armenia, Quindío</span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Restaurantes locales · Pedidos directos</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── RIGHT PANEL — Auth Form ── */}
      <motion.div 
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        className="login-form-panel"
      >
        {/* Connection Status */}
        {authMode === 'demo' && (
          <div style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            fontSize: '0.8rem',
            color: '#991B1B',
            marginBottom: '1.25rem',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, color: '#DC2626' }} />
            <span><strong>Modo Demo Local:</strong> El servicio remoto de autenticación no está configurado. Operando con cuentas locales.</span>
          </div>
        )}

        {authMode === 'remote' && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            fontSize: '0.78rem',
            color: '#065F46',
            marginBottom: '1.25rem',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0, color: '#059669' }} />
            <span><strong>Conectado</strong> — Listo para explorar restaurantes y hacer pedidos.</span>
          </div>
        )}

        {/* Tab Switcher */}
        {/* Tab Switcher */}
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

        {/* Error Alert Box */}
        {loginError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="auth-alert error"
            role="alert"
          >
            <AlertCircle size={18} style={{ color: '#DC2626', flexShrink: 0 }} />
            <span>{loginError}</span>
          </motion.div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {tab === 'register' && (
            <div className="auth-field">
              <label htmlFor="auth-name" className="auth-label">Nombre completo</label>
              <div className="auth-input-wrap">
                <div className="auth-field-icon">
                  <User size={18} />
                </div>
                <input
                  id="auth-name"
                  type="text"
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
          )}

          <div className="auth-field">
            <label htmlFor="auth-email" className="auth-label">Correo electrónico</label>
            <div className="auth-input-wrap">
              <div className="auth-field-icon">
                <Mail size={18} />
              </div>
              <input
                id="auth-email"
                type="email"
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
              {tab === 'login' && (
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
              )}
            </div>
            <div className="auth-input-wrap">
              <div className="auth-field-icon">
                <Lock size={18} />
              </div>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
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

            {/* Field error for password */}
            {fieldErrors.password && (
              <div id="auth-password-error" role="alert" className="auth-field-error">
                {fieldErrors.password}
              </div>
            )}

            {/* Password Strength Indicator (only on register) */}
            {tab === 'register' && password.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ marginTop: '8px' }}
              >
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: '4px',
                        borderRadius: '2px',
                        background: i < passwordStrength.score
                          ? passwordStrength.color
                          : 'var(--neutral-border)',
                        transition: 'all 0.3s'
                      }}
                    />
                  ))}
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: passwordStrength.color
                }}>
                  Seguridad: {passwordStrength.label}
                </span>
                {passwordStrength.score < 3 && (
                  <div style={{ marginTop: '4px' }}>
                    {passwordStrength.checks.filter(c => !c.passed).map((c, i) => (
                      <span key={i} style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        • {c.text}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {tab === 'register' && (
            <div className="auth-field">
              <label htmlFor="auth-confirm-password" className="auth-label">Confirmar contraseña</label>
              <div className="auth-input-wrap">
                <div className="auth-field-icon">
                  <Lock size={18} />
                </div>
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  onBlur={handleConfirmPasswordBlur}
                  aria-invalid={!!fieldErrors.confirmPassword}
                  aria-describedby={fieldErrors.confirmPassword ? 'auth-confirm-password-error' : undefined}
                  className={`auth-input has-icon-right ${fieldErrors.confirmPassword ? 'auth-input-error' : ''}`}
                  required
                />
              </div>
              {fieldErrors.confirmPassword && (
                <div id="auth-confirm-password-error" role="alert" className="auth-field-error">
                  {fieldErrors.confirmPassword}
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading && <span className="auth-spinner" aria-hidden="true" />}
            <span>
              {loading
                ? (tab === 'login' ? 'Validando...' : 'Creando cuenta...')
                : (tab === 'login' ? 'Iniciar Sesión' : 'Crear Mi Cuenta')
              }
            </span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--neutral-border)' }} />
            <span style={{ padding: '0 10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, color: 'var(--text-muted)' }}>o también</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--neutral-border)' }} />
          </div>

          <motion.button
            whileHover={{ scale: 1.01, backgroundColor: 'var(--neutral-surface-alt)' }}
            whileTap={{ scale: 0.99 }}
            type="button"
            onClick={() => loginWithGoogle()}
            disabled={authMode === 'demo'}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: '1.5px solid var(--neutral-border-strong)',
              background: '#FFFFFF',
              color: '#141210',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: authMode === 'remote' ? 'pointer' : 'not-allowed',
              opacity: authMode === 'remote' ? 1 : 0.5,
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              transition: 'all 0.2s ease'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Continuar con Google
          </motion.button>
        </form>

        {/* Dedicated Restaurant Onboarding Card */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1.2rem 1.25rem',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, rgba(200, 169, 126, 0.14) 0%, rgba(200, 169, 126, 0.05) 100%)',
          border: '1px solid rgba(200, 169, 126, 0.35)',
          textAlign: 'left',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #d4a359 0%, #b8843b 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(184, 132, 59, 0.28)'
            }}>
              <Building2 size={18} />
            </div>
            <div>
              <div style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '0.92rem', lineHeight: 1.25 }}>
                ¿Tienes un restaurante en el Quindío?
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9a6b28', fontWeight: 700, marginTop: '2px' }}>
                Sin mensualidad · Comisión del 3% · Menú QR y Domicilios
              </div>
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
            Digitaliza tu restaurante, recibe pedidos directos a cocina y gestiona tus mesas en minutos.
          </p>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="button"
            onClick={() => setShowPartnerModal(true)}
            style={{
              width: '100%',
              padding: '11px 18px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #c8964e 0%, #b37d33 100%)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.88rem',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 16px rgba(179, 125, 51, 0.28)'
            }}
          >
            <span>🤝 Registrar mi restaurante aliado</span>
          </motion.button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '1.1rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          🍽️ GastroSync · Armenia, Quindío
        </div>

        <PartnerApplicationModal
          isOpen={showPartnerModal}
          onClose={() => setShowPartnerModal(false)}
        />

        {/* Modal de Restablecimiento de Contraseña */}
        <AnimatePresence>
          {showResetModal && (
            <div className="modal-overlay" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}>
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                style={{
                  background: 'var(--neutral-surface)',
                  border: '1px solid var(--neutral-border)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '2rem',
                  maxWidth: '440px',
                  width: '100%',
                  position: 'relative',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.12)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  aria-label="Cerrar recuperación de contraseña"
                  style={{
                    position: 'absolute',
                    top: '18px',
                    right: '18px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={20} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'var(--primary-light)',
                    border: '1px solid var(--primary-border)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <KeyRound size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                      Recuperar Contraseña
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Restablece el acceso a tu cuenta
                    </span>
                  </div>
                </div>

                {resetSuccessMessage ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-sm)',
                      background: '#ECFDF5',
                      border: '1px solid #A7F3D0',
                      color: '#065F46',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      marginBottom: '1rem'
                    }}
                  >
                    <CheckCircle2 size={24} style={{ marginBottom: '8px', display: 'block', color: '#059669' }} />
                    {resetSuccessMessage}
                  </motion.div>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                      Ingresa tu correo electrónico registrado y te enviaremos un enlace seguro para crear una nueva contraseña.
                    </p>

                    {resetErrorMessage && (
                      <div className="auth-alert error" role="alert" style={{ marginBottom: 0 }}>
                        <AlertCircle size={18} style={{ color: '#DC2626', flexShrink: 0 }} />
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
                      style={{ marginTop: '4px' }}
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
      </motion.div>
    </motion.div>
  );
};
