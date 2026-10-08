/**
 * Utilidades de validación de formularios compartidas entre el login,
 * el registro de clientes y la solicitud de restaurante aliado.
 * Todas devuelven un mensaje de error en español o `null` si el valor es válido.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Acepta formatos CO: (300) 123-4567, 300 123 4567, +57 300 123 4567 */
const PHONE_CO_RE = /^(\+?\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)?\d{3}[\s-]?\d{2,4}([\s-]?\d{1,4})?$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Ingresa tu correo electrónico.';
  if (!EMAIL_RE.test(v)) return 'Ingresa un correo válido (ej: nombre@dominio.com).';
  return null;
}

export function validateName(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Ingresa tu nombre completo.';
  if (v.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
  return null;
}

export function validatePhone(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Ingresa un teléfono de contacto.';
  if (!PHONE_CO_RE.test(v)) return 'Ingresa un teléfono válido (ej: 300 123 4567).';
  if (v.replace(/\D/g, '').length < 7) return 'El número debe tener al menos 7 dígitos.';
  return null;
}

export function validateRequired(value: string, label: string): string | null {
  return value.trim() ? null : `${label} es obligatorio.`;
}

/* ── Fuerza de contraseña (compartida por registro de cliente y aliado) ── */

export interface PasswordStrength {
  score: number; // 0-5
  label: string;
  color: string;
  checks: { passed: boolean; text: string }[];
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const checks = [
    { passed: password.length >= 8, text: 'Mínimo 8 caracteres' },
    { passed: /[A-Z]/.test(password), text: 'Al menos una mayúscula' },
    { passed: /[a-z]/.test(password), text: 'Al menos una minúscula' },
    { passed: /[0-9]/.test(password), text: 'Al menos un número' },
    { passed: /[^A-Za-z0-9]/.test(password), text: 'Al menos un carácter especial' },
  ];

  const score = checks.filter(c => c.passed).length;

  const configs: Record<number, { label: string; color: string }> = {
    0: { label: 'Muy débil', color: '#EF4444' },
    1: { label: 'Débil', color: '#EF4444' },
    2: { label: 'Regular', color: '#F59E0B' },
    3: { label: 'Buena', color: '#F59E0B' },
    4: { label: 'Fuerte', color: '#10B981' },
    5: { label: 'Excelente', color: '#10B981' },
  };

  const config = configs[score] || configs[0];

  return { score, label: config.label, color: config.color, checks };
}

/** Contraseña válida para registro: score mínimo 3 (8 chars + 2 requisitos más). */
export function validateRegisterPassword(password: string): string | null {
  if (!password) return 'Ingresa una contraseña.';
  const strength = evaluatePasswordStrength(password);
  if (strength.score < 3) {
    return 'La contraseña es demasiado débil: usa al menos 8 caracteres con mayúsculas, minúsculas y números.';
  }
  return null;
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (!confirm) return 'Confirma tu contraseña.';
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return null;
}
