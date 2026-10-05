import React, { useState, useRef } from 'react';
import { Upload, X, Film, Image as ImageIcon, CheckCircle, Loader2 } from 'lucide-react';
import { uploadMediaFile } from '../services/supabaseStorageService';
import { isSupabaseConfigured } from '../lib/supabase';

interface FileUploadInputProps {
  label: string;
  accept: 'image' | 'video' | 'both';
  value: string; // Data URL or Web URL
  onChange: (value: string, fileType: 'photo' | 'video', width?: number, height?: number) => void;
  maxSizeMB?: number;
  placeholder?: string;
  folder?: string;
  tenantId?: string;
}

export const FileUploadInput: React.FC<FileUploadInputProps> = ({
  label,
  accept,
  value,
  onChange,
  maxSizeMB = 50,
  folder = 'dishes',
  tenantId
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{ original: number, final: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptMime = accept === 'image' 
    ? 'image/jpeg,image/png,image/webp' 
    : accept === 'video' 
      ? 'video/*' 
      : 'image/jpeg,image/png,image/webp,video/*';


  const isVideo = value.startsWith('data:video/') || 
    /\.(mp4|webm|ogg|mov)$/i.test(value);

  const handleFile = async (rawFile: File) => {
    setError(null);
    if (!rawFile) return;
    setCompressionInfo(null);

    const isVideoFile = rawFile.type.startsWith('video/');
    const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];

    if (!isVideoFile && !allowedImages.includes(rawFile.type)) {
      setError('Formato no permitido. Solo JPG, PNG o WEBP para imágenes (SVG y GIF rechazados).');
      return;
    }

    setIsProcessing(true);
    let finalFile = rawFile;

    try {
      if (!isVideoFile) {
        const { compressImage } = await import('../utils/imageCompression');
        // Para productos (folder dishes) o logos, max size is generally what passed in maxSizeMB (e.g. 8MB for products)
        const result = await compressImage(rawFile, maxSizeMB);
        finalFile = result.file;
        if (result.compressed) {
          setCompressionInfo({ original: result.originalSize, final: result.finalSize });
        }
      }

      const fileMB = finalFile.size / (1024 * 1024);
      if (fileMB > maxSizeMB) {
        setError(`El archivo pesa ${fileMB.toFixed(1)}MB. El tamaño máximo permitido es ${maxSizeMB}MB.`);
        setIsProcessing(false);
        return;
      }

      const fileType: 'photo' | 'video' = isVideoFile ? 'video' : 'photo';

      const getDimensions = (f: File, t: 'photo' | 'video'): Promise<{width: number, height: number}> => {
        return new Promise((resolve) => {
          const url = URL.createObjectURL(f);
          if (t === 'photo') {
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve({width: img.width, height: img.height}); };
            img.onerror = () => { URL.revokeObjectURL(url); resolve({width: 0, height: 0}); };
            img.src = url;
          } else {
            const vid = document.createElement('video');
            vid.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve({width: vid.videoWidth, height: vid.videoHeight}); };
            vid.onerror = () => { URL.revokeObjectURL(url); resolve({width: 0, height: 0}); };
            vid.src = url;
          }
        });
      };

      const dims = await getDimensions(finalFile, fileType);

      const res = await uploadMediaFile(finalFile, folder, tenantId);
      if (res.success && res.publicUrl) {
        onChange(res.publicUrl, fileType, dims.width, dims.height);
      } else {
        setError(res.error || 'No se pudo procesar la subida.');
      }
    } catch {
      setError('Ocurrió un error inesperado al subir el archivo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {accept === 'video' ? <Film size={16} style={{ color: '#F59E0B' }} /> : <ImageIcon size={16} style={{ color: '#10B981' }} />}
          {label}
        </label>
      </div>

      <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptMime}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {!value ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragActive ? 'var(--primary, #E11D48)' : 'rgba(255, 255, 255, 0.15)'}`,
                borderRadius: '16px',
                padding: '1.5rem 1rem',
                textAlign: 'center',
                background: dragActive ? 'rgba(225, 29, 72, 0.08)' : 'var(--glass-overlay)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {isProcessing ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary, #E11D48)' }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                    {isSupabaseConfigured ? 'Subiendo a Supabase Storage (CDN)...' : 'Procesando archivo...'}
                  </p>
                </div>
              ) : (
                <>
                  <Upload size={32} style={{ color: dragActive ? 'var(--primary, #E11D48)' : '#94a3b8', marginBottom: '8px' }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 4px 0' }}>
                    Haz clic o arrastra tu archivo aquí
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                    {accept === 'image' && 'Soporta PNG, JPG, WEBP (Máx. 50MB)'}
                    {accept === 'video' && 'Soporta MP4, WEBM, MOV (Máx. 50MB)'}
                    {accept === 'both' && 'Fotos (PNG, JPG, WEBP) o Videos (MP4, WEBM)'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.12)', background: '#000' }}>
              {isVideo ? (
                <video
                  src={value}
                  controls
                  style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <img
                  src={value}
                  alt="Vista previa"
                  style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }}
                />
              )}

              <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                display: 'flex',
                gap: '8px'
              }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--glass-medium)',
                    backdropFilter: 'blur(8px)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={() => onChange('', 'photo')}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(239, 68, 68, 0.9)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                background: 'rgba(16, 185, 129, 0.9)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle size={13} />
                {isVideo ? 'Video cargado' : 'Imagen cargada'}
              </div>
            </div>
          )}
        </div>

      {compressionInfo && !error && value && (
        <p style={{ color: '#10B981', fontSize: '0.75rem', marginTop: '6px', fontWeight: 600 }}>
          ⚡ Comprimido: {(compressionInfo.original / 1024 / 1024).toFixed(1)}MB → {(compressionInfo.final / 1024 / 1024).toFixed(1)}MB (WEBP)
        </p>
      )}
      {error && (
        <p style={{ color: '#EF4444', fontSize: '0.78rem', marginTop: '6px', fontWeight: 600 }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
};
