export function formatCop(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return 'No disponible';
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (!Number.isFinite(num)) {
    return 'No disponible';
  }

  return `$${num.toLocaleString('es-CO')} COP`;
}

export function formatCopOrZero(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '$0 COP';
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (!Number.isFinite(num)) {
    return '$0 COP';
  }

  return `$${num.toLocaleString('es-CO')} COP`;
}

export function safeFormatDate(dateStr: string | number | Date | null | undefined, locale: string = 'es-CO'): string {
  if (!dateStr) return 'No disponible';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'No disponible';
    return d.toLocaleString(locale);
  } catch (_e) {
    return 'No disponible';
  }
}
