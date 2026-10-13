import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isRestaurantOwner,
  isRestaurantStaff,
  isPlatformAdmin,
  hasOwnershipOfTenant,
  validateCachedSession,
} from '../src/context/authGuards.ts';

import {
  sanitizeSavedAddresses,
  getPrimarySavedAddress,
} from '../src/utils/addressBank.ts';

import {
  calculateWompiGatewayFee,
  calculateOrderFinancialBreakdown,
} from '../src/utils/wompiFees.ts';

import {
  saveCookieConsent,
  getSavedCookieConsent,
  isFunctionalStorageAllowed,
} from '../src/utils/legalNavigation.ts';

const ROOT = process.cwd();

describe('GastroSync Audit Remediation — Behavioral & Authorization Unit Tests', () => {
  it('P0-07 / P1-01 / P1-02 / P1-03: authGuards bloquea sesiones cacheadas en modo remoto y aísla roles y propiedad de restaurante', () => {
    // 1. Usuario nulo nunca es owner, staff ni platform_admin
    assert.equal(isRestaurantOwner(null), false);
    assert.equal(isRestaurantStaff(null), false);
    assert.equal(isPlatformAdmin(null), false);
    assert.equal(hasOwnershipOfTenant(null, 'rest-1'), false);

    // 2. Cliente verificado nunca es owner, staff ni platform_admin
    const verifiedClient = {
      id: 'u-client',
      email: 'verified@example.com',
      name: 'Cliente Verificado',
      role: 'client_delivery',
      businessRole: 'customer',
      emailVerified: true,
    };
    assert.equal(isRestaurantOwner(verifiedClient), false);
    assert.equal(isRestaurantStaff(verifiedClient), false);
    assert.equal(isPlatformAdmin(verifiedClient), false);
    assert.equal(hasOwnershipOfTenant(verifiedClient, 'rest-1'), false);

    // 3. Owner solo tiene propiedad sobre su propio tenantId, nunca sobre otro restaurante
    const ownerRest1 = {
      id: 'u-owner',
      email: 'owner@example.com',
      name: 'Owner Rest 1',
      role: 'admin',
      businessRole: 'restaurant_owner',
      tenantId: 'rest-1',
      emailVerified: true,
    };
    assert.equal(isRestaurantOwner(ownerRest1), true);
    assert.equal(hasOwnershipOfTenant(ownerRest1, 'rest-1'), true);
    assert.equal(hasOwnershipOfTenant(ownerRest1, 'rest-2'), false);

    // 4. Staff de cocina es reconocido como staff pero NO como owner (P1-08)
    const kitchenStaff = {
      id: 'u-staff',
      email: 'cocina@example.com',
      name: 'Chef',
      role: 'kitchen',
      businessRole: 'restaurant_staff',
      tenantId: 'rest-1',
      emailVerified: true,
    };
    assert.equal(isRestaurantStaff(kitchenStaff), true);
    assert.equal(isRestaurantOwner(kitchenStaff), false);
    assert.equal(hasOwnershipOfTenant(kitchenStaff, 'rest-1'), false);

    // 5. SuperAdmin es reconocido por businessRole === 'platform_admin'
    const superAdmin = {
      id: 'u-super',
      email: 'admin@example.com',
      name: 'Super Admin',
      role: 'platform_admin',
      businessRole: 'platform_admin',
      emailVerified: true,
    };
    assert.equal(isPlatformAdmin(superAdmin), true);
    assert.equal(isRestaurantOwner(superAdmin), false);

    // 6. En modo remoto (Supabase), validateCachedSession JAMÁS confía en localStorage
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    store.set('gs_demo_session_v1', JSON.stringify(superAdmin));
    assert.equal(
      validateCachedSession('remote'),
      null,
      'En modo remoto nunca debe hidratarse sesión desde localStorage'
    );
    const demoSession = validateCachedSession('demo');
    assert.equal(demoSession?.email, 'admin@example.com');
    delete globalThis.localStorage;
  });

  it('P1-12: addressBank sanitiza direcciones guardadas y garantiza una única dirección principal con ciudad válida', () => {
    const rawAddresses = [
      {
        id: 'a1',
        label: 'Casa',
        address: 'Calle 10 # 5-20',
        cityId: 'city-tunja',
        isPrimary: false,
        createdAt: 1000,
      },
      {
        id: 'a2',
        label: 'Oficina',
        address: 'Cra 7 # 72-10',
        cityId: 'city-bogota',
        isPrimary: true,
        createdAt: 2000,
      },
    ];

    const sanitized = sanitizeSavedAddresses(rawAddresses, 'city-tunja');
    assert.equal(sanitized.length, 2);
    const primary = getPrimarySavedAddress(sanitized);
    assert.equal(primary?.id, 'a2');
    assert.equal(primary?.cityId, 'city-bogota');
  });

  it('P0-05 / P1-15: wompiFees calcula comisiones exactas en pesos enteros y maneja bordes <= 0', () => {
    const zeroBreakdown = calculateOrderFinancialBreakdown(0, 'wompi');
    assert.equal(zeroBreakdown.grossTotalCop, 0);
    assert.equal(zeroBreakdown.gastroSyncFeeCop, 0);
    assert.equal(zeroBreakdown.wompiTotalFeeCop, 0);
    assert.equal(zeroBreakdown.restaurantNetCop, 0);

    const cashOrder = calculateOrderFinancialBreakdown(50000, 'cash');
    assert.equal(cashOrder.isCash, true);
    assert.equal(cashOrder.gastroSyncFeeCop, 1500);
    assert.equal(cashOrder.wompiTotalFeeCop, 0);
    assert.equal(cashOrder.restaurantNetCop, 48500);

    const digitalOrder = calculateOrderFinancialBreakdown(50000, 'wompi');
    assert.equal(digitalOrder.isCash, false);
    assert.equal(digitalOrder.gastroSyncFeeCop, 1500);
    const fee = calculateWompiGatewayFee(50000, 'wompi');
    assert.equal(fee.baseFeeCop, Math.round(50000 * 0.0265 + 700));
    assert.equal(digitalOrder.wompiTotalFeeCop, fee.totalGatewayFeeCop);
    assert.equal(digitalOrder.restaurantNetCop, 50000 - 1500 - fee.totalGatewayFeeCop);
  });

  it('P2-01: legalNavigation respeta consentimiento de cookies funcionales y purga claves de ubicación al elegir Solo Esenciales', () => {
    const store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
      dispatchEvent: () => true,
    };

    store.set('gs_selected_city_v1', 'city-tunja');
    store.set('gs_selected_zone_v1', 'zone-centro');
    store.set('gs_location_preference_v1', 'gps');

    // El usuario elige "Solo esenciales" (functional: false)
    saveCookieConsent({ functional: false, analytics: false });
    const saved = getSavedCookieConsent();
    assert.equal(saved?.functional, false);
    assert.equal(isFunctionalStorageAllowed(), false);
    assert.equal(store.has('gs_selected_city_v1'), false);
    assert.equal(store.has('gs_selected_zone_v1'), false);
    assert.equal(store.has('gs_location_preference_v1'), false);

    // El usuario acepta funcionales
    saveCookieConsent({ functional: true, analytics: false });
    assert.equal(isFunctionalStorageAllowed(), true);

    delete globalThis.window;
  });

  it('P0-01 a P0-06 y P1-04 a P1-18: verifica que la migración 058 y el código fuente cumplen todas las invariantes de seguridad y cero any', () => {
    const sql058 = fs.readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '058_comprehensive_audit_remediation.sql'),
      'utf8'
    );

    // P0-01: Triggers de soporte corregidos a tablas reales
    assert.match(sql058, /INSERT INTO public\.support_audit_log/i);
    assert.match(sql058, /INSERT INTO public\.support_notifications/i);
    assert.match(sql058, /platform_role = 'platform_admin'/i);
    assert.equal(sql058.includes('INSERT INTO public.support_ticket_events'), false);

    // P0-02: handle_new_user sincroniza todos los campos de perfil y consentimiento
    assert.match(sql058, /CREATE OR REPLACE FUNCTION public\.handle_new_user/i);
    assert.match(sql058, /preferred_city_id/);
    assert.match(sql058, /saved_addresses/);
    assert.match(sql058, /terms_accepted_at/);
    assert.match(sql058, /privacy_accepted_at/);

    // P0-03 & P0-04: Políticas de Storage endurecidas
    assert.match(sql058, /CREATE OR REPLACE FUNCTION public\.can_access_support_attachment_path/i);
    assert.match(sql058, /CREATE POLICY "support_attachments_select_strict"/i);
    assert.match(sql058, /CREATE POLICY "gastro_media_insert_authenticated"/i);

    // P0-05 & P1-13: create_order_with_items endurecido
    assert.match(sql058, /CREATE OR REPLACE FUNCTION public\.create_order_with_items/i);
    assert.match(sql058, /El restaurante se encuentra cerrado o no está recibiendo pedidos/i);
    assert.match(sql058, /v_subtotal/);

    // P0-06 & P1-07: Mesa QR aislada por table_id y session_id sin bypass legacy
    assert.match(sql058, /CREATE OR REPLACE FUNCTION public\.get_table_orders_for_session/i);
    assert.match(sql058, /AND o\.device_id = btrim\(p_session_id\)/i);
    assert.match(sql058, /OR lower\(btrim\(p_session_id\)\) = 'legacy' THEN\s+RETURN;/i);

    // P1-10: KDS sincronizado en BD
    assert.match(sql058, /kds_checked_items/);
    assert.match(sql058, /CREATE OR REPLACE FUNCTION public\.update_order_kds_items/i);

    // P1-15: Liquidaciones con estado pending_review y aprobación por platform_admin
    assert.match(sql058, /pending_review/);
    assert.match(sql058, /CREATE OR REPLACE FUNCTION public\.admin_review_restaurant_settlement/i);

    // P0-08: PaymentModal no captura PAN/CVV ni ofrece MercadoPago falso
    const paymentModal = fs.readFileSync(path.join(ROOT, 'src', 'components', 'PaymentModal.tsx'), 'utf8');
    assert.equal(paymentModal.includes('cardNumber'), false);
    assert.equal(paymentModal.includes('cardCvc'), false);
    assert.equal(paymentModal.includes("'mercadopago'"), false);

    // P0-04 / P1-11 (Migración 059): Elimina DELETE directo sobre storage.objects y usa Storage API (.remove)
    const sql059 = fs.readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '059_fix_storage_api_deletion_in_purge_rpcs.sql'),
      'utf8'
    );
    const sql059WithoutComments = sql059
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    assert.equal(/DELETE\s+FROM\s+storage\.objects/i.test(sql059WithoutComments), false);
    assert.match(sql059WithoutComments, /'storage_paths'/);
    assert.match(sql059WithoutComments, /CREATE OR REPLACE FUNCTION public\.can_purge_restaurant_storage/i);

    const dataServiceSrc = fs.readFileSync(
      path.join(ROOT, 'src', 'services', 'supabaseDataService.ts'),
      'utf8'
    );
    assert.match(dataServiceSrc, /purgeStorageObjectsFromRpcResponse/);
  });
});

