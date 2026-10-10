import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Phone, MapPin, Camera, Check, Sparkles, AlertCircle, Trash2
} from 'lucide-react';
import type { UserAccount } from '../types';
import {
  validateName,
  validatePhone,
  validateUsername,
  normalizeUsername,
  suggestUsernameFromName
} from '../utils/formValidation';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useApp();

  if (!isOpen || !currentUser) return null;

  return (
    <UserProfileModalInner
      key={`${currentUser.email}-${currentUser.username || ''}-${currentUser.phone || ''}`}
      currentUser={currentUser}
      onClose={onClose}
    />
  );
};

const UserProfileModalInner: React.FC<{
  currentUser: UserAccount;
  onClose: () => void;
}> = ({ currentUser, onClose }) => {
  const { updateUserProfile, showToast } = useApp();

  const [name, setName] = useState(() => currentUser.name || '');
  const [username, setUsername] = useState(
    () => currentUser.username || suggestUsernameFromName(currentUser.name || '')
  );
  const [phone, setPhone] = useState(() => currentUser.phone || '');
  const [defaultAddress, setDefaultAddress] = useState(() => currentUser.defaultAddress || '');
  const [defaultDeliveryNotes, setDefaultDeliveryNotes] = useState(
    () => currentUser.defaultDeliveryNotes || ''
  );
  const [avatarPreview, setAvatarPreview] = useState<string>(() => currentUser.avatarUrl || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string | null;
    username?: string | null;
    phone?: string | null;
  }>({});

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    if (!rawFile.type.startsWith('image/')) {
      setErrorMsg('Selecciona una imagen válida (JPG, PNG o WEBP).');
      return;
    }
    setIsCompressing(true);
    setErrorMsg(null);
    try {
      const { compressImage } = await import('../utils/imageCompression');
      const result = await compressImage(rawFile, 0.35, 320);
      const dataUrl = await fileToDataUrl(result.file);
      setAvatarFile(result.file);
      setAvatarPreview(dataUrl);
    } catch {
      setErrorMsg('No se pudo procesar la imagen seleccionada.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const nameErr = validateName(name);
    const usernameErr = validateUsername(username);
    const phoneErr = phone.trim() ? validatePhone(phone) : null;

    if (nameErr || usernameErr || phoneErr) {
      setFieldErrors({ name: nameErr, username: usernameErr, phone: phoneErr });
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateUserProfile(
        {
          name: name.trim(),
          username: normalizeUsername(username),
          phone: phone.trim(),
          defaultAddress: defaultAddress.trim(),
          defaultDeliveryNotes: defaultDeliveryNotes.trim(),
          avatarUrl: avatarPreview
        },
        avatarFile
      );

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo actualizar tu perfil.');
        return;
      }

      showToast('✨ Tu perfil, @usuario y datos de entrega se han actualizado.');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const step1Done = !validateName(name) && !validateUsername(username);
  const step2Done = Boolean(phone.trim() && !validatePhone(phone) && defaultAddress.trim().length >= 5);

  return (
    <AnimatePresence>
      <div className="pam-overlay" onClick={onClose}>
        <motion.div
          className="pam-modal"
          style={{ maxWidth: '580px' }}
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Header */}
          <div className="pam-header">
            <div className="pam-header-top">
              <div className="pam-brand-row">
                <div className="pam-icon-badge">
                  <User size={22} />
                </div>
                <div>
                  <div className="pam-eyebrow">
                    <Sparkles size={11} /> Perfil Gastronómico · GastroSync
                  </div>
                  <h2 className="pam-title">Mi Perfil y Datos de Pedido</h2>
                  <p className="pam-subtitle">
                    Tu foto y tu <strong>@usuario</strong> aparecen en tus comentarios y tus datos se autocompletan al pedir.
                  </p>
                </div>
              </div>
              <button type="button" className="pam-close" onClick={onClose} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="pam-body">
              {errorMsg && (
                <div className="auth-alert error" role="alert">
                  <AlertCircle size={18} style={{ color: '#DC2626', flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Sección 1: Identidad y @ */}
              <section className="pam-section">
                <div className="pam-section-head">
                  <div className={`pam-step ${step1Done ? 'done' : ''}`}>
                    {step1Done ? <Check size={15} strokeWidth={3} /> : 1}
                  </div>
                  <div className="pam-section-title-wrap">
                    <h3 className="pam-section-title">Tu identidad y foto de perfil</h3>
                    <p className="pam-section-desc">Visible cuando comentas platos en el feed</p>
                  </div>
                </div>

                {/* Avatar Upload */}
                <div className="urm-avatar-box">
                  <div className="urm-avatar-preview">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt={name || 'Avatar'} />
                    ) : (
                      <span>{(name || currentUser.email || 'U').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="urm-avatar-info">
                    <div className="urm-avatar-title">Foto de perfil</div>
                    <p className="urm-avatar-sub">
                      Sube una foto cuadrada (JPG, PNG o WebP). Se optimiza automáticamente.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                      <label className="urm-avatar-btn">
                        <Camera size={14} />
                        <span>{isCompressing ? 'Optimizando...' : avatarPreview ? 'Cambiar foto' : 'Subir foto'}</span>
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
                    <label className="auth-label">Nombre completo *</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon"><User size={17} /></div>
                      <input
                        type="text"
                        className={`auth-input ${fieldErrors.name ? 'auth-input-error' : ''}`}
                        value={name}
                        onChange={e => {
                          setName(e.target.value);
                          setFieldErrors(prev => ({ ...prev, name: null }));
                        }}
                        placeholder="Ej. María Fernanda López"
                      />
                    </div>
                    {fieldErrors.name && <div className="auth-field-error">{fieldErrors.name}</div>}
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">Tu usuario @ *</label>
                    <div className="auth-input-wrap">
                      <div className="urm-at-prefix">@</div>
                      <input
                        type="text"
                        className={`auth-input ${fieldErrors.username ? 'auth-input-error' : ''}`}
                        style={{ paddingLeft: '38px' }}
                        value={username}
                        onChange={e => {
                          setUsername(normalizeUsername(e.target.value));
                          setFieldErrors(prev => ({ ...prev, username: null }));
                        }}
                        placeholder="maria_lopez"
                        maxLength={24}
                      />
                    </div>
                    {fieldErrors.username && <div className="auth-field-error">{fieldErrors.username}</div>}
                  </div>
                </div>
              </section>

              {/* Sección 2: Datos para pedidos */}
              <section className="pam-section">
                <div className="pam-section-head">
                  <div className={`pam-step ${step2Done ? 'done' : ''}`}>
                    {step2Done ? <Check size={15} strokeWidth={3} /> : 2}
                  </div>
                  <div className="pam-section-title-wrap">
                    <h3 className="pam-section-title">Datos para autocompletar pedidos</h3>
                    <p className="pam-section-desc">Se llenarán automáticamente al pedir a domicilio o para recoger</p>
                  </div>
                </div>

                <div className="pam-grid-1">
                  <div className="auth-field">
                    <label className="auth-label">Teléfono / WhatsApp de contacto</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon"><Phone size={17} /></div>
                      <input
                        type="tel"
                        className={`auth-input ${fieldErrors.phone ? 'auth-input-error' : ''}`}
                        value={phone}
                        onChange={e => {
                          setPhone(e.target.value);
                          setFieldErrors(prev => ({ ...prev, phone: null }));
                        }}
                        placeholder="Ej. +57 300 123 4567"
                      />
                    </div>
                    {fieldErrors.phone && <div className="auth-field-error">{fieldErrors.phone}</div>}
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">Dirección habitual de entrega</label>
                    <div className="auth-input-wrap">
                      <div className="auth-field-icon"><MapPin size={17} /></div>
                      <input
                        type="text"
                        className="auth-input"
                        value={defaultAddress}
                        onChange={e => setDefaultAddress(e.target.value)}
                        placeholder="Ej. Cra 14 # 19-20, Apto 302, Barrio..."
                      />
                    </div>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">Notas de entrega (Apto, torre, indicaciones)</label>
                    <input
                      type="text"
                      className="auth-input no-icon-left"
                      value={defaultDeliveryNotes}
                      onChange={e => setDefaultDeliveryNotes(e.target.value)}
                      placeholder="Ej. Apto 302, timbrar en portería"
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="pam-footer">
              <div className="pam-footer-hint">
                Conectado como <strong>{currentUser.email}</strong>
              </div>
              <div className="pam-footer-actions">
                <button type="button" className="pam-btn-cancel" onClick={onClose} disabled={isSaving}>
                  Cancelar
                </button>
                <button type="submit" className="pam-btn-submit" disabled={isSaving || isCompressing}>
                  {isSaving && <span className="auth-spinner" aria-hidden="true" />}
                  <span>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
