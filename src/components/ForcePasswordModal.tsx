import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabase';
import { validateRegisterPassword, validatePasswordConfirm } from '../utils/formValidation';

export const ForcePasswordModal: React.FC = () => {
  const { currentUser } = useApp();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!currentUser || currentUser.needsPasswordSet !== true) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const pwdErr = validateRegisterPassword(password);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    const confirmErr = validatePasswordConfirm(password, confirmPassword);
    if (confirmErr) {
      setError(confirmErr);
      return;
    }

    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase no configurado');

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: { needs_password_set: false }
      });

      if (updateError) throw updateError;

      if (window.location.pathname.startsWith('/reset-password')) {
        window.history.replaceState({}, document.title, '/');
      }
      // Reload page strictly to clean up states and ensure everything is updated
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la contraseña');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      background: 'var(--glass-overlay)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="card"
        style={{
          width: '100%', maxWidth: '420px', background: 'var(--neutral-surface)',
          border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-xl)', padding: '2rem',
          boxShadow: 'var(--shadow-hover)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: '56px', height: '56px', background: 'var(--secondary-light)', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--secondary-hover)' }}>
            <KeyRound size={28} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 8px' }}>
            Protege tu cuenta
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
            ¡Bienvenido a GastroSync! Por motivos de seguridad, debes configurar una contraseña permanente para tu restaurante antes de continuar.
          </p>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--primary-border)', padding: '12px', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.875rem', display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.6px' }}>NUEVA CONTRASEÑA</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mín. 8 caracteres"
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.6px' }}>CONFIRMAR CONTRASEÑA</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repite tu contraseña"
              required
            />
          </div>
          
          <button
            type="submit"
            className="btn btn-primary btn-full"
            style={{ padding: '12px', fontWeight: 700, borderRadius: 'var(--radius-md)', marginTop: '0.5rem', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Guardando...' : 'Guardar y Continuar'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
