import React, { useState } from 'react';
import { Mail, RefreshCw, LogOut, Edit2, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/useApp';

export const EmailVerificationScreen: React.FC = () => {
  const { 
    pendingVerificationEmail, 
    resendVerificationEmail, 
    refreshEmailVerification, 
    signOutUnverifiedUser,
    emailVerificationState
  } = useApp();

  const [isResending, setIsResending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    await resendVerificationEmail();
    setIsResending(false);
    setCooldown(60);
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshEmailVerification();
    setIsRefreshing(false);
  };

  const openMailApp = () => {
    if (pendingVerificationEmail) {
      window.location.href = `mailto:${pendingVerificationEmail}`;
    } else {
      window.location.href = `mailto:`;
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 64px)',
      background: 'var(--bg-main)',
      color: 'var(--text-main)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          opacity: 0.18,
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 50% 30%, var(--primary) 0%, transparent 45%)'
        }}
      />

      <div className="card" style={{
        position: 'relative',
        zIndex: 10,
        maxWidth: '440px',
        width: '100%',
        background: 'var(--bg-card)',
        padding: '2rem',
        borderRadius: '24px',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'rgba(255, 107, 53, 0.15)',
            borderRadius: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255, 107, 53, 0.35)',
            color: 'var(--primary)'
          }}>
            <Mail size={32} />
          </div>
        </div>

        <h1 style={{ fontSize: '1.45rem', fontWeight: 900, textAlign: 'center', margin: '0 0 0.5rem', color: 'var(--text-main)' }}>
          Confirma tu correo para continuar
        </h1>
        
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
          Te enviamos un enlace de confirmación a <strong style={{ color: 'var(--text-main)' }}>{pendingVerificationEmail || 'tu correo electrónico'}</strong>. Abre tu bandeja de entrada, confirma la cuenta y vuelve aquí para continuar.
        </p>

        {(emailVerificationState === 'error' || emailVerificationState === 'expired') && (
          <div style={{
            marginBottom: '1.25rem',
            padding: '0.9rem 1rem',
            borderRadius: '14px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}>
            <AlertTriangle style={{ color: '#F87171', flexShrink: 0, marginTop: '2px' }} size={18} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#FECACA', lineHeight: 1.45 }}>
              Todavía no detectamos la confirmación. Revisa el enlace recibido en tu correo (incluyendo Spam) e inténtalo nuevamente.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={openMailApp}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            Abrir aplicación de correo
            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn btn-outline"
            style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {isRefreshing ? <RefreshCw className="spin" size={18} /> : <CheckCircle size={18} />}
            Ya confirmé mi correo
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className="btn btn-outline"
            style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: cooldown > 0 || isResending ? 0.6 : 1 }}
          >
            {isResending ? <RefreshCw className="spin" size={18} /> : <Mail size={18} />}
            {cooldown > 0 ? `Podrás solicitar otro correo en ${cooldown}s` : 'Reenviar correo'}
          </button>
        </div>

        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          <button 
            type="button"
            onClick={signOutUnverifiedUser}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.35rem 0' }}
          >
            <Edit2 size={16} />
            Cambiar correo
          </button>

          <button 
            type="button"
            onClick={signOutUnverifiedUser}
            style={{ background: 'transparent', border: 'none', color: '#F87171', fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.35rem 0' }}
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};
