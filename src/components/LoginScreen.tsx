import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, Mail, User, ArrowRight, ShieldCheck,
  Eye, EyeOff, Utensils, Bike, BarChart3, ChefHat,
  Star, Zap, AlertCircle
} from 'lucide-react';
import { DEMO_ACCOUNTS, COMMON_DEMO_PASSWORD } from '../context/demoAccounts';
import { PartnerApplicationModal } from './PartnerApplicationModal';

/* ── UI Demo Accounts Display Cards ────────────────────────── */
const UI_DEMO_CARDS = [
  {
    email: 'cliente@demo.gastrosync.co',
    label: 'Cliente Demo (Armenia)',
    roleBadge: 'Cliente',
    description: 'Explora el feed gastronómico y realiza pedidos',
    icon: <Bike size={20} />,
    color: '#FF5533',
    bg: 'rgba(255, 85, 51, 0.14)',
    border: 'rgba(255, 85, 51, 0.3)',
  },
  {
    email: 'restaurante@demo.gastrosync.co',
    label: 'Dueño de Restaurante',
    roleBadge: 'Dueño (La Trattoria)',
    description: 'Dashboard de ventas, menú y configuración',
    icon: <BarChart3 size={20} />,
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.14)',
    border: 'rgba(16, 185, 129, 0.3)',
  },
  {
    email: 'cocina@demo.gastrosync.co',
    label: 'Personal de Cocina',
    roleBadge: 'Personal Cocina (KDS)',
    description: 'Panel KDS de comanda en vivo y preparación',
    icon: <ChefHat size={20} />,
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.14)',
    border: 'rgba(245, 158, 11, 0.3)',
  },
  {
    email: 'admin@demo.gastrosync.co',
    label: 'Administrador de Plataforma',
    roleBadge: 'Uso interno de GastroSync',
    description: 'Revisión de solicitudes de aliados y métricas globales',
    icon: <ShieldCheck size={20} />,
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.14)',
    border: 'rgba(139, 92, 246, 0.3)',
  },
];

/* ── Animated feature cards shown on the left panel ────────── */
const FEATURES = [
  { icon: '📸', title: 'Red Social Gastronómica', desc: 'Posts en vivo de platos irresistibles con pedido en 1 clic' },
  { icon: '🛵', title: 'Domicilio Directo sin Comisión', desc: '97% del valor real para el restaurante sin recargos abusivos' },
  { icon: '📊', title: 'Gestión KDS en Tiempo Real', desc: 'Control de comandas, menú dinámico y analítica de ventas' },
];

