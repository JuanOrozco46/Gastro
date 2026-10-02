import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabase';

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

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
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
      background: 'rgba(8, 12, 20, 0.95)', backdropFilter: 'blur(24px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="card"
        style={{
          width: '100%', maxWidth: '420px', background: 'var(--glass-dark)',
          border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '24px', padding: '2rem'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: '56px', height: '56px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#10B981' }}>
            <KeyRound size={32} />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'white', margin: '0 0 8px' }}>
            Protege tu cuenta
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
            ¡Bienvenido a GastroSync! Por motivos de seguridad, debes configurar una contraseña permanente para tu restaurante antes de continuar.
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '12px', color: '#FCA5A5', fontSize: '0.8rem', display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>NUEVA CONTRASEÑA</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 caracteres"
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>CONFIRMAR CONTRASEÑA</label>
            <input
              type="password"
              className="input-field"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repite tu contraseña"
              required
            />
          </div>
          
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontWeight: 800, borderRadius: '12px', marginTop: '0.5rem', background: '#10B981', borderColor: '#10B981', color: 'white' }}
            disabled={loading}
          >
            {loading ? 'Guardando...' : 'Guardar y Continuar'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
