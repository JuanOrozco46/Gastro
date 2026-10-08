import React, { useState, useRef } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant, Product } from '../../types';
import {
  Plus,
  Edit2,
  Trash2,
  Archive,
  Copy,
  Eye,
  EyeOff,
  Save,
  X,
  Utensils,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Check,
  DollarSign,
  Clock,
  FileText,
  Tag,
  AlertCircle,
  Upload
} from 'lucide-react';
import { uploadMediaFile } from '../../services/supabaseStorageService';
import { motion, AnimatePresence } from 'framer-motion';

const DISH_CATEGORIES: Array<{ label: string; value: Product['category'] }> = [
  { label: '🍽️ Platos Principales', value: 'Platos Principales' },
  { label: '🥟 Entradas', value: 'Entradas' },
  { label: '🥤 Bebidas', value: 'Bebidas' },
  { label: '🍰 Postres', value: 'Postres' }
];

export const MenuTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { products, addProduct, updateProduct, deleteProduct, toggleProductAvailability } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Product>({
    name: '',
    desc: '',
    price: 0,
    category: 'Platos Principales',
    available: true,
    isArchived: false,
    image: '',
    emoji: '🍽️',
    preparationTimeMinutes: 15,
    tags: [],
    ingredients: [],
    allergens: [],
    id: '',
    tenantId: ''
  });

  const [tempTags, setTempTags] = useState('');
  const [tempIngredients, setTempIngredients] = useState('');
  const [tempAllergens, setTempAllergens] = useState('');

  const tenantProducts = products
    .filter(p => p.tenantId === tenant.id)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const activeProducts = tenantProducts.filter(p => !p.isArchived);
  const archivedProducts = tenantProducts.filter(p => p.isArchived);

  const [activeSubTab, setActiveSubTab] = useState<'active' | 'archived'>('active');

  const openNewForm = () => {
    setEditingProduct(null);
    setFormError(null);
    setFormData({
      name: '',
      desc: '',
      price: 0,
      category: 'Platos Principales',
      available: true,
      isArchived: false,
      image: '',
      emoji: '🍽️',
      preparationTimeMinutes: 15,
      tags: [],
      ingredients: [],
      allergens: [],
      id: '',
      tenantId: ''
    });
    setTempTags('');
    setTempIngredients('');
    setTempAllergens('');
    setShowForm(true);
  };

  const openEditForm = (p: Product) => {
    setEditingProduct(p);
    setFormError(null);
    setFormData({ ...p });
    setTempTags(p.tags?.join(', ') || '');
    setTempIngredients(p.ingredients?.join(', ') || '');
    setTempAllergens(p.allergens?.join(', ') || '');
    setShowForm(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setFormError(null);
    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const compressed = await compressImage(file, 8);
      const res = await uploadMediaFile(compressed.file, 'product', tenant.id);
      if (res.success && res.publicUrl) {
        setFormData(prev => ({ ...prev, image: res.publicUrl as string }));
      } else {
        setFormError(res.error || 'Error subiendo imagen');
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error subiendo imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.name || !formData.name.trim()) {
      return 'El nombre del plato es obligatorio.';
    }
    if (!Number.isFinite(formData.price) || formData.price <= 0) {
      return 'El precio debe ser un número mayor a $0 COP.';
    }
    if (!Number.isInteger(formData.price)) {
      return 'El precio debe ser un valor entero en pesos (COP), sin decimales.';
    }
    if (formData.preparationTimeMinutes !== undefined && formData.preparationTimeMinutes < 0) {
      return 'El tiempo de preparación no puede ser negativo.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    const finalData = {
      ...formData,
      name: (formData.name ?? '').trim(),
      desc: formData.desc ?? '',
      price: Math.round(Number(formData.price ?? 0)),
      category: formData.category ?? 'Platos Principales',
      available: formData.available ?? true,
      image: formData.image ?? '',
      emoji: formData.emoji ?? '🍽️',
      preparationTimeMinutes: formData.preparationTimeMinutes ?? 15,
      tags: tempTags
        .split(',')
        .map(s => s.trim())
        .filter(s => s),
      ingredients: tempIngredients
        .split(',')
        .map(s => s.trim())
        .filter(s => s),
      allergens: tempAllergens
        .split(',')
        .map(s => s.trim())
        .filter(s => s)
    };

    let ok: boolean;
    if (editingProduct) {
      await updateProduct(editingProduct.id, finalData);
      ok = true;
    } else {
      ok = await addProduct(finalData as Omit<Product, 'id' | 'tenantId'>);
    }
    setIsSubmitting(false);
    if (ok) {
      setShowForm(false);
    }
    return ok;
  };

  const duplicateProduct = async (p: Product) => {
    await addProduct({
      ...p,
      name: `${p.name} (Copia)`,
      available: false,
      isArchived: false
    });
  };

  const archiveProduct = async (p: Product) => {
    await updateProduct(p.id, { isArchived: true, available: false });
  };

  const restoreProduct = async (p: Product) => {
    await updateProduct(p.id, { isArchived: false, available: true });
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const list = [...activeProducts];
    if (direction === 'up' && index > 0) {
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
    } else if (direction === 'down' && index < list.length - 1) {
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
    } else {
      return;
    }

    for (let i = 0; i < list.length; i++) {
      if (list[i].sortOrder !== i) {
        await updateProduct(list[i].id, { sortOrder: i });
      }
    }
  };

  const step1Done = Boolean(formData.name.trim() && formData.category);
  const step2Done = Boolean(Number.isFinite(formData.price) && formData.price > 0);
  const displayedProducts = activeSubTab === 'active' ? activeProducts : archivedProducts;

  return (
    <div className="rpa-card">
      {/* Header Editorial */}
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <Utensils size={22} />
          </div>
          <div>
            <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
              <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Carta Gastronómica Digital
            </span>
            <h3 className="rpa-card-title">Menú de {tenant.name}</h3>
            <p className="rpa-card-subtitle">
              Gestiona tus platos, precios, fotos, disponibilidad en tiempo real y orden de aparición.
            </p>
          </div>
        </div>

        <button
          type="button"
          className={showForm ? 'pam-btn-ghost' : 'pam-btn-primary'}
          onClick={() => (showForm ? setShowForm(false) : openNewForm())}
        >
          {showForm ? (
            <>
              <X size={16} /> Cerrar Formulario
            </>
          ) : (
            <>
              <Plus size={16} /> Nuevo Plato
            </>
          )}
        </button>
      </div>

      {/* Subtabs */}
      <div className="rpa-subtabs">
        <button
          type="button"
          className={`rpa-subtab ${activeSubTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('active')}
        >
          <Utensils size={15} /> Platos Activos ({activeProducts.length})
        </button>
        <button
          type="button"
          className={`rpa-subtab ${activeSubTab === 'archived' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('archived')}
        >
          <Archive size={15} /> Archivados ({archivedProducts.length})
        </button>
      </div>

      <div className="rpa-card-body">
        {/* Formulario Editorial de Crear / Editar Plato */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {formError && (
                  <div className="pam-callout error">
                    <AlertCircle size={18} />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Sección 1: Identidad del Plato */}
                <section className="pam-section">
                  <div className="pam-section-head">
                    <div className={`pam-step ${step1Done ? 'done' : ''}`}>
                      {step1Done ? <Check size={15} strokeWidth={3} /> : 1}
                    </div>
                    <div>
                      <h4>{editingProduct ? `Editando: ${editingProduct.name}` : '1. Identidad del Plato y Categoría'}</h4>
                      <p>Define el nombre, categoría de la carta y descripción gastronómica.</p>
                    </div>
                  </div>

                  <div className="pam-grid">
                    <div className="pam-field">
                      <label>
                        Nombre del Plato <em>*</em>
                      </label>
                      <div className="pam-input-wrap">
                        <Utensils size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Ej. Hamburguesa Artesanal Trufada"
                          required
                        />
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Emoji del Plato <span className="pam-opt">Icono rápido</span>
                      </label>
                      <div className="pam-input-wrap">
                        <input
                          type="text"
                          className="pam-input no-icon"
                          value={formData.emoji}
                          onChange={e => setFormData({ ...formData, emoji: e.target.value })}
                          maxLength={2}
                          style={{ textAlign: 'center', fontSize: '1.15rem' }}
                        />
                      </div>
                    </div>

                    <div className="pam-field pam-span-2">
                      <label>
                        Categoría en el Menú <em>*</em>
                      </label>
                      <div className="pam-chips">
                        {DISH_CATEGORIES.map(cat => (
                          <button
                            key={cat.value}
                            type="button"
                            className={`pam-chip ${formData.category === cat.value ? 'active' : ''}`}
                            onClick={() => setFormData({ ...formData, category: cat.value })}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pam-field pam-span-2">
                      <label>
                        Descripción del Plato <span className="pam-opt">Ingredientes y preparación</span>
                      </label>
                      <div className="pam-input-wrap">
                        <FileText size={16} className="pam-icon top" />
                        <textarea
                          className="pam-input"
                          rows={3}
                          value={formData.desc}
                          onChange={e => setFormData({ ...formData, desc: e.target.value })}
                          placeholder="Ej. 180g de carne madurada, queso cheddar fundido, tocineta ahumada y pan brioche artesanal..."
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Sección 2: Precio, Foto y Detalles */}
                <section className="pam-section">
                  <div className="pam-section-head">
                    <div className={`pam-step ${step2Done ? 'done' : ''}`}>
                      {step2Done ? <Check size={15} strokeWidth={3} /> : 2}
                    </div>
                    <div>
                      <h4>2. Precio, Fotografía y Detalles Técnicos</h4>
                      <p>Configura el valor en pesos colombianos, tiempo en cocina y foto del plato.</p>
                    </div>
                  </div>

                  <div className="pam-grid">
                    <div className="pam-field">
                      <label>
                        Precio de Venta <em>*</em>
                      </label>
                      <div className="pam-input-wrap">
                        <DollarSign size={16} className="pam-icon" />
                        <input
                          type="number"
                          className="pam-input with-suffix"
                          value={formData.price || ''}
                          onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                          placeholder="25000"
                          min="100"
                          step="500"
                          required
                        />
                        <span className="pam-suffix">COP</span>
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Tiempo de Preparación <span className="pam-opt">Minutos</span>
                      </label>
                      <div className="pam-input-wrap">
                        <Clock size={16} className="pam-icon" />
                        <input
                          type="number"
                          className="pam-input with-suffix"
                          value={formData.preparationTimeMinutes ?? 15}
                          onChange={e =>
                            setFormData({ ...formData, preparationTimeMinutes: Number(e.target.value) })
                          }
                          min="1"
                        />
                        <span className="pam-suffix">min</span>
                      </div>
                    </div>

                    <div className="pam-field pam-span-2">
                      <label>
                        Fotografía del Plato <span className="pam-opt">Optimización automática WebP</span>
                      </label>
                      <div
                        className={`pam-drop ${formData.image ? 'has-file' : ''}`}
                        style={{ height: '165px' }}
                        onClick={() => !uploadingImage && fileInputRef.current?.click()}
                      >
                        {formData.image ? (
                          <>
                            <img src={formData.image} alt="Plato" />
                            <span className="pam-drop-change">
                              {uploadingImage ? 'Subiendo...' : 'Cambiar foto'}
                            </span>
                          </>
                        ) : (
                          <div className="pam-drop-empty">
                            <Upload size={24} />
                            <strong>{uploadingImage ? 'Subiendo y optimizando...' : 'Subir foto del plato'}</strong>
                            <span>JPG, PNG o WEBP · Se muestra en tu menú y pedidos</span>
                          </div>
                        )}
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileUpload}
                        />
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Etiquetas <span className="pam-opt">Separadas por coma</span>
                      </label>
                      <div className="pam-input-wrap">
                        <Tag size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={tempTags}
                          onChange={e => setTempTags(e.target.value)}
                          placeholder="Ej. Más vendido, Artesanal, Picante"
                        />
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Alérgenos <span className="pam-opt">Opcional</span>
                      </label>
                      <div className="pam-input-wrap">
                        <AlertCircle size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={tempAllergens}
                          onChange={e => setTempAllergens(e.target.value)}
                          placeholder="Ej. Gluten, Lácteos, Maní"
                        />
                      </div>
                    </div>

                    <div className="pam-field pam-span-2">
                      <label>
                        Ingredientes Destacados <span className="pam-opt">Separados por coma</span>
                      </label>
                      <div className="pam-input-wrap">
                        <Utensils size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={tempIngredients}
                          onChange={e => setTempIngredients(e.target.value)}
                          placeholder="Ej. Pan brioche, Carne angus, Queso cheddar, Cebolla caramelizada"
                        />
                      </div>
                    </div>

                    <div className="pam-field pam-span-2">
                      <div className={`rpa-switch-card ${formData.available ? 'on' : 'off'}`}>
                        <div className="rpa-switch-info">
                          <h5>
                            {formData.available ? '🟢 Plato Disponible para Ordenar' : '⏸️ Marcar como Agotado'}
                          </h5>
                          <p>
                            {formData.available
                              ? 'Los clientes pueden agregar este plato al carrito inmediatamente.'
                              : 'El plato seguirá visible en la carta pero con etiqueta de Agotado.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`rpa-toggle-pill ${formData.available ? 'on' : ''}`}
                          onClick={() => setFormData({ ...formData, available: !formData.available })}
                        >
                          <div className="rpa-toggle-knob" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <button type="button" className="pam-btn-ghost" onClick={() => setShowForm(false)}>
                      Cancelar
                    </button>
                    <button type="submit" className="pam-btn-primary" disabled={isSubmitting || uploadingImage}>
                      <Save size={16} />
                      <span>{isSubmitting ? 'Guardando...' : editingProduct ? 'Actualizar Plato' : 'Guardar en el Menú'}</span>
                    </button>
                  </div>
                </section>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista de Platos */}
        {displayedProducts.length === 0 ? (
          <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <Utensils size={36} style={{ color: 'var(--primary)', opacity: 0.6 }} />
            <h4 style={{ margin: '6px 0 2px', color: 'var(--text-main)', fontWeight: 800 }}>
              {activeSubTab === 'active'
                ? 'Aún no tienes platos activos en tu menú'
                : 'No tienes platos archivados'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              {activeSubTab === 'active'
                ? 'Haz clic en "Nuevo Plato" arriba a la derecha para agregar tu primera especialidad.'
                : 'Los platos que archives aparecerán aquí por si deseas restaurarlos más adelante.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayedProducts.map((product, index) => (
              <div key={product.id} className="rpa-item-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                  {activeSubTab === 'active' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <button
                        type="button"
                        className="rpa-icon-btn"
                        style={{ width: '26px', height: '24px', borderRadius: '6px' }}
                        onClick={() => handleReorder(index, 'up')}
                        disabled={index === 0}
                        title="Subir posición"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="rpa-icon-btn"
                        style={{ width: '26px', height: '24px', borderRadius: '6px' }}
                        onClick={() => handleReorder(index, 'down')}
                        disabled={index === activeProducts.length - 1}
                        title="Bajar posición"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  )}

                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '14px',
                      background: 'var(--primary-light)',
                      border: '1px solid var(--primary-border)',
                      overflow: 'hidden',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: '1.65rem' }}>{product.emoji || '🍽️'}</span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-main)', fontSize: '0.96rem', fontWeight: 800 }}>
                        {product.name}
                      </strong>
                      <span className="rpa-badge neutral">{product.category}</span>
                      {product.available ? (
                        <span className="rpa-badge success">Disponible</span>
                      ) : (
                        <span className="rpa-badge warning">Agotado</span>
                      )}
                      {product.preparationTimeMinutes && (
                        <span className="rpa-badge primary">⏱️ {product.preparationTimeMinutes} min</span>
                      )}
                    </div>
                    {product.desc && (
                      <p
                        style={{
                          margin: '4px 0',
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.4
                        }}
                      >
                        {product.desc}
                      </p>
                    )}
                    <div style={{ fontWeight: 900, fontSize: '0.95rem', color: 'var(--primary)' }}>
                      ${product.price.toLocaleString('es-CO')} COP
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {activeSubTab === 'active' ? (
                    <>
                      <button
                        type="button"
                        className="rpa-icon-btn"
                        title={product.available ? 'Marcar como Agotado' : 'Marcar como Disponible'}
                        onClick={() => toggleProductAvailability(product.id)}
                      >
                        {product.available ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        type="button"
                        className="rpa-icon-btn"
                        title="Editar plato"
                        onClick={() => openEditForm(product)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="rpa-icon-btn"
                        title="Duplicar plato"
                        onClick={() => duplicateProduct(product)}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        type="button"
                        className="rpa-icon-btn danger"
                        title="Archivar plato"
                        onClick={() => archiveProduct(product)}
                      >
                        <Archive size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="pam-chip"
                        title="Restaurar al menú activo"
                        onClick={() => restoreProduct(product)}
                      >
                        <CheckCircle size={14} /> Restaurar
                      </button>
                      <button
                        type="button"
                        className="rpa-icon-btn danger"
                        title="Eliminar definitivamente"
                        onClick={() => {
                          if (window.confirm('¿Eliminar este plato definitivamente del menú?')) {
                            deleteProduct(product.id);
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