export const LoginScreen: React.FC = () => {
  const { loginWithCredentials, registerAccount } = useApp();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const [showPartnerModal, setShowPartnerModal] = useState(false);

  // Cycle features every 3.5s
  React.useEffect(() => {
    const t = setInterval(() => setActiveFeature(i => (i + 1) % FEATURES.length), 3500);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!email || !password) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    if (tab === 'login') {
      const ok = loginWithCredentials(email, password);
      if (!ok) {
        setLoginError('Correo o contraseña incorrectos.');
      }
    } else {
      // Demo local registration only; real registration will be backed by API service
      registerAccount(name || 'Cliente Demo', email, password, 'client_delivery');
    }
    setLoading(false);
  };

  const handleQuickDemoLogin = (demoEmail: string) => {
    setLoginError(null);
    setEmail(demoEmail);
    setPassword(COMMON_DEMO_PASSWORD);
    loginWithCredentials(demoEmail, COMMON_DEMO_PASSWORD);
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
      >
        {/* Background decorative glow spots */}
        <div style={{
          position: 'absolute',
          top: '-60px',
          left: '-60px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(255, 85, 51, 0.25) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-60px',
          right: '-60px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div className="brand-content" style={{ position: 'relative', zIndex: 2 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, var(--primary), #e11d48)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 6px 20px rgba(255, 85, 51, 0.4)'
            }}>
              <Utensils size={26} />
            </div>
            <div>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
                GastroSync
              </span>
              <span style={{
                marginLeft: '8px',
                padding: '2px 8px',
                borderRadius: '8px',
                background: 'rgba(255, 85, 51, 0.2)',
                color: 'var(--primary)',
                fontSize: '0.7rem',
                fontWeight: 800
              }}>
                ARMENIA PILOT MVP
              </span>
            </div>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '2.3rem', fontWeight: 900, lineHeight: 1.15, color: 'white', letterSpacing: '-0.8px', marginBottom: '1rem' }}>
              La plataforma<br />gastronómica<br />
              <span style={{
                background: 'linear-gradient(135deg, var(--primary), #F59E0B)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                sin comisiones abusivas.
              </span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.6 }}>
              Conecta restaurantes independientes, chefs y comensales en un ecosistema directo, transparente y orgánico en Armenia, Quindío.
            </p>
          </div>

          {/* Animated Feature Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
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
                <span style={{ fontSize: '2rem', background: 'rgba(255,255,255,0.08)', padding: '10px', borderRadius: '14px' }}>
                  {FEATURES[activeFeature].icon}
                </span>
                <div>
                  <strong style={{ fontSize: '0.95rem', color: 'white', display: 'block', marginBottom: '2px' }}>
                    {FEATURES[activeFeature].title}
                  </strong>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
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
                    height: '8px',
                    borderRadius: '4px',
                    background: i === activeFeature ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Trust Stats */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '14px 20px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', display: 'block' }}>97%</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pago Directo</span>
            </div>
            <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Star size={16} fill="#F59E0B" strokeWidth={0} />
              <div>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', display: 'block' }}>4.9/5</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Satisfacción</span>
              </div>
            </div>
            <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10B981', display: 'block' }}>0%</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Comisión Extra</span>
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
        {/* Direct One-Click Client Feed Entrance Banner */}
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ marginBottom: '1.25rem' }}
        >
          <button
            type="button"
            onClick={() => handleQuickDemoLogin(DEMO_ACCOUNTS[0].email)}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: '18px',
              fontWeight: 900,
              fontSize: '1rem',
              background: 'linear-gradient(135deg, var(--primary), #e04424)',
              boxShadow: '0 8px 24px rgba(255, 85, 51, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              letterSpacing: '-0.2px'
            }}
          >
            <Bike size={22} />
            <span>🛵 Probar como Cliente Demo (Armenia)</span>
            <ArrowRight size={20} />
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textAlign: 'center', marginTop: '8px', fontWeight: 600 }}>
            ⚡ Iniciar sesión instantánea como Cliente sin escribir
          </span>
        </motion.div>

        {/* Local Demo Notice */}
        <div style={{
          padding: '10px 14px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          marginBottom: '1.25rem',
          lineHeight: 1.4
        }}>
          💡 <strong>Demostración Local MVP:</strong> Accede con credenciales predefinidas. Contraseña demo para todas las cuentas: <code style={{ color: 'white', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{COMMON_DEMO_PASSWORD}</code>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '4px',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '1.25rem',
          gap: '4px'
        }}>
          <button
            type="button"
            onClick={() => { setTab('login'); setLoginError(null); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: tab === 'login' ? 'var(--primary)' : 'transparent',
              color: tab === 'login' ? 'white' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Iniciar Sesión Demo
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setLoginError(null); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: tab === 'register' ? 'var(--primary)' : 'transparent',
              color: tab === 'register' ? 'white' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Registro Cliente
          </button>
        </div>

        {/* Error Alert Box */}
        {loginError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#FCA5A5',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '1.1rem'
            }}
          >
            <AlertCircle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span>{loginError}</span>
          </motion.div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {tab === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }}>
                Nombre completo
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Ej. María Fernanda"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', paddingLeft: '44px' }}
                  required
                />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                El registro local crea una cuenta con perfil de Cliente para Armenia.
              </span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }}>
              Correo electrónico
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                placeholder="ejemplo@demo.gastrosync.co"
                value={email}
                onChange={e => { setEmail(e.target.value); setLoginError(null); }}
                style={{ width: '100%', paddingLeft: '44px' }}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="GastroSyncDemo2026!"
                value={password}
                onChange={e => { setPassword(e.target.value); setLoginError(null); }}
                style={{ width: '100%', paddingLeft: '44px', paddingRight: '44px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            className="btn btn-primary"
            style={{
              padding: '14px',
              fontSize: '0.95rem',
              fontWeight: 800,
              borderRadius: '14px',
              marginTop: '4px'
            }}
            disabled={loading}
          >
            {loading ? 'Validando...' : (tab === 'login' ? 'Iniciar Sesión' : 'Registrar Cuenta Cliente')}
          </motion.button>
        </form>

        {/* Demo Roles Quick Cards */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
            ⚡ CUENTAS DEMO HABILITADAS (CLIC PARA INGRESAR)
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {UI_DEMO_CARDS.map(acc => (
              <motion.button
                key={acc.email}
                whileHover={{ scale: 1.015, x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleQuickDemoLogin(acc.email)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '14px',
                  background: acc.bg,
                  border: `1px solid ${acc.border}`,
                  color: 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <div style={{ color: acc.color, display: 'flex', alignItems: 'center' }}>
                  {acc.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '0.84rem', color: 'white' }}>{acc.label}</strong>
                    <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.12)', color: acc.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      {acc.roleBadge}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                    <code>{acc.email}</code>
                  </span>
                </div>
                <Zap size={15} style={{ color: acc.color }} />
              </motion.button>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <button
            type="button"
            onClick={() => setShowPartnerModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary)',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '4px 8px'
            }}
          >
            🏪 ¿Tienes un restaurante en Armenia? Únete como Aliado GastroSync
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '1.1rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <ShieldCheck size={14} style={{ color: '#10B981' }} />
          Demostración local segura MVP GastroSync Armenia
        </div>

        <PartnerApplicationModal
          isOpen={showPartnerModal}
          onClose={() => setShowPartnerModal(false)}
        />
      </motion.div>
    </motion.div>
  );
};
