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
    <div className="pam-field">
      <label>
        {accept === 'video' ? (
          <Film size={15} style={{ color: 'var(--primary)' }} />
        ) : (
          <ImageIcon size={15} style={{ color: 'var(--primary)' }} />
        )}
        {label} <em>*</em>
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptMime}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {!value ? (
        <div
          className={`pam-drop ${error ? 'has-error' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          style={{
            height: '165px',
            borderColor: dragActive ? 'var(--primary)' : undefined,
            background: dragActive ? 'var(--primary-light)' : undefined
          }}
        >
          {isProcessing ? (
            <div className="pam-drop-empty">
              <Loader2 size={28} className="spin" />
              <strong>
                {isSupabaseConfigured ? 'Subiendo archivo al servidor...' : 'Procesando archivo...'}
              </strong>
              <span>Optimizando calidad y peso automáticamente</span>
            </div>
          ) : (
            <div className="pam-drop-empty">
              <Upload size={26} />
              <strong>Haz clic o arrastra tu archivo aquí</strong>
              <span>
                {accept === 'image' && `Formatos JPG, PNG o WEBP · Máx. ${maxSizeMB}MB`}
                {accept === 'video' && `Formatos MP4, WEBM o MOV · Máx. ${maxSizeMB}MB`}
                {accept === 'both' && `Fotos (JPG, PNG, WEBP) o Videos (MP4, WEBM) · Máx. ${maxSizeMB}MB`}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          className="pam-drop has-file"
          style={{ height: isVideo ? '220px' : '185px', background: '#141210' }}
        >
          {isVideo ? (
            <video
              src={value}
              controls
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <img
              src={value}
              alt="Vista previa"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}

          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              display: 'flex',
              gap: '8px'
            }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(20, 18, 16, 0.78)',
                color: '#ffffff',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => onChange('', 'photo')}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(220, 38, 38, 0.92)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Quitar archivo"
            >
              <X size={15} />
            </button>
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              background: 'rgba(5, 150, 105, 0.92)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <CheckCircle size={13} />
            {isVideo ? 'Video listo' : 'Imagen lista'}
          </div>
        </div>
      )}

      {compressionInfo && !error && value && (
        <span className="pam-hint ok">
          ⚡ Optimizado: {(compressionInfo.original / 1024 / 1024).toFixed(1)}MB → {(compressionInfo.final / 1024 / 1024).toFixed(1)}MB (WEBP)
        </span>
      )}
      {error && (
        <span className="pam-error">
          ⚠️ {error}
        </span>
      )}
    </div>
  );
};
