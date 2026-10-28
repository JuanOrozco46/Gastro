import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isRestaurantOwner,
  isRestaurantStaff,
  isPlatformAdmin,
  hasOwnershipOfTenant,
} from '../src/context/authGuards.ts';

import {
  calculateWompiGatewayFee,
  calculateOrderFinancialBreakdown,
} from '../src/utils/wompiFees.ts';

const ROOT = process.cwd();

describe('GastroSync Production Readiness — Migrations 060/061, Dispatch & Financial Integrity', () => {
  it('Migración 060: valida resolución de RLS de auditoría P0, driver is_active, trigger in_review y media permissions', () => {
    const migration060Path = path.join(ROOT, 'supabase', 'migrations', '060_fix_audit_p0_and_storage_issues.sql');
    assert.ok(fs.existsSync(migration060Path), 'El archivo 060_fix_audit_p0_and_storage_issues.sql debe existir');

    const sql060 = fs.readFileSync(migration060Path, 'utf8');

    // 1. attach_application_media_urls sin referencias a columnas inexistentes
    assert.match(sql060, /attach_application_media_urls/i, 'Debe definir attach_application_media_urls');
    assert.doesNotMatch(sql060, /restaurants\.application_id/i, 'No debe referenciar application_id en tabla restaurants');

    // 2. Columna is_active en restaurant_drivers
    assert.match(sql060, /ADD COLUMN IF NOT EXISTS\s+is_active\s+BOOLEAN/i, 'Debe añadir columna is_active a restaurant_drivers');
    assert.match(sql060, /idx_restaurant_drivers_restaurant_active/i, 'Debe crear índice para drivers activos');

    // 3. Trigger notify_on_new_message y notify_on_ticket_updated usan estado permitido in_review
    assert.match(sql060, /notify_on_new_message/i, 'Debe definir notify_on_new_message');
    assert.match(sql060, /notify_on_ticket_updated/i, 'Debe definir notify_on_ticket_updated');
    assert.match(sql060, /'in_review'/i, 'Debe incluir estado in_review compatible con CHECK constraint');

    // 4. Políticas para gastro_media_insert_authenticated con soporte a miembros del restaurante
    assert.match(sql060, /gastro_media_insert_authenticated/i, 'Debe actualizar política de storage');
    assert.match(sql060, /is_restaurant_member\s*\(/i, 'Debe permitir upload a miembros autenticados con is_restaurant_member');
  });

  it('Migración 061: valida atomicidad en KDS (accept_and_start_order) con row lock FOR UPDATE y permisos', () => {
    const migration061Path = path.join(ROOT, 'supabase', 'migrations', '061_atomic_accept_and_start_order.sql');
    assert.ok(fs.existsSync(migration061Path), 'El archivo 061_atomic_accept_and_start_order.sql debe existir');

    const sql061 = fs.readFileSync(migration061Path, 'utf8');

    // 1. Definición de la función RPC con SECURITY DEFINER
    assert.match(sql061, /CREATE OR REPLACE FUNCTION\s+public\.accept_and_start_order/i, 'Debe declarar public.accept_and_start_order');
    assert.match(sql061, /SECURITY DEFINER/i, 'Debe ser SECURITY DEFINER para ejecutar atomicamente');

    // 2. Row lock FOR UPDATE para prevenir race conditions concurrentes
    assert.match(sql061, /FOR UPDATE/i, 'Debe adquirir un row lock FOR UPDATE sobre la orden');

    // 3. Ejecución atómica de accepted y preparing
    assert.match(sql061, /'accepted'/i, 'Debe registrar transición a accepted');
    assert.match(sql061, /'preparing'/i, 'Debe registrar transición a preparing');

    // 4. Permisos estrictos: denegado a anon/public, otorgado a authenticated
    assert.match(sql061, /REVOKE ALL ON FUNCTION public\.accept_and_start_order/i, 'Debe revocar permisos a PUBLIC y anon');
    assert.match(sql061, /GRANT EXECUTE ON FUNCTION public\.accept_and_start_order/i, 'Debe conceder ejecución a authenticated');
  });

  it('CORS & Headers en Edge Functions: create-payment y approve_restaurant validan orígenes seguros', () => {
    const createPaymentPath = path.join(ROOT, 'supabase', 'functions', 'create-payment', 'index.ts');
    assert.ok(fs.existsSync(createPaymentPath), 'create-payment/index.ts debe existir');
    const createPaymentCode = fs.readFileSync(createPaymentPath, 'utf8');

    // Verifica que maneja preflight OPTIONS y restringe o valida origen
    assert.match(createPaymentCode, /OPTIONS/i, 'create-payment debe responder al preflight OPTIONS');
    assert.match(createPaymentCode, /Access-Control-Allow-Origin/i, 'create-payment debe incluir Access-Control-Allow-Origin');

    const approveRestPath = path.join(ROOT, 'supabase', 'functions', 'approve_restaurant', 'index.ts');
    assert.ok(fs.existsSync(approveRestPath), 'approve_restaurant/index.ts debe existir');
    const approveRestCode = fs.readFileSync(approveRestPath, 'utf8');
    assert.match(approveRestCode, /OPTIONS/i, 'approve_restaurant debe responder al preflight OPTIONS');
  });

  it('Coherencia Matemática Financiera: calculateOrderFinancialBreakdown respeta identidad neta sin Math.max distorsionado', () => {
    const testCases = [
      { gross: 10000, commissionRate: 0.03, method: 'wompi' },
      { gross: 35000, commissionRate: 0.03, method: 'wompi' },
      { gross: 85000, commissionRate: 0.05, method: 'wompi' },
      { gross: 150000, commissionRate: 0.03, method: 'cash' },
      { gross: 500000, commissionRate: 0.025, method: 'wompi' }
    ];

    for (const { gross, commissionRate, method } of testCases) {
      const breakdown = calculateOrderFinancialBreakdown(gross, method, commissionRate);

      assert.equal(breakdown.grossTotalCop, gross, 'Gross debe coincidir');
      assert.ok(breakdown.gastroSyncFeeCop >= 0, 'Comisión de plataforma no puede ser negativa');
      assert.ok(breakdown.wompiBaseFeeCop >= 0, 'Tarifa Wompi base no puede ser negativa');
      assert.ok(breakdown.wompiIvaCop >= 0, 'IVA Wompi no puede ser negativo');
      assert.ok(breakdown.wompiTotalFeeCop >= 0, 'Tarifa total Wompi no puede ser negativa');

      const expectedDeductions = breakdown.gastroSyncFeeCop + breakdown.wompiTotalFeeCop;
      assert.equal(breakdown.totalDeductionCop, expectedDeductions, 'totalDeductionCop debe ser la suma exacta');

      const expectedNet = Math.max(0, gross - expectedDeductions);
      assert.equal(breakdown.restaurantNetCop, expectedNet, `Identidad neta matemática exacta para $${gross}`);
      assert.ok(breakdown.restaurantNetCop <= gross, 'El neto pagado al restaurante nunca supera el total bruto');
    }

    // Casos borde <= 0
    const zeroBreakdown = calculateOrderFinancialBreakdown(0, 'wompi');
    assert.equal(zeroBreakdown.grossTotalCop, 0);
    assert.equal(zeroBreakdown.gastroSyncFeeCop, 0);
    assert.equal(zeroBreakdown.wompiTotalFeeCop, 0);
    assert.equal(zeroBreakdown.restaurantNetCop, 0);

    const negativeBreakdown = calculateOrderFinancialBreakdown(-5000, 'wompi');
    assert.equal(negativeBreakdown.grossTotalCop, 0);
    assert.equal(negativeBreakdown.restaurantNetCop, 0);
  });

  it('KDS & UI Integrity: soporte backward-compatible en servicio RPC y honestidad en cancelaciones y envíos', () => {
    // 1. supabaseOrderService implementa acceptAndStartLiveOrder con fallback
    const servicePath = path.join(ROOT, 'src', 'services', 'supabaseOrderService.ts');
    const serviceCode = fs.readFileSync(servicePath, 'utf8');
    assert.match(serviceCode, /export async function acceptAndStartLiveOrder/i, 'Debe exportar acceptAndStartLiveOrder');
    assert.match(serviceCode, /accept_and_start_order/i, 'Debe invocar RPC accept_and_start_order');
    assert.match(serviceCode, /PGRST202|42883/i, 'Debe contar con detección de fallback ante RPC ausente');

    // 2. MyOrders.tsx muestra aviso transparente sobre gestión de reembolsos
    const myOrdersPath = path.join(ROOT, 'src', 'components', 'MyOrders.tsx');
    const myOrdersCode = fs.readFileSync(myOrdersPath, 'utf8');
    assert.match(myOrdersCode, /gestión del restaurante|soporte/i, 'Debe clarificar honestamente el proceso de reembolso');
    assert.doesNotMatch(myOrdersCode, /reembolso automático en tu cuenta bancaria/i, 'No debe prometer reembolso automático inexistente');

    // 3. CartModal.tsx y CustomerDeliveryApp.tsx clarifican tarifa de envío para domicilio vs mesa/recoger
    const cartModalPath = path.join(ROOT, 'src', 'components', 'CartModal.tsx');
    const cartModalCode = fs.readFileSync(cartModalPath, 'utf8');
    assert.match(cartModalCode, /recoger en el local o servicio en mesa/i, 'Debe avisar exención de costo de envío');

    // 4. KdsBoard.tsx expone asignación de domiciliarios en comandas listas
    const kdsBoardPath = path.join(ROOT, 'src', 'components', 'KdsBoard.tsx');
    const kdsBoardCode = fs.readFileSync(kdsBoardPath, 'utf8');
    assert.match(kdsBoardCode, /assignDriverToOrder/i, 'KdsBoard debe invocar assignDriverToOrder');
    assert.match(kdsBoardCode, /tenantDrivers/i, 'KdsBoard debe filtrar domiciliarios del restaurante');
  });

  it('Auth Guards & Delivery Fees: permisos de asignación de repartidores y cálculo base de Wompi', () => {
    // 1. Roles y propiedad de restaurante
    const ownerT1 = { id: 'u1', email: 'owner@t1.com', name: 'Owner', role: 'admin', businessRole: 'restaurant_owner', tenantId: 't1' };
    const staffT1 = { id: 'u2', email: 'staff@t1.com', name: 'Staff', role: 'kitchen', businessRole: 'restaurant_staff', tenantId: 't1' };
    const platformAdmin = { id: 'u4', email: 'admin@gs.com', name: 'Admin', role: 'platform_admin', businessRole: 'platform_admin' };

    assert.ok(isRestaurantOwner(ownerT1));
    assert.ok(hasOwnershipOfTenant(ownerT1, 't1'));
    assert.ok(!hasOwnershipOfTenant(ownerT1, 't2'));

    assert.ok(isRestaurantStaff(staffT1));
    assert.ok(!isRestaurantOwner(staffT1));

    assert.ok(isPlatformAdmin(platformAdmin));
    assert.ok(!isRestaurantOwner(platformAdmin));

    // 2. Wompi gateway fee calculation
    const wompiFee = calculateWompiGatewayFee(50000, 'wompi');
    assert.ok(wompiFee.totalGatewayFeeCop > 0);
    assert.equal(wompiFee.baseFeeCop + wompiFee.ivaCop, wompiFee.totalGatewayFeeCop);
  });

  it('Hardening, Code Splitting & Warm Gastronomy: cabeceras CSP/HSTS, Origin 403, chunks diferidos y tokens visuales', () => {
    const vercelConfig = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
    assert.match(vercelConfig, /Content-Security-Policy/i, 'vercel.json debe definir Content-Security-Policy');
    assert.match(vercelConfig, /Strict-Transport-Security/i, 'vercel.json debe definir Strict-Transport-Security');
    assert.match(vercelConfig, /Cross-Origin-Opener-Policy/i, 'vercel.json debe definir Cross-Origin-Opener-Policy');

    const createPaymentCode = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'create-payment', 'index.ts'), 'utf8');
    assert.match(createPaymentCode, /!isOriginAllowed\(req\.headers\.get\('Origin'\)\)/, 'create-payment debe validar activamente isOriginAllowed');
    assert.match(createPaymentCode, /status:\s*403/, 'create-payment debe rechazar orígenes no autorizados con HTTP 403');

    const approveRestCode = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'approve_restaurant', 'index.ts'), 'utf8');
    assert.match(approveRestCode, /!isOriginAllowed\(req\.headers\.get\('Origin'\)\)/, 'approve_restaurant debe validar activamente isOriginAllowed');
    assert.match(approveRestCode, /status:\s*403/, 'approve_restaurant debe rechazar orígenes no autorizados con HTTP 403');

    const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
    assert.match(viteConfig, /vendor-charts/, 'vite.config.ts debe aislar recharts/d3 en el chunk vendor-charts');

    const restAdminCode = fs.readFileSync(path.join(ROOT, 'src', 'components', 'RestaurantAdmin.tsx'), 'utf8');
    assert.match(restAdminCode, /lazyWithRetry\(\(\)\s*=>\s*import\(['"]\.\/RestaurantAdmin\/DashboardTab['"]\)/, 'DashboardTab debe cargarse con lazyWithRetry');
    assert.match(restAdminCode, /lazyWithRetry\(\(\)\s*=>\s*import\(['"]\.\/KdsBoard['"]\)/, 'KdsBoard debe cargarse con lazyWithRetry');

    const tablePublicCode = fs.readFileSync(path.join(ROOT, 'src', 'components', 'TablePublicView.tsx'), 'utf8');
    assert.match(tablePublicCode, /var\(--neutral-surface\)/, 'TablePublicView debe usar tokens Warm Gastronomy');
    assert.match(tablePublicCode, /encodeURIComponent\(restaurant\.googlePlaceId!\)/, 'TablePublicView debe codificar googlePlaceId en URL externa con noopener,noreferrer');

    const storiesCode = fs.readFileSync(path.join(ROOT, 'src', 'components', 'StoriesBar.tsx'), 'utf8');
    assert.match(storiesCode, /orderedStories/, 'StoriesBar debe ordenar historias no vistas primero estilo Instagram');
    assert.match(storiesCode, /gf-story-peek-card/, 'StoriesBar debe mostrar tarjetas peek laterales en escritorio');
    assert.match(storiesCode, /is-ui-hidden/, 'StoriesBar debe ocultar UI suavemente al mantener presionado (hold-to-pause)');

    const feedCode = fs.readFileSync(path.join(ROOT, 'src', 'components', 'CustomerDeliveryApp.tsx'), 'utf8');
    assert.match(feedCode, /IntersectionObserver/, 'PostCard debe reproducir y pausar videos inline según visibilidad en viewport');
    assert.match(feedCode, /gf-ig-shop-tag/, 'PostCard debe incluir etiqueta flotante estilo Instagram Shopping');
    assert.match(feedCode, /gf-inline-comment-form/, 'PostCard debe permitir agregar comentario rápido inline');
  });
});
