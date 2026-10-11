import React, { useState, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Phone, MapPin, Camera, Check, Sparkles, AlertCircle, Trash2, ShieldCheck, Scale, Plus, Home, Building2
} from 'lucide-react';
import type { SavedDeliveryAddress, UserAccount } from '../types';
import {
  validateName,
  validatePhone,
  validateUsername,
  normalizeUsername,
  suggestUsernameFromName
} from '../utils/formValidation';
import { loadUserAddressBank, sanitizeSavedAddresses } from '../utils/addressBank';
import { openLegalCenter, openCookieSettingsBanner } from '../utils/legalNavigation';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: 'identity' | 'addresses';
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, initialSection = 'identity' }) => {
  const { currentUser } = useApp();

  if (!isOpen || !currentUser) return null;

  return (
    <UserProfileModalInner
      key={`${currentUser.email}-${currentUser.username || ''}-${currentUser.phone || ''}-${initialSection}`}
      currentUser={currentUser}
      onClose={onClose}
      initialSection={initialSection}
    />
  );
};

const UserProfileModalInner: React.FC<{
  currentUser: UserAccount;
  onClose: () => void;
  initialSection: 'identity' | 'addresses';
}> = ({ currentUser, onClose, initialSection }) => {
  const {
    cities,
    zones,
    selectedCityId,
    selectedZoneId,
    setSelectedCity,
    setSelectedZone,
    updateUserProfile,
    deleteMyAccount,
    showToast
  } = useApp();

  const activeCities = useMemo(() => cities.filter((c) => c.isActive), [cities]);

  const initialAddresses = useMemo<SavedDeliveryAddress[]>(() => {
    const bank = loadUserAddressBank([currentUser.id, currentUser.email]);
    const raw = currentUser.savedAddresses?.length ? currentUser.savedAddresses : bank;
    const sanitized = sanitizeSavedAddresses(raw, currentUser.preferredCityId || selectedCityId || activeCities[0]?.id || 'armenia');
    if (sanitized.length > 0) return sanitized;
    if (currentUser.defaultAddress?.trim()) {
      return [
        {
          id: 'addr-default',
          label: 'Casa',
          address: currentUser.defaultAddress.trim(),
          notes: currentUser.defaultDeliveryNotes?.trim() || undefined,
          cityId: currentUser.preferredCityId || selectedCityId || activeCities[0]?.id || 'armenia',
          zoneId: currentUser.preferredZoneId || selectedZoneId || null,
          isPrimary: true,
          isDefault: true
        }
      ];
    }
    return [];
  }, [currentUser, selectedCityId, selectedZoneId, activeCities]);

  const primaryInitialAddress = initialAddresses.find((a) => a.isPrimary) || initialAddresses[0];

  const [name, setName] = useState(() => currentUser.name || '');
  const [username, setUsername] = useState(
    () => currentUser.username || suggestUsernameFromName(currentUser.name || '')
  );
  const [phone, setPhone] = useState(() => currentUser.phone || '');
  const [preferredCityId, setPreferredCityId] = useState<string>(
    () => primaryInitialAddress?.cityId || currentUser.preferredCityId || selectedCityId || activeCities[0]?.id || ''
  );
  const [preferredZoneId, setPreferredZoneId] = useState<string | null>(
    () => primaryInitialAddress?.zoneId ?? currentUser.preferredZoneId ?? selectedZoneId ?? null
  );
  const [savedAddresses, setSavedAddresses] = useState<SavedDeliveryAddress[]>(initialAddresses);

  // Estado para agregar una nueva ubicación al banco
  const [isAddingAddress, setIsAddingAddress] = useState<boolean>(() => initialAddresses.length === 0 || initialSection === 'addresses');
  const [newAddressLabel, setNewAddressLabel] = useState<'Casa' | 'Oficina' | 'Apartamento' | 'Pareja'>('Casa');
  const [newAddressText, setNewAddressText] = useState('');
  const [newAddressNotes, setNewAddressNotes] = useState('');
  const [newAddressCityId, setNewAddressCityId] = useState<string>(
    () => primaryInitialAddress?.cityId || currentUser.preferredCityId || selectedCityId || activeCities[0]?.id || ''
  );

  const [avatarPreview, setAvatarPreview] = useState<string>(() => currentUser.avatarUrl || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado para Derecho de Supresión (Ley 1581 de 2012)
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string | null;
    username?: string | null;
    phone?: string | null;
    newAddress?: string | null;
  }>({});

  const availableZones = useMemo(
    () => zones.filter((z) => z.cityId === preferredCityId && z.isActive),
    [zones, preferredCityId]
  );

  const resolveCityName = (cityIdRef: string) => {
    const found = activeCities.find(
      (c) =>
        c.id === cityIdRef ||
        (c.slug || '').toLowerCase() === cityIdRef.toLowerCase() ||
        c.name.toLowerCase() === cityIdRef.toLowerCase()
    );
    return found ? found.name : 'Tu ciudad';
  };

  const handleSelectPrimaryAddress = (addrId: string) => {
    setSavedAddresses((prev) =>
      prev.map((item) => {
        const isTarget = item.id === addrId;
        if (isTarget && item.cityId) {
          setPreferredCityId(item.cityId);
          setPreferredZoneId(item.zoneId || null);
        }
        return { ...item, isPrimary: isTarget };
      })
    );
  };

  const handleDeleteAddress = (addrId: string) => {
    setSavedAddresses((prev) => {
      const filtered = prev.filter((a) => a.id !== addrId);
      if (filtered.length > 0 && !filtered.some((a) => a.isPrimary)) {
        filtered[0] = { ...filtered[0], isPrimary: true };
      }
      return filtered;
    });
  };

  const handleAddAddressToBank = () => {
    const cleanText = newAddressText.trim();
    if (cleanText.length < 5) {
      setFieldErrors((prev) => ({
        ...prev,
        newAddress: 'Ingresa una dirección válida (mínimo 5 caracteres).'
      }));
      return;
    }
    const targetCityId = newAddressCityId || preferredCityId || selectedCityId || activeCities[0]?.id || 'armenia';
    const created: SavedDeliveryAddress = {
      id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: newAddressLabel,
      address: cleanText,
      notes: newAddressNotes.trim() || undefined,
      cityId: targetCityId,
      zoneId: targetCityId === preferredCityId ? preferredZoneId : null,
      isPrimary: true,
      createdAt: Date.now()
    };

    setSavedAddresses((prev) => [
      created,
      ...prev.map((item) => ({ ...item, isPrimary: false }))
    ]);
    setPreferredCityId(targetCityId);
    setNewAddressText('');
    setNewAddressNotes('');
    setFieldErrors((prev) => ({ ...prev, newAddress: null }));
    setIsAddingAddress(false);
  };

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

    // Si el usuario escribió una dirección en el formulario de nueva ubicación sin pulsar "+ Guardar ubicación", incluirla automáticamente
    let nextBank = [...savedAddresses];
    if (newAddressText.trim().length >= 5) {
      const targetCityId = newAddressCityId || preferredCityId || selectedCityId || activeCities[0]?.id || 'armenia';
      const pendingAddr: SavedDeliveryAddress = {
        id: `addr-${Date.now()}`,
        label: newAddressLabel,
        address: newAddressText.trim(),
        notes: newAddressNotes.trim() || undefined,
        cityId: targetCityId,
        zoneId: targetCityId === preferredCityId ? preferredZoneId : null,
        isPrimary: true,
        createdAt: Date.now()
      };
      nextBank = [pendingAddr, ...nextBank.map((a) => ({ ...a, isPrimary: false }))];
    }

    const activeAddr = nextBank.find((a) => a.isPrimary) || nextBank[0];
    const finalCityId = preferredCityId || activeAddr?.cityId || selectedCityId;

    setIsSaving(true);
    try {
      const res = await updateUserProfile(
        {
          name: name.trim(),
          username: normalizeUsername(username),
          phone: phone.trim(),
          defaultAddress: activeAddr?.address || '',
          defaultDeliveryNotes: activeAddr?.notes || '',
          preferredCityId: finalCityId,
          preferredZoneId,
          savedAddresses: nextBank,
          avatarUrl: avatarPreview
        },
        avatarFile
      );

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo actualizar tu perfil.');
        return;
      }

      if (finalCityId && finalCityId !== selectedCityId) {
        setSelectedCity(finalCityId);
      }
      if (preferredZoneId !== selectedZoneId) {
        setSelectedZone(preferredZoneId);
      }

      showToast('✨ Tu perfil, banco de ubicaciones y ciudad principal se han actualizado.');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmAccountDeletion = async () => {
    setDeleteError(null);
    if (deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR MI CUENTA') {
      setDeleteError('Debes escribir exactamente ELIMINAR MI CUENTA en mayúsculas.');
      return;
    }
    setIsDeletingAccount(true);
    try {
      const res = await deleteMyAccount(deleteConfirmText);
      if (!res.success) {
        setDeleteError(res.error || 'No se pudo procesar la supresión de la cuenta.');
        return;
      }
      onClose();
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const step1Done = !validateName(name) && !validateUsername(username);
  const step2Done = Boolean(savedAddresses.length > 0 || newAddressText.trim().length >= 5);

  const addressBankSection = (
    <section className="pam-section">
      <div className="pam-section-head">
        <div className={`pam-step ${step2Done ? 'done' : ''}`}>
          {step2Done ? <Check size={15} strokeWidth={3} /> : <MapPin size={15} />}
        </div>
        <div className="pam-section-title-wrap">
          <h3 className="pam-section-title">Banco de Ubicaciones y Ciudad Principal</h3>
          <p className="pam-section-desc">
            Cambia de ciudad o elige tu dirección activa para ver los restaurantes de tu zona y agilizar tus pagos
          </p>
        </div>
      </div>

      <div className="pam-grid-2">
        <div className="auth-field">
          <label htmlFor="profile-city-select" className="auth-label">Ciudad donde estás pidiendo *</label>
          <div className="auth-input-wrap">
            <div className="auth-field-icon"><MapPin size={17} /></div>
            <select
              id="profile-city-select"
              className="auth-input"
              value={preferredCityId}
              onChange={(e) => {
                const nextCity = e.target.value;
                setPreferredCityId(nextCity);
                setPreferredZoneId(null);
                setNewAddressCityId(nextCity);
              }}
            >
              {activeCities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="profile-zone-select" className="auth-label">Zona / Sector (Opcional)</label>
          <div className="auth-input-wrap">
            <div className="auth-field-icon"><Building2 size={17} /></div>
            <select
              id="profile-zone-select"
              className="auth-input"
              value={preferredZoneId || ''}
              onChange={(e) => setPreferredZoneId(e.target.value || null)}
            >
              <option value="">Todas las zonas de {resolveCityName(preferredCityId)}</option>
              {availableZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista del Banco de Ubicaciones */}
      <div className="gs-address-bank-list" role="radiogroup" aria-label="Mis ubicaciones guardadas">
        <div className="gs-address-bank-header">
          <span className="gs-address-bank-title">
            Mis ubicaciones frecuentes ({savedAddresses.length})
          </span>
          {!isAddingAddress && (
            <button
              type="button"
              className="gs-address-bank-add-trigger"
              onClick={() => {
                setNewAddressCityId(preferredCityId);
                setIsAddingAddress(true);
              }}
            >
              <Plus size={14} />
              <span>Nueva ubicación</span>
            </button>
          )}
        </div>

        {savedAddresses.length > 0 ? (
          <div className="gs-address-bank-items">
            {savedAddresses.map((addr) => {
              const isSelected = Boolean(addr.isPrimary);
              return (
                <div
                  key={addr.id}
                  className={`gs-address-bank-item ${isSelected ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    className="gs-address-bank-select-btn"
                    onClick={() => handleSelectPrimaryAddress(addr.id)}
                    aria-pressed={isSelected}
                  >
                    <span className="gs-address-bank-radio" aria-hidden="true">
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </span>
                    <div className="gs-address-bank-meta">
                      <div className="gs-address-bank-topline">
                        <span className="gs-address-bank-tag">{addr.label}</span>
                        <span className="gs-address-bank-city">{resolveCityName(addr.cityId)}</span>
                        {isSelected && <span className="gs-address-bank-active-pill">En uso</span>}
                      </div>
                      <span className="gs-address-bank-street">{addr.address}</span>
                      {addr.notes && <span className="gs-address-bank-notes">{addr.notes}</span>}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="gs-address-bank-delete-btn"
                    onClick={() => handleDeleteAddress(addr.id)}
                    aria-label={`Eliminar ubicación ${addr.label}`}
                    title="Eliminar ubicación"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="gs-address-bank-empty">
            Aún no tienes direcciones en tu banco de ubicaciones. Registra tu casa u oficina abajo para pedir en un toque.
          </p>
        )}

        {isAddingAddress && (
          <div className="gs-address-bank-new-form">
            <div className="gs-address-bank-new-head">
              <span>Agregar ubicación al banco</span>
              {savedAddresses.length > 0 && (
                <button
                  type="button"
                  className="forgot-link"
                  onClick={() => {
                    setIsAddingAddress(false);
                    setFieldErrors((prev) => ({ ...prev, newAddress: null }));
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>

            <div className="gs-address-label-pills" role="group" aria-label="Etiqueta de la nueva ubicación">
              {(['Casa', 'Oficina', 'Apartamento', 'Pareja'] as const).map((lbl) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => setNewAddressLabel(lbl)}
                  className={`gs-address-label-pill ${newAddressLabel === lbl ? 'active' : ''}`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="pam-grid-2">
              <div className="auth-field">
                <label className="auth-label">Dirección exacta *</label>
                <div className="auth-input-wrap">
                  <div className="auth-field-icon"><Home size={16} /></div>
                  <input
                    type="text"
                    className={`auth-input ${fieldErrors.newAddress ? 'auth-input-error' : ''}`}
                    value={newAddressText}
                    onChange={(e) => {
                      setNewAddressText(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, newAddress: null }));
                    }}
                    placeholder="Ej. Calle 2 Norte # 18 - 144"
                  />
                </div>
                {fieldErrors.newAddress && (
                  <div className="auth-field-error">{fieldErrors.newAddress}</div>
                )}
              </div>

              <div className="auth-field">
                <label className="auth-label">Ciudad de esta dirección</label>
                <div className="auth-input-wrap">
                  <div className="auth-field-icon"><MapPin size={16} /></div>
                  <select
                    className="auth-input"
                    value={newAddressCityId}
                    onChange={(e) => setNewAddressCityId(e.target.value)}
                  >
                    {activeCities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label">Notas de entrega (Apto, torre, portería)</label>
              <input
                type="text"
                className="auth-input no-icon-left"
                value={newAddressNotes}
                onChange={(e) => setNewAddressNotes(e.target.value)}
                placeholder="Ej. Apto 302, Torre B, dejar en recepción"
              />
            </div>

            <button
              type="button"
              className="gs-address-bank-save-btn"
              onClick={handleAddAddressToBank}
            >
              <Plus size={15} />
              <span>Guardar en mi banco de ubicaciones</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <AnimatePresence>
      <div className="pam-overlay" onClick={onClose}>
        <motion.div
          className="pam-modal"
          style={{ maxWidth: '600px' }}
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
                  {initialSection === 'addresses' ? <MapPin size={22} /> : <User size={22} />}
                </div>
                <div>
                  <div className="pam-eyebrow">
                    <Sparkles size={11} /> Perfil y Ubicaciones · GastroSync
                  </div>
                  <h2 className="pam-title">
                    {initialSection === 'addresses' ? 'Mis Ubicaciones y Ciudad' : 'Mi Perfil y Banco de Ubicaciones'}
                  </h2>
                  <p className="pam-subtitle">
                    Administra tus direcciones frecuentes, cambia tu ciudad de entrega o edita tu identidad @usuario.
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
                  <AlertCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {initialSection === 'addresses' && addressBankSection}

              {/* Sección 1: Identidad y @ */}
              <section className="pam-section">
                <div className="pam-section-head">
                  <div className={`pam-step ${step1Done ? 'done' : ''}`}>
                    {step1Done ? <Check size={15} strokeWidth={3} /> : 1}
                  </div>
                  <div className="pam-section-title-wrap">
                    <h3 className="pam-section-title">Tu identidad, foto y WhatsApp</h3>
                    <p className="pam-section-desc">Visible cuando comentas platos y para notificaciones de tus pedidos</p>
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

                <div className="auth-field" style={{ marginTop: '10px' }}>
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
              </section>

              {initialSection !== 'addresses' && addressBankSection}

              {/* Sección 3: Privacidad, Habeas Data y Baja de Cuenta (Ley 1581 de 2012) */}
              <section className="pam-section gs-privacy-zone-section">
                <div className="gs-privacy-zone-header">
                  <div className="gs-privacy-zone-title-row">
                    <ShieldCheck size={18} />
                    <div>
                      <h3 className="pam-section-title">Privacidad, Habeas Data y Baja de Cuenta</h3>
                      <p className="pam-section-desc">
                        Derechos de conocer, actualizar, rectificar y suprimir tus datos (Ley 1581 de 2012)
                      </p>
                    </div>
                  </div>
                  <div className="gs-privacy-quick-links">
                    <button
                      type="button"
                      className="gs-inline-legal-link"
                      onClick={() => openLegalCenter('privacy')}
                    >
                      Política de Privacidad
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      className="gs-inline-legal-link"
                      onClick={() => openLegalCenter('terms')}
                    >
                      Términos y Condiciones
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      className="gs-inline-legal-link"
                      onClick={() => openCookieSettingsBanner()}
                    >
                      Cookies
                    </button>
                  </div>
                </div>

                {!showDeleteZone ? (
                  <button
                    type="button"
                    className="gs-danger-outline-btn"
                    onClick={() => {
                      setShowDeleteZone(true);
                      setDeleteError(null);
                    }}
                  >
                    <Trash2 size={15} />
                    <span>Solicitar supresión de mi cuenta y datos personales</span>
                  </button>
                ) : (
                  <div className="gs-danger-confirm-box">
                    <p className="gs-danger-confirm-copy">
                      <strong>⚠️ Acción irreversible (Derecho de Supresión — Ley 1581 de 2012):</strong> Se eliminarán de inmediato tu perfil, foto, reseñas, likes y comentarios, y se anonimizarán tus pedidos históricos como <em>&ldquo;Titular Suprimido (Ley 1581)&rdquo;</em>.
                    </p>
                    <label htmlFor="delete-account-confirm" className="auth-label">
                      Escribe <strong>ELIMINAR MI CUENTA</strong> para confirmar:
                    </label>
                    <input
                      id="delete-account-confirm"
                      type="text"
                      className="auth-input no-icon-left"
                      placeholder="ELIMINAR MI CUENTA"
                      value={deleteConfirmText}
                      onChange={e => {
                        setDeleteConfirmText(e.target.value);
                        setDeleteError(null);
                      }}
                    />
                    {deleteError && (
                      <div className="auth-field-error" role="alert">
                        {deleteError}
                      </div>
                    )}
                    <div className="gs-danger-confirm-actions">
                      <button
                        type="button"
                        className="pam-btn-cancel"
                        onClick={() => {
                          setShowDeleteZone(false);
                          setDeleteConfirmText('');
                          setDeleteError(null);
                        }}
                        disabled={isDeletingAccount}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="gs-danger-solid-btn"
                        onClick={handleConfirmAccountDeletion}
                        disabled={
                          isDeletingAccount ||
                          deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR MI CUENTA'
                        }
                      >
                        <Trash2 size={15} />
                        <span>
                          {isDeletingAccount ? 'Suprimiendo datos...' : 'Eliminar mi cuenta definitivamente'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="pam-footer">
              <div className="pam-footer-hint">
                <Scale size={13} /> Conectado como <strong>{currentUser.email}</strong>
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

