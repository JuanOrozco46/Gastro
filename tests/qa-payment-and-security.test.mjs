import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function timingSafeEqualStrings(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function calculateWompiIntegrity(reference, amountInCents, currency, integritySecret) {
  const text = `${reference}${amountInCents}${currency}${integritySecret}`;
  return crypto.createHash('sha256').update(text).digest('hex');
}

function verifyWompiChecksum(payload, eventsSecret) {
  if (!payload?.signature?.properties || typeof payload?.signature?.checksum !== 'string') {
    return false;
  }
  let concatenated = '';
  for (const propPath of payload.signature.properties) {
    const parts = propPath.split('.');
    let val = payload.data;
    for (const part of parts) {
      val = val?.[part];
    }
    concatenated += String(val ?? '');
  }
  const timestamp = payload.timestamp ?? payload.sent_at ?? '';
  concatenated += String(timestamp) + eventsSecret;
  const calculated = crypto.createHash('sha256').update(concatenated).digest('hex');
  return timingSafeEqualStrings(calculated.toLowerCase(), payload.signature.checksum.toLowerCase());
}

function computeFinancialBreakdown(totalCop, provider = 'wompi', commissionRate = 0.03) {
  const platformFeeCop = Math.round(totalCop * commissionRate);
  const isCash = String(provider).toLowerCase().trim() === 'cash';
  const rawWompiBase = isCash ? 0 : totalCop * 0.0265 + 700;
  const gatewayFeeCop = isCash ? 0 : Math.round(rawWompiBase * 1.19);
  const gatewayIvaCop = isCash ? 0 : Math.max(0, gatewayFeeCop - Math.round(rawWompiBase));
  const restaurantPayoutCop = Math.max(0, totalCop - platformFeeCop - gatewayFeeCop);
  return { platformFeeCop, gatewayFeeCop, gatewayIvaCop, restaurantPayoutCop };
}

describe('GastroSync QA Hardening — Payment & Security Suite', () => {
  it('calcula firma de integridad SHA-256 de Wompi y comparación timing-safe correctamente', () => {
    const sig = calculateWompiIntegrity('GS_PAY_12345678_1700000000', 4500000, 'COP', 'prod_integrity_secret_xyz');
    assert.equal(sig.length, 64);
    assert.equal(timingSafeEqualStrings(sig, sig), true);
    assert.equal(timingSafeEqualStrings(sig, sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0')), false);
    assert.equal(timingSafeEqualStrings(sig, 'short'), false);
  });

  it('verifica checksum oficial de eventos webhook de Wompi y rechaza alteraciones de monto', () => {
    const secret = 'wompi_events_secret_test';
    const timestamp = 1712690000;
    const raw = `tx_999APPROVED4500000${timestamp}${secret}`;
    const validChecksum = crypto.createHash('sha256').update(raw).digest('hex');

    const payload = {
      data: {
        transaction: {
          id: 'tx_999',
          status: 'APPROVED',
          amount_in_cents: 4500000,
          currency: 'COP',
          reference: 'GS_PAY_12345678'
        }
      },
      timestamp,
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
        checksum: validChecksum
      }
    };

    assert.equal(verifyWompiChecksum(payload, secret), true);

    // Si alguien altera amount_in_cents en el payload, el checksum falla inmediatamente
    const tampered = structuredClone(payload);
    tampered.data.transaction.amount_in_cents = 10000;
    assert.equal(verifyWompiChecksum(tampered, secret), false);
  });

  it('calcula el desglose financiero exacto (3% libre GastroSync + pasarela Wompi 2.65% + $700 + IVA 19%)', () => {
    const digital = computeFinancialBreakdown(100000, 'wompi', 0.03);
    assert.equal(digital.platformFeeCop, 3000);
    // Base Wompi: 100000 * 0.0265 + 700 = 3350; con IVA 19%: ROUND(3350 * 1.19) = 3987
    assert.equal(digital.gatewayFeeCop, 3987);
    assert.equal(digital.gatewayIvaCop, 637);
    assert.equal(digital.restaurantPayoutCop, 100000 - 3000 - 3987);

    const cash = computeFinancialBreakdown(100000, 'cash', 0.03);
    assert.equal(cash.platformFeeCop, 3000);
    assert.equal(cash.gatewayFeeCop, 0);
    assert.equal(cash.gatewayIvaCop, 0);
    assert.equal(cash.restaurantPayoutCop, 97000);
  });

  it('verifica que la migración 054 impone índice único parcial y search_path en funciones SECURITY DEFINER', () => {
    const sqlPath = path.join(ROOT, 'supabase', 'migrations', '054_qa_security_and_payment_hardening.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_approved_per_order/i);
    assert.match(sql, /ON public\.payments\s*\(order_id\)\s*WHERE status = 'approved'/i);
    assert.match(sql, /CREATE TRIGGER trg_guard_payment_intent_insert/i);
    assert.match(sql, /ALTER FUNCTION %I\.%I\(%s\) SET search_path = public/i);
  });

  it('verifica que create-payment, payment-webhook y application-assets no tienen fallbacks inseguros', () => {
    const createPayment = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'create-payment', 'index.ts'), 'utf8');
    assert.equal(createPayment.includes('pub_test_Q5y1F3WwWLu1G2A1z0y3Z5'), false, 'No debe tener WOMPI_PUBLIC_KEY hardcodeada');
    assert.equal(createPayment.includes('test_integrity_secret_placeholder'), false, 'No debe tener WOMPI_INTEGRITY_SECRET hardcodeado');
    assert.match(createPayment, /\.update\(\{\s*status:\s*'voided'\s*\}\)/);

    const webhook = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'payment-webhook', 'index.ts'), 'utf8');
    assert.match(webhook, /function timingSafeEqualStrings/);
    assert.match(webhook, /parsedAmountInCents <= 0/);

    const appAssets = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'application-assets', 'index.ts'), 'utf8');
    assert.match(appAssets, /Deno\.env\.get\('ALLOWED_ORIGINS'\)/);
    assert.match(appAssets, /status:\s*403/);
  });

  it('verifica que App.tsx envuelve las vistas lazy en ErrorBoundary y el modo Demo tiene datos coherentes para t1', () => {
    const appTsx = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
    assert.match(appTsx, /<ErrorBoundary(?:\s+key=\{userRole\})?\s+moduleName="Aplicación Principal">/);
    assert.match(appTsx, /<ErrorBoundary moduleName="Servicio en Mesa QR">/);

    const defaultData = fs.readFileSync(path.join(ROOT, 'src', 'context', 'defaultData.ts'), 'utf8');
    assert.match(defaultData, /id:\s*'t1'/);
    assert.match(defaultData, /tenantId:\s*'t1'/);
  });

  it('verifica las defensas de la Ronda 2 (migración 055 Storage RLS + reembolso en cancelación, validación de avatar, paginación del feed y preservación de rol)', () => {
    const sql055 = fs.readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '055_qa_round2_storage_and_feed_hardening.sql'),
      'utf8'
    );
    assert.match(sql055, /CREATE POLICY "gastro_media_insert_authenticated"/);
    assert.match(sql055, /\(string_to_array\(name, '\/'\)\)\[2\] = auth\.uid\(\)::text/);
    assert.match(sql055, /UPDATE public\.payments[\s\S]*SET status = 'refunded'[\s\S]*AND status = 'approved'/);

    const authSvc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'supabaseAuthService.ts'), 'utf8');
    assert.match(authSvc, /ALLOWED_AVATAR_MIMES/);
    assert.match(authSvc, /AVATAR_MAX_BYTES = 5 \* 1024 \* 1024/);
    assert.match(authSvc, /avatars\/\$\{cleanUserId\}\//);
    assert.match(authSvc, /cached\?\.role/);

    const dataSvc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'supabaseDataService.ts'), 'utf8');
    assert.match(dataSvc, /fetchLivePosts\(limit: number = 40, offset: number = 0\)/);
    assert.match(dataSvc, /\.range\(safeOffset, safeOffset \+ safeLimit - 1\)/);

    const errBoundary = fs.readFileSync(path.join(ROOT, 'src', 'components', 'ErrorBoundary.tsx'), 'utf8');
    assert.match(errBoundary, /this\.props\.moduleName/);
  });

  it('verifica la suite de Cumplimiento Legal en Colombia (Ley 1581 de 2012, RNBD, Consentimiento Informado, Supresión de Datos, Banner de Cookies y Sanitización de Claves)', () => {
    const sql056 = fs.readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '056_privacy_and_data_deletion.sql'),
      'utf8'
    );
    assert.match(sql056, /CREATE OR REPLACE FUNCTION public\.delete_my_user_account/i);
    assert.match(sql056, /CREATE OR REPLACE FUNCTION public\.deactivate_and_purge_my_restaurant/i);
    assert.match(sql056, /SET search_path = public/i);
    assert.match(sql056, /Titular Suprimido \(Ley 1581\)/);

    const debugSupabase = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'debugSupabase.ts'), 'utf8');
    assert.equal(debugSupabase.includes('key.substring'), false, 'Nunca debe imprimir fragmentos de la clave en consola');

    const loginScreen = fs.readFileSync(path.join(ROOT, 'src', 'components', 'LoginScreen.tsx'), 'utf8');
    assert.match(loginScreen, /acceptedLegalConsent/);
    assert.match(loginScreen, /Política de Privacidad y Habeas Data \(Ley 1581 de 2012\)/);

    const legalModal = fs.readFileSync(path.join(ROOT, 'src', 'components', 'LegalCenterModal.tsx'), 'utf8');
    assert.match(legalModal, /Decreto 090/);
    assert.match(legalModal, /100\.000 UVT/);
    assert.match(legalModal, /SIL Open Font License/);
    assert.match(legalModal, /Unsplash/);

    const cookieBanner = fs.readFileSync(path.join(ROOT, 'src', 'components', 'CookieConsentBanner.tsx'), 'utf8');
    assert.match(cookieBanner, /gs-cookie-banner/);
    assert.match(cookieBanner, /Solo esenciales/);
  });

  it('verifica la auto-recuperación ante fallos de chunks dinámicos tras despliegues en Vercel (lazyWithRetry + vite:preloadError + ErrorBoundary)', () => {
    const lazyHelper = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'lazyWithRetry.ts'), 'utf8');
    assert.match(lazyHelper, /failed to fetch dynamically imported module/);
    assert.match(lazyHelper, /vite:preloadError/);
    assert.match(lazyHelper, /gs_last_chunk_reload_ts/);

    const appTsx = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
    assert.match(appTsx, /lazyWithRetry\(\(\) => import\('\.\/components\/LoginScreen'\)/);

    const errBoundary = fs.readFileSync(path.join(ROOT, 'src', 'components', 'ErrorBoundary.tsx'), 'utf8');
    assert.match(errBoundary, /isChunkLoadError/);
    assert.match(errBoundary, /gs-error-boundary/);

    const vercelConfig = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
    assert.match(vercelConfig, /\/\(\(\?!assets\/\)\.\*\)/);
  });

  it('verifica que el Feed, Tendencias, Stories y Directorio filtran estrictamente por la ciudad seleccionada sin mostrar publicaciones de otras ciudades', () => {
    const customerApp = fs.readFileSync(path.join(ROOT, 'src', 'components', 'CustomerDeliveryApp.tsx'), 'utf8');
    assert.equal(
      customerApp.includes('if (city && hasTenantsInCity && tenant.cityId !== city.id)'),
      false,
      'CustomerDeliveryApp no debe omitir el filtro de ciudad cuando una ciudad no tiene restaurantes'
    );
    assert.match(customerApp, /if \(city && tenant\.cityId !== city\.id\)/);
    assert.match(customerApp, /\) : !hasTenantsInActiveCity \? \(/);

    const directory = fs.readFileSync(path.join(ROOT, 'src', 'components', 'RestaurantDirectory.tsx'), 'utf8');
    assert.equal(
      directory.includes('if (activeCity && hasTenantsInActiveCity && t.cityId !== activeCity.id)'),
      false,
      'RestaurantDirectory no debe mostrar restaurantes de otra ciudad cuando la ciudad seleccionada está vacía'
    );
    assert.match(directory, /if \(activeCity && t\.cityId !== activeCity\.id\) return false/);

    const storiesBar = fs.readFileSync(path.join(ROOT, 'src', 'components', 'StoriesBar.tsx'), 'utf8');
    assert.match(storiesBar, /if \(selectedCityId && tenant\.cityId !== selectedCityId\) return false/);
  });

  it('verifica la experiencia móvil no intrusiva estilo Rappi: barra superior con dirección activa + botón Salir, Historias dinámicas, Banco de Ubicaciones en Perfil/Checkout y persistencia extendida de sesión', () => {
    const customerApp = fs.readFileSync(path.join(ROOT, 'src', 'components', 'CustomerDeliveryApp.tsx'), 'utf8');
    assert.equal(
      customerApp.includes('<LocationSelector'),
      false,
      'El Feed del cliente no debe mostrar el bloque intrusivo LocationSelector al entrar'
    );
    assert.match(customerApp, /gs-rappi-address-trigger/);
    assert.match(customerApp, /gs-top-logout-btn/);
    assert.match(customerApp, /<StoriesBar onOrderProduct=\{handleOrder\} \/>/);

    const headerTsx = fs.readFileSync(path.join(ROOT, 'src', 'components', 'Header.tsx'), 'utf8');
    assert.match(headerTsx, /userRole === 'login' \|\| userRole === 'client_delivery'/);

    const loginScreen = fs.readFileSync(path.join(ROOT, 'src', 'components', 'LoginScreen.tsx'), 'utf8');
    assert.match(loginScreen, /preferredCityId/);
    assert.match(loginScreen, /savedAddresses/);

    const profileModal = fs.readFileSync(path.join(ROOT, 'src', 'components', 'UserProfileModal.tsx'), 'utf8');
    assert.match(profileModal, /Banco de Ubicaciones y Ciudad Principal/);
    assert.match(profileModal, /handleAddAddressToBank/);

    const paymentModal = fs.readFileSync(path.join(ROOT, 'src', 'components', 'PaymentModal.tsx'), 'utf8');
    assert.match(paymentModal, /Tu Banco de Ubicaciones/);
    assert.match(paymentModal, /Etiqueta para tu Banco de Ubicaciones/);

    const appContext = fs.readFileSync(path.join(ROOT, 'src', 'context', 'AppContext.tsx'), 'utf8');
    assert.match(appContext, /const activeStories = React\.useMemo<Story\[\]>/);
    assert.match(appContext, /keepSupabaseSessionAlive\(\)/);

    const sql057 = fs.readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '057_user_address_bank_and_city.sql'),
      'utf8'
    );
    assert.match(sql057, /preferred_city_id/);
    assert.match(sql057, /saved_addresses/);
  });

  it('verifica la publicación de Historias 24h en el panel del restaurante, eliminación del botón de perfil duplicado arriba en móvil y barra de progreso/transiciones animadas en StoriesBar', () => {
    const restaurantAdmin = fs.readFileSync(path.join(ROOT, 'src', 'components', 'RestaurantAdmin.tsx'), 'utf8');
    assert.match(restaurantAdmin, /contentPublishMode/);
    assert.match(restaurantAdmin, /handleCreateStorySubmit/);
    assert.match(restaurantAdmin, /createStoryItem/);
    assert.match(restaurantAdmin, /deleteStoryItem/);
    assert.match(restaurantAdmin, /Historias Activas 24h/);

    const customerApp = fs.readFileSync(path.join(ROOT, 'src', 'components', 'CustomerDeliveryApp.tsx'), 'utf8');
    assert.equal(
      customerApp.includes('gs-top-profile-btn'),
      false,
      'No debe existir un botón de perfil duplicado en la barra superior móvil (.gs-top-actions-cluster)'
    );
    assert.match(customerApp, /gs-desktop-profile-pill/);

    const storiesBar = fs.readFileSync(path.join(ROOT, 'src', 'components', 'StoriesBar.tsx'), 'utf8');
    assert.match(storiesBar, /gf-story-progress-fill/);
    assert.match(storiesBar, /scaleX\(\$\{fillPct \/ 100\}\)/);
    assert.match(storiesBar, /gf-story-slide-stage/);
    assert.match(storiesBar, /tenantTransition/);
    assert.match(storiesBar, /window\.requestAnimationFrame/);
  });
});


