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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 50% 30%, var(--primary) 0%, transparent 40%)'
      }} />

      <div className="relative z-10 max-w-md w-full bg-[#111111] p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/30 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]">
            <Mail className="text-primary w-8 h-8" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-2">Confirma tu correo para continuar</h1>
        
        <p className="text-center text-gray-400 mb-6 text-sm leading-relaxed">
          Te enviamos un enlace de confirmación a <strong className="text-white">{pendingVerificationEmail}</strong>. Abre tu correo, confirma la cuenta y vuelve aquí para continuar.
        </p>

        {emailVerificationState === 'error' && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-red-200">Todavía no detectamos la confirmación. Revisa el enlace recibido e inténtalo nuevamente.</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={openMailApp}
            className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            Abrir aplicación de correo
            <ArrowRight size={18} />
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full py-3 px-4 bg-white/5 border border-white/10 font-medium rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {isRefreshing ? <RefreshCw className="spin" size={18} /> : <CheckCircle size={18} />}
            Ya confirmé mi correo
          </button>

          <button
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className="w-full py-3 px-4 bg-white/5 border border-white/10 font-medium rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {isResending ? <RefreshCw className="spin" size={18} /> : <Mail size={18} />}
            {cooldown > 0 ? `Podrás solicitar otro correo en ${cooldown}s` : 'Reenviar correo'}
          </button>
        </div>

        <div className="mt-8 flex items-center justify-between pt-6 border-t border-white/10">
          <button 
            onClick={signOutUnverifiedUser}
            className="text-sm text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
          >
            <Edit2 size={16} />
            Cambiar correo
          </button>

          <button 
            onClick={signOutUnverifiedUser}
            className="text-sm text-red-400 hover:text-red-300 flex items-center gap-2 transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};
