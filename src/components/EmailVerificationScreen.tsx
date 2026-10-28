import React, { useState, useEffect, useRef } from 'react';
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
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    await resendVerificationEmail();
    setIsResending(false);
    setCooldown(60);
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = window.setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
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
    if (pendingVerificationEmail && pendingVerificationEmail.trim()) {
      window.location.href = `mailto:${encodeURIComponent(pendingVerificationEmail.trim())}`;
    } else {
      window.location.href = `mailto:`;
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 64px)',
      background: 'var(--neutral-bg)',
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
          opacity: 0.14,
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 50% 30%, var(--primary) 0%, transparent 45%)'
        }}
      />

      <div className="card" style={{
        position: 'relative',
        zIndex: 10,
        maxWidth: '440px',
        width: '100%',
        background: 'var(--neutral-surface)',
        padding: '2rem',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--neutral-border)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'var(--primary-light)',
            borderRadius: 'var(--radius-xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--primary-border)',
            color: 'var(--primary)'
          }}>
            <Mail size={32} />
          </div>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, textAlign: 'center', margin: '0 0 0.5rem', color: 'var(--text-main)' }}>
          Confirma tu correo para continuar
        </h1>
        
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
          Te enviamos un enlace de confirmación a <strong style={{ color: 'var(--text-main)' }}>{pendingVerificationEmail || 'tu correo electrónico'}</strong>. Abre tu bandeja de entrada, confirma la cuenta y vuelve aquí para continuar.
        </p>

        {(emailVerificationState === 'error' || emailVerificationState === 'expired') && (
          <div style={{
            marginBottom: '1.25rem',
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--danger-light)',
            border: '1px solid var(--primary-border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}>
            <AlertTriangle style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} size={18} />
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--danger)', lineHeight: 1.45 }}>
              Todavía no detectamos la confirmación. Revisa el enlace recibido en tu correo (incluyendo Spam) e inténtalo nuevamente.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={openMailApp}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            Abrir aplicación de correo
            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn btn-outline"
            style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {isRefreshing ? <RefreshCw className="spin" size={18} /> : <CheckCircle size={18} />}
            Ya confirmé mi correo
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className="btn btn-outline"
            style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: cooldown > 0 || isResending ? 0.6 : 1 }}
          >
            {isResending ? <RefreshCw className="spin" size={18} /> : <Mail size={18} />}
            {cooldown > 0 ? `Podrás solicitar otro correo en ${cooldown}s` : 'Reenviar correo'}
          </button>
        </div>

        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--neutral-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          <button 
            type="button"
            onClick={signOutUnverifiedUser}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.35rem 0' }}
          >
            <Edit2 size={16} />
            Cambiar correo
          </button>

          <button 
            type="button"
            onClick={signOutUnverifiedUser}
            style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.875rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.35rem 0' }}
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};
