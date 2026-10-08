import React, { useState, useRef } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant, Product } from '../../types';
import { Plus, Edit2, Trash2, Archive, Copy, Eye, EyeOff, Image as ImageIcon, Save, X, Utensils, CheckCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { uploadMediaFile } from '../../services/supabaseStorageService';
import { motion, AnimatePresence } from 'framer-motion';

export const MenuTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { products, addProduct, updateProduct, deleteProduct, toggleProductAvailability } = useApp();
  
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
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
      name: '', desc: '', price: 0, category: 'Platos Principales', available: true, isArchived: false, image: '', emoji: '🍽️', preparationTimeMinutes: 15, tags: [], ingredients: [], allergens: [], id: '', tenantId: ''
    });
    setTempTags(''); setTempIngredients(''); setTempAllergens('');
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
    try {
      // Misma compresión que FileUploadInput: sin esto se sube el original completo.
      const { compressImage } = await import('../../utils/imageCompression');
      const compressed = await compressImage(file, 8);
      const res = await uploadMediaFile(compressed.file, 'product', tenant.id);
      if (res.success && res.publicUrl) {
        setFormData(prev => ({ ...prev, image: res.publicUrl as string }));
      } else {
        setFormError(res.error || 'Error subiendo imagen');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error subiendo imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.name || !formData.name.trim()) {
      return 'El nombre del producto es obligatorio.';
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
      tags: tempTags.split(',').map(s => s.trim()).filter(s => s),
      ingredients: tempIngredients.split(',').map(s => s.trim()).filter(s => s),
      allergens: tempAllergens.split(',').map(s => s.trim()).filter(s => s)
    };

    let ok: boolean;
    if (editingProduct) {
      await updateProduct(editingProduct.id, finalData);
      ok = true; // updateProduct no reporta éxito; el toast de error ya lo muestra el contexto
    } else {
      ok = await addProduct(finalData as Omit<Product, 'id' | 'tenantId'>);
    }
    setIsSubmitting(false);
    if (ok) {
      setShowForm(false);
    }
    return ok;
  }

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

    // Assign new sortOrders and update all sequentially (simplified approach)
    for (let i = 0; i < list.length; i++) {
      if (list[i].sortOrder !== i) {
        await updateProduct(list[i].id, { sortOrder: i });
      }
    }
  };

  return (
    <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
      <div className="card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="card-title" style={{ color: 'white', fontWeight: 900, fontSize: '1.2rem' }}>
          <Utensils size={22} style={{ color: 'var(--primary)' }} /> Menú de {tenant.name}
        </div>
        {!showForm && (
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="btn btn-primary" onClick={openNewForm}>
            <Plus size={16} /> Nuevo Producto
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ color: 'white', margin: 0 }}>{editingProduct ? 'Editar Producto' : 'Crear Producto'}</h3>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary" style={{ padding: '6px' }}><X size={18} /></button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                
                {/* Left Col */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Nombre</label>
                    <input type="text" className="gf-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Descripción</label>
                    <textarea className="gf-input" value={formData.desc} onChange={e => setFormData({ ...formData, desc: e.target.value })} style={{ minHeight: '80px' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Precio (COP)</label>
                      <input type="number" className="gf-input" value={formData.price} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} required />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Categoría</label>
                      <select className="gf-input" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as any })}>
                        <option value="Platos Principales">Platos Principales</option>
                        <option value="Entradas">Entradas</option>
                        <option value="Bebidas">Bebidas</option>
                        <option value="Postres">Postres</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Tiempo Prep. (Min)</label>
                      <input type="number" className="gf-input" value={formData.preparationTimeMinutes} onChange={e => setFormData({ ...formData, preparationTimeMinutes: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Emoji Opcional</label>
                      <input type="text" className="gf-input" value={formData.emoji} onChange={e => setFormData({ ...formData, emoji: e.target.value })} maxLength={2} />
                    </div>
                  </div>
                </div>

                {/* Right Col */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Foto del Producto</label>
                    <div 
                      style={{ height: '140px', borderRadius: '12px', border: formData.image ? 'none' : '2px dashed var(--neutral-border)', backgroundColor: 'var(--surface-color)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      onClick={() => !uploadingImage && fileInputRef.current?.click()}
                    >
                      {formData.image ? (
                        <>
                          <img src={formData.image} alt="Producto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '8px' }}>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setFormData(p => ({...p, image: ''})); }} style={{ background: 'rgba(239,68,68,0.8)', color: 'white', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}><X size={16} /></button>
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          {uploadingImage ? <div className="spinner" style={{ margin: '0 auto 8px' }} /> : <ImageIcon size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />}
                          <p style={{ margin: 0, fontSize: '0.85rem' }}>{uploadingImage ? 'Subiendo...' : 'Clic para subir imagen'}</p>
                        </div>
                      )}
                      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileUpload} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Etiquetas (ej. Nuevo, Vegano) separadas por coma</label>
                    <input type="text" className="gf-input" value={tempTags} onChange={e => setTempTags(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Ingredientes (separados por coma)</label>
                    <input type="text" className="gf-input" value={tempIngredients} onChange={e => setTempIngredients(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Alérgenos (ej. Maní, Gluten) separados por coma</label>
                    <input type="text" className="gf-input" value={tempAllergens} onChange={e => setTempAllergens(e.target.value)} />
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
                    <input type="checkbox" id="availableCheck" checked={formData.available} onChange={e => setFormData({ ...formData, available: e.target.checked })} style={{ transform: 'scale(1.2)' }} />
                    <label htmlFor="availableCheck" style={{ color: 'white', cursor: 'pointer' }}>Disponible para ordenar</label>
                  </div>
                </div>

              </div>

              {formError && (
                <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '10px', color: '#FCA5A5', fontSize: '0.85rem', fontWeight: 600 }}>
                  ⚠️ {formError}
                </div>
              )}

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="gf-btn-primary" disabled={isSubmitting} style={isSubmitting ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
                  <Save size={18} /> {isSubmitting ? 'Guardando...' : 'Guardar Producto'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ padding: '1rem', display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button className={`btn ${activeSubTab === 'active' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveSubTab('active')}>Activos ({activeProducts.length})</button>
        <button className={`btn ${activeSubTab === 'archived' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveSubTab('archived')}>Archivados ({archivedProducts.length})</button>
      </div>

      <div style={{ padding: '1rem' }}>
        {(activeSubTab === 'active' ? activeProducts : archivedProducts).length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No hay productos en esta lista.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(activeSubTab === 'active' ? activeProducts : archivedProducts).map((product, index) => (
              <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {activeSubTab === 'active' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button onClick={() => handleReorder(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', color: index === 0 ? 'rgba(255,255,255,0.1)' : 'var(--text-muted)', cursor: index === 0 ? 'default' : 'pointer' }}><ArrowUp size={16}/></button>
                    <button onClick={() => handleReorder(index, 'down')} disabled={index === activeProducts.length - 1} style={{ background: 'transparent', border: 'none', color: index === activeProducts.length - 1 ? 'rgba(255,255,255,0.1)' : 'var(--text-muted)', cursor: index === activeProducts.length - 1 ? 'default' : 'pointer' }}><ArrowDown size={16}/></button>
                  </div>
                )}
                
                <div style={{ width: '60px', height: '60px', borderRadius: '8px', background: 'var(--surface-color)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {product.image ? <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.5rem' }}>{product.emoji}</span>}
                </div>
                
                <div style={{ flex: 1 }}>
                  <h4 style={{ color: 'white', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {product.name}
                    {!product.available && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Agotado</span>}
                  </h4>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: 'var(--text-light)' }}>{product.category}</p>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--primary)' }}>${product.price.toLocaleString('es-CO')}</p>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  {activeSubTab === 'active' ? (
                    <>
                      <button className="btn btn-secondary" style={{ padding: '8px' }} title={product.available ? 'Marcar Agotado' : 'Marcar Disponible'} onClick={() => toggleProductAvailability(product.id)}>
                        {product.available ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '8px' }} title="Editar" onClick={() => openEditForm(product)}><Edit2 size={16} /></button>
                      <button className="btn btn-secondary" style={{ padding: '8px' }} title="Duplicar" onClick={() => duplicateProduct(product)}><Copy size={16} /></button>
                      <button className="btn btn-secondary" style={{ padding: '8px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }} title="Archivar" onClick={() => archiveProduct(product)}><Archive size={16} /></button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" style={{ padding: '8px' }} title="Restaurar" onClick={() => restoreProduct(product)}><CheckCircle size={16} /></button>
                      <button className="btn btn-secondary" style={{ padding: '8px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }} title="Eliminar Definitivo" onClick={() => { if(confirm('¿Eliminar definitivamente?')) deleteProduct(product.id); }}><Trash2 size={16} /></button>
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
