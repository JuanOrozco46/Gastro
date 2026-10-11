import type { SavedDeliveryAddress, UserAccount } from '../types';
import { DEFAULT_CITIES } from '../context/defaultData';

const ADDRESS_BANK_STORAGE_PREFIX = 'gs_address_bank_v1_';

export const ADDRESS_LABEL_PRESETS = ['Casa', 'Oficina', 'Apartamento', 'Pareja', 'Otro'] as const;

export type AddressBankUserTarget =
  | UserAccount
  | Pick<UserAccount, 'id' | 'email'>
  | string
  | Array<string | undefined | null>
  | null
  | undefined;

function getStorageKeysForUser(target?: AddressBankUserTarget): string[] {
  const keys: string[] = [];
  if (typeof target === 'string') {
    const trimmed = target.trim();
    if (trimmed) {
      keys.push(
        `${ADDRESS_BANK_STORAGE_PREFIX}${trimmed.includes('@') ? trimmed.toLowerCase() : trimmed}`
      );
    }
  } else if (Array.isArray(target)) {
    for (const item of target) {
      if (typeof item === 'string' && item.trim()) {
        const trimmed = item.trim();
        keys.push(
          `${ADDRESS_BANK_STORAGE_PREFIX}${trimmed.includes('@') ? trimmed.toLowerCase() : trimmed}`
        );
      }
    }
  } else if (target && typeof target === 'object') {
    if (target.id && target.id.trim()) {
      keys.push(`${ADDRESS_BANK_STORAGE_PREFIX}${target.id.trim()}`);
    }
    if (target.email && target.email.trim()) {
      keys.push(`${ADDRESS_BANK_STORAGE_PREFIX}${target.email.trim().toLowerCase()}`);
    }
  }
  if (keys.length === 0) {
    keys.push(`${ADDRESS_BANK_STORAGE_PREFIX}guest`);
  }
  return Array.from(new Set(keys));
}

export function sanitizeSavedAddresses(
  raw: unknown,
  fallbackCityId: string = DEFAULT_CITIES[0].id
): SavedDeliveryAddress[] {
  if (!Array.isArray(raw)) return [];
  const valid: SavedDeliveryAddress[] = [];
  const seenAddresses = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const address = typeof obj.address === 'string' ? obj.address.trim() : '';
    if (address.length < 4) continue;

    const label =
      typeof obj.label === 'string' && obj.label.trim()
        ? obj.label.trim()
        : 'Casa';
    const cityId =
      typeof obj.cityId === 'string' && obj.cityId.trim()
        ? obj.cityId.trim()
        : fallbackCityId;
    const zoneId =
      typeof obj.zoneId === 'string' && obj.zoneId.trim()
        ? obj.zoneId.trim()
        : null;
    const notes =
      typeof obj.notes === 'string' && obj.notes.trim()
        ? obj.notes.trim()
        : undefined;
    const id =
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : `addr_${cityId}_${address.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`;

    const dedupeKey = `${cityId}::${address.toLowerCase()}`;
    if (seenAddresses.has(dedupeKey)) continue;
    seenAddresses.add(dedupeKey);

    const isPrimaryFlag = Boolean(obj.isPrimary ?? obj.isDefault);
    const createdAt = typeof obj.createdAt === 'number' ? obj.createdAt : undefined;

    valid.push({
      id,
      label,
      address,
      cityId,
      zoneId,
      notes,
      isDefault: isPrimaryFlag,
      isPrimary: isPrimaryFlag,
      createdAt
    });
  }

  if (valid.length > 0 && !valid.some(a => a.isPrimary || a.isDefault)) {
    valid[0].isDefault = true;
    valid[0].isPrimary = true;
  }

  return valid;
}

/**
 * Carga y sincroniza el Banco de Ubicaciones del usuario desde su cuenta (`user.savedAddresses`),
 * su caché local y, si aún no tiene entradas en el banco pero sí `defaultAddress`,
 * convierte automáticamente su dirección habitual en su ubicación principal «Casa».
 */
export function loadUserAddressBank(
  target?: AddressBankUserTarget,
  fallbackCityId: string = DEFAULT_CITIES[0].id
): SavedDeliveryAddress[] {
  const userObj =
    target && typeof target === 'object' && !Array.isArray(target) && 'email' in target
      ? (target as UserAccount)
      : null;
  const effectiveCityId = userObj?.preferredCityId || fallbackCityId || DEFAULT_CITIES[0].id;
  let storedList: SavedDeliveryAddress[] = [];

  if (typeof window !== 'undefined') {
    const keys = getStorageKeysForUser(target);
    for (const key of keys) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = sanitizeSavedAddresses(JSON.parse(raw), effectiveCityId);
          if (parsed.length > 0) {
            storedList = parsed;
            break;
          }
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  const fromUser = sanitizeSavedAddresses(userObj?.savedAddresses, effectiveCityId);
  const mergedMap = new Map<string, SavedDeliveryAddress>();

  for (const addr of [...fromUser, ...storedList]) {
    const key = `${addr.cityId}::${addr.address.toLowerCase()}`;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, addr);
    }
  }

  let list = Array.from(mergedMap.values());

  // Si el usuario tiene defaultAddress y no está aún en el banco, hidratarla como «Casa»
  const trimmedDefault = userObj?.defaultAddress?.trim() || '';
  if (trimmedDefault.length >= 4) {
    const exists = list.some(
      a => a.address.toLowerCase() === trimmedDefault.toLowerCase()
    );
    if (!exists) {
      const isFirst = list.length === 0;
      const synthesized: SavedDeliveryAddress = {
        id: 'addr_primary_default',
        label: 'Casa',
        address: trimmedDefault,
        cityId: effectiveCityId,
        zoneId: userObj?.preferredZoneId || null,
        notes: userObj?.defaultDeliveryNotes?.trim() || undefined,
        isDefault: isFirst,
        isPrimary: isFirst
      };
      list = [synthesized, ...list];
    }
  }

  if (list.length > 0 && !list.some(a => a.isPrimary || a.isDefault)) {
    list[0] = { ...list[0], isDefault: true, isPrimary: true };
  }

  return list;
}

export function saveUserAddressBank(
  target: AddressBankUserTarget,
  addresses: SavedDeliveryAddress[],
  fallbackCityId: string = DEFAULT_CITIES[0].id
): SavedDeliveryAddress[] {
  const sanitized = sanitizeSavedAddresses(addresses, fallbackCityId);
  if (typeof window !== 'undefined') {
    const keys = getStorageKeysForUser(target);
    const payload = JSON.stringify(sanitized.slice(0, 15));
    for (const key of keys) {
      try {
        window.localStorage.setItem(key, payload);
      } catch {
        // ignore quota errors
      }
    }
  }
  return sanitized;
}

export function getPrimarySavedAddress(
  addresses: SavedDeliveryAddress[]
): SavedDeliveryAddress | null {
  if (!addresses || addresses.length === 0) return null;
  return addresses.find(a => a.isPrimary || a.isDefault) || addresses[0];
}
